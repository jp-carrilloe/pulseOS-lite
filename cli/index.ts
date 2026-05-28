import { spawn } from "node:child_process";
import fs from "node:fs";
import { createInterface } from "node:readline/promises";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectBootstrapIntake } from "./bootstrap-intake.js";
import type { RetrievalDebugSummary } from "./retrieval.js";
import { actionBlock, bold, bullet, dim, kv, section, tone } from "./terminal-format.js";
import { buildUiBundle, ensureUiReady } from "./ui-runtime.js";
import {
  REPO_ROOT,
  ensureCliWorkspaceReady,
  getBootstrapStateFilePath,
  getCliDbPath,
  getCliHome,
  getCliHomeRoot,
  type DaemonState,
  type ModelName,
  delay,
  fetchDaemonJson,
  getDefaultChatModel,
  getDaemonStateFilePath,
  getDaemonVersion,
  getModelCredentialStatus,
  SUGGESTED_CHAT_MODELS,
  loadRepoEnv,
  probeDaemonHealth,
  readBootstrapState,
  readDaemonState,
  removeDaemonState,
} from "./shared.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODEL_PROVIDERS: ModelName[] = ["openai", "claude", "gemini"];

interface ChatModelSelection {
  provider: ModelName;
  modelId: string;
}

// ── CLI Entry ─────────────────────────────────────────────────────────────────

async function main(argv = process.argv.slice(2), env: NodeJS.ProcessEnv = process.env) {
  await loadRepoEnv(env);
  const args = parseCliArgs(argv);
  const [command, subcommand] = args.positionals;
  const shouldPrepareWorkspace =
    command === undefined
    || command === "chat"
    || command === "ui"
    || command === "graph"
    || command === "status"
    || (command === "daemon" && subcommand === "start");
  if (shouldPrepareWorkspace) {
    const workspace = await ensureCliWorkspaceReady(env, { log: (message) => process.stdout.write(message) });
    process.stdout.write(
      `Workspace storage: ${workspace.paths.workspaceRoot}\n`,
    );
  }

  try {
    switch (`${command ?? ""} ${subcommand ?? ""}`.trim()) {
      case "daemon start":
        await ensureRuntime(env);
        process.stdout.write("Daemon started. It checks 000_Company_Memory against the SQLite graph/index on startup.\n");
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
      case "ui":
      case "graph":
        await printUiUrl(env);
        break;
      case "chat":
      case "":
        await runInteractiveChat(args.flags, env);
        break;
      default:
        process.stderr.write(
          `I don't recognize that command: ${args.positionals.join(" ") || "none"}.\nUse one of: chat, ui, status, daemon start, daemon stop, or daemon status.\n\n`,
        );
        printHelp();
        process.exitCode = 1;
    }
  } catch (err) {
    process.stderr.write(
      `\n${section("Command Failed")}\n${kv("Error", err instanceof Error ? err.message : String(err), "danger")}\n${actionBlock("Best next action", ["Fix the issue above, then rerun the command.", "Use `npm run status` if you want a quick health snapshot first."], "danger")}\n`,
    );
    process.exitCode = 1;
  }
}

function printHelp() {
  process.stdout.write(`
${bold("pulseos-lite-cli")} — Chat with your PulseOS-Lite repo using Claude, OpenAI, or Gemini

${section("Workflow")}
  npm run bootstrap          — seed the markdown documents
  npm run chat               — start the daemon and refresh the Company Memory index
  npm run ui                 — build and open the PulseOS Company Memory UI

${section("Usage")}
  npm run chat [-- --model <auto|openai|claude|gemini> --model-id <provider-model-id|auto>]
  npm run ui
  npm run status
  npm run daemon:start
  npm run daemon:stop
  npm run daemon:status

${section("Chat Commands")}
  /model auto                  — auto-pick the first configured provider
  /model openai gpt-5.4        — switch provider and model id
  /ui                          — build the browser UI and print the local URL
  /models                      — list configured provider examples
  /reset                       — clear conversation history
  /reload                      — manually re-index repo files/new docs and re-run vectorization
  /retrieve <query>             — show retrieval ranking diagnostics for a query
  /files                       — list indexed files
  /status                      — daemon status
  /help                        — show this help
  /exit                        — quit

${section("Environment")}
  ANTHROPIC_API_KEY
  OPENAI_API_KEY
  GEMINI_API_KEY
  PULSEOS_CLAUDE_AUTH_MODE
  PULSEOS_CLAUDE_BIN
  PULSEOS_OPENAI_AUTH_MODE
  PULSEOS_OPENAI_CODEX_BIN
  PULSEOS_HOME
  PULSEOS_WORKSPACE_ID
  PULSEOS_CHAT_OPENAI_MODEL
  PULSEOS_CHAT_ANTHROPIC_MODEL
  PULSEOS_CHAT_GEMINI_MODEL
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
      `${section("Daemon Status")}\n${kv("Status", "not running", "warning")}\n${bullet(`No active daemon state file was found at ${getDaemonStateFilePath(env)}`)}\n\n${actionBlock("Best next action", ["Run `npm run chat` for the CLI session or `npm run ui` for the browser workspace."], "warning")}\n`,
    );
    return;
  }
  const alive = await probeDaemonHealth(state.port, state.token);
  if (!alive) {
    const pidAlive = isProcessAlive(state.pid);
    process.stdout.write(
      pidAlive
        ? `${section("Daemon Status")}\n${kv("Status", "unverified", "warning")}\n${bullet(`Recorded process ${state.pid} still exists, but localhost health could not be confirmed.`, "warning")}\n${bullet("If the UI is already open and working, you can keep using it.", "muted")}\n\n${actionBlock("Best next action", ["Run `npm run daemon:stop`", "Then relaunch with `npm run chat` or `npm run ui`"], "warning")}\n`
        : `${section("Daemon Status")}\n${kv("Status", "stale", "danger")}\n${bullet(`Recorded process ${state.pid} is not responding.`, "danger")}\n\n${actionBlock("Best next action", ["Run `npm run daemon:stop`", "Then start a fresh session with `npm run chat` or `npm run ui`"], "warning")}\n`,
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
  const openAiStatus = await getModelCredentialStatus("openai", env);
  const claudeStatus = await getModelCredentialStatus("claude", env);
  const geminiStatus = await getModelCredentialStatus("gemini", env);

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

  const lines = [section("PulseOS-Lite Workflow Status"), "", section("Workspace"), kv("Home root", getCliHomeRoot(env)), kv("Workspace root", getCliHome(env))];

  if (!bootstrapState) {
    lines.push("", section("Bootstrap"));
    lines.push(kv("Status", "not run yet", "warning"));
    lines.push(kv("State file", getBootstrapStateFilePath(env)));
  } else {
    lines.push("", section("Bootstrap"));
    lines.push(kv("Status", bootstrapState.status, bootstrapState.status === "completed" ? "success" : bootstrapState.status === "running" ? "info" : "warning"));
    if (bootstrapState.companyName) lines.push(kv("Company", bootstrapState.companyName, "info"));
    lines.push(kv("Templates processed", String(bootstrapState.templateFiles)));
    lines.push(kv("Seeded successfully", String(bootstrapState.succeeded), "success"));
    lines.push(kv("Failed", String(bootstrapState.failed), bootstrapState.failed > 0 ? "danger" : "muted"));
    lines.push(kv("Local intake files used", String(bootstrapState.localSourceCount)));
    lines.push(kv("External reference files used", String(bootstrapState.externalSourceCount)));
    lines.push(kv("Company Memory files checked", String(bootstrapState.companyMemorySourceCount ?? 0)));
    if (bootstrapState.indexedDocumentCount !== undefined) {
      lines.push(kv("Company Memory docs indexed after bootstrap", String(bootstrapState.indexedDocumentCount)));
    }
    if (bootstrapState.indexedAt) lines.push(kv("Latest bootstrap index refresh", bootstrapState.indexedAt));
    lines.push(kv("Warnings", String(bootstrapState.warningsCount), bootstrapState.warningsCount > 0 ? "warning" : "muted"));
    if (bootstrapState.completedAt) lines.push(kv("Completed at", bootstrapState.completedAt));
    if (bootstrapState.error) lines.push(kv("Error", bootstrapState.error, "danger"));
  }

  lines.push("", section("Current Intake"));
  lines.push(kv("Local source files available now", String(intake.localSources.length), intake.localSources.length > 0 ? "success" : "warning"));
  lines.push(kv("External source files available now", String(intake.externalSources.length), intake.externalSources.length > 0 ? "success" : "muted"));
  lines.push(kv("Curated Company Memory files available now", String(intake.companyMemorySources.length), intake.companyMemorySources.length > 0 ? "success" : "warning"));
  lines.push(kv("Intake warnings now", String(intake.warnings.length), intake.warnings.length > 0 ? "warning" : "muted"));

  lines.push("", section("Daemon"));
  if (!daemonState) {
    lines.push(kv("Status", "not running", "warning"));
  } else {
    lines.push(kv("Status", daemonAlive ? "running" : daemonPidAlive ? "unverified" : "stale", daemonAlive ? "success" : daemonPidAlive ? "warning" : "danger"));
    lines.push(kv("PID", String(daemonState.pid)));
    lines.push(kv("Started at", daemonState.startedAt));
    if (!daemonAlive && daemonPidAlive) {
      lines.push(bullet("The daemon process exists, but localhost health could not be confirmed from the current environment.", "warning"));
    }
  }

  lines.push("", section("Model Auth"));
  lines.push(kv("OpenAI", openAiStatus.ok ? `available via ${openAiStatus.method}` : `unavailable — ${openAiStatus.message}`, openAiStatus.ok ? "success" : "danger"));
  lines.push(kv("Claude", claudeStatus.ok ? `available via ${claudeStatus.method}` : `unavailable — ${claudeStatus.message}`, claudeStatus.ok ? "success" : "danger"));
  lines.push(kv("Gemini", geminiStatus.ok ? `available via ${geminiStatus.method}` : `unavailable — ${geminiStatus.message}`, geminiStatus.ok ? "success" : "danger"));

  lines.push("", section("SQL + Vectorization"));
  lines.push(kv("Database path", dbPath));
  lines.push(kv("Database exists", dbExists ? "yes" : "no", dbExists ? "success" : "warning"));
  lines.push(kv("Documents table rows", String(documentCount), documentCount > 0 ? "success" : "warning"));
  lines.push(kv("Vector rows", String(vectorCount), vectorCount > 0 ? "success" : "warning"));
  lines.push(kv("Document relationship rows", String(referenceCount), referenceCount > 0 ? "success" : "warning"));
  if (latestIndexRun) {
    lines.push(kv("Latest index run status", latestIndexRun.status, latestIndexRun.status === "completed" ? "success" : "warning"));
    lines.push(kv("Latest files indexed", String(latestIndexRun.files_indexed)));
    if (latestIndexRun.completed_at) lines.push(kv("Latest index completed", latestIndexRun.completed_at));
    if (latestIndexRun.error) lines.push(kv("Latest index error", latestIndexRun.error, "danger"));
  } else {
    lines.push(kv("Latest index run status", "not available", "warning"));
  }

  const intakeReady = intake.localSources.length + intake.externalSources.length > 0;
  const bootstrapDone = bootstrapState?.status === "completed";
  lines.push("", section("Overall Checks"));
  lines.push(kv("Source intake ready", intakeReady ? "yes" : "no", intakeReady ? "success" : "warning"));
  lines.push(kv("Curated Company Memory ready", intake.companyMemorySources.length > 0 ? "yes" : "no", intake.companyMemorySources.length > 0 ? "success" : "warning"));
  lines.push(kv("Bootstrap completed successfully", bootstrapDone ? "yes" : "no", bootstrapDone ? "success" : "warning"));
  lines.push(kv("SQL tables populated", documentCount > 0 ? "yes" : "no", documentCount > 0 ? "success" : "warning"));
  lines.push(kv("Vectorization completed", vectorCount > 0 ? "yes" : "no", vectorCount > 0 ? "success" : "warning"));
  lines.push(kv("Document relationships populated", referenceCount > 0 ? "yes" : "no", referenceCount > 0 ? "success" : "warning"));

  const nextActions: string[] = [];
  if (!intakeReady) nextActions.push("Add real source material in `001_Data_Souces`, then rerun `npm run bootstrap`.");
  else if (!bootstrapDone) nextActions.push("Run `npm run bootstrap` to seed the Company Memory docs.");
  if (!daemonAlive) nextActions.push("Run `npm run chat` for the CLI or `npm run ui` for the browser workspace.");
  if (daemonState && !daemonAlive) nextActions.push("If the daemon looks stale, run `npm run daemon:stop` first.");
  if (!nextActions.length) nextActions.push("Continue in `npm run chat`, or open `npm run ui` if you want the visual workspace.");
  lines.push("", actionBlock("Best Next Action", nextActions, intakeReady && bootstrapDone ? "info" : "warning"));

  process.stdout.write(lines.join("\n") + "\n");
}

async function printUiUrl(env: NodeJS.ProcessEnv): Promise<void> {
  process.stdout.write(`${section("UI Startup")}\n${bullet("Building and starting the PulseOS Company Memory UI...", "info")}\n`);
  const state = await ensureRuntime(env);
  await buildUiBundle(env);
  const url = await ensureUiReady(state);
  process.stdout.write(
    [
      "",
      section("UI Ready"),
      kv("Status", "ready", "success"),
      "",
      bold("Open this local URL in your browser:"),
      tone(url, "info"),
      "",
      section("What You Get"),
      bullet("Left explorer: folders and Markdown documents inside 000_Company_Memory only."),
      bullet("Center canvas: Company Ontology and Document Relationships views backed by SQLite."),
      bullet("Right panel: read and save Markdown documents inside 000_Company_Memory."),
      bullet("Interaction: pan, zoom, fit, reset, and drag relationship nodes without changing layout data."),
      "",
      actionBlock("Best Next Action", [
        "Open the link once to establish the local browser session.",
        "Use the explorer or map to open a document.",
        "If files were added outside the UI editor, run `Rebuild index` in the UI or `npm run index` in the terminal.",
      ], "info"),
      "",
      dim("Saving a document refreshes the SQLite documents table and summary vectors so chat and UI retrieval stay current."),
      dim("After the first open, the UI redirects to a clean localhost URL so normal refresh works."),
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
  let selection = await resolveChatModelSelection(
    flags.model,
    flags["model-id"] ?? flags.modelId ?? flags["chat-model"],
    env,
  );
  await assertModelCredentials(selection.provider, env);

  process.stdout.write(`${section("Chat Startup")}\n${bullet("Starting pulseos-lite-cli daemon...", "info")}\n`);
  const state = await ensureRuntime(env);
  process.stdout.write(`${kv("Status", "connected", "success")}\n${bullet("The daemon checks 000_Company_Memory on startup and waits for any graph/index refresh before answering.")}\n`);
  try {
    process.stdout.write(`${bullet("Building the browser UI for this session...", "info")}\n`);
    await buildUiBundle(env);
    const uiUrl = await ensureUiReady(state);
    process.stdout.write(`${kv("UI", "ready", "success")}\n${bullet(uiUrl, "info")}\n`);
  } catch (error) {
    process.stdout.write(`${kv("UI", "not ready", "warning")}\n${bullet(error instanceof Error ? error.message : String(error), "warning")}\n`);
  }
  process.stdout.write("\n");

  const sessionId = "main";

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: process.stdin.isTTY ?? true,
  });

  printWelcome(selection);

  // Check bootstrap status and show warnings if incomplete/failed
  try {
    const bootstrapState = await readBootstrapState(env);
    const intake = await collectBootstrapIntake(REPO_ROOT, "");
    const intakeReady = intake.localSources.length + intake.externalSources.length > 0;
    const companyMemoryReady = intake.companyMemorySources.length > 0;
    const bootstrapDone = bootstrapState?.status === "completed";

    if (!bootstrapDone) {
      process.stdout.write(`\n${section("Bootstrap Status Warning")}\n`);
      if (!bootstrapState) {
        process.stdout.write(`${bullet("Bootstrap has not been run yet in this workspace.", "warning")}\n`);
      } else if (bootstrapState.status === "failed") {
        process.stdout.write(`${bullet(`Previous bootstrap run failed. Error: ${bootstrapState.error ?? "Unknown error"}`, "danger")}\n`);
      } else if (bootstrapState.status === "running") {
        process.stdout.write(`${bullet("A bootstrap run is currently marked as running or was interrupted.", "warning")}\n`);
      }

      const missingPieces: string[] = [];
      
      // Check credentials
      const openAiStatus = await getModelCredentialStatus("openai", env);
      const claudeStatus = await getModelCredentialStatus("claude", env);
      const geminiStatus = await getModelCredentialStatus("gemini", env);
      const noCredentials = !openAiStatus.ok && !claudeStatus.ok && !geminiStatus.ok;

      if (!intakeReady && !companyMemoryReady) {
        missingPieces.push("Missing company data sources: Add your raw company materials (founder notes, PRDs, etc.) to `001_Data_Souces/Data_Souces_Folder/`.");
      }

      if (noCredentials) {
        missingPieces.push("Missing AI model provider credentials: Configure at least one key (OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY) in `.env` / `.env.local`.");
      }

      if (!intakeReady && !companyMemoryReady) {
        missingPieces.push("Run `npm run bootstrap` once source files are added to auto-fill templates and build the graph/embeddings.");
      } else {
        missingPieces.push("Run `npm run bootstrap` to complete onboarding, fill out templates, and build your knowledge graph.");
      }

      if (companyMemoryReady && !intakeReady) {
        missingPieces.push("Since you have added files directly to `000_Company_Memory`, you can also run `npm run index` to index them and generate the graph & embeddings without raw data sources.");
      }

      process.stdout.write(`${actionBlock("Missing Pieces for Strategic Graph", missingPieces, "warning")}\n\n`);
    }
  } catch (err) {
    // Fail silently on bootstrap check errors so chat remains accessible
  }

  try {
    while (true) {
      let rawLine: string;
      try {
        rawLine = await rl.question(`\npulseOS-lite [${selection.provider}:${selection.modelId}] -> `);
      } catch {
        break; // readline closed (Ctrl+D)
      }

      const line = rawLine.trim();
      if (!line) continue;

      // handle REPL commands
      if (line.startsWith(":") || line.startsWith("/")) {
        const handled = await handleReplCommand(line, state, selection, sessionId, env);
        if (handled === "exit") break;
        if (handled !== null) {
          selection = handled;
        }
        continue;
      }

      // send to AI
      process.stdout.write("Thinking...\n");
      try {
        const result = await daemonCommand<{ reply: string; model: ModelName; modelId: string; messageCount: number }>(
          state,
          "chat",
          { message: line, model: selection.provider, model_id: selection.modelId, session_id: sessionId },
        );
        process.stdout.write(`\n${result.reply}\n`);
        process.stdout.write(`\n— ${result.model}:${result.modelId} · ${result.messageCount / 2} exchanges\n`);
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
  currentSelection: ChatModelSelection,
  sessionId: string,
  env: NodeJS.ProcessEnv,
): Promise<ChatModelSelection | "exit" | null> {
  const commandPrefix = line[0];
  const [cmd, ...args] = line.slice(1).trim().split(/\s+/);

  switch (cmd) {
    case "exit":
    case "quit":
      return "exit";

    case "help":
      printHelp();
      return null;

    case "model": {
      if (!args[0]) {
        process.stdout.write(
          `Current model: ${currentSelection.provider}:${currentSelection.modelId}\nUse \`/model auto\`, \`/model openai gpt-5.4\`, \`/model claude auto\`, or \`/models\`.\n`,
        );
        return null;
      }

      const nextSelection = await resolveChatModelSelection(args[0], args[1] ?? "auto", env);
      await assertModelCredentials(nextSelection.provider, env);
      process.stdout.write(`Switched to ${nextSelection.provider}:${nextSelection.modelId}.\n`);
      return nextSelection;
    }

    case "models": {
      await printModelOptions(env);
      return null;
    }

    case "ui": {
      process.stdout.write("Building browser UI...\n");
      await buildUiBundle(env);
      const uiUrl = await ensureUiReady(state);
      process.stdout.write(`UI ready:\n${uiUrl}\n`);
      return null;
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

    case "retrieve": {
      const query = args.join(" ").trim();
      if (!query) {
        process.stdout.write("Usage: /retrieve <query>\n");
        return null;
      }
      const debug = await daemonCommand<RetrievalDebugSummary>(state, "retrieve_debug", { query, top_k: 8 });
      printRetrievalDebug(debug);
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
      process.stdout.write(`I don't recognize \`${commandPrefix}${cmd}\`.\nType \`/help\` to see the available chat commands.\n`);
      return null;
  }
}

function printWelcome(selection: ChatModelSelection) {
  const directory = formatDisplayPath(REPO_ROOT);
  const lines = [
    "☕️ PulseOS Lite by tintto",
    "Operating System for AI Native Teams",
    "",
    `model;     ${selection.provider}:${selection.modelId}   (/model to change)`,
    `directory; ${directory}`,
    "vibe;      caffeinated company memory",
    "workflow;  chat refreshes 000_Company_Memory into the SQL graph/index",
    "commands;  /help /model /models /files /status /reload /reset /exit",
    "",
    "☕ made with much coffee by jp-carrilloe",
    "   https://github.com/jp-carrilloe",
  ];
  process.stdout.write(renderWelcomeBox(lines));
}

function printRetrievalDebug(debug: RetrievalDebugSummary) {
  process.stdout.write(`\n${section("Retrieval Debug")}\n`);
  process.stdout.write(`${kv("Query", debug.query)}\n`);
  process.stdout.write(`${kv("Results", String(debug.results.length))}\n\n`);

  for (const [index, result] of debug.results.entries()) {
    const scores = result.scores;
    process.stdout.write(
      [
        `${index + 1}. ${bold(result.document.title)}`,
        `   ${result.document.relativePath}`,
        `   score ${scores.total.toFixed(3)} = vector ${scores.vector.toFixed(3)} + lexical ${scores.lexical.toFixed(3)} + keyword ${scores.keywordSql.toFixed(3)}`,
        `   matched: ${result.matchedFields.length ? result.matchedFields.join(", ") : "none"}`,
      ].join("\n") + "\n",
    );
  }
}

async function resolveChatModelSelection(
  providerInput: string | boolean | undefined,
  modelIdInput: string | boolean | undefined,
  env: NodeJS.ProcessEnv,
): Promise<ChatModelSelection> {
  const providerValue = typeof providerInput === "string" ? providerInput.trim().toLowerCase() : "";
  const provider = providerValue && providerValue !== "auto" ? parseModelProvider(providerValue) : await selectAutoProvider(env);
  const requestedModelId = typeof modelIdInput === "string" ? modelIdInput.trim() : "";
  const modelId = requestedModelId && requestedModelId !== "auto" ? requestedModelId : getDefaultChatModel(provider, env);
  return { provider, modelId };
}

function parseModelProvider(value: string): ModelName {
  if (MODEL_PROVIDERS.includes(value as ModelName)) return value as ModelName;
  throw new Error(`Unknown model provider "${value}". Use one of: auto, openai, claude, gemini.`);
}

async function selectAutoProvider(env: NodeJS.ProcessEnv): Promise<ModelName> {
  for (const provider of MODEL_PROVIDERS) {
    if ((await getModelCredentialStatus(provider, env)).ok) return provider;
  }
  throw new Error(
    "No configured chat provider was found for `auto`.\nRun `codex login`, add `OPENAI_API_KEY`, run `claude auth login`, add `ANTHROPIC_API_KEY`, or configure `GEMINI_API_KEY` / `GOOGLE_API_KEY` in `.env` or `.env.local`.",
  );
}

async function printModelOptions(env: NodeJS.ProcessEnv) {
  process.stdout.write("Available chat model selectors:\n");
  process.stdout.write("  /model auto                       auto-pick the first configured provider\n");
  for (const provider of MODEL_PROVIDERS) {
    const credential = await getModelCredentialStatus(provider, env);
    const defaultModel = getDefaultChatModel(provider, env);
    const examples = SUGGESTED_CHAT_MODELS[provider].join(", ");
    process.stdout.write(
      `  /model ${provider} auto                 use ${provider}'s default (${defaultModel}) ${credential.ok ? `[${credential.method}]` : "[unavailable]"}\n`,
    );
    process.stdout.write(`  /model ${provider} <model-id>           examples: ${examples}\n`);
  }
}

function formatDisplayPath(value: string) {
  const home = process.env.HOME;
  if (home && value === home) return "~";
  if (home && value.startsWith(`${home}${path.sep}`)) return `~${value.slice(home.length)}`;
  return value;
}

function renderWelcomeBox(lines: string[]) {
  const width = Math.max(...lines.map((line) => terminalDisplayWidth(line)), 58);
  const top = `╭${"─".repeat(width + 2)}╮`;
  const body = lines.map((line) => `│ ${padEndTerminal(line, width)} │`).join("\n");
  const bottom = `╰${"─".repeat(width + 2)}╯`;
  return `${top}\n${body}\n${bottom}\n`;
}

function padEndTerminal(value: string, width: number) {
  return value + " ".repeat(Math.max(0, width - terminalDisplayWidth(value)));
}

function terminalDisplayWidth(value: string) {
  let width = 0;
  for (const char of Array.from(value)) {
    const code = char.codePointAt(0) ?? 0;
    if (code === 0) continue;
    if (code < 32 || (code >= 0x7f && code < 0xa0)) continue;
    if (isZeroWidthCodePoint(code)) continue;
    width += isWideCodePoint(code) ? 2 : 1;
  }
  return width;
}

function isZeroWidthCodePoint(code: number) {
  return (
    (code >= 0x0300 && code <= 0x036f) ||
    (code >= 0xfe00 && code <= 0xfe0f) ||
    code === 0x200d
  );
}

function isWideCodePoint(code: number) {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2329 && code <= 0x232a) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe10 && code <= 0xfe19) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1faff)
  );
}

async function assertModelCredentials(model: ModelName, env: NodeJS.ProcessEnv) {
  const status = await getModelCredentialStatus(model, env);
  if (!status.ok) {
    const remediation =
      status.keyName === "codex login"
        ? "Run `codex login` first, or switch OpenAI back to `OPENAI_API_KEY`."
        : status.keyName === "claude auth login"
          ? "Run `claude auth login` first, or switch Claude back to `ANTHROPIC_API_KEY`."
          : `Add ${status.keyName} to \`.env\` or \`.env.local\` at the repo root, then run the command again.`;
    throw new Error(`${status.message}\n${remediation}`);
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
