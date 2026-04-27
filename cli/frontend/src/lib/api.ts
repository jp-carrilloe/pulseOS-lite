import type { ApiKnowledgeGraphSnapshot, DocumentReadResponse, FileTreeNode, RebuildAdvisorStatus, UiCapabilities } from "../types/graph";
import type { TerminalSessionSummary } from "../types/terminal";

interface Envelope<T> {
  data: T;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? undefined);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "same-origin",
  });

  const contentType = response.headers.get("content-type") ?? "";
  const rawBody = await response.text();

  let payload: Envelope<T> | { error?: { message?: string } } | null = null;
  if (contentType.includes("application/json")) {
    try {
      payload = JSON.parse(rawBody) as Envelope<T> | { error?: { message?: string } };
    } catch {
      throw new Error("The local UI received invalid JSON from the daemon. Refresh the page or restart `npm run graph`.");
    }
  }

  if (!response.ok) {
    const fallbackMessage =
      rawBody.trim() === "404 Not Found"
        ? "The local graph daemon is missing a UI endpoint that this page expects. Restart `npm run graph` so the UI and daemon are on the same version."
        : rawBody.trim() || "Request failed";
    throw new Error(payload && "error" in payload ? payload.error?.message ?? fallbackMessage : fallbackMessage);
  }

  if (!payload || !("data" in payload)) {
    throw new Error(
      rawBody.trim() === "404 Not Found"
        ? "The local graph daemon is out of date for this UI. Restart `npm run graph` and open the new link."
        : "The local daemon returned a response this UI could not use. Refresh the page or restart `npm run graph`.",
    );
  }
  return payload.data;
}

export const api = {
  getUiCapabilities: () => request<UiCapabilities>("/api/ui-capabilities"),
  getGraph: () => request<ApiKnowledgeGraphSnapshot>("/api/graph-data"),
  getRebuildAdvisor: () => request<RebuildAdvisorStatus>("/api/rebuild-advisor"),
  rebuildGraph: () =>
    request<{
      files: number;
      charCount: number;
      indexedAt: string;
      embeddingModel: string;
      embeddingMode: string;
      advisor: RebuildAdvisorStatus;
    }>("/api/rebuild", { method: "POST" }),
  getFileTree: () => request<FileTreeNode>("/api/files/tree"),
  readDocument: (documentPath: string) =>
    request<DocumentReadResponse>(`/api/files/read?path=${encodeURIComponent(documentPath)}`),
  writeDocument: (documentPath: string, content: string) =>
    request<{ path: string; indexedAt: string }>(`/api/files/write`, {
      method: "POST",
      body: JSON.stringify({ path: documentPath, content }),
    }),
  createTerminalSession: () =>
    request<TerminalSessionSummary>("/api/terminal/session", {
      method: "POST",
    }),
  sendTerminalInput: (id: string, text: string) =>
    request<{ ok: boolean }>("/api/terminal/input", {
      method: "POST",
      body: JSON.stringify({ id, text }),
    }),
  closeTerminalSession: (id: string) =>
    request<{ closed: boolean }>("/api/terminal/close", {
      method: "POST",
      body: JSON.stringify({ id }),
    }),
};
