import { Buffer } from "node:buffer";
import process from "node:process";

import { REPO_ROOT, getCliDbPath, loadRepoEnv } from "./shared.js";

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
}

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const SERVER_INFO = {
  name: "pulseos-lite-mcp",
  version: "0.1.0",
};

const TOOLS: ToolDefinition[] = [
  {
    name: "repo_status",
    description: "Return the local knowledge-base status, including document and vector counts.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: "rebuild_advisor",
    description: "Inspect pending documentation drift, weekly rebuild cadence, and likely rebuild cost.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: "rebuild_now",
    description: "Re-index the markdown knowledge base, refresh vectors, and return the updated rebuild advisory.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: "list_files",
    description: "List all markdown files currently indexed in the local knowledge base.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: "retrieve_context",
    description: "Build the retrieval prompt context for a natural-language query using the local vector index.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: { type: "string", description: "User question or retrieval query." },
        refresh_if_stale: {
          type: "boolean",
          description: "When true, allow this tool to rebuild the local index first if drift is detected.",
        },
      },
      required: ["query"],
    },
  },
];

silenceNodeSqliteExperimentalWarning();

const { KnowledgeBaseIndex } = await import("./retrieval.js");

await loadRepoEnv(process.env);
const kbIndex = new KnowledgeBaseIndex({
  repoRoot: REPO_ROOT,
  dbPath: getCliDbPath(process.env),
  env: process.env,
});
await kbIndex.inspectRebuildStatus({ persistLog: true });

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

let inputBuffer = Buffer.alloc(0);

process.stdin.on("data", (chunk: Buffer) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);
  drainMessages();
});

function drainMessages() {
  while (true) {
    const separator = inputBuffer.indexOf("\r\n\r\n");
    if (separator === -1) return;

    const headerText = inputBuffer.slice(0, separator).toString("utf8");
    const lengthMatch = headerText.match(/Content-Length:\s*(\d+)/i);
    if (!lengthMatch) {
      inputBuffer = Buffer.alloc(0);
      return;
    }

    const contentLength = Number(lengthMatch[1]);
    const messageStart = separator + 4;
    const messageEnd = messageStart + contentLength;
    if (inputBuffer.length < messageEnd) return;

    const messageText = inputBuffer.slice(messageStart, messageEnd).toString("utf8");
    inputBuffer = inputBuffer.slice(messageEnd);
    void handleMessage(messageText);
  }
}

async function handleMessage(messageText: string) {
  let request: JsonRpcRequest;
  try {
    request = JSON.parse(messageText) as JsonRpcRequest;
  } catch {
    return;
  }

  if (!request.method) return;

  try {
    switch (request.method) {
      case "initialize":
        respond(request.id ?? null, {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {},
          },
          serverInfo: SERVER_INFO,
        });
        return;
      case "notifications/initialized":
        return;
      case "ping":
        respond(request.id ?? null, {});
        return;
      case "tools/list":
        respond(request.id ?? null, { tools: TOOLS });
        return;
      case "tools/call":
        respond(request.id ?? null, await callTool(request.params ?? {}));
        return;
      default:
        if (request.id !== undefined) {
          respondError(request.id, -32601, `Method not found: ${request.method}`);
        }
    }
  } catch (error) {
    if (request.id !== undefined) {
      respondError(request.id, -32000, error instanceof Error ? error.message : "Unknown MCP server error.");
    }
  }
}

async function callTool(params: Record<string, unknown>) {
  const name = String(params.name ?? "");
  const args = (params.arguments as Record<string, unknown> | undefined) ?? {};

  switch (name) {
    case "repo_status": {
      const status = kbIndex.getStatus();
      return toolResult(status);
    }
    case "rebuild_advisor": {
      const advisor = await kbIndex.inspectRebuildStatus();
      return toolResult(advisor);
    }
    case "rebuild_now": {
      const syncResult = await kbIndex.sync();
      const advisor = await kbIndex.inspectRebuildStatus();
      return toolResult({ syncResult, advisor });
    }
    case "list_files": {
      return toolResult({ files: kbIndex.listFiles() });
    }
    case "retrieve_context": {
      const query = String(args.query ?? "").trim();
      if (!query) {
        throw new Error("The `query` argument is required.");
      }
      const refreshIfStale = args.refresh_if_stale === true;
      const advisor = await kbIndex.inspectRebuildStatus();
      if (advisor.indexedDocuments === 0 && !refreshIfStale) {
        throw new Error(
          "No indexed documents are available yet. Call `rebuild_now` first, or retry `retrieve_context` with `refresh_if_stale: true`.",
        );
      }
      if (refreshIfStale && advisor.needsRebuild) {
        await kbIndex.sync();
      }
      const context = await kbIndex.buildPromptContext(query);
      return {
        content: [{ type: "text", text: context }],
        structuredContent: { query, context, advisor },
      };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function toolResult(payload: unknown) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

function respond(id: JsonRpcId, result: unknown) {
  writeMessage({
    jsonrpc: "2.0",
    id,
    result,
  });
}

function respondError(id: JsonRpcId, code: number, message: string) {
  writeMessage({
    jsonrpc: "2.0",
    id,
    error: { code, message },
  });
}

function writeMessage(message: unknown) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}

function silenceNodeSqliteExperimentalWarning() {
  const originalEmitWarning = process.emitWarning.bind(process);
  process.emitWarning = ((warning: string | Error, ...args: unknown[]) => {
    const message = typeof warning === "string" ? warning : warning.message;
    if (
      message.includes("SQLite is an experimental feature")
      || (typeof args[0] === "string" && args[0] === "ExperimentalWarning")
    ) {
      return;
    }
    return originalEmitWarning(warning as never, ...(args as []));
  }) as typeof process.emitWarning;
}

function shutdown() {
  kbIndex.close();
  process.exit(0);
}
