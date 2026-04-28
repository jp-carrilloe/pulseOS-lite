import { spawn } from "node:child_process";
import fs from "node:fs";
import { createInterface } from "node:readline/promises";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectBootstrapIntake } from "./bootstrap-intake.js";
import {
  REPO_ROOT,
  getBootstrapStateFilePath,
  getCliDbPath,
  type DaemonState,
  type ModelName,
  delay,
  fetchDaemonJson,
  getDaemonStateFilePath,
  getDaemonVersion,
  getModelCredentialStatus,
  loadRepoEnv,
  probeGraphBootstrapUrl,
  probeUiCapabilities,
  probeDaemonHealth,
  readBootstrapState,
  readDaemonState,
  removeDaemonState,
} from "./shared.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── CLI Entry ─────────────────────────────────────────────────────────────────

async function main(argv = process.argv.slice(2), env: NodeJS.ProcessEnv = process.env) {
  await loadRepoEnv(env);
  const args = parseCliArgs(argv);
  const [command, subcommand] = args.positionals;

  try {
    switch (`${command ?? ""} ${subcommand ?? ""}`.trim()) {
      case "daemon start":
        await ensureRuntime(env);
        process.stdout.write("Daemon started. It will use the existing SQLite index immediately. Run `npm run index` or `:reload` only when you want to refresh indexing/vectorization.\n");
        break;
      case "daemon stop":
        await stopDaemon(env);
        break;
      case "daemon status":
        await printDaemonStatus(env);
        break;
      case "status":
        await printWorkflowStatus(env);
        break;
      case "graph":
        await printGraphUrl(env);
        break;
      case "chat":
      case "":
        await runInteractiveChat(args.flags, env);
        break;
      default:
        process.stderr.write(
          `I don't recognize that command: ${args.positionals.join(" ") || "none"}.\nUse one of: chat, status, daemon start, daemon stop, or daemon status.\n\n`,
        );
        printHelp();
        process.exitCode = 1;
    }
  } catch (err) {
    process.stderr.write(`\nSomething went wrong.\n${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  }
}

function printHelp() {
  process.stdout.write(`
pulseos-lite-open-source-cli — Chat with your PulseOS Lite Open Source repo using Claude, OpenAI, or Gemini

Workflow:
  npm run bootstrap          — seed the markdown documents
  npm run chat               — start the daemon and use the existing SQLite index
  npm run graph              — build and open the PulseOS Company Memory UI

Usage:
  npm run chat [-- --model <openai|claude|gemini>]
  npm run graph
  npm run status
  npm run daemon:start
  npm run daemon:stop
  npm run daemon:status

Chat commands (type while in REPL):
  :model openai|claude|gemini  — switch AI model
  :reset                       — clear conversation history
  :reload                      — manually re-index repo files and re-run vectorization
  :files                       — list indexed files
  :status                      — daemon status
  :help                        — show this help
  :exit                        — quit

Environment variables (set in .env at repo root):
  ANTHROPIC_API_KEY
  OPENAI_API_KEY
  GEMINI_API_KEY
`);
}

// ── Daemon Lifecycle ──────────────────────────────────────────────────────────

async function ensureRuntime(env: NodeJS.ProcessEnv): Promise<DaemonState> {
  let state = await readDaemonState(env);
  const alive = state ? await probeDaemonHealth(state.port, state.token) : false;

  if (state && alive && state.version === getDaemonVersion()) {
    return state;
  }

  if (state) {
    try {
      process.kill(state.pid, "SIGTERM");
    } catch {
      // stale pid
    }
    await removeDaemonState(env);
    state = null;
  }

  const daemonEntry = path.join(__dirname, "daemon.ts");
  const child = spawn(process.execPath, ["--import", "tsx/esm", daemonEntry], {
    detached: true,
    stdio: "ignore",
    env,
  });
  child.unref();

  for (let attempt = 0; attempt < 40; attempt++) {
    await delay(150);
    const next = await readDaemonState(env);
    if (!next) continue;
    const ok = await probeDaemonHealth(next.port, next.token);
    if (ok) return next;
  }

  throw new Error(
    "The CLI daemon did not become ready in time.\nCheck that your repo .env/.env.local file is present, your model API keys are valid, and no older daemon process is stuck.\nThen try `npm run daemon:status` or start chat again.",
  );
}

async function stopDaemon(env: NodeJS.ProcessEnv): Promise<void> {
  const state = await readDaemonState(env);
  if (!state) {
    process.stdout.write("The daemon is not running right now.\n");
    return;
  }
  try {
    await fetchDaemonJson(state, "/shutdown", { method: "POST" });
  } catch {
    // might throw as connection closes
  }
  for (let attempt = 0; attempt < 20; attempt++) {
    await delay(100);
    const current = await readDaemonState(env);
    if (!current) {
      process.stdout.write("Daemon stopped cleanly.\n");
      return;
    }
  }
  process.stdout.write("The daemon did not stop in time. You may need to stop the process manually and then retry.\n");
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function printDaemonStatus(env: NodeJS.ProcessEnv): Promise<void> {
  const state = await readDaemonState(env);
  if (!state) {
    process.stdout.write(
      `Status: not running\nNo active daemon state file was found at:\n${getDaemonStateFilePath(env)}\n`,
    );
    return;
  }
  const alive = await probeDaemonHealth(state.port, state.token);
  if (!alive) {
    const pidAlive = isProcessAlive(state.pid);
    process.stdout.write(
      pidAlive
        ? `Status: unverified\nThe recorded daemon process (pid ${state.pid}) still exists, but this CLI could not confirm localhost health from the current environment.\nIf the graph UI is already open and working, you can keep using it. Otherwise run \`npm run daemon:stop\` and then relaunch with \`npm run graph\` or \`npm run chat\`.\n`
        : `Status: stale\nThe recorded daemon process (pid ${state.pid}) is not responding.\nYou can usually recover by running \`npm run daemon:stop\` and then starting chat again.\n`,
    );
    return;
  }
  const status = await fetchDaemonJson<Record<string, unknown>>(state, "/status");
  process.stdout.write(JSON.stringify(status, null, 2) + "\n");
}

async function printWorkflowStatus(env: NodeJS.ProcessEnv): Promise<void> {
  const intake = await collectBootstrapIntake(REPO_ROOT, "");
  const bootstrapState = await readBootstrapState(env);
  const daemonState = await readDaemonState(env);
  const daemonAlive = daemonState ? await probeDaemonHealth(daemonState.port, daemonState.token) : false;
  const daemonPidAlive = daemonState ? isProcessAlive(daemonState.pid) : false;
  const dbPath = getCliDbPath(env);
  const dbExists = fs.existsSync(dbPath);

  let documentCount = 0;
  let vectorCount = 0;
  let referenceCount = 0;
  let latestIndexRun:
    | { status: string; completed_at: string | null; files_indexed: number; error: string | null }
    | null = null;

  if (dbExists) {
    const db = new DatabaseSync(dbPath, { open: true });
    try {
      const tables = new Set(
        (
          db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`).all() as Array<{ name: string }>
        ).map((row) => row.name),
      );
      if (tables.has("documents")) {
        documentCount = (db.prepare(`SELECT COUNT(*) as count FROM documents`).get() as { count: number }).count;
      }
      if (tables.has("knowledge_vectors")) {
        vectorCount = (db.prepare(`SELECT COUNT(*) as count FROM knowledge_vectors`).get() as { count: number }).count;
      }
      if (tables.has("document_references")) {
        referenceCount = (db.prepare(`SELECT COUNT(*) as count FROM document_references`).get() as { count: number }).count;
      }
      if (tables.has("index_runs")) {
        latestIndexRun =
          (db
            .prepare(
              `SELECT status, completed_at, files_indexed, error
               FROM index_runs
               ORDER BY started_at DESC
               LIMIT 1`,
            )
            .get() as {
            status: string;
            completed_at: string | null;
            files_indexed: number;
            error: string | null;
          } | null) ?? null;
      }
    } finally {
      db.close();
    }
  }

  const lines = [
    "PulseOS Lite Open Source Workflow Status",
    "=======================================",
    "",
    "Bootstrap:",
  ];

  if (!bootstrapState) {
    lines.push(`- Status: not run yet`);
    lines.push(`- State file: ${getBootstrapStateFilePath(env)}`);
  } else {
    lines.push(`- Status: ${bootstrapState.status}`);
    if (bootstrapState.companyName) lines.push(`- Company: ${bootstrapState.companyName}`);
    lines.push(`- Templates processed: ${bootstrapState.templateFiles}`);
    lines.push(`- Seeded successfully: ${bootstrapState.succeeded}`);
    lines.push(`- Failed: ${bootstrapState.failed}`);
    lines.push(`- Local intake files used: ${bootstrapState.localSourceCount}`);
    lines.push(`- External reference files used: ${bootstrapState.externalSourceCount}`);
    lines.push(`- Warnings: ${bootstrapState.warningsCount}`);
    if (bootstrapState.completedAt) lines.push(`- Completed at: ${bootstrapState.completedAt}`);
    if (bootstrapState.error) lines.push(`- Error: ${bootstrapState.error}`);
  }

  lines.push("", "Current intake:");
  lines.push(`- Local source files available now: ${intake.localSources.length}`);
  lines.push(`- External source files available now: ${intake.externalSources.length}`);
  lines.push(`- Intake warnings now: ${intake.warnings.length}`);

  lines.push("", "Daemon:");
  if (!daemonState) {
    lines.push(`- Status: not running`);
  } else {
    lines.push(`- Status: ${daemonAlive ? "running" : daemonPidAlive ? "unverified" : "stale"}`);
    lines.push(`- PID: ${daemonState.pid}`);
    lines.push(`- Started at: ${daemonState.startedAt}`);
    if (!daemonAlive && daemonPidAlive) {
      lines.push(`- Note: The daemon process exists, but this CLI could not confirm localhost health from the current environment.`);
    }
  }

  lines.push("", "SQL + vectorization:");
  lines.push(`- Database path: ${dbPath}`);
  lines.push(`- Database exists: ${dbExists ? "yes" : "no"}`);
  lines.push(`- Documents table rows: ${documentCount}`);
  lines.push(`- Vector rows: ${vectorCount}`);
  lines.push(`- Document relationship rows: ${referenceCount}`);
  if (latestIndexRun) {
    lines.push(`- Latest index run status: ${latestIndexRun.status}`);
    lines.push(`- Latest files indexed: ${latestIndexRun.files_indexed}`);
    if (latestIndexRun.completed_at) lines.push(`- Latest index completed: ${latestIndexRun.completed_at}`);
    if (latestIndexRun.error) lines.push(`- Latest index error: ${latestIndexRun.error}`);
  } else {
    lines.push(`- Latest index run status: not available`);
  }

  lines.push("", "Overall checks:");
  lines.push(`- Source intake ready: ${intake.localSources.length + intake.externalSources.length > 0 ? "yes" : "no"}`);
  lines.push(`- Bootstrap completed successfully: ${bootstrapState?.status === "completed" ? "yes" : "no"}`);
  lines.push(`- SQL tables populated: ${documentCount > 0 ? "yes" : "no"}`);
  lines.push(`- Vectorization completed: ${vectorCount > 0 ? "yes" : "no"}`);
  lines.push(`- Document relationships populated: ${referenceCount > 0 ? "yes" : "no"}`);

  process.stdout.write(lines.join("\n") + "\n");
}

async function printGraphUrl(env: NodeJS.ProcessEnv): Promise<void> {
  process.stdout.write("Building and starting the PulseOS Company Memory UI...\n");
  const state = await ensureRuntime(env);
  const graphReady = await probeGraphBootstrapUrl(state.port, state.token);
  const capabilitiesReady = await probeUiCapabilities(state.port, state.token);
  if (!graphReady || !capabilitiesReady) {
    throw new Error(
      "The graph daemon started, but the UI compatibility handshake did not become ready.\nTry `npm run daemon:stop` and then `npm run graph` again.",
    );
  }
  const url = `http://127.0.0.1:${state.port}/graph?token=${encodeURIComponent(state.token)}`;
  process.stdout.write(
    [
      "PulseOS Company Memory UI is ready.",
      "",
      "Open this local URL in your browser:",
      url,
      "",
      "What it shows:",
      "- Left explorer: folders and Markdown documents inside 000_Company_Memory only.",
      "- Center graph: Company Ontology and Document Relationships views backed by SQLite.",
      "- Right panel: read and save Markdown documents inside 000_Company_Memory.",
      "- Interaction: pan, zoom, fit, reset, and drag graph nodes without changing layout data.",
      "",
      "Saving a document refreshes the SQLite documents table and summary vectors so chat and graph retrieval stay current.",
      "Open the printed link once to create the local browser session. After that, the UI redirects to a clean localhost URL and normal refresh works.",
    ].join("\n") + "\n",
  );
}

async function daemonCommand<T>(state: DaemonState, name: string, args: Record<string, unknown>): Promise<T> {
  return fetchDaemonJson<T>(state, "/command", {
    method: "POST",
    body: JSON.stringify({ name, args }),
  });
}

// ── Interactive Chat ──────────────────────────────────────────────────────────

async function runInteractiveChat(
  flags: Record<string, string | boolean>,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  let model: ModelName = (flags.model as ModelName | undefined) ?? "openai";
  assertModelCredentials(model, env);

  process.stdout.write("Starting pulseos-lite-open-source-cli daemon...\n");
  const state = await ensureRuntime(env);
  process.stdout.write("Connected. The daemon is using the existing SQLite index. Run :reload only when you want to refresh indexing/vectorization.\n\n");

  const sessionId = "main";

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: process.stdin.isTTY ?? true,
  });

  printWelcome(model);

  try {
    while (true) {
      let rawLine: string;
      try {
        rawLine = await rl.question(`\n[${model}]> `);
      } catch {
        break; // readline closed (Ctrl+D)
      }

      const line = rawLine.trim();
      if (!line) continue;

      // handle REPL commands
      if (line.startsWith(":")) {
        const handled = await handleReplCommand(line, state, model, sessionId, env);
        if (handled === "exit") break;
        if (handled !== null) {
          model = handled as ModelName;
        }
        continue;
      }

      // send to AI
      process.stdout.write("Thinking...\n");
      try {
        const result = await daemonCommand<{ reply: string; model: ModelName; messageCount: number }>(
          state,
          "chat",
          { message: line, model, session_id: sessionId },
        );
        process.stdout.write(`\n${result.reply}\n`);
        process.stdout.write(`\n— ${result.model} · ${result.messageCount / 2} exchanges\n`);
      } catch (err) {
        process.stderr.write(`\nThat request could not be completed.\n${err instanceof Error ? err.message : String(err)}\n`);
      }
    }
  } finally {
    rl.close();
    process.stdout.write("\nSession ended.\n");
  }
}

async function handleReplCommand(
  line: string,
  state: DaemonState,
  currentModel: ModelName,
  sessionId: string,
  env: NodeJS.ProcessEnv,
): Promise<ModelName | "exit" | null> {
  const [cmd, arg] = line.slice(1).split(/\s+/);

  switch (cmd) {
    case "exit":
    case "quit":
      return "exit";

    case "help":
      printHelp();
      return null;

    case "model": {
      const next = arg as ModelName | undefined;
      if (!next || !["claude", "openai", "gemini"].includes(next)) {
        process.stdout.write("Please choose a valid model: `:model openai`, `:model claude`, or `:model gemini`.\n");
        return null;
      }
      assertModelCredentials(next, env);
      process.stdout.write(`Switched to ${next}.\n`);
      return next;
    }

    case "reset": {
      await daemonCommand(state, "reset_session", { session_id: sessionId });
      process.stdout.write("Session history cleared.\n");
      return null;
    }

    case "reload": {
      process.stdout.write("Re-indexing repository...\n");
      const result = await daemonCommand<{
        files: number;
        charCount: number;
        embeddingModel: string;
        embeddingMode: string;
      }>(state, "reload_repo", {});
      process.stdout.write(
        `Done. ${result.files} files (${result.charCount.toLocaleString()} chars) using ${result.embeddingModel} [${result.embeddingMode}]\n`,
      );
      return null;
    }

    case "files": {
      const files = await daemonCommand<string[]>(state, "list_files", {});
      process.stdout.write(`${files.length} indexed files:\n`);
      for (const f of files) process.stdout.write(`  ${f}\n`);
      return null;
    }

    case "status": {
      const status = await fetchDaemonJson<Record<string, unknown>>(state, "/status");
      process.stdout.write(JSON.stringify(status, null, 2) + "\n");
      return null;
    }

    default:
      process.stdout.write(`I don't recognize \`:${cmd}\`.\nType \`:help\` to see the available chat commands.\n`);
      return null;
  }
}

function printWelcome(model: ModelName) {
  process.stdout.write("🚢 PulseOS Lite Open Source — Strategic Growth Engine\n");
  process.stdout.write(`Vibe: JP Standard | Model: ${model}\n`);
  process.stdout.write("Workflow: bootstrap seeds documents; chat/daemon reads the existing SQL index; :reload or npm run index refresh indexing/vectorization manually.\n");
  process.stdout.write("─".repeat(60) + "\n");
}

function assertModelCredentials(model: ModelName, env: NodeJS.ProcessEnv) {
  const status = getModelCredentialStatus(model, env);
  if (!status.ok) {
    throw new Error(`${status.message}\nAdd ${status.keyName} to \`.env\` or \`.env.local\` at the repo root, then run the command again.`);
  }
}

// ── Arg Parsing ───────────────────────────────────────────────────────────────

function parseCliArgs(argv: string[]) {
  const flags: Record<string, string | boolean> = {};
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const current = argv[i];
    if (!current.startsWith("--")) {
      positionals.push(current);
      continue;
    }
    const normalized = current.slice(2);
    if (normalized.includes("=")) {
      const [key, value] = normalized.split("=", 2);
      flags[key] = value;
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      flags[normalized] = next;
      i++;
      continue;
    }
    flags[normalized] = true;
  }

  return { flags, positionals };
}

// ── Run ───────────────────────────────────────────────────────────────────────

await main();
