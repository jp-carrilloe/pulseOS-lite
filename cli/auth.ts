import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import fsp from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type SupportedProvider = "openai" | "claude" | "gemini";
export type OpenAiAuthMode = "auto" | "api_key" | "codex_cli_session";
export type ClaudeAuthMode = "auto" | "api_key" | "claude_cli_session";
export type ProviderAuthMethod = "api_key" | "codex_cli_session" | "claude_cli_session" | "none";

export interface ProviderCredentialStatus {
  ok: boolean;
  keyName: string;
  message: string;
  method: ProviderAuthMethod;
  configuredMode?: OpenAiAuthMode | ClaudeAuthMode;
}

export interface OpenAiTextRequest {
  systemPrompt: string;
  userPrompt: string;
  modelId: string;
  env?: NodeJS.ProcessEnv;
  workingDirectory?: string;
}

export interface ClaudeTextRequest {
  systemPrompt: string;
  userPrompt: string;
  modelId: string;
  env?: NodeJS.ProcessEnv;
  workingDirectory?: string;
}

export interface ExecRunner {
  (command: string, args: string[], options?: { env?: NodeJS.ProcessEnv; cwd?: string; timeoutMs?: number }): Promise<{
    stdout: string;
    stderr: string;
  }>;
}

function defaultExecRunner(
  command: string,
  args: string[],
  options?: { env?: NodeJS.ProcessEnv; cwd?: string; timeoutMs?: number },
) {
  return execFileAsync(command, args, {
    env: options?.env ?? process.env,
    cwd: options?.cwd,
    timeout: options?.timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });
}

export function getOpenAiAuthMode(env: NodeJS.ProcessEnv = process.env): OpenAiAuthMode {
  const configured = (env.PULSEOS_OPENAI_AUTH_MODE ?? "auto").trim().toLowerCase();
  if (configured === "auto" || configured === "api_key" || configured === "codex_cli_session") {
    return configured;
  }
  throw new Error(
    `Unsupported PULSEOS_OPENAI_AUTH_MODE "${configured}". Use one of: auto, api_key, codex_cli_session.`,
  );
}

function getCodexBinary(env: NodeJS.ProcessEnv = process.env): string {
  return env.PULSEOS_OPENAI_CODEX_BIN?.trim() || "codex";
}

function getCodexTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env.PULSEOS_CODEX_EXEC_TIMEOUT_MS ?? 120_000);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 120_000;
}

export function getClaudeAuthMode(env: NodeJS.ProcessEnv = process.env): ClaudeAuthMode {
  const configured = (env.PULSEOS_CLAUDE_AUTH_MODE ?? "auto").trim().toLowerCase();
  if (configured === "auto" || configured === "api_key" || configured === "claude_cli_session") {
    return configured;
  }
  throw new Error(
    `Unsupported PULSEOS_CLAUDE_AUTH_MODE "${configured}". Use one of: auto, api_key, claude_cli_session.`,
  );
}

function getClaudeBinary(env: NodeJS.ProcessEnv = process.env): string {
  return env.PULSEOS_CLAUDE_BIN?.trim() || "claude";
}

function getClaudeTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env.PULSEOS_CLAUDE_EXEC_TIMEOUT_MS ?? 120_000);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 120_000;
}

async function getCodexLoginStatus(
  env: NodeJS.ProcessEnv = process.env,
  runner: ExecRunner = defaultExecRunner,
): Promise<{ available: boolean; loggedIn: boolean; detail: string }> {
  try {
    const { stdout, stderr } = await runner(getCodexBinary(env), ["login", "status"], {
      env,
      timeoutMs: 15_000,
    });
    const output = `${stdout}\n${stderr}`.trim();
    if (/logged in/i.test(output)) {
      return { available: true, loggedIn: true, detail: output };
    }
    return { available: true, loggedIn: false, detail: output || "Codex is installed but did not report an active login." };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/ENOENT|not found/i.test(message)) {
      return { available: false, loggedIn: false, detail: "Codex CLI is not installed or not on PATH." };
    }
    return { available: true, loggedIn: false, detail: message };
  }
}

async function getClaudeLoginStatus(
  env: NodeJS.ProcessEnv = process.env,
  runner: ExecRunner = defaultExecRunner,
): Promise<{ available: boolean; loggedIn: boolean; detail: string }> {
  try {
    const { stdout, stderr } = await runner(getClaudeBinary(env), ["auth", "status", "--json"], {
      env,
      timeoutMs: 15_000,
    });
    const rawOutput = `${stdout}\n${stderr}`.trim();
    if (!rawOutput) {
      return { available: true, loggedIn: false, detail: "Claude CLI returned no auth status output." };
    }
    try {
      const parsed = JSON.parse(rawOutput) as { loggedIn?: boolean; authMethod?: string; apiProvider?: string };
      return parsed.loggedIn
        ? {
            available: true,
            loggedIn: true,
            detail: `Logged in via ${parsed.authMethod ?? "Claude CLI"} (${parsed.apiProvider ?? "firstParty"}).`,
          }
        : {
            available: true,
            loggedIn: false,
            detail: `Claude CLI is installed but not logged in (${parsed.authMethod ?? "none"}).`,
          };
    } catch {
      return {
        available: true,
        loggedIn: /"loggedIn"\s*:\s*true/i.test(rawOutput),
        detail: rawOutput,
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/ENOENT|not found/i.test(message)) {
      return { available: false, loggedIn: false, detail: "Claude CLI is not installed or not on PATH." };
    }
    return { available: true, loggedIn: false, detail: message };
  }
}

async function getOpenAiCredentialStatus(
  env: NodeJS.ProcessEnv = process.env,
  runner: ExecRunner = defaultExecRunner,
): Promise<ProviderCredentialStatus> {
  const authMode = getOpenAiAuthMode(env);
  const apiKey = env.OPENAI_API_KEY?.trim();

  if (authMode === "api_key") {
    return apiKey
      ? {
          ok: true,
          keyName: "OPENAI_API_KEY",
          message: "OpenAI API key found.",
          method: "api_key",
          configuredMode: authMode,
        }
      : {
          ok: false,
          keyName: "OPENAI_API_KEY",
          message: "OpenAI was configured for API-key auth, but no `OPENAI_API_KEY` was found.",
          method: "none",
          configuredMode: authMode,
        };
  }

  if (authMode === "codex_cli_session") {
    const codex = await getCodexLoginStatus(env, runner);
    return codex.available && codex.loggedIn
      ? {
          ok: true,
          keyName: "codex login",
          message: "Codex CLI session found.",
          method: "codex_cli_session",
          configuredMode: authMode,
        }
      : {
          ok: false,
          keyName: "codex login",
          message: `OpenAI was configured for Codex session auth, but it is not usable. ${codex.detail}`.trim(),
          method: "none",
          configuredMode: authMode,
        };
  }

  if (apiKey) {
    return {
      ok: true,
      keyName: "OPENAI_API_KEY",
      message: "OpenAI API key found.",
      method: "api_key",
      configuredMode: authMode,
    };
  }

  const codex = await getCodexLoginStatus(env, runner);
  return codex.available && codex.loggedIn
    ? {
        ok: true,
        keyName: "codex login",
        message: "Using local Codex session auth for OpenAI.",
        method: "codex_cli_session",
        configuredMode: authMode,
      }
    : {
        ok: false,
        keyName: "OPENAI_API_KEY or codex login",
        message: `OpenAI is the default chat model, but no \`OPENAI_API_KEY\` was found and no usable Codex session was detected. ${codex.detail}`.trim(),
        method: "none",
        configuredMode: authMode,
      };
}

async function getClaudeCredentialStatus(
  env: NodeJS.ProcessEnv = process.env,
  runner: ExecRunner = defaultExecRunner,
): Promise<ProviderCredentialStatus> {
  const authMode = getClaudeAuthMode(env);
  const apiKey = env.ANTHROPIC_API_KEY?.trim();

  if (authMode === "api_key") {
    return apiKey
      ? {
          ok: true,
          keyName: "ANTHROPIC_API_KEY",
          message: "Anthropic API key found.",
          method: "api_key",
          configuredMode: authMode,
        }
      : {
          ok: false,
          keyName: "ANTHROPIC_API_KEY",
          message: "Claude was configured for API-key auth, but no `ANTHROPIC_API_KEY` was found.",
          method: "none",
          configuredMode: authMode,
        };
  }

  if (authMode === "claude_cli_session") {
    const claude = await getClaudeLoginStatus(env, runner);
    return claude.available && claude.loggedIn
      ? {
          ok: true,
          keyName: "claude auth login",
          message: "Claude CLI session found.",
          method: "claude_cli_session",
          configuredMode: authMode,
        }
      : {
          ok: false,
          keyName: "claude auth login",
          message: `Claude was configured for Claude CLI session auth, but it is not usable. ${claude.detail}`.trim(),
          method: "none",
          configuredMode: authMode,
        };
  }

  if (apiKey) {
    return {
      ok: true,
      keyName: "ANTHROPIC_API_KEY",
      message: "Anthropic API key found.",
      method: "api_key",
      configuredMode: authMode,
    };
  }

  const claude = await getClaudeLoginStatus(env, runner);
  return claude.available && claude.loggedIn
    ? {
        ok: true,
        keyName: "claude auth login",
        message: "Using local Claude CLI session auth for Anthropic.",
        method: "claude_cli_session",
        configuredMode: authMode,
      }
    : {
        ok: false,
        keyName: "ANTHROPIC_API_KEY or claude auth login",
        message: `Claude was selected, but no \`ANTHROPIC_API_KEY\` was found and no usable Claude CLI session was detected. ${claude.detail}`.trim(),
        method: "none",
        configuredMode: authMode,
      };
}

export async function getModelCredentialStatus(
  model: SupportedProvider,
  env: NodeJS.ProcessEnv = process.env,
  runner: ExecRunner = defaultExecRunner,
): Promise<ProviderCredentialStatus> {
  switch (model) {
    case "openai":
      return getOpenAiCredentialStatus(env, runner);
    case "claude":
      return getClaudeCredentialStatus(env, runner);
    case "gemini": {
      const value = env.GEMINI_API_KEY?.trim() ?? env.GOOGLE_API_KEY?.trim();
      return value
        ? {
            ok: true,
            keyName: env.GEMINI_API_KEY?.trim() ? "GEMINI_API_KEY" : "GOOGLE_API_KEY",
            message: "Gemini API key found.",
            method: "api_key",
          }
        : {
            ok: false,
            keyName: "GEMINI_API_KEY or GOOGLE_API_KEY",
            message: "Gemini was selected, but neither `GEMINI_API_KEY` nor `GOOGLE_API_KEY` was found.",
            method: "none",
          };
    }
  }
}

async function runCodexExecPrompt(
  prompt: string,
  modelId: string,
  env: NodeJS.ProcessEnv = process.env,
  workingDirectory: string = process.cwd(),
  runner: ExecRunner = defaultExecRunner,
): Promise<string> {
  const outputDir = await fsp.mkdtemp(path.join(os.tmpdir(), "pulseos-codex-auth-"));
  const outputFile = path.join(outputDir, "last-message.txt");

  try {
    const args = [
      "exec",
      "-C",
      workingDirectory,
      "-s",
      "read-only",
      "--ignore-user-config",
      "--color",
      "never",
      "-m",
      modelId,
      "-o",
      outputFile,
      prompt,
    ];
    await runner(getCodexBinary(env), args, {
      env,
      cwd: workingDirectory,
      timeoutMs: getCodexTimeoutMs(env),
    });
    if (!fs.existsSync(outputFile)) {
      throw new Error("Codex completed without writing a final response.");
    }
    return (await fsp.readFile(outputFile, "utf8")).trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Codex session execution failed. ${message}`);
  } finally {
    await fsp.rm(outputDir, { recursive: true, force: true });
  }
}

function renderCodexPrompt(systemPrompt: string, userPrompt: string): string {
  return [
    "You are answering through PulseOS-Lite using the local Codex session.",
    "Follow the system instructions exactly.",
    "Return only the assistant response body with no preamble.",
    "",
    "<system>",
    systemPrompt,
    "</system>",
    "",
    "<user>",
    userPrompt,
    "</user>",
  ].join("\n");
}

async function runClaudePrompt(
  request: ClaudeTextRequest,
  runner: ExecRunner = defaultExecRunner,
): Promise<string> {
  const args = [
    "-p",
    "--output-format",
    "text",
    "--model",
    request.modelId,
    "--permission-mode",
    "bypassPermissions",
    "--tools",
    "",
    "--system-prompt",
    request.systemPrompt,
    request.userPrompt,
  ];
  try {
    const { stdout } = await runner(getClaudeBinary(request.env), args, {
      env: request.env ?? process.env,
      cwd: request.workingDirectory,
      timeoutMs: getClaudeTimeoutMs(request.env),
    });
    return stdout.trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Claude CLI session execution failed. ${message}`);
  }
}

export async function generateOpenAiText(
  request: OpenAiTextRequest,
  runner: ExecRunner = defaultExecRunner,
): Promise<string> {
  const env = request.env ?? process.env;
  const status = await getOpenAiCredentialStatus(env, runner);
  if (!status.ok) throw new Error(status.message);

  if (status.method === "api_key") {
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY?.trim() });
    const response = await client.chat.completions.create({
      model: request.modelId,
      messages: [
        { role: "system", content: request.systemPrompt },
        { role: "user", content: request.userPrompt },
      ],
    });
    return response.choices[0]?.message?.content?.trim() ?? "";
  }

  return runCodexExecPrompt(
    renderCodexPrompt(request.systemPrompt, request.userPrompt),
    request.modelId,
    env,
    request.workingDirectory,
    runner,
  );
}

export async function generateClaudeText(
  request: ClaudeTextRequest,
  runner: ExecRunner = defaultExecRunner,
): Promise<string> {
  const env = request.env ?? process.env;
  const status = await getClaudeCredentialStatus(env, runner);
  if (!status.ok) throw new Error(status.message);

  if (status.method === "api_key") {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY?.trim() });
    const response = await client.messages.create({
      model: request.modelId,
      max_tokens: 8192,
      system: [{ type: "text", text: request.systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: request.userPrompt }],
      betas: ["prompt-caching-2024-07-31"],
    } as Parameters<typeof client.messages.create>[0]);
    const block = (response as Anthropic.Messages.Message).content[0];
    return block?.type === "text" ? block.text : "";
  }

  return runClaudePrompt(request, runner);
}

export async function validateOpenAiAccess(
  modelId: string,
  env: NodeJS.ProcessEnv = process.env,
  workingDirectory: string = process.cwd(),
  runner: ExecRunner = defaultExecRunner,
): Promise<void> {
  const status = await getOpenAiCredentialStatus(env, runner);
  if (!status.ok) throw new Error(status.message);

  if (status.method === "api_key") {
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY?.trim() });
    await client.models.retrieve(modelId);
    return;
  }

  const probe = await runCodexExecPrompt(
    "Reply with exactly OK and nothing else.",
    modelId,
    env,
    workingDirectory,
    runner,
  );
  if (!/^OK\b/i.test(probe)) {
    throw new Error(`Codex session validation returned an unexpected response: ${probe.slice(0, 200)}`);
  }
}

export async function validateClaudeAccess(
  modelId: string,
  env: NodeJS.ProcessEnv = process.env,
  workingDirectory: string = process.cwd(),
  runner: ExecRunner = defaultExecRunner,
): Promise<void> {
  const status = await getClaudeCredentialStatus(env, runner);
  if (!status.ok) throw new Error(status.message);

  if (status.method === "api_key") {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY?.trim() });
    await client.messages.create({
      model: modelId,
      max_tokens: 1,
      messages: [{ role: "user", content: "Reply with OK." }],
    } as Parameters<typeof client.messages.create>[0]);
    return;
  }

  const probe = await runClaudePrompt(
    {
      systemPrompt: "Return exactly the requested output.",
      userPrompt: "Reply with exactly OK and nothing else.",
      modelId,
      env,
      workingDirectory,
    },
    runner,
  );
  if (!/^OK\b/i.test(probe)) {
    throw new Error(`Claude CLI session validation returned an unexpected response: ${probe.slice(0, 200)}`);
  }
}
