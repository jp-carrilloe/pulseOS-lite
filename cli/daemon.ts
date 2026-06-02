import { randomUUID } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Hono, type Context, type Next } from "hono";
import { serve } from "@hono/node-server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { generateClaudeText, generateOpenAiText } from "./auth.js";
import {
  REPO_ROOT,
  type DaemonState,
  type ModelName,
  ensureCliWorkspaceReady,
  getAvailablePort,
  getCliDbPath,
  getDefaultChatModel,
  getDaemonIdleMs,
  getDaemonVersion,
  loadRepoEnv,
  removeDaemonState,
  writeDaemonState,
} from "./shared.js";
import type { KnowledgeGraphSnapshot, RebuildAdvisorStatus, RetrievalDebugSummary } from "./retrieval.js";
import { openWorkspaceStore } from "./workspace-store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COMPANY_MEMORY_ROOT = "000_Company_Memory";
const FRONTEND_DIST = path.join(__dirname, "frontend", "dist");
const GRAPH_SESSION_COOKIE = "pulseos_graph_session";
const UI_API_VERSION = 1;

// ── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface Session {
  id: string;
  model: ModelName;
  modelId: string;
  messages: ChatMessage[];
  createdAt: string;
}

interface ReadyState {
  ready: boolean;
  error: string | null;
}

interface FileTreeNode {
  name: string;
  path: string;
  type: "folder" | "document";
  children?: FileTreeNode[];
}

interface TerminalSessionSummary {
  id: string;
  cwd: string;
  shell: string;
  startedAt: string;
  status: "running" | "exited";
  exitCode: number | null;
  exitSignal: string | null;
}

type TerminalEvent =
  | { type: "started"; session: TerminalSessionSummary; message: string }
  | { type: "output"; stream: "stdout" | "stderr"; chunk: string }
  | { type: "exit"; code: number | null; signal: string | null }
  | { type: "error"; message: string };

interface TerminalSession {
  summary: TerminalSessionSummary;
  process: ChildProcessWithoutNullStreams;
  history: TerminalEvent[];
  listeners: Set<(event: TerminalEvent) => void>;
}

class TerminalSessionManager {
  private sessions = new Map<string, TerminalSession>();

  createSession(): TerminalSessionSummary {
    const shell = process.env.SHELL?.trim() || "/bin/zsh";
    const child = spawn("python3", [path.join(__dirname, "terminal_bridge.py")], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        PWD: REPO_ROOT,
        PULSEOS_SHELL: shell,
        PULSEOS_TERM_COLS: "100",
        PULSEOS_TERM_ROWS: "32",
      },
      stdio: "pipe",
    });

    const summary: TerminalSessionSummary = {
      id: randomUUID(),
      cwd: REPO_ROOT,
      shell,
      startedAt: new Date().toISOString(),
      status: "running",
      exitCode: null,
      exitSignal: null,
    };

    const session: TerminalSession = {
      summary,
      process: child,
      history: [],
      listeners: new Set(),
    };
    this.sessions.set(summary.id, session);

    this.publish(session, {
      type: "started",
      session: { ...summary },
      message: `PulseOS local repo shell started in ${REPO_ROOT}. Run cd cli && npm run chat for the PulseOS CLI, cd cli && npm run ui for the Company Memory UI, or use commands like rg, git, npm, claude, and gemini if they are installed on this machine.`,
    });

    child.stdout.on("data", (chunk: Buffer | string) => {
      this.publish(session, { type: "output", stream: "stdout", chunk: String(chunk) });
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      this.publish(session, { type: "output", stream: "stderr", chunk: String(chunk) });
    });
    child.on("error", (error) => {
      this.publish(session, { type: "error", message: error.message || "The local shell failed to start." });
    });
    child.on("exit", (code, signal) => {
      session.summary.status = "exited";
      session.summary.exitCode = code;
      session.summary.exitSignal = signal;
      this.publish(session, { type: "exit", code, signal });
    });

    return { ...summary };
  }

  getSession(id: string): TerminalSession | null {
    return this.sessions.get(id) ?? null;
  }

  writeInput(id: string, text: string): void {
    const session = this.sessions.get(id);
    if (!session) throw new Error("That terminal session does not exist anymore. Start a new shell and try again.");
    if (session.summary.status !== "running") {
      throw new Error("That terminal session has already exited. Start a new shell to continue.");
    }
    session.process.stdin.write(text);
  }

  resizeSession(id: string, cols: number, rows: number): void {
    void id;
    void cols;
    void rows;
    // The Python PTY bridge uses a fixed default terminal size in v1.
  }

  closeSession(id: string): void {
    const session = this.sessions.get(id);
    if (!session) return;
    if (session.summary.status === "running") {
      session.process.kill("SIGTERM");
    }
    session.listeners.clear();
    this.sessions.delete(id);
  }

  closeAll(): void {
    for (const id of Array.from(this.sessions.keys())) {
      this.closeSession(id);
    }
  }

  createStreamResponse(id: string, signal?: AbortSignal): Response {
    const session = this.sessions.get(id);
    if (!session) {
      return createSingleTerminalEventResponse(
        {
          type: "error",
          message: "That terminal session could not be found. Start a new shell from the terminal panel and try again.",
        },
        200,
      );
    }

    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        const encoder = new TextEncoder();
        const send = (event: TerminalEvent) => {
          controller.enqueue(encoder.encode(encodeSseEvent(event)));
        };

        for (const event of session.history) send(event);
        const listener = (event: TerminalEvent) => send(event);
        session.listeners.add(listener);

        const cleanup = () => {
          session.listeners.delete(listener);
          try {
            controller.close();
          } catch {
            // already closed
          }
        };

        signal?.addEventListener("abort", cleanup, { once: true });
      },
      cancel: () => {
        // listener cleanup is handled via abort
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  private publish(session: TerminalSession, event: TerminalEvent) {
    session.history.push(event);
    if (session.history.length > 400) {
      session.history.splice(0, session.history.length - 400);
    }
    for (const listener of session.listeners) {
      listener(event);
    }
  }
}

function jsonErrorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

function encodeSseEvent(event: TerminalEvent): string {
  const payload = JSON.stringify(event);
  return payload
    .split("\n")
    .map((line) => `data: ${line}`)
    .join("\n")
    .concat("\n\n");
}

function createSingleTerminalEventResponse(event: TerminalEvent, status = 200): Response {
  return new Response(encodeSseEvent(event), {
    status,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

// ── AI Providers ─────────────────────────────────────────────────────────────

function buildSystemPrompt(repoContext: string): string {
  return `You are an intelligent AI assistant embedded in the PulseOS-Lite repository. You are working against a local retrieved context rather than the full repo, so stay grounded in the provided documents and say when something is missing.

- Answering questions about any document, strategy, or operational detail
- Drafting new documents or sections in the existing style
- Suggesting improvements or identifying gaps
- Cross-referencing information across multiple documents
- Strategic analysis and synthesis

Always be specific and reference actual content from the repository when relevant. Follow ISO 8601 dates and existing formatting conventions.

${repoContext}`;
}

async function chatWithClaude(
  messages: ChatMessage[],
  newMessage: string,
  systemPrompt: string,
  modelId: string,
): Promise<string> {
  return generateClaudeText({
    systemPrompt,
    userPrompt: [
      "Conversation history:",
      ...messages.map((message, index) => `${index + 1}. ${message.role.toUpperCase()}: ${message.content}`),
      `USER: ${newMessage}`,
      "",
      "Return only the assistant reply for the latest user message.",
    ].join("\n"),
    modelId,
    env: process.env,
    workingDirectory: REPO_ROOT,
  });
}

async function chatWithOpenAI(
  messages: ChatMessage[],
  newMessage: string,
  systemPrompt: string,
  modelId: string,
): Promise<string> {
  return generateOpenAiText({
    systemPrompt,
    userPrompt: [
      "Conversation history:",
      ...messages.map((message, index) => `${index + 1}. ${message.role.toUpperCase()}: ${message.content}`),
      `USER: ${newMessage}`,
      "",
      "Return only the assistant reply for the latest user message.",
    ].join("\n"),
    modelId,
    env: process.env,
    workingDirectory: REPO_ROOT,
  });
}

async function chatWithGemini(
  messages: ChatMessage[],
  newMessage: string,
  systemPrompt: string,
  modelId: string,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelId,
    systemInstruction: systemPrompt,
  });

  const history = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const chat = model.startChat({ history });
  const result = await chat.sendMessage(newMessage);
  return result.response.text();
}

// ── Daemon App ────────────────────────────────────────────────────────────────

export function createDaemonApp(options: {
  state: DaemonState;
  token: string;
  kbIndex: KnowledgeBaseIndex;
  terminalManager: TerminalSessionManager;
  getReadyState: () => ReadyState;
  awaitReady: () => Promise<void>;
  sessions: Map<string, Session>;
  resetIdleTimer: () => void;
  onShutdown: () => void;
}) {
  const app = new Hono();
  const { state, token, sessions, resetIdleTimer, onShutdown, kbIndex, terminalManager, getReadyState, awaitReady } = options;

  const auth = async (ctx: Context, next: Next) => {
    const header = ctx.req.header("authorization");
    if (header !== `Bearer ${token}`) {
      return ctx.json(
        {
          error: {
            code: "unauthorized",
            message: "This request is missing a valid daemon bearer token. Restart the CLI session or daemon and try again.",
          },
        },
        401,
      );
    }
    resetIdleTimer();
    await next();
  };

  app.get("/health", (ctx) => {
    resetIdleTimer();
    return ctx.json({ data: { ok: true, pid: process.pid, port: state.port, version: state.version } });
  });

  app.use("/status", auth);
  app.use("/command", auth);
  app.use("/shutdown", auth);

  app.get("/graph", (ctx) => {
    const bootstrapSession = bootstrapGraphSession(ctx, token, "/graph");
    if (bootstrapSession) return bootstrapSession;
    if (!hasGraphSessionAccess(ctx, token)) {
      return ctx.html(renderGraphUnauthorizedPage(), 401);
    }
    resetIdleTimer();
    return serveGraphIndex(ctx, token);
  });

  app.get("/ui", (ctx) => {
    const bootstrapSession = bootstrapGraphSession(ctx, token, "/ui");
    if (bootstrapSession) return bootstrapSession;
    if (!hasGraphSessionAccess(ctx, token)) {
      return ctx.html(renderGraphUnauthorizedPage(), 401);
    }
    resetIdleTimer();
    return serveGraphIndex(ctx, token);
  });

  app.get("/ui/*", async (ctx) => {
    resetIdleTimer();
    return serveStaticAsset(ctx, ctx.req.path.replace(/^\/ui\//, ""));
  });

  app.get("/api/graph-data", async (ctx) => {
    if (!hasGraphSessionAccess(ctx, token)) {
      return ctx.json(
        {
          error: {
            code: "unauthorized",
            message: "This UI request is no longer attached to the current local UI session. Run `npm run ui` again and open the printed link once to restore access.",
          },
        },
        401,
      );
    }
    resetIdleTimer();
    await awaitReady();
    return ctx.json({ data: scopeGraphToCompanyMemory(await kbIndex.buildGraphSnapshot()) });
  });

  app.get("/api/ui-capabilities", (ctx) => {
    if (!hasGraphSessionAccess(ctx, token)) {
      return ctx.json(
        {
          error: {
            code: "unauthorized",
            message: "Open the current `npm run ui` link once to restore the local UI session.",
          },
        },
        401,
      );
    }
    resetIdleTimer();
    return ctx.json({
      data: {
        daemonVersion: state.version,
        uiApiVersion: UI_API_VERSION,
        buildId: `${state.version}:${state.startedAt}`,
        features: {
          terminalPanel: true,
          rebuildAdvisor: true,
          documentContext: true,
          graphSessionCookie: true,
        },
      },
    });
  });

  app.get("/api/rebuild-advisor", async (ctx) => {
    if (!hasGraphSessionAccess(ctx, token)) {
      return ctx.json(
        { error: { code: "unauthorized", message: "Open the current `npm run ui` link once to restore the local UI session." } },
        401,
      );
    }
    resetIdleTimer();
    return ctx.json({ data: await kbIndex.inspectRebuildStatus() });
  });

  app.post("/api/rebuild", async (ctx) => {
    if (!hasGraphSessionAccess(ctx, token)) {
      return ctx.json(
        { error: { code: "unauthorized", message: "Open the current `npm run ui` link once to restore the local UI session." } },
        401,
      );
    }
    resetIdleTimer();
    const result = await kbIndex.sync();
    const advisor = await kbIndex.inspectRebuildStatus();
    return ctx.json({
      data: {
        files: result.fileCount,
        charCount: result.charCount,
        indexedAt: result.indexedAt,
        embeddingModel: result.embeddingModel,
        embeddingMode: result.embeddingMode,
        advisor,
      },
    });
  });

  app.get("/api/files/tree", async (ctx) => {
    if (!hasGraphSessionAccess(ctx, token)) {
      return ctx.json(
        { error: { code: "unauthorized", message: "Open the current `npm run ui` link once to restore the local UI session." } },
        401,
      );
    }
    resetIdleTimer();
    return ctx.json({ data: await buildCompanyMemoryTree(REPO_ROOT) });
  });

  app.get("/api/files/read", async (ctx) => {
    if (!hasGraphSessionAccess(ctx, token)) {
      return ctx.json(
        { error: { code: "unauthorized", message: "Open the current `npm run ui` link once to restore the local UI session." } },
        401,
      );
    }
    const requestedPath = ctx.req.query("path") ?? "";
    try {
      const resolved = resolveCompanyMemoryMarkdownPath(requestedPath);
      const [content, stat] = await Promise.all([fsp.readFile(resolved.fullPath, "utf8"), fsp.stat(resolved.fullPath)]);
      resetIdleTimer();
      return ctx.json({ data: { path: resolved.relativePath, content, updatedAt: stat.mtime.toISOString() } });
    } catch (err) {
      return ctx.json(
        {
          error: {
            code: "file_read_failed",
            message: err instanceof Error ? err.message : "Could not read that Company Memory document.",
          },
        },
        400,
      );
    }
  });

  app.post("/api/files/write", async (ctx) => {
    if (!hasGraphSessionAccess(ctx, token)) {
      return ctx.json(
        { error: { code: "unauthorized", message: "Open the current `npm run ui` link once to restore the local UI session." } },
        401,
      );
    }
    const body = (await ctx.req.json()) as { path?: string; content?: unknown };
    try {
      const resolved = resolveCompanyMemoryMarkdownPath(String(body.path ?? ""));
      if (typeof body.content !== "string") {
        throw new Error("The editor did not send valid Markdown content to save.");
      }
      await fsp.writeFile(resolved.fullPath, body.content, "utf8");
      const syncResult = await kbIndex.sync();
      resetIdleTimer();
      return ctx.json({ data: { path: resolved.relativePath, indexedAt: syncResult.indexedAt } });
    } catch (err) {
      return ctx.json(
        {
          error: {
            code: "file_write_failed",
            message: err instanceof Error ? err.message : "Could not save that Company Memory document.",
          },
        },
        400,
      );
    }
  });

  app.post("/api/terminal/session", (ctx) => {
    if (!hasGraphSessionAccess(ctx, token)) {
      return ctx.json(
        { error: { code: "unauthorized", message: "Open the current `npm run ui` link once to restore the local UI session." } },
        401,
      );
    }
    resetIdleTimer();
    return ctx.json({ data: terminalManager.createSession() });
  });

  app.get("/api/terminal/stream", (ctx) => {
    if (!hasGraphSessionAccess(ctx, token)) {
      return createSingleTerminalEventResponse(
        {
          type: "error",
          message: "Open the current `npm run ui` link once to restore the local UI session.",
        },
        200,
      );
    }
    resetIdleTimer();
    const id = ctx.req.query("id") ?? "";
    return terminalManager.createStreamResponse(id, ctx.req.raw.signal);
  });

  app.post("/api/terminal/input", async (ctx) => {
    if (!hasGraphSessionAccess(ctx, token)) {
      return ctx.json(
        { error: { code: "unauthorized", message: "Open the current `npm run ui` link once to restore the local UI session." } },
        401,
      );
    }
    const body = (await ctx.req.json()) as { id?: string; text?: unknown };
    try {
      if (typeof body.text !== "string" || !body.text.length) {
        throw new Error("The terminal did not receive any command text to send.");
      }
      terminalManager.writeInput(String(body.id ?? ""), body.text);
      resetIdleTimer();
      return ctx.json({ data: { ok: true } });
    } catch (err) {
      return ctx.json(
        {
          error: {
            code: "terminal_input_failed",
            message: err instanceof Error ? err.message : "Could not send input to the local shell.",
          },
        },
        400,
      );
    }
  });

  app.post("/api/terminal/resize", async (ctx) => {
    if (!hasGraphSessionAccess(ctx, token)) {
      return ctx.json(
        { error: { code: "unauthorized", message: "Open the current `npm run ui` link once to restore the local UI session." } },
        401,
      );
    }
    const body = (await ctx.req.json()) as { id?: string; cols?: unknown; rows?: unknown };
    try {
      const cols = Number(body.cols ?? 0);
      const rows = Number(body.rows ?? 0);
      if (!Number.isFinite(cols) || !Number.isFinite(rows)) {
        throw new Error("The terminal resize request did not include valid dimensions.");
      }
      terminalManager.resizeSession(String(body.id ?? ""), Math.round(cols), Math.round(rows));
      resetIdleTimer();
      return ctx.json({ data: { ok: true } });
    } catch (err) {
      return ctx.json(
        {
          error: {
            code: "terminal_resize_failed",
            message: err instanceof Error ? err.message : "Could not resize the local shell.",
          },
        },
        400,
      );
    }
  });

  app.post("/api/terminal/close", async (ctx) => {
    if (!hasGraphSessionAccess(ctx, token)) {
      return ctx.json(
        { error: { code: "unauthorized", message: "Open the current `npm run ui` link once to restore the local UI session." } },
        401,
      );
    }
    const body = (await ctx.req.json()) as { id?: string };
    terminalManager.closeSession(String(body.id ?? ""));
    resetIdleTimer();
    return ctx.json({ data: { closed: true } });
  });

  app.get("/graph-data", async (ctx) => {
    if (!hasGraphSessionAccess(ctx, token)) {
      return ctx.json(
        {
          error: {
            code: "unauthorized",
            message: "This UI request is no longer attached to the current local UI session. Run `npm run ui` again and open the printed link once to restore access.",
          },
        },
        401,
      );
    }
    resetIdleTimer();
    await awaitReady();
    return ctx.json({ data: await kbIndex.buildGraphSnapshot() });
  });

  app.get("/status", (ctx) => {
    const repoStatus = kbIndex.getStatus();
    return ctx.json({
      data: {
        daemon: { pid: process.pid, port: state.port, version: state.version, startedAt: state.startedAt },
        repo: repoStatus,
        retrieval: getReadyState(),
        sessions: Array.from(sessions.values()).map((s) => ({
          id: s.id,
          model: s.model,
          messageCount: s.messages.length,
          createdAt: s.createdAt,
        })),
      },
    });
  });

  app.post("/command", async (ctx) => {
    const body = (await ctx.req.json()) as { name?: string; args?: Record<string, unknown> };
    if (!body?.name) {
      return ctx.json(
        {
          error: {
            code: "invalid_request",
            message: "The daemon received a command request without a command name.",
          },
        },
        400,
      );
    }

    try {
      const result = await handleCommand(body.name, body.args ?? {}, {
        awaitReady,
        sessions,
        buildPromptContext: (message) => kbIndex.buildPromptContext(message),
        inspectRetrieval: (message, topK) => kbIndex.inspectRetrieval(message, topK),
        reloadRepo: () => kbIndex.sync(),
        rebuildAdvisor: () => kbIndex.inspectRebuildStatus(),
        repoFiles: () => kbIndex.listFiles(),
        repoStatus: () => kbIndex.getStatus(),
      });
      return ctx.json({ data: result });
    } catch (err) {
      return ctx.json(
        {
          error: {
            code: "command_failed",
            message:
              err instanceof Error
                ? err.message
                : "The daemon could not complete that command.",
          },
        },
        400,
      );
    }
  });

  app.post("/shutdown", (ctx) => {
    setTimeout(() => onShutdown(), 25);
    return ctx.json({ data: { stopped: true } });
  });

  return app;
}

async function handleCommand(
  name: string,
  args: Record<string, unknown>,
  ctx: {
    awaitReady: () => Promise<void>;
    sessions: Map<string, Session>;
    buildPromptContext: (message: string) => Promise<string>;
    inspectRetrieval: (message: string, topK?: number) => Promise<RetrievalDebugSummary>;
    reloadRepo: () => Promise<{ fileCount: number; charCount: number; indexedAt: string; embeddingModel: string; embeddingMode: string }>;
    rebuildAdvisor: () => Promise<RebuildAdvisorStatus>;
    repoFiles: () => string[];
    repoStatus: () => { root: string; indexedDocuments: number; indexedCharCount: number };
  },
): Promise<unknown> {
  switch (name) {
    case "chat": {
      await ctx.awaitReady();
      const message = String(args.message ?? "").trim();
      if (!message) throw new Error("Your chat request was empty. Please enter a message before sending.");

      const sessionId = String(args.session_id ?? "main");
      const model = (args.model as ModelName | undefined) ?? "openai";
      const modelId = String(args.model_id ?? "").trim() || getDefaultChatModel(model);

      if (!ctx.sessions.has(sessionId)) {
        ctx.sessions.set(sessionId, {
          id: sessionId,
          model,
          modelId,
          messages: [],
          createdAt: new Date().toISOString(),
        });
      }

      const session = ctx.sessions.get(sessionId)!;
      if (args.model) session.model = model;
      if (args.model || args.model_id) session.modelId = modelId;

      const retrievalQuery = buildRetrievalQuery(session.messages, message);
      const systemPrompt = buildSystemPrompt(await ctx.buildPromptContext(retrievalQuery));
      let reply = "";

      switch (session.model) {
        case "claude":
          reply = await chatWithClaude(session.messages, message, systemPrompt, session.modelId);
          break;
        case "openai":
          reply = await chatWithOpenAI(session.messages, message, systemPrompt, session.modelId);
          break;
        case "gemini":
          reply = await chatWithGemini(session.messages, message, systemPrompt, session.modelId);
          break;
        default:
          throw new Error(`The selected model "${String(session.model)}" is not supported by this CLI session.`);
      }

      session.messages.push({ role: "user", content: message });
      session.messages.push({ role: "assistant", content: reply });

      return { reply, model: session.model, modelId: session.modelId, sessionId, messageCount: session.messages.length };
    }

    case "reset_session": {
      const sessionId = String(args.session_id ?? "main");
      ctx.sessions.delete(sessionId);
      return { reset: true, sessionId };
    }

    case "list_sessions": {
      return Array.from(ctx.sessions.values()).map((s) => ({
        id: s.id,
        model: s.model,
        modelId: s.modelId,
        messageCount: s.messages.length,
        createdAt: s.createdAt,
      }));
    }

    case "repo_status": {
      await ctx.awaitReady();
      return { files: ctx.repoFiles(), ...ctx.repoStatus() };
    }

    case "reload_repo": {
      const result = await ctx.reloadRepo();
      return {
        reloaded: true,
        files: result.fileCount,
        charCount: result.charCount,
        indexedAt: result.indexedAt,
        embeddingModel: result.embeddingModel,
        embeddingMode: result.embeddingMode,
      };
    }

    case "rebuild_advisor": {
      await ctx.awaitReady();
      return ctx.rebuildAdvisor();
    }

    case "retrieve_debug": {
      await ctx.awaitReady();
      const query = String(args.query ?? "").trim();
      if (!query) throw new Error("The `query` argument is required.");
      const topK = Number(args.top_k ?? args.topK ?? 8);
      return ctx.inspectRetrieval(query, Number.isFinite(topK) ? topK : 8);
    }

    case "list_files": {
      await ctx.awaitReady();
      return ctx.repoFiles();
    }

    default:
      throw new Error(`The daemon does not recognize the command "${name}".`);
  }
}

function renderGraphUnauthorizedPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PulseOS Lite Graph</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f5efe2; color: #211b14; font: 16px/1.5 Georgia, "Times New Roman", serif; }
    main { max-width: 640px; padding: 32px; background: #fffaf0; border: 1px solid #d8c7aa; box-shadow: 0 22px 60px rgba(66, 47, 21, 0.12); }
    code { background: #efe3cb; padding: 2px 6px; border-radius: 6px; }
  </style>
</head>
<body>
  <main>
    <h1>UI link expired or incomplete</h1>
    <p>Run <code>npm run ui</code> from <code>cli/</code> and open the local URL it prints once. The first launch uses a short-lived local token to create a browser session, then the UI redirects to a clean localhost URL so normal refresh works.</p>
  </main>
</body>
</html>`;
}

function hasGraphSessionAccess(ctx: Context, token: string): boolean {
  const queryToken = ctx.req.query("token");
  if (queryToken === token) return true;
  return getCookieValue(ctx, GRAPH_SESSION_COOKIE) === token;
}

function bootstrapGraphSession(ctx: Context, token: string, destinationPath: string): Response | null {
  const queryToken = ctx.req.query("token");
  if (queryToken !== token) return null;
  ctx.header("Set-Cookie", serializeGraphSessionCookie(token));
  return ctx.redirect(destinationPath, 302);
}

function getCookieValue(ctx: Context, cookieName: string): string | null {
  const cookieHeader = ctx.req.header("cookie");
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    const name = trimmed.slice(0, separatorIndex).trim();
    if (name !== cookieName) continue;
    return decodeURIComponent(trimmed.slice(separatorIndex + 1));
  }

  return null;
}

function serializeGraphSessionCookie(token: string): string {
  return [
    `${GRAPH_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=43200",
  ].join("; ");
}

async function serveGraphIndex(ctx: Context, token: string) {
  try {
    let html = await fsp.readFile(path.join(FRONTEND_DIST, "index.html"), "utf8");
    // Inject the current daemon token so the frontend can auto-reattach on 401
    const tokenScript = `<script>window.__PULSEOS_TOKEN__=${JSON.stringify(token)};window.__PULSEOS_REATTACH_PATH__=${JSON.stringify("/ui")}</script>`;
    html = html.replace("</head>", `${tokenScript}</head>`);
    return ctx.html(html);
  } catch {
    return ctx.html(renderGraphBuildMissingPage(), 503);
  }
}

function renderGraphBuildMissingPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PulseOS Light Company Memory</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #081018; color: #eef4ff; font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { max-width: 680px; padding: 32px; background: rgba(18, 27, 42, 0.88); border: 1px solid rgba(255,255,255,.1); border-radius: 24px; }
    code { background: rgba(255,255,255,.08); padding: 2px 6px; border-radius: 6px; }
  </style>
</head>
<body>
  <main>
    <h1>UI is not built yet</h1>
    <p>Run <code>npm run ui</code> from <code>cli/</code>. That command builds the React Company Memory workspace before printing the local URL.</p>
  </main>
</body>
</html>`;
}

async function serveStaticAsset(ctx: Context, assetPath: string) {
  const fullPath = path.resolve(FRONTEND_DIST, assetPath);
  if (!fullPath.startsWith(FRONTEND_DIST + path.sep)) {
    return ctx.text("Not found", 404);
  }
  try {
    const body = await fsp.readFile(fullPath);
    return new Response(body, {
      headers: {
        "Content-Type": getMimeType(fullPath),
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return ctx.text("Not found", 404);
  }
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".json") return "application/json; charset=utf-8";
  return "application/octet-stream";
}

function scopeGraphToCompanyMemory(snapshot: KnowledgeGraphSnapshot): KnowledgeGraphSnapshot {
  const includedNodeIds = new Set(
    snapshot.nodes
      .filter((node) => node.path === COMPANY_MEMORY_ROOT || node.path.startsWith(`${COMPANY_MEMORY_ROOT}/`))
      .map((node) => node.id),
  );
  const nodes = snapshot.nodes.filter((node) => includedNodeIds.has(node.id));
  const edges = snapshot.edges.filter((edge) => includedNodeIds.has(edge.source) && includedNodeIds.has(edge.target));

  return {
    ...snapshot,
    stats: {
      documents: nodes.filter((node) => node.type === "document").length,
      folders: nodes.filter((node) => node.type === "folder").length,
      references: edges.filter((edge) => edge.type === "REFERENCES").length,
    },
    nodes,
    edges,
  };
}

async function buildCompanyMemoryTree(repoRoot: string): Promise<FileTreeNode> {
  const rootPath = path.join(repoRoot, COMPANY_MEMORY_ROOT);
  const root = await buildTreeNode(rootPath, COMPANY_MEMORY_ROOT);
  return root ?? { name: COMPANY_MEMORY_ROOT, path: COMPANY_MEMORY_ROOT, type: "folder", children: [] };
}

async function buildTreeNode(fullPath: string, relativePath: string): Promise<FileTreeNode | null> {
  const stat = await fsp.stat(fullPath);
  if (stat.isFile()) {
    if (!isMarkdownPath(relativePath)) return null;
    return { name: path.basename(relativePath), path: toPosixPath(relativePath), type: "document" };
  }

  if (!stat.isDirectory()) return null;

  const entries = await fsp.readdir(fullPath, { withFileTypes: true });
  const children: FileTreeNode[] = [];
  for (const entry of entries.sort((left, right) => {
    if (left.isDirectory() !== right.isDirectory()) return left.isDirectory() ? -1 : 1;
    return left.name.localeCompare(right.name);
  })) {
    if (entry.name.startsWith(".")) continue;
    const childRelativePath = path.join(relativePath, entry.name);
    const child = await buildTreeNode(path.join(fullPath, entry.name), childRelativePath);
    if (child) children.push(child);
  }

  return {
    name: path.basename(relativePath),
    path: toPosixPath(relativePath),
    type: "folder",
    children,
  };
}

function resolveCompanyMemoryMarkdownPath(requestedPath: string): { relativePath: string; fullPath: string } {
  const normalized = toPosixPath(path.posix.normalize(requestedPath.replaceAll("\\", "/")));
  if (normalized.startsWith("../") || normalized === ".." || path.isAbsolute(requestedPath)) {
    throw new Error("For safety, the editor only accepts repo-relative Markdown paths.");
  }
  if (normalized !== COMPANY_MEMORY_ROOT && !normalized.startsWith(`${COMPANY_MEMORY_ROOT}/`)) {
    throw new Error(`The graph editor can only read and save Markdown inside ${COMPANY_MEMORY_ROOT}.`);
  }
  if (!isMarkdownPath(normalized)) {
    throw new Error("The graph editor only supports Markdown files.");
  }

  const fullPath = path.resolve(REPO_ROOT, normalized);
  const companyRoot = path.resolve(REPO_ROOT, COMPANY_MEMORY_ROOT);
  if (!fullPath.startsWith(companyRoot + path.sep)) {
    throw new Error(`The requested file is outside ${COMPANY_MEMORY_ROOT}.`);
  }

  return { relativePath: normalized, fullPath };
}

function isMarkdownPath(filePath: string): boolean {
  return [".md", ".markdown"].includes(path.extname(filePath).toLowerCase());
}

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function renderGraphPage(port: number, token: string): string {
  const escapedToken = JSON.stringify(token);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
	  <title>PulseOS Light Company Graph</title>
  <style>
    :root {
      --font-body: "Inter", "SF Pro Text", "Segoe UI", sans-serif;
      --font-heading: "Geist", "SF Pro Display", "Inter", sans-serif;
      --font-mono: "SF Mono", "Geist Mono", ui-monospace, monospace;
      --bg: #f6f8fb;
      --ink: #142033;
      --muted: #53627c;
      --faint: #73819a;
      --panel: rgba(255, 255, 255, 0.78);
      --panel-strong: rgba(255, 255, 255, 0.94);
      --panel-muted: rgba(255, 255, 255, 0.52);
      --line: rgba(122, 145, 176, 0.22);
      --line-strong: rgba(122, 145, 176, 0.34);
      --primary: #2386ff;
      --primary-soft: rgba(35, 134, 255, 0.14);
      --folder: #f2c26a;
      --folder-root: #6ab2ff;
      --doc: #63d59d;
      --ref: #caa7ff;
      --shadow: 0 22px 56px rgba(26, 46, 73, 0.12);
      --canvas-bg:
        radial-gradient(circle at top, rgba(88, 164, 255, 0.16), transparent 38%),
        linear-gradient(180deg, rgba(9, 13, 21, 0.96), rgba(5, 8, 14, 0.99));
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      color: var(--ink);
      font: 15px/1.45 var(--font-body);
      background:
        radial-gradient(circle at 15% 8%, rgba(35, 134, 255, 0.13), transparent 28rem),
        radial-gradient(circle at 88% 16%, rgba(99, 213, 157, 0.14), transparent 24rem),
        linear-gradient(135deg, #f8fbff 0%, #f4f7fb 48%, #eef3f8 100%);
    }
    header {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 20px;
      padding: 28px clamp(18px, 4vw, 48px) 18px;
      align-items: end;
    }
    h1 {
      margin: 0;
      font-family: var(--font-heading);
      font-size: clamp(30px, 5vw, 62px);
      line-height: 0.94;
      letter-spacing: -0.05em;
    }
    .subtitle { max-width: 760px; color: var(--muted); margin-top: 12px; }
    .toolbar {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    button {
      border: 1px solid var(--line);
      background: var(--panel);
      color: var(--ink);
      border-radius: 999px;
      padding: 10px 14px;
      cursor: pointer;
      box-shadow: 0 8px 24px rgba(55, 41, 23, 0.08);
    }
    button.active {
      background: var(--primary);
      color: #ffffff;
      border-color: rgba(35, 134, 255, 0.4);
    }
    main {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 360px;
      gap: 18px;
      padding: 0 clamp(18px, 4vw, 48px) 36px;
    }
    .canvasWrap, aside {
      min-height: 70vh;
      background: var(--panel);
      border: 1px solid var(--line);
      box-shadow: var(--shadow);
      backdrop-filter: blur(22px);
    }
	    .canvasWrap {
	      position: relative;
	      overflow: hidden;
	      border-radius: 28px;
	      background: var(--canvas-bg);
	    }
	    svg {
	      width: 100%;
	      height: 74vh;
	      display: block;
	      touch-action: none;
	      cursor: grab;
	      user-select: none;
	    }
	    svg.panning { cursor: grabbing; }
	    aside { border-radius: 24px; padding: 22px; overflow: auto; }
	    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 18px; }
	    .stat { border: 1px solid var(--line); border-radius: 18px; padding: 12px; background: var(--panel-muted); }
	    .stat strong { display: block; font-size: 22px; }
	    .legend { display: flex; gap: 8px; flex-wrap: wrap; margin: 12px 0 18px; }
	    .pill { border-radius: 999px; padding: 7px 10px; background: var(--panel-muted); border: 1px solid var(--line); }
	    .details h2 { margin: 0 0 8px; font-family: var(--font-heading); line-height: 1; }
	    .details p { color: var(--muted); }
	    .path { word-break: break-word; font-family: var(--font-mono); font-size: 12px; background: rgba(20, 32, 51, 0.06); padding: 10px; border-radius: 12px; }
	    .node { cursor: grab; }
	    .node.dragging { cursor: grabbing; }
	    .node text { pointer-events: none; paint-order: stroke; stroke: rgba(5, 8, 14, 0.82); stroke-width: 5px; stroke-linejoin: round; font-size: 11px; fill: #eef4ff; }
	    .node.document text {
	      opacity: 0;
	      font-size: 10px;
	      transition: opacity 140ms ease;
	    }
	    .node.document:hover text,
	    .node.document:focus text,
	    .node.document.dragging text {
	      opacity: 1;
	    }
	    .node.document circle {
	      filter: drop-shadow(0 0 8px rgba(99, 213, 157, 0.22));
	    }
	    .node.document:hover circle,
	    .node.document.dragging circle {
	      stroke-width: 2.3;
	      filter: drop-shadow(0 0 14px rgba(99, 213, 157, 0.48));
	    }
	    .node.document.selected text {
	      opacity: 1;
	    }
	    .node.document.selected circle {
	      stroke: rgba(255, 255, 255, 0.92);
	      stroke-width: 2.6;
	      filter: drop-shadow(0 0 18px rgba(99, 213, 157, 0.75));
	    }
	    .node.document.context {
	      opacity: 0.58;
	    }
	    .node.document.dimmed {
	      opacity: 0.14;
	    }
	    .node.folder.selected circle,
	    .node.folder.related circle {
	      stroke: rgba(255, 255, 255, 0.9);
	      stroke-width: 2.5;
	    }
	    .node.folder.selected text,
	    .node.folder.related text {
	      fill: #ffffff;
	    }
	    .edge { stroke: rgba(167, 180, 203, 0.24); stroke-width: 1.1; pointer-events: none; }
	    .edge.reference {
	      stroke: rgba(202, 167, 255, 0.34);
	      stroke-width: 0.85;
	      stroke-linecap: round;
	    }
	    .edge.reference.active {
	      stroke: rgba(202, 167, 255, 0.88);
	      stroke-width: 1.4;
	    }
	    .edge.reference.muted {
	      stroke: rgba(202, 167, 255, 0.08);
	    }
	    .edge.contains.active {
	      stroke: rgba(242, 194, 106, 0.74);
	      stroke-width: 1.4;
	    }
	    .graph-controls {
	      position: absolute;
	      top: 18px;
	      right: 18px;
	      z-index: 2;
	      display: flex;
	      gap: 8px;
	      flex-wrap: wrap;
	      justify-content: flex-end;
	      max-width: min(560px, calc(100% - 36px));
	      padding: 8px;
	      border: 1px solid rgba(122, 145, 176, 0.22);
	      border-radius: 18px;
	      background: rgba(10, 18, 30, 0.68);
	      backdrop-filter: blur(14px);
	    }
	    .graph-controls button {
	      background: rgba(255, 255, 255, 0.08);
	      color: #eef4ff;
	      border-color: rgba(238, 244, 255, 0.16);
	      box-shadow: none;
	      padding: 8px 11px;
	    }
	    .graph-controls button:hover { background: rgba(255, 255, 255, 0.14); }
	    .view-note {
	      position: absolute;
	      left: 18px;
	      bottom: 18px;
      max-width: min(620px, calc(100% - 36px));
      padding: 10px 12px;
      border: 1px solid rgba(122, 145, 176, 0.22);
      border-radius: 16px;
      background: rgba(10, 18, 30, 0.72);
      color: #a7b4cb;
      font-size: 12px;
	      backdrop-filter: blur(14px);
	    }
	    .legend-tray {
	      margin: 12px 0 18px;
	      border: 1px solid var(--line);
	      border-radius: 18px;
	      background: var(--panel-muted);
	      overflow: hidden;
	    }
	    .legend-tray summary {
	      display: flex;
	      align-items: center;
	      justify-content: space-between;
	      gap: 12px;
	      padding: 12px 14px;
	      cursor: pointer;
	      list-style: none;
	      font-weight: 700;
	    }
	    .legend-tray summary::-webkit-details-marker { display: none; }
	    .legend-tray summary::after { content: "+"; color: var(--faint); }
	    .legend-tray[open] summary::after { content: "\\2212"; }
	    .legend-panel {
	      display: grid;
	      gap: 14px;
	      padding: 0 14px 14px;
	      border-top: 1px solid var(--line);
	    }
	    .legend-section { display: grid; gap: 8px; }
	    .legend-label {
	      margin: 0;
	      color: var(--faint);
	      font-size: 11px;
	      font-weight: 800;
	      letter-spacing: 0.08em;
	      text-transform: uppercase;
	    }
	    .legend-list { display: flex; gap: 8px; flex-wrap: wrap; }
	    .legend-chip {
	      display: inline-flex;
	      align-items: center;
	      gap: 8px;
	      border: 1px solid var(--line);
	      border-radius: 999px;
	      padding: 7px 10px;
	      background: rgba(255, 255, 255, 0.42);
	      font-size: 12px;
	    }
	    .legend-swatch {
	      width: 11px;
	      height: 11px;
	      border-radius: 999px;
	      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.36);
	    }
	    .legend-line {
	      width: 20px;
	      height: 0;
	      border-top: 2px solid rgba(167, 180, 203, 0.72);
	    }
	    .legend-line.reference {
	      border-top-color: var(--ref);
	      opacity: 0.72;
	    }
	    .empty { padding: 28px; color: var(--muted); }
	    @media (max-width: 920px) {
	      header, main { grid-template-columns: 1fr; }
	      .toolbar { justify-content: flex-start; }
	      svg { height: 68vh; }
	      .graph-controls { position: static; margin: 12px; max-width: none; justify-content: flex-start; }
	      aside { min-height: auto; }
	    }
  </style>
</head>
<body>
  <header>
    <div>
	      <h1>PulseOS Light Company Graph</h1>
	      <div class="subtitle">Two focused graph views generated from the local SQLite index: a readable company hierarchy and a dynamic document-relationship map. Click to expand context without overloading the canvas.</div>
    </div>
    <div class="toolbar">
      <button data-mode="ontology" class="active">Company Ontology</button>
      <button data-mode="documents">Document Relationships</button>
      <button id="refresh">Refresh</button>
    </div>
  </header>
	  <main>
	    <section class="canvasWrap">
	      <div class="graph-controls" aria-label="Graph movement controls">
	        <button id="defaultView" type="button">Default view</button>
	        <button id="zoomIn" type="button">Zoom in</button>
	        <button id="zoomOut" type="button">Zoom out</button>
	        <button id="fitGraph" type="button">Fit graph</button>
	      </div>
	      <svg id="graph" role="img" aria-label="Company memory graph"></svg>
	      <div class="view-note" id="viewNote">Company Ontology shows only the folder hierarchy. Switch to Document Relationships to inspect direct Markdown links between documents.</div>
	    </section>
    <aside>
      <section class="stats">
        <div class="stat"><strong id="docCount">0</strong>Docs</div>
        <div class="stat"><strong id="folderCount">0</strong>Folders</div>
        <div class="stat"><strong id="refCount">0</strong>Refs</div>
      </section>
	      <details class="legend-tray" open>
	        <summary>
	          <span>Legend</span>
	          <span class="muted-copy" id="legendCounts">0 visible nodes</span>
	        </summary>
	        <div class="legend-panel">
	          <section class="legend-section">
	            <p class="legend-label">Active view</p>
	            <div class="legend-list" id="activeViewLegend"></div>
	          </section>
	          <section class="legend-section">
	            <p class="legend-label">Node types</p>
	            <div class="legend-list" id="nodeLegend"></div>
	          </section>
	          <section class="legend-section">
	            <p class="legend-label">Relationships</p>
	            <div class="legend-list" id="edgeLegend"></div>
	          </section>
	        </div>
	      </details>
	      <section class="details" id="details">
	        <h2>Select a node</h2>
	        <p>Choose Company Ontology for the structure hierarchy, or Document Relationships for direct Markdown reference edges. Click folders to expand documents, click documents to reveal related documents, and pan, zoom, fit, reset, or drag nodes without changing the underlying files.</p>
	      </section>
	    </aside>
	  </main>
  <script>
	    const token = ${escapedToken};
	    const dataUrl = "http://127.0.0.1:${port}/graph-data?token=" + encodeURIComponent(token);
	    const svg = document.getElementById("graph");
	    const details = document.getElementById("details");
	    const viewNote = document.getElementById("viewNote");
	    const legendCounts = document.getElementById("legendCounts");
	    const activeViewLegend = document.getElementById("activeViewLegend");
	    const nodeLegend = document.getElementById("nodeLegend");
	    const edgeLegend = document.getElementById("edgeLegend");
	    const svgNs = "http://www.w3.org/2000/svg";
	    let graph = null;
	    let mode = "ontology";
	    let visibleNodes = [];
	    let visibleEdges = [];
	    let positions = new Map();
	    let defaultPositions = new Map();
	    let nodeElements = new Map();
	    let edgeElements = new Map();
	    let viewportGroup = null;
	    let viewport = { x: 0, y: 0, scale: 1 };
	    let dragState = null;
	    let expandedFolderIds = new Set();
	    let focusedDocumentId = null;
	    let relatedDocumentIds = new Set();
	    let relatedFolderIds = new Set();
	    let hoveredDocumentId = null;
	    let hoveredRelatedDocumentIds = new Set();
	    let hoveredNodeId = null;

	    for (const button of document.querySelectorAll("[data-mode]")) {
	      button.addEventListener("click", () => {
	        mode = button.dataset.mode;
	        if (mode === "documents") expandedFolderIds = new Set();
	        document.querySelectorAll("[data-mode]").forEach((item) => item.classList.toggle("active", item === button));
	        render();
	      });
	    }
	    document.getElementById("refresh").addEventListener("click", load);
	    document.getElementById("defaultView").addEventListener("click", () => resetDefaultView());
	    document.getElementById("zoomIn").addEventListener("click", () => zoomBy(1.2));
	    document.getElementById("zoomOut").addEventListener("click", () => zoomBy(1 / 1.2));
	    document.getElementById("fitGraph").addEventListener("click", () => fitGraph());
	    svg.addEventListener("pointerdown", onCanvasPointerDown);
	    svg.addEventListener("pointermove", onPointerMove);
	    svg.addEventListener("pointerup", onPointerUp);
	    svg.addEventListener("pointercancel", onPointerUp);
	    svg.addEventListener("wheel", onWheel, { passive: false });
	    window.addEventListener("resize", () => {
	      if (!graph) return;
	      render();
	    });

	    async function load() {
	      svg.innerHTML = '<text x="32" y="48" fill="#756a5d">Loading graph...</text>';
      const response = await fetch(dataUrl);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message || "Could not load graph data.");
      graph = payload.data;
      document.getElementById("docCount").textContent = graph.stats.documents;
      document.getElementById("folderCount").textContent = graph.stats.folders;
      document.getElementById("refCount").textContent = graph.stats.references;
	      render();
	    }

	    function buildVisibleGraphState() {
	      if (!graph) return { nodes: [], edges: [], relatedDocumentIds: new Set(), relatedFolderIds: new Set() };
	      const byId = new Map(graph.nodes.map((node) => [node.id, node]));
	      const nodeMap = new Map();
	      const edgeMap = new Map();
	      const relatedDocs = new Set();
	      const relatedFolders = new Set();

	      if (mode === "documents") {
	        graph.nodes
	          .filter((node) => node.type === "document")
	          .forEach((node) => nodeMap.set(node.id, node));
	        graph.edges
	          .filter((edge) => edge.type === "REFERENCES" && byId.get(edge.source)?.type === "document" && byId.get(edge.target)?.type === "document")
	          .forEach((edge) => edgeMap.set(edge.id, edge));
	        if (focusedDocumentId && nodeMap.has(focusedDocumentId)) {
	          edgeMap.forEach((edge) => {
	            if (edge.source === focusedDocumentId) relatedDocs.add(edge.target);
	            if (edge.target === focusedDocumentId) relatedDocs.add(edge.source);
	          });
	        }
	        return { nodes: Array.from(nodeMap.values()), edges: Array.from(edgeMap.values()), relatedDocumentIds: relatedDocs, relatedFolderIds: relatedFolders };
	      }

	      const folderIds = buildVisibleFolderIds();
	      folderIds.forEach((folderId) => {
	        const node = byId.get(folderId);
	        if (node?.type === "folder") nodeMap.set(node.id, node);
	      });

	      graph.edges
	        .filter((edge) =>
	          edge.type === "CONTAINS" &&
	          byId.get(edge.source)?.type === "folder" &&
	          byId.get(edge.target)?.type === "folder" &&
	          folderIds.has(edge.source) &&
	          folderIds.has(edge.target),
	        )
	        .forEach((edge) => edgeMap.set(edge.id, edge));

	      expandedFolderIds.forEach((folderId) => {
	        getContainedDocuments(folderId).forEach((documentNode) => {
	          nodeMap.set(documentNode.id, documentNode);
	          edgeMap.set("contains:" + folderId + ":" + documentNode.id, {
	            id: "contains:" + folderId + ":" + documentNode.id,
	            type: "CONTAINS",
	            source: folderId,
	            target: documentNode.id,
	          });
	        });
	      });

	      if (focusedDocumentId) {
	        const focusedNode = byId.get(focusedDocumentId);
	        if (focusedNode?.type === "document") {
	          nodeMap.set(focusedNode.id, focusedNode);
	          getParentFoldersForDocument(focusedNode.id).forEach((folderNode) => {
	            nodeMap.set(folderNode.id, folderNode);
	            relatedFolders.add(folderNode.id);
	            edgeMap.set("contains:" + folderNode.id + ":" + focusedNode.id, {
	              id: "contains:" + folderNode.id + ":" + focusedNode.id,
	              type: "CONTAINS",
	              source: folderNode.id,
	              target: focusedNode.id,
	            });
	          });
	          getRelatedReferenceEdges(focusedNode.id).forEach((edge) => {
	            edgeMap.set(edge.id, edge);
	            const otherId = edge.source === focusedNode.id ? edge.target : edge.source;
	            const otherNode = byId.get(otherId);
	            if (otherNode?.type === "document") {
	              nodeMap.set(otherNode.id, otherNode);
	              relatedDocs.add(otherNode.id);
	              getParentFoldersForDocument(otherNode.id).forEach((folderNode) => {
	                nodeMap.set(folderNode.id, folderNode);
	                relatedFolders.add(folderNode.id);
	                edgeMap.set("contains:" + folderNode.id + ":" + otherNode.id, {
	                  id: "contains:" + folderNode.id + ":" + otherNode.id,
	                  type: "CONTAINS",
	                  source: folderNode.id,
	                  target: otherNode.id,
	                });
	              });
	            }
	          });
	        }
	      }

	      return { nodes: Array.from(nodeMap.values()), edges: Array.from(edgeMap.values()), relatedDocumentIds: relatedDocs, relatedFolderIds: relatedFolders };
	    }

	    function buildVisibleFolderIds() {
	      const folderNodes = graph.nodes.filter((node) => node.type === "folder");
	      const folderIds = new Set();
	      const rootIds = folderNodes
	        .filter((node) => getParentFoldersForFolder(node.id).length === 0)
	        .map((node) => node.id);
	      const startingRoots = rootIds.length ? rootIds : folderNodes.slice(0, 1).map((node) => node.id);

	      startingRoots.forEach((rootId) => {
	        folderIds.add(rootId);
	        getChildFolders(rootId).forEach((child) => folderIds.add(child.id));
	      });

	      expandedFolderIds.forEach((folderId) => {
	        if (!graph.nodes.some((node) => node.id === folderId && node.type === "folder")) return;
	        folderIds.add(folderId);
	        getAncestorFolders(folderId).forEach((ancestor) => folderIds.add(ancestor.id));
	        getChildFolders(folderId).forEach((child) => folderIds.add(child.id));
	      });

	      return folderIds;
	    }

	    function getParentFoldersForFolder(folderId) {
	      return graph.edges
	        .filter((edge) => edge.type === "CONTAINS" && edge.target === folderId)
	        .map((edge) => graph.nodes.find((node) => node.id === edge.source))
	        .filter((node) => node?.type === "folder");
	    }

	    function getAncestorFolders(folderId) {
	      const ancestors = [];
	      let currentId = folderId;
	      const seen = new Set();
	      while (currentId && !seen.has(currentId)) {
	        seen.add(currentId);
	        const parent = getParentFoldersForFolder(currentId)[0];
	        if (!parent) break;
	        ancestors.push(parent);
	        currentId = parent.id;
	      }
	      return ancestors;
	    }

	    function getChildFolders(folderId) {
	      return graph.edges
	        .filter((edge) => edge.type === "CONTAINS" && edge.source === folderId)
	        .map((edge) => graph.nodes.find((node) => node.id === edge.target))
	        .filter((node) => node?.type === "folder");
	    }

	    function getContainedDocuments(folderId) {
	      return graph.edges
	        .filter((edge) => edge.type === "CONTAINS" && edge.source === folderId)
	        .map((edge) => graph.nodes.find((node) => node.id === edge.target))
	        .filter((node) => node?.type === "document");
	    }

	    function getParentFoldersForDocument(documentId) {
	      return graph.edges
	        .filter((edge) => edge.type === "CONTAINS" && edge.target === documentId)
	        .map((edge) => graph.nodes.find((node) => node.id === edge.source))
	        .filter((node) => node?.type === "folder");
	    }

	    function getRelatedReferenceEdges(documentId) {
	      return graph.edges.filter((edge) =>
	        edge.type === "REFERENCES" &&
	        (edge.source === documentId || edge.target === documentId),
	      );
	    }

	    function render() {
	      if (!graph) return;
	      const width = svg.clientWidth || 1000;
	      const height = svg.clientHeight || 720;
	      svg.setAttribute("viewBox", "0 0 " + width + " " + height);
	      svg.innerHTML = "";

	      const graphState = buildVisibleGraphState();
	      visibleNodes = graphState.nodes;
	      visibleEdges = graphState.edges;
	      relatedDocumentIds = graphState.relatedDocumentIds;
	      relatedFolderIds = graphState.relatedFolderIds;
	      viewNote.textContent = mode === "documents"
	        ? "Document Relationships uses a quiet gravity layout. Click a document to pull its related documents forward and reveal the local neighborhood."
	        : "Company Ontology starts with the root folder structure. Click a folder to open only that branch, keeping the hierarchy readable as new nodes appear.";

	      updateLegend();

	      if (visibleNodes.length === 0) {
	        svg.innerHTML = '<text x="32" y="48" fill="#756a5d">No graph nodes available yet. Run :reload or npm run index.</text>';
	        return;
	      }

	      positions = layout(visibleNodes, visibleEdges, width, height);
	      defaultPositions = clonePositions(positions);
	      nodeElements = new Map();
	      edgeElements = new Map();
	      viewportGroup = document.createElementNS(svgNs, "g");
	      viewportGroup.setAttribute("class", "graph-viewport");
	      svg.appendChild(viewportGroup);

	      for (const edge of visibleEdges) {
	        const source = positions.get(edge.source);
	        const target = positions.get(edge.target);
	        if (!source || !target) continue;
	        const line = document.createElementNS(svgNs, "line");
	        line.setAttribute("class", edgeClassName(edge));
	        edgeElements.set(edge.id, line);
	        updateEdgeElement(edge);
	        viewportGroup.appendChild(line);
	      }

	      for (const node of visibleNodes) {
	        const point = positions.get(node.id);
	        if (!point) continue;
	        const group = document.createElementNS(svgNs, "g");
	        group.setAttribute("class", nodeClassName(node));
	        group.setAttribute("tabindex", "0");
	        group.setAttribute("aria-label", node.label + " (" + node.type + ")");
	        group.dataset.nodeId = node.id;
	        group.addEventListener("pointerdown", (event) => onNodePointerDown(event, node));
	        group.addEventListener("pointerenter", () => setHoveredNode(node.id));
	        group.addEventListener("pointerleave", () => setHoveredNode(null));
	        group.addEventListener("focus", () => setHoveredNode(node.id));
	        group.addEventListener("blur", () => setHoveredNode(null));
	        group.addEventListener("keydown", (event) => {
	          if (event.key === "Enter" || event.key === " ") {
	            event.preventDefault();
	            activateNode(node);
	          }
	        });

	        const circle = document.createElementNS(svgNs, "circle");
	        const radius = radiusForNode(node);
	        circle.setAttribute("cx", 0);
	        circle.setAttribute("cy", 0);
	        circle.setAttribute("r", radius);
	        circle.setAttribute("fill", node.type === "folder" ? (node.path === "." ? "var(--folder-root)" : "var(--folder)") : "var(--doc)");
	        circle.setAttribute("stroke", "rgba(238,244,255,0.36)");
	        circle.setAttribute("stroke-width", "1.5");

	        const text = document.createElementNS(svgNs, "text");
	        text.setAttribute("x", radius + 6);
	        text.setAttribute("y", 4);
	        text.textContent = nodeDisplayLabel(node);

	        const title = document.createElementNS(svgNs, "title");
	        title.textContent = node.label;

	        group.appendChild(title);
	        group.appendChild(circle);
	        group.appendChild(text);
	        nodeElements.set(node.id, group);
	        updateNodeElement(node.id);
	        viewportGroup.appendChild(group);
	      }

	      fitGraph();
	    }

    function layout(nodes, edges, width, height) {
      if (mode === "ontology") return layoutOntology(nodes, width, height);
      return layoutDocuments(nodes, edges, width, height);
    }

    function layoutOntology(nodes, width, height) {
      const positions = new Map();
      const folderNodes = nodes.filter((node) => node.type === "folder");
      const documentNodes = nodes.filter((node) => node.type === "document");
      const folderById = new Map(folderNodes.map((node) => [node.id, node]));
      const children = new Map(folderNodes.map((node) => [node.id, []]));
      const rootIds = [];

      visibleEdges.forEach((edge) => {
        if (edge.type !== "CONTAINS") return;
        if (!folderById.has(edge.source) || !folderById.has(edge.target)) return;
        children.get(edge.source).push(edge.target);
      });

      folderNodes.forEach((node) => {
        const hasParent = visibleEdges.some((edge) => edge.type === "CONTAINS" && edge.target === node.id && folderById.has(edge.source));
        if (!hasParent) rootIds.push(node.id);
      });

      const orderedRoots = (rootIds.length ? rootIds : folderNodes.map((node) => node.id)).sort(compareNodesByPath);
      const unitGap = 0.55;
      const depth = Math.max(maxFolderDepth(orderedRoots, children), 1);
      const treeHeightUnits = Math.max(
        orderedRoots.reduce((sum, rootId, index) => sum + subtreeHeight(rootId) + (index > 0 ? unitGap * 1.8 : 0), 0),
        1,
      );
      const leftPad = 96;
      const rightPad = 220;
      const topPad = 84;
      const bottomPad = 84;
      const usableWidth = Math.max(width - leftPad - rightPad, 320);
      const usableHeight = Math.max(height - topPad - bottomPad, 320);
      const colGap = Math.max(150, Math.min(220, usableWidth / Math.max(depth + 1, 2)));
      const rowGap = Math.max(72, Math.min(108, usableHeight / Math.max(treeHeightUnits, 3)));
      let cursor = 0;

      orderedRoots.forEach((rootId) => {
        const span = subtreeHeight(rootId);
        placeFolder(rootId, 0, cursor, cursor + span);
        cursor += span + unitGap * 1.8;
      });

      placeOntologyDocuments(documentNodes, positions, visibleEdges);
      resolveOntologyOverlaps(nodes, positions, width, height);
      return positions;

      function subtreeHeight(nodeId) {
        const childIds = (children.get(nodeId) || []).slice().sort(compareNodesByPath);
        if (childIds.length === 0) return 1;
        return childIds.reduce((sum, childId, index) => sum + subtreeHeight(childId) + (index > 0 ? unitGap : 0), 0);
      }

      function placeFolder(nodeId, level, startUnit, endUnit) {
        const childIds = (children.get(nodeId) || []).slice().sort(compareNodesByPath);
        const yUnit = childIds.length === 0 ? (startUnit + endUnit) / 2 : computeChildCenter(startUnit, childIds);
        positions.set(nodeId, {
          x: leftPad + level * colGap + (level % 2) * 18,
          y: topPad + yUnit * rowGap,
        });
        let childCursor = startUnit;
        childIds.forEach((childId) => {
          const childHeight = subtreeHeight(childId);
          placeFolder(childId, level + 1, childCursor, childCursor + childHeight);
          childCursor += childHeight + unitGap;
        });
      }

      function computeChildCenter(startUnit, childIds) {
        let childCursor = startUnit;
        let firstCenter = null;
        let lastCenter = null;
        childIds.forEach((childId) => {
          const childHeight = subtreeHeight(childId);
          const center = childCursor + childHeight / 2;
          if (firstCenter === null) firstCenter = center;
          lastCenter = center;
          childCursor += childHeight + unitGap;
        });
        return ((firstCenter ?? startUnit) + (lastCenter ?? startUnit)) / 2;
      }
    }

    function layoutDocuments(nodes, edges, width, height) {
      const positions = new Map();
      const degree = new Map(nodes.map((node) => [node.id, 0]));
      const connectedIds = new Set();
      edges.forEach((edge) => {
        connectedIds.add(edge.source);
        connectedIds.add(edge.target);
        degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
        degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
      });
      const connected = nodes
        .filter((node) => connectedIds.has(node.id))
        .sort((left, right) => (degree.get(right.id) || 0) - (degree.get(left.id) || 0) || left.label.localeCompare(right.label));
      const isolated = nodes
        .filter((node) => !connectedIds.has(node.id))
        .sort((left, right) => left.label.localeCompare(right.label));
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.max(170, Math.min(width, height) * 0.34);

      if (connected.length === 0) {
        placeGrid(isolated, width, height, positions);
        return positions;
      }

      connected.forEach((node, index) => {
        const angle = seededAngle(node.id) + (Math.PI * 2 * index) / Math.max(connected.length, 1);
        const degreeBias = Math.min((degree.get(node.id) || 1) / 8, 0.65);
        const spiral = connected.length <= 1 ? 0 : index / (connected.length - 1);
        const nodeRadius = radius * (0.18 + spiral * 0.74 - degreeBias * 0.18);
        positions.set(node.id, {
          x: centerX + Math.cos(angle) * nodeRadius,
          y: centerY + Math.sin(angle) * nodeRadius,
        });
      });

	      isolated.forEach((node, index) => {
	        const angle = seededAngle(node.id) + index * 2.399963;
	        const ring = radius * (1.05 + (index % 5) * 0.13);
	        positions.set(node.id, {
	          x: centerX + Math.cos(angle) * ring,
	          y: centerY + Math.sin(angle) * ring,
	        });
	      });

	      runGravityLayout(nodes, edges, positions, degree, width, height);
	      if (focusedDocumentId && positions.has(focusedDocumentId)) {
	        const focusPoint = { x: centerX, y: centerY };
	        positions.set(focusedDocumentId, focusPoint);
	        const neighbors = Array.from(relatedDocumentIds)
	          .map((id) => nodes.find((node) => node.id === id))
	          .filter(Boolean);
	        neighbors.forEach((node, index) => {
	          const angle = seededAngle(node.id) + (Math.PI * 2 * index) / Math.max(neighbors.length, 1);
	          const orbit = 130 + (index % 4) * 20;
	          positions.set(node.id, {
	            x: focusPoint.x + Math.cos(angle) * orbit,
	            y: focusPoint.y + Math.sin(angle) * orbit * 0.74,
	          });
	        });
	      }
	      return positions;
	    }

    function runGravityLayout(nodes, edges, positions, degree, width, height) {
      const velocities = new Map(nodes.map((node) => [node.id, { x: 0, y: 0 }]));
      const centerX = width / 2;
      const centerY = height / 2;
      const iterations = nodes.length > 90 ? 180 : 230;
      const repulsion = Math.max(6800, Math.min(18000, width * height / Math.max(nodes.length, 1) * 0.018));
      const springLength = Math.max(96, Math.min(160, Math.sqrt((width * height) / Math.max(nodes.length, 1)) * 1.35));
      const springStrength = 0.018;
      const gravity = 0.0055;
      const isolatedGravity = 0.0018;
      const minGap = 42;

      for (let iteration = 0; iteration < iterations; iteration += 1) {
        for (let i = 0; i < nodes.length; i += 1) {
          for (let j = i + 1; j < nodes.length; j += 1) {
            const left = positions.get(nodes[i].id);
            const right = positions.get(nodes[j].id);
            if (!left || !right) continue;
            let dx = right.x - left.x;
            let dy = right.y - left.y;
            let distanceSq = dx * dx + dy * dy;
            if (distanceSq < 0.01) {
              dx = Math.cos(seededAngle(nodes[i].id)) * 0.1;
              dy = Math.sin(seededAngle(nodes[j].id)) * 0.1;
              distanceSq = dx * dx + dy * dy;
            }
            const distance = Math.sqrt(distanceSq);
            const overlapBoost = distance < minGap ? (minGap - distance) * 0.18 : 0;
            const force = Math.min(repulsion / distanceSq, 6) + overlapBoost;
            const fx = (dx / distance) * force;
            const fy = (dy / distance) * force;
            const leftVelocity = velocities.get(nodes[i].id);
            const rightVelocity = velocities.get(nodes[j].id);
            leftVelocity.x -= fx;
            leftVelocity.y -= fy;
            rightVelocity.x += fx;
            rightVelocity.y += fy;
          }
        }

        edges.forEach((edge) => {
          const source = positions.get(edge.source);
          const target = positions.get(edge.target);
          if (!source || !target) return;
          const sourceVelocity = velocities.get(edge.source);
          const targetVelocity = velocities.get(edge.target);
          const dx = target.x - source.x;
          const dy = target.y - source.y;
          const distance = Math.max(Math.sqrt(dx * dx + dy * dy), 0.01);
          const force = (distance - springLength) * springStrength;
          const fx = (dx / distance) * force;
          const fy = (dy / distance) * force;
          sourceVelocity.x += fx;
          sourceVelocity.y += fy;
          targetVelocity.x -= fx;
          targetVelocity.y -= fy;
        });

        nodes.forEach((node) => {
          const point = positions.get(node.id);
          const velocity = velocities.get(node.id);
          if (!point || !velocity) return;
          const nodeDegree = degree.get(node.id) || 0;
          const centerPull = nodeDegree > 0 ? gravity * (1 + Math.min(nodeDegree, 8) * 0.08) : isolatedGravity;
          velocity.x += (centerX - point.x) * centerPull;
          velocity.y += (centerY - point.y) * centerPull;
          velocity.x *= 0.78;
          velocity.y *= 0.78;
          point.x = clamp(point.x + velocity.x, 48, width - 48);
          point.y = clamp(point.y + velocity.y, 54, height - 54);
        });
      }
    }

    function seededAngle(value) {
      let hash = 2166136261;
      for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
      return ((hash >>> 0) / 4294967295) * Math.PI * 2;
    }

    function placeRing(items, radius, centerX, centerY, offset, positions) {
      const total = Math.max(items.length, 1);
      items.forEach((item, index) => {
        const angle = offset + (Math.PI * 2 * index) / total;
        positions.set(item.id, { x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius });
      });
    }

	    function placeGrid(items, width, height, positions) {
	      const cols = Math.max(1, Math.ceil(Math.sqrt(items.length)));
	      const rows = Math.max(1, Math.ceil(items.length / cols));
      items.forEach((item, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        positions.set(item.id, {
          x: ((col + 1) * width) / (cols + 1),
          y: ((row + 1) * height) / (rows + 1),
	        });
	      });
	    }

	    function updateLegend() {
	      legendCounts.textContent = visibleNodes.length + " visible nodes · " + visibleEdges.length + " visible edges";
	      activeViewLegend.innerHTML = '<span class="legend-chip">' + escapeHtml(mode === "documents" ? "Document Relationships" : "Company Ontology") + '</span>' +
	        '<span class="legend-chip">' + (mode === "documents" ? "Gravity layout" : "Hierarchy layout") + '</span>' +
	        '<span class="legend-chip">Drag nodes</span><span class="legend-chip">Pan + zoom canvas</span>';

	      const nodeTypes = mode === "documents"
	        ? [{ label: "Document", color: "var(--doc)" }]
	        : [{ label: "Root folder", color: "var(--folder-root)" }, { label: "Folder", color: "var(--folder)" }];
	      nodeLegend.innerHTML = nodeTypes.map((item) =>
	        '<span class="legend-chip"><span class="legend-swatch" style="background:' + item.color + '"></span>' + escapeHtml(item.label) + '</span>',
	      ).join("");

	      const edgeTypes = mode === "documents"
	        ? [{ label: "Simple REFERENCES", className: "reference" }]
	        : [{ label: "CONTAINS", className: "contains" }];
	      edgeLegend.innerHTML = edgeTypes.map((item) =>
	        '<span class="legend-chip"><span class="legend-line ' + item.className + '"></span>' + escapeHtml(item.label) + '</span>',
	      ).join("");
	    }

	    function clonePositions(source) {
	      const cloned = new Map();
	      source.forEach((point, id) => cloned.set(id, { x: point.x, y: point.y }));
	      return cloned;
	    }

	    function updateViewport() {
	      if (!viewportGroup) return;
	      viewportGroup.setAttribute("transform", "translate(" + viewport.x + " " + viewport.y + ") scale(" + viewport.scale + ")");
	    }

	    function updateNodeElement(nodeId) {
	      const group = nodeElements.get(nodeId);
	      const point = positions.get(nodeId);
	      if (!group || !point) return;
	      const node = visibleNodes.find((item) => item.id === nodeId);
	      if (node) {
	        group.setAttribute("class", nodeClassName(node));
	        const circle = group.querySelector("circle");
	        if (circle) circle.setAttribute("r", radiusForNode(node));
	      }
	      group.setAttribute("transform", "translate(" + point.x + " " + point.y + ")");
	      const text = group.querySelector("text");
	      if (node && text) text.textContent = nodeDisplayLabel(node);
	    }

	    function setHoveredNode(nodeId) {
	      if (hoveredNodeId === nodeId) return;
	      hoveredNodeId = nodeId;
	      hoveredRelatedDocumentIds = nodeId && mode === "documents"
	        ? new Set(getRelatedReferenceEdges(nodeId).map((edge) => (edge.source === nodeId ? edge.target : edge.source)))
	        : new Set();
	      updateInteractionState();
	    }

	    function updateEdgeElement(edge) {
	      const line = edgeElements.get(edge.id);
	      const source = positions.get(edge.source);
	      const target = positions.get(edge.target);
	      if (!line || !source || !target) return;
	      line.setAttribute("class", edgeClassName(edge));
	      line.setAttribute("x1", source.x);
	      line.setAttribute("y1", source.y);
	      line.setAttribute("x2", target.x);
	      line.setAttribute("y2", target.y);
	    }

	    function updateInteractionState() {
	      visibleNodes.forEach((node) => updateNodeElement(node.id));
	      visibleEdges.forEach((edge) => updateEdgeElement(edge));
	    }

	    function updateConnectedEdges(nodeId) {
	      visibleEdges.forEach((edge) => {
	        if (edge.source === nodeId || edge.target === nodeId) updateEdgeElement(edge);
	      });
	    }

	    function onNodePointerDown(event, node) {
	      event.stopPropagation();
	      const point = getGraphPoint(event);
	      const current = positions.get(node.id);
	      if (!current) return;
	      dragState = {
	        type: "node",
	        node,
	        pointerId: event.pointerId,
	        startClientX: event.clientX,
	        startClientY: event.clientY,
	        moved: false,
	        offsetX: point.x - current.x,
	        offsetY: point.y - current.y,
	      };
	      nodeElements.get(node.id)?.classList.add("dragging");
	      svg.setPointerCapture(event.pointerId);
	    }

	    function onCanvasPointerDown(event) {
	      if (event.target !== svg) return;
	      dragState = {
	        type: "pan",
	        pointerId: event.pointerId,
	        startClientX: event.clientX,
	        startClientY: event.clientY,
	        startX: viewport.x,
	        startY: viewport.y,
	        moved: false,
	      };
	      svg.classList.add("panning");
	      svg.setPointerCapture(event.pointerId);
	    }

	    function onPointerMove(event) {
	      if (!dragState || dragState.pointerId !== event.pointerId) return;
	      const deltaX = event.clientX - dragState.startClientX;
	      const deltaY = event.clientY - dragState.startClientY;
	      if (Math.hypot(deltaX, deltaY) > 4) dragState.moved = true;

	      if (dragState.type === "pan") {
	        viewport.x = dragState.startX + deltaX;
	        viewport.y = dragState.startY + deltaY;
	        updateViewport();
	        return;
	      }

	      if (dragState.type === "node") {
	        const point = getGraphPoint(event);
	        positions.set(dragState.node.id, {
	          x: point.x - dragState.offsetX,
	          y: point.y - dragState.offsetY,
	        });
	        updateNodeElement(dragState.node.id);
	        updateConnectedEdges(dragState.node.id);
	      }
	    }

	    function onPointerUp(event) {
	      if (!dragState || dragState.pointerId !== event.pointerId) return;
	      if (dragState.type === "node") {
	        nodeElements.get(dragState.node.id)?.classList.remove("dragging");
	        if (!dragState.moved) activateNode(dragState.node);
	      }
	      svg.classList.remove("panning");
	      if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
	      dragState = null;
	    }

	    function onWheel(event) {
	      event.preventDefault();
	      const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
	      zoomBy(factor, { x: event.clientX, y: event.clientY });
	    }

	    function getGraphPoint(event) {
	      const rect = svg.getBoundingClientRect();
	      return {
	        x: (event.clientX - rect.left - viewport.x) / viewport.scale,
	        y: (event.clientY - rect.top - viewport.y) / viewport.scale,
	      };
	    }

	    function zoomBy(factor, anchorClient) {
	      const rect = svg.getBoundingClientRect();
	      const anchor = anchorClient
	        ? { x: anchorClient.x - rect.left, y: anchorClient.y - rect.top }
	        : { x: (svg.clientWidth || 1000) / 2, y: (svg.clientHeight || 720) / 2 };
	      const nextScale = clamp(viewport.scale * factor, 0.2, 3.5);
	      const graphX = (anchor.x - viewport.x) / viewport.scale;
	      const graphY = (anchor.y - viewport.y) / viewport.scale;
	      viewport.x = anchor.x - graphX * nextScale;
	      viewport.y = anchor.y - graphY * nextScale;
	      viewport.scale = nextScale;
	      updateViewport();
	    }

	    function fitGraph() {
	      if (positions.size === 0) return;
	      const width = svg.clientWidth || 1000;
	      const height = svg.clientHeight || 720;
	      const bounds = getPositionBounds();
	      const padding = 96;
	      const scaleX = width / Math.max(bounds.width + padding, 1);
	      const scaleY = height / Math.max(bounds.height + padding, 1);
	      viewport.scale = clamp(Math.min(scaleX, scaleY), 0.25, 2.2);
	      viewport.x = width / 2 - (bounds.minX + bounds.width / 2) * viewport.scale;
	      viewport.y = height / 2 - (bounds.minY + bounds.height / 2) * viewport.scale;
	      updateViewport();
	    }

	    function resetDefaultView() {
	      if (mode === "ontology") {
	        expandedFolderIds = new Set();
	        focusedDocumentId = null;
	        relatedDocumentIds = new Set();
	        relatedFolderIds = new Set();
	        hoveredNodeId = null;
	        hoveredRelatedDocumentIds = new Set();
	        render();
	        return;
	      }
	      positions = clonePositions(defaultPositions);
	      visibleNodes.forEach((node) => updateNodeElement(node.id));
	      visibleEdges.forEach((edge) => updateEdgeElement(edge));
	      fitGraph();
	    }

	    function getPositionBounds() {
	      const points = Array.from(positions.values());
	      const xs = points.map((point) => point.x);
	      const ys = points.map((point) => point.y);
	      const minX = Math.min(...xs);
	      const maxX = Math.max(...xs);
	      const minY = Math.min(...ys);
	      const maxY = Math.max(...ys);
	      return { minX, minY, width: maxX - minX, height: maxY - minY };
	    }

	    function clamp(value, min, max) {
	      return Math.max(min, Math.min(max, value));
	    }

	    function activateNode(node) {
	      if (mode === "ontology" && node.type === "folder") {
	        if (expandedFolderIds.has(node.id)) expandedFolderIds.delete(node.id);
	        else expandedFolderIds.add(node.id);
	        showDetails(node);
	        render();
	        return;
	      }

	      if (node.type === "document") {
	        focusedDocumentId = focusedDocumentId === node.id ? null : node.id;
	        if (mode === "ontology") {
	          getParentFoldersForDocument(node.id).forEach((folderNode) => expandedFolderIds.add(folderNode.id));
	        }
	        showDetails(node);
	        render();
	        return;
	      }

	      showDetails(node);
	    }

	    function nodeClassName(node) {
	      const classes = ["node", node.type];
	      const activeDocumentId = getActiveDocumentId();
	      const activeRelatedIds = getActiveRelatedDocumentIds();
	      if (activeDocumentId) {
	        if (node.type === "document") {
	          if (node.id === activeDocumentId) classes.push("selected");
	          else if (activeRelatedIds.has(node.id) && mode === "documents") classes.push("context");
	          else if (mode === "documents") classes.push("dimmed");
	        } else if (relatedFolderIds.has(node.id)) {
	          classes.push("related");
	        }
	      }
	      if (mode === "ontology" && node.type === "folder" && expandedFolderIds.has(node.id)) classes.push("selected");
	      return classes.join(" ");
	    }

	    function edgeClassName(edge) {
	      const classes = ["edge", edge.type === "REFERENCES" ? "reference" : "contains"];
	      const activeDocumentId = getActiveDocumentId();
	      if (activeDocumentId && edge.type === "REFERENCES") {
	        if (edge.source === activeDocumentId || edge.target === activeDocumentId) classes.push("active");
	        else if (mode === "documents") classes.push("muted");
	      }
	      if (mode === "ontology" && edge.type === "CONTAINS" && (expandedFolderIds.has(edge.source) || relatedFolderIds.has(edge.source))) {
	        classes.push("active");
	      }
	      return classes.join(" ");
	    }

	    function radiusForNode(node) {
	      if (node.type === "folder") return Math.min(28, 12 + Math.sqrt(node.documentCount || 1) * 2.4);
	      const activeDocumentId = getActiveDocumentId();
	      if (activeDocumentId === node.id) return 8.5;
	      return 6.5;
	    }

	    function getActiveDocumentId() {
	      return hoveredNodeId || focusedDocumentId;
	    }

	    function getActiveRelatedDocumentIds() {
	      return hoveredNodeId ? hoveredRelatedDocumentIds : relatedDocumentIds;
	    }

	    function placeOntologyDocuments(documentNodes, positions, edges) {
	      const docsByFolder = new Map();
	      edges.forEach((edge) => {
	        if (edge.type !== "CONTAINS") return;
	        const documentNode = documentNodes.find((node) => node.id === edge.target);
	        if (!documentNode) return;
	        if (!docsByFolder.has(edge.source)) docsByFolder.set(edge.source, []);
	        docsByFolder.get(edge.source).push(documentNode);
	      });

	      docsByFolder.forEach((docs, folderId) => {
	        const folderPoint = positions.get(folderId);
	        if (!folderPoint) return;
	        docs
	          .slice()
	          .sort((left, right) => left.label.localeCompare(right.label))
	          .forEach((doc, index) => {
	            const column = Math.floor(index / 6);
	            const row = index % 6;
	            const rowCenter = (Math.min(docs.length, 6) - 1) / 2;
	            positions.set(doc.id, {
	              x: folderPoint.x + 108 + column * 112,
	              y: folderPoint.y + (row - rowCenter) * 34,
	            });
	          });
	      });

	      if (!focusedDocumentId || !positions.has(focusedDocumentId)) return;
	      const focusPoint = positions.get(focusedDocumentId);
	      const relatedDocs = Array.from(relatedDocumentIds)
	        .map((id) => documentNodes.find((node) => node.id === id))
	        .filter(Boolean);
	      relatedDocs.forEach((doc, index) => {
	        const angle = seededAngle(doc.id) + (Math.PI * 2 * index) / Math.max(relatedDocs.length, 1);
	        const orbit = 114 + (index % 3) * 18;
	        positions.set(doc.id, {
	          x: focusPoint.x + Math.cos(angle) * orbit,
	          y: focusPoint.y + Math.sin(angle) * orbit * 0.68,
	        });
	      });
	    }

	    function compareNodesByPath(leftId, rightId) {
	      const left = visibleNodes.find((node) => node.id === leftId);
	      const right = visibleNodes.find((node) => node.id === rightId);
	      return (left?.path || "").localeCompare(right?.path || "");
	    }

	    function resolveOntologyOverlaps(nodes, positions, width, height) {
	      const orderedNodes = nodes
	        .slice()
	        .sort((left, right) => {
	          const leftPoint = positions.get(left.id);
	          const rightPoint = positions.get(right.id);
	          return (leftPoint?.x || 0) - (rightPoint?.x || 0) || (leftPoint?.y || 0) - (rightPoint?.y || 0);
	        });
	      const iterations = 18;
	      const paddingX = 28;
	      const paddingY = 18;
	      const minX = 72;
	      const maxX = Math.max(width - 72, minX + 1);
	      const minY = 56;
	      const maxY = Math.max(height - 56, minY + 1);

	      for (let iteration = 0; iteration < iterations; iteration += 1) {
	        for (let i = 0; i < orderedNodes.length; i += 1) {
	          for (let j = i + 1; j < orderedNodes.length; j += 1) {
	            const left = orderedNodes[i];
	            const right = orderedNodes[j];
	            const leftPoint = positions.get(left.id);
	            const rightPoint = positions.get(right.id);
	            if (!leftPoint || !rightPoint) continue;

	            const leftBox = estimateNodeBox(left);
	            const rightBox = estimateNodeBox(right);
	            const dx = rightPoint.x - leftPoint.x;
	            const dy = rightPoint.y - leftPoint.y;
	            const overlapX = (leftBox.width + rightBox.width) / 2 + paddingX - Math.abs(dx);
	            const overlapY = (leftBox.height + rightBox.height) / 2 + paddingY - Math.abs(dy);
	            if (overlapX <= 0 || overlapY <= 0) continue;

	            const pushY = overlapY / 2 + 4;
	            const pushX = overlapX / 2 + 4;
	            const sameColumn = Math.abs(dx) < 120;
	            const leftIsFolder = left.type === "folder";
	            const rightIsFolder = right.type === "folder";

	            if (sameColumn || leftIsFolder || rightIsFolder) {
	              if (dy <= 0) {
	                leftPoint.y = clamp(leftPoint.y - pushY * (leftIsFolder ? 0.25 : 0.5), minY, maxY);
	                rightPoint.y = clamp(rightPoint.y + pushY * (rightIsFolder ? 0.25 : 0.5), minY, maxY);
	              } else {
	                leftPoint.y = clamp(leftPoint.y + pushY * (leftIsFolder ? 0.25 : 0.5), minY, maxY);
	                rightPoint.y = clamp(rightPoint.y - pushY * (rightIsFolder ? 0.25 : 0.5), minY, maxY);
	              }
	            } else {
	              if (dx <= 0) {
	                leftPoint.x = clamp(leftPoint.x - pushX * (leftIsFolder ? 0.15 : 0.45), minX, maxX);
	                rightPoint.x = clamp(rightPoint.x + pushX * (rightIsFolder ? 0.15 : 0.45), minX, maxX);
	              } else {
	                leftPoint.x = clamp(leftPoint.x + pushX * (leftIsFolder ? 0.15 : 0.45), minX, maxX);
	                rightPoint.x = clamp(rightPoint.x - pushX * (rightIsFolder ? 0.15 : 0.45), minX, maxX);
	              }
	            }
	          }
	        }
	      }
	    }

	    function estimateNodeBox(node) {
	      const label = trimLabel(node.label, node.type === "folder" ? 24 : 22);
	      const textWidth = Math.min(Math.max(label.length * (node.type === "folder" ? 7.2 : 6.4), 58), node.type === "folder" ? 196 : 152);
	      const radius = node.type === "folder" ? Math.min(28, 12 + Math.sqrt(node.documentCount || 1) * 2.4) : 6.5;
	      return {
	        width: radius * 2 + 10 + textWidth,
	        height: node.type === "folder" ? 30 : 22,
	      };
	    }

	    function maxFolderDepth(rootIds, children) {
	      let depth = 0;
	      function walk(nodeId, level) {
	        depth = Math.max(depth, level);
	        (children.get(nodeId) || []).forEach((childId) => walk(childId, level + 1));
	      }
	      rootIds.forEach((rootId) => walk(rootId, 0));
	      return depth;
	    }

	    function showDetails(node) {
	      const containedDocs = node.type === "folder" ? getContainedDocuments(node.id).length : null;
	      const childFolders = node.type === "folder" ? getChildFolders(node.id).length : null;
	      const relatedDocs = node.type === "document" ? getRelatedReferenceEdges(node.id).length : null;
	      const chips = [
	        node.type,
	        node.ontologyDomain,
	        node.status,
	        node.ownerAgent,
	        node.documentCount ? node.documentCount + " docs" : null,
	        childFolders ? childFolders + " child folders" : null,
	        containedDocs ? containedDocs + " contained docs" : null,
	        relatedDocs ? relatedDocs + " related docs" : null,
	      ].filter(Boolean).map((item) => '<span class="pill">' + escapeHtml(item) + '</span>').join(" ");
	      const actionCopy = node.type === "folder"
	        ? (expandedFolderIds.has(node.id)
	          ? "<p>Click this folder again to collapse this branch. Click child folders to continue opening the hierarchy.</p>"
	          : "<p>Click this folder to open just this branch and keep the rest of the graph compact.</p>")
	        : (focusedDocumentId === node.id
	          ? "<p>This document is focused. Related documents are pulled forward in the graph.</p>"
	          : "<p>Click this document to pull its related documents forward and reveal the local neighborhood.</p>");
	      details.innerHTML = '<h2>' + escapeHtml(node.label) + '</h2>' +
	        '<div class="legend">' + chips + '</div>' +
	        '<div class="path">' + escapeHtml(node.path) + '</div>' +
	        (node.summary ? '<p>' + escapeHtml(node.summary) + '</p>' : '<p>Ontology node generated from the company-memory folder hierarchy.</p>') +
	        actionCopy;
	    }

    function nodeDisplayLabel(node) {
      return shouldExpandNodeLabel(node)
        ? node.label
        : trimLabel(node.label, node.type === "folder" ? 24 : 22);
    }

    function shouldExpandNodeLabel(node) {
      const activeDocumentId = getActiveDocumentId();
      return (
        hoveredNodeId === node.id ||
        activeDocumentId === node.id ||
        expandedFolderIds.has(node.id) ||
        relatedFolderIds.has(node.id)
      );
    }

    function trimLabel(value, max) {
      return value.length > max ? value.slice(0, max - 1) + "…" : value;
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
    }

    load().catch((error) => {
      svg.innerHTML = '<text x="32" y="48" fill="#8b2f2f">' + escapeHtml(error.message) + '</text>';
    });
  </script>
</body>
</html>`;
}

function buildRetrievalQuery(messages: ChatMessage[], latestMessage: string): string {
  const recentTurns = messages
    .slice(-6)
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");
  return recentTurns ? `${recentTurns}\nuser: ${latestMessage}` : latestMessage;
}

// ── Entry Point ───────────────────────────────────────────────────────────────

export async function startDaemonServer(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  await loadRepoEnv(env);
  const workspace = await ensureCliWorkspaceReady(env, { log: (message) => process.stdout.write(message) });

  process.stdout.write(
    `[pulseos-lite-cli] Loading Company Memory knowledge base for workspace ${workspace.paths.workspaceId}...\n`,
  );
  process.stdout.write(`[pulseos-lite-cli] Workspace storage: ${workspace.paths.workspaceRoot}\n`);
  const kbIndex = openWorkspaceStore({
    repoRoot: REPO_ROOT,
    dbPath: getCliDbPath(env),
    env,
  });
  const terminalManager = new TerminalSessionManager();

  const port = await getAvailablePort(env);
  const token = randomUUID();
  const version = getDaemonVersion();
  const state: DaemonState = {
    pid: process.pid,
    port,
    token,
    startedAt: new Date().toISOString(),
    version,
  };

  const sessions = new Map<string, Session>();
  const readyState: ReadyState = { ready: false, error: null };

  let idleTimer: NodeJS.Timeout | null = null;
  let shuttingDown = false;
  let server: ReturnType<typeof serve> | null = null;
  let indexingError: Error | null = null;
  let indexingPromise: Promise<void> = Promise.resolve();

  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => void shutdown(), getDaemonIdleMs(env));
  };

  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (idleTimer) clearTimeout(idleTimer);
    if (server) await new Promise<void>((resolve) => server?.close(() => resolve()));
    terminalManager.closeAll();
    kbIndex.close();
    await removeDaemonState(env);
    process.exit(0);
  };

  const app = createDaemonApp({
    state,
    token,
    kbIndex,
    terminalManager,
    getReadyState: () => ({ ...readyState }),
    awaitReady: async () => {
      await indexingPromise;
      if (indexingError) throw indexingError;
    },
    sessions,
    resetIdleTimer,
    onShutdown: () => void shutdown(),
  });

  server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port }, () => {
    process.stdout.write(`[pulseos-lite-cli] Daemon running on port ${port} (pid ${process.pid})\n`);
  });

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  await writeDaemonState(state, env);
  process.stdout.write("[pulseos-lite-cli] Checking 000_Company_Memory against the SQLite graph/index...\n");
  indexingPromise = (async () => {
    const result = await kbIndex.ensureCurrent();
    await kbIndex.inspectRebuildStatus({ persistLog: true });
    process.stdout.write(
      `[pulseos-lite-cli] Company Memory graph/index is current with ${result.fileCount} documents (${result.charCount.toLocaleString()} chars) using ${result.embeddingModel} [${result.embeddingMode}].\n`,
    );
  })();

  try {
    await indexingPromise;
    readyState.ready = true;
    readyState.error = null;
    indexingError = null;
  } catch (error) {
    indexingError = error instanceof Error ? error : new Error(String(error));
    readyState.ready = false;
    readyState.error = indexingError.message;
    process.stderr.write(
      `[pulseos-lite-cli] Company Memory graph/index refresh failed: ${indexingError.message}\n`,
    );
  }
  resetIdleTimer();
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await startDaemonServer();
}
