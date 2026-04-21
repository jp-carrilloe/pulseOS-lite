import { randomUUID } from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import { Hono, type Context, type Next } from "hono";
import { serve } from "@hono/node-server";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  REPO_ROOT,
  type DaemonState,
  type ModelName,
  getAvailablePort,
  getCliDbPath,
  getDaemonIdleMs,
  getDaemonVersion,
  loadRepoEnv,
  removeDaemonState,
  writeDaemonState,
} from "./shared.js";
import { KnowledgeBaseIndex } from "./retrieval.js";

// ── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface Session {
  id: string;
  model: ModelName;
  messages: ChatMessage[];
  createdAt: string;
}

interface ReadyState {
  ready: boolean;
  error: string | null;
}

// ── AI Providers ─────────────────────────────────────────────────────────────

function buildSystemPrompt(repoContext: string): string {
  return `You are an intelligent AI assistant embedded in the PulseOS Lite Open Source repository. You are working against a local retrieved context rather than the full repo, so stay grounded in the provided documents and say when something is missing.

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
): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 4096,
    // Cache the large system prompt (repo context) across turns — saves ~90% on input tokens
    system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
    messages: [
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: newMessage },
    ],
    betas: ["prompt-caching-2024-07-31"],
  } as Parameters<typeof client.messages.create>[0]);
  const res = response as Anthropic.Messages.Message;
  const block = res.content[0];
  return block.type === "text" ? block.text : "";
}

async function chatWithOpenAI(
  messages: ChatMessage[],
  newMessage: string,
  systemPrompt: string,
): Promise<string> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: newMessage },
    ],
  });
  return response.choices[0]?.message?.content ?? "";
}

async function chatWithGemini(
  messages: ChatMessage[],
  newMessage: string,
  systemPrompt: string,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
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
  getReadyState: () => ReadyState;
  awaitReady: () => Promise<void>;
  sessions: Map<string, Session>;
  resetIdleTimer: () => void;
  onShutdown: () => void;
}) {
  const app = new Hono();
  const { state, token, sessions, resetIdleTimer, onShutdown, kbIndex, getReadyState, awaitReady } = options;

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
        reloadRepo: () => kbIndex.sync(),
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
    reloadRepo: () => Promise<{ fileCount: number; charCount: number; indexedAt: string; embeddingModel: string; embeddingMode: string }>;
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

      if (!ctx.sessions.has(sessionId)) {
        ctx.sessions.set(sessionId, {
          id: sessionId,
          model,
          messages: [],
          createdAt: new Date().toISOString(),
        });
      }

      const session = ctx.sessions.get(sessionId)!;
      if (args.model) session.model = model;

      const retrievalQuery = buildRetrievalQuery(session.messages, message);
      const systemPrompt = buildSystemPrompt(await ctx.buildPromptContext(retrievalQuery));
      let reply = "";

      switch (session.model) {
        case "claude":
          reply = await chatWithClaude(session.messages, message, systemPrompt);
          break;
        case "openai":
          reply = await chatWithOpenAI(session.messages, message, systemPrompt);
          break;
        case "gemini":
          reply = await chatWithGemini(session.messages, message, systemPrompt);
          break;
        default:
          throw new Error(`The selected model "${String(session.model)}" is not supported by this CLI session.`);
      }

      session.messages.push({ role: "user", content: message });
      session.messages.push({ role: "assistant", content: reply });

      return { reply, model: session.model, sessionId, messageCount: session.messages.length };
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

    case "list_files": {
      await ctx.awaitReady();
      return ctx.repoFiles();
    }

    default:
      throw new Error(`The daemon does not recognize the command "${name}".`);
  }
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

  process.stdout.write("[pulseos-lite-open-source-cli] Indexing repository...\n");
  const kbIndex = new KnowledgeBaseIndex({
    repoRoot: REPO_ROOT,
    dbPath: getCliDbPath(env),
    env,
  });

  const port = await getAvailablePort();
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
    kbIndex.close();
    await removeDaemonState(env);
    process.exit(0);
  };

  const app = createDaemonApp({
    state,
    token,
    kbIndex,
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
    process.stdout.write(`[pulseos-lite-open-source-cli] Daemon running on port ${port} (pid ${process.pid})\n`);
  });

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  await writeDaemonState(state, env);
  indexingPromise = kbIndex
    .ensureCurrent()
    .then((indexResult) => {
      readyState.ready = true;
      readyState.error = null;
      indexingError = null;
      process.stdout.write(
        `[pulseos-lite-open-source-cli] Created or refreshed the SQL index and ran vectorization for ${indexResult.fileCount} files (${indexResult.charCount.toLocaleString()} chars) via ${indexResult.embeddingModel}\n`,
      );
    })
    .catch((error) => {
      readyState.ready = false;
      readyState.error = error instanceof Error ? error.message : String(error);
      indexingError = error instanceof Error ? error : new Error(String(error));
    });
  resetIdleTimer();
}

import { fileURLToPath } from "node:url";
if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await startDaemonServer();
}
