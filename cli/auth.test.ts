import assert from "node:assert/strict";
import test from "node:test";

import { getClaudeAuthMode, getModelCredentialStatus, getOpenAiAuthMode, type ExecRunner } from "./auth.js";

function runnerWith(output: { stdout?: string; stderr?: string; error?: Error }): ExecRunner {
  return async () => {
    if (output.error) throw output.error;
    return { stdout: output.stdout ?? "", stderr: output.stderr ?? "" };
  };
}

test("getOpenAiAuthMode defaults to auto", () => {
  assert.equal(getOpenAiAuthMode({}), "auto");
});

test("getClaudeAuthMode defaults to auto", () => {
  assert.equal(getClaudeAuthMode({}), "auto");
});

test("openai auth status prefers API key in auto mode", async () => {
  const status = await getModelCredentialStatus(
    "openai",
    { OPENAI_API_KEY: "test-key" },
    runnerWith({ stdout: "Logged in using ChatGPT" }),
  );
  assert.equal(status.ok, true);
  assert.equal(status.method, "api_key");
});

test("openai auth status uses codex session in auto mode when no API key exists", async () => {
  const status = await getModelCredentialStatus(
    "openai",
    {},
    runnerWith({ stdout: "Logged in using ChatGPT" }),
  );
  assert.equal(status.ok, true);
  assert.equal(status.method, "codex_cli_session");
});

test("openai auth status fails cleanly when codex session mode is requested but unavailable", async () => {
  const status = await getModelCredentialStatus(
    "openai",
    { PULSEOS_OPENAI_AUTH_MODE: "codex_cli_session" },
    runnerWith({ error: new Error("spawn ENOENT") }),
  );
  assert.equal(status.ok, false);
  assert.equal(status.method, "none");
  assert.match(status.message, /Codex CLI is not installed|not usable/i);
});

test("claude auth status prefers API key in auto mode", async () => {
  const claude = await getModelCredentialStatus(
    "claude",
    { ANTHROPIC_API_KEY: "x" },
    runnerWith({ stdout: JSON.stringify({ loggedIn: true, authMethod: "oauth", apiProvider: "firstParty" }) }),
  );
  assert.equal(claude.ok, true);
  assert.equal(claude.method, "api_key");
});

test("claude auth status uses claude cli session in auto mode when no API key exists", async () => {
  const claude = await getModelCredentialStatus(
    "claude",
    {},
    runnerWith({ stdout: JSON.stringify({ loggedIn: true, authMethod: "oauth", apiProvider: "firstParty" }) }),
  );
  assert.equal(claude.ok, true);
  assert.equal(claude.method, "claude_cli_session");
});

test("claude auth status fails cleanly when claude cli session mode is requested but unavailable", async () => {
  const status = await getModelCredentialStatus(
    "claude",
    { PULSEOS_CLAUDE_AUTH_MODE: "claude_cli_session" },
    runnerWith({ error: new Error("spawn ENOENT") }),
  );
  assert.equal(status.ok, false);
  assert.equal(status.method, "none");
  assert.match(status.message, /Claude CLI is not installed|not usable/i);
});

test("gemini still uses API-key-only availability", async () => {
  const gemini = await getModelCredentialStatus("gemini", { GOOGLE_API_KEY: "y" });
  assert.equal(gemini.ok, true);
  assert.equal(gemini.method, "api_key");
});
