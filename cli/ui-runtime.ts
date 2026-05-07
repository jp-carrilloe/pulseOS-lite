import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { probeUiBootstrapUrl, probeUiCapabilities, type DaemonState } from "./shared.js";

const CLI_ROOT = path.dirname(fileURLToPath(import.meta.url));

export function getUiUrl(state: DaemonState): string {
  return `http://127.0.0.1:${state.port}/ui?token=${encodeURIComponent(state.token)}`;
}

export async function buildUiBundle(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("npm", ["run", "ui:build"], {
      cwd: CLI_ROOT,
      env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`UI build failed with exit code ${code ?? 1}.`));
    });
  });
}

export async function ensureUiReady(state: DaemonState): Promise<string> {
  const uiReady = await probeUiBootstrapUrl(state.port, state.token);
  const capabilitiesReady = await probeUiCapabilities(state.port, state.token);
  if (!uiReady || !capabilitiesReady) {
    throw new Error(
      "The daemon started, but the UI compatibility handshake did not become ready.\nTry `npm run daemon:stop` and then rerun the command.",
    );
  }
  return getUiUrl(state);
}
