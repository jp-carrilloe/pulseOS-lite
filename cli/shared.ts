import fs from "node:fs";
import fsp from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getModelCredentialStatus as resolveModelCredentialStatus, type ProviderCredentialStatus } from "./auth.js";
import {
  prepareWorkspaceStorage,
  resolveWorkspacePaths,
  snapshotWorkspaceDatabase,
} from "./workspace-storage.js";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export type ModelName = "claude" | "openai" | "gemini";

export const DEFAULT_CHAT_MODELS: Record<ModelName, string> = {
  openai: "gpt-4o",
  claude: "claude-opus-4-6",
  gemini: "gemini-2.0-flash",
};

export const SUGGESTED_CHAT_MODELS: Record<ModelName, string[]> = {
  openai: ["gpt-4o", "gpt-4o-mini"],
  claude: ["claude-opus-4-6", "claude-sonnet-4-5"],
  gemini: ["gemini-2.0-flash", "gemini-1.5-pro"],
};

export function getChatModelEnvVar(provider: ModelName): string {
  switch (provider) {
    case "openai":
      return "PULSEOS_CHAT_OPENAI_MODEL";
    case "claude":
      return "PULSEOS_CHAT_ANTHROPIC_MODEL";
    case "gemini":
      return "PULSEOS_CHAT_GEMINI_MODEL";
  }
}

export function getDefaultChatModel(provider: ModelName, env: NodeJS.ProcessEnv = process.env): string {
  return env[getChatModelEnvVar(provider)]?.trim() || DEFAULT_CHAT_MODELS[provider];
}

export interface DaemonState {
  pid: number;
  port: number;
  token: string;
  startedAt: string;
  version: string;
}

export interface BootstrapState {
  status: "running" | "completed" | "failed";
  startedAt: string;
  completedAt: string | null;
  companyName: string | null;
  templateFiles: number;
  succeeded: number;
  failed: number;
  localSourceCount: number;
  externalSourceCount: number;
  companyMemorySourceCount?: number;
  indexedDocumentCount?: number;
  indexedAt?: string | null;
  warningsCount: number;
  error: string | null;
}

export function getCliHome(env: NodeJS.ProcessEnv = process.env): string {
  return resolveWorkspacePaths(REPO_ROOT, env).workspaceRoot;
}

export function getCliWorkspaceId(env: NodeJS.ProcessEnv = process.env): string {
  return resolveWorkspacePaths(REPO_ROOT, env).workspaceId;
}

export function getCliHomeRoot(env: NodeJS.ProcessEnv = process.env): string {
  return resolveWorkspacePaths(REPO_ROOT, env).homeRoot;
}

export function getCliSnapshotsDir(env: NodeJS.ProcessEnv = process.env): string {
  return resolveWorkspacePaths(REPO_ROOT, env).snapshotsDir;
}

export function getCliLogsDir(env: NodeJS.ProcessEnv = process.env): string {
  return resolveWorkspacePaths(REPO_ROOT, env).logsDir;
}

export function getCliCacheDir(env: NodeJS.ProcessEnv = process.env): string {
  return resolveWorkspacePaths(REPO_ROOT, env).cacheDir;
}

export function getDaemonStateFilePath(env: NodeJS.ProcessEnv = process.env): string {
  return resolveWorkspacePaths(REPO_ROOT, env).daemonStateFilePath;
}

export function getBootstrapStateFilePath(env: NodeJS.ProcessEnv = process.env): string {
  return resolveWorkspacePaths(REPO_ROOT, env).bootstrapStateFilePath;
}

export function getCliDbPath(env: NodeJS.ProcessEnv = process.env): string {
  return resolveWorkspacePaths(REPO_ROOT, env).dbPath;
}

export function getDaemonIdleMs(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(
    env.PULSEOS_LITE_OPEN_SOURCE_CLI_DAEMON_IDLE_MS ?? env.PULSEOS_CLI_DAEMON_IDLE_MS ?? 60 * 60 * 1000,
  );
  return Number.isFinite(parsed) && parsed >= 1000 ? parsed : 60 * 60 * 1000;
}

export function getPreferredDaemonPort(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env.PULSEOS_LITE_OPEN_SOURCE_CLI_PORT ?? env.PULSEOS_CLI_PORT ?? 50464);
  return Number.isInteger(parsed) && parsed >= 1024 && parsed <= 65535 ? parsed : 50464;
}

export async function writeDaemonState(state: DaemonState, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const filePath = getDaemonStateFilePath(env);
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  await fsp.writeFile(tempPath, JSON.stringify(state, null, 2), { encoding: "utf8", mode: 0o600 });
  await fsp.rename(tempPath, filePath);
}

export async function readDaemonState(env: NodeJS.ProcessEnv = process.env): Promise<DaemonState | null> {
  const filePath = getDaemonStateFilePath(env);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(await fsp.readFile(filePath, "utf8")) as DaemonState;
  } catch {
    return null;
  }
}

export async function removeDaemonState(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const filePath = getDaemonStateFilePath(env);
  if (fs.existsSync(filePath)) {
    await fsp.rm(filePath, { force: true });
  }
}

export async function writeBootstrapState(
  state: BootstrapState,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const filePath = getBootstrapStateFilePath(env);
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  await fsp.writeFile(tempPath, JSON.stringify(state, null, 2), { encoding: "utf8", mode: 0o600 });
  await fsp.rename(tempPath, filePath);
}

export async function readBootstrapState(env: NodeJS.ProcessEnv = process.env): Promise<BootstrapState | null> {
  const filePath = getBootstrapStateFilePath(env);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(await fsp.readFile(filePath, "utf8")) as BootstrapState;
  } catch {
    return null;
  }
}

export async function ensureCliWorkspaceReady(
  env: NodeJS.ProcessEnv = process.env,
  options?: { log?: (message: string) => void },
) {
  return prepareWorkspaceStorage({ repoRoot: REPO_ROOT, env, log: options?.log });
}

export async function createWorkspaceSnapshot(
  env: NodeJS.ProcessEnv = process.env,
  options?: { timestamp?: string },
): Promise<string | null> {
  return snapshotWorkspaceDatabase({ repoRoot: REPO_ROOT, env, timestamp: options?.timestamp });
}

export async function probeDaemonHealth(port: number, token: string): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function probeGraphBootstrapUrl(port: number, token: string): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/graph?token=${encodeURIComponent(token)}`, {
      redirect: "manual",
    });
    return response.status === 302 && response.headers.get("location") === "/graph";
  } catch {
    return false;
  }
}

export async function probeUiCapabilities(port: number, token: string): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/ui-capabilities?token=${encodeURIComponent(token)}`);
    if (!response.ok) return false;
    const payload = (await response.json()) as { data?: { uiApiVersion?: number } };
    return typeof payload.data?.uiApiVersion === "number";
  } catch {
    return false;
  }
}

export async function fetchDaemonJson<T>(
  state: DaemonState,
  pathname: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers ?? undefined);
  headers.set("Authorization", `Bearer ${state.token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`http://127.0.0.1:${state.port}${pathname}`, { ...init, headers });
  const payload = response.headers.get("content-type")?.includes("application/json")
    ? ((await response.json()) as { data?: T; error?: { message?: string } })
    : null;
  if (!response.ok) {
    throw new Error(
      payload?.error?.message ??
        `The daemon request to ${pathname} failed.\nThe local daemon may still be starting, may have stopped unexpectedly, or may need to be restarted.`,
    );
  }
  return payload?.data as T;
}

async function canListenOnPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, "127.0.0.1", () => {
      server.close((err) => resolve(!err));
    });
    server.on("error", () => resolve(false));
  });
}

async function findEphemeralPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to get an available port")));
        return;
      }
      const port = address.port;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
    server.on("error", reject);
  });
}

export async function getAvailablePort(env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const preferredPort = getPreferredDaemonPort(env);
  if (await canListenOnPort(preferredPort)) {
    return preferredPort;
  }
  return findEphemeralPort();
}

export function getDaemonVersion(): string {
  return "1.9.1";
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function loadRepoEnv(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const envFiles = [path.join(REPO_ROOT, ".env"), path.join(REPO_ROOT, ".env.local")];
  for (const envFilePath of envFiles) {
    try {
      const envContent = await fsp.readFile(envFilePath, "utf8");
      for (const line of envContent.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
        if (key && !(key in env)) env[key] = value;
      }
    } catch {
      // .env files are optional
    }
  }
}

export async function getModelCredentialStatus(
  model: ModelName,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ProviderCredentialStatus> {
  return resolveModelCredentialStatus(model, env);
}
