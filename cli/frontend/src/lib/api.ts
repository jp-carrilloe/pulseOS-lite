import type { ApiKnowledgeGraphSnapshot, DocumentReadResponse, FileTreeNode } from "../types/graph";

interface Envelope<T> {
  data: T;
}

const token = new URLSearchParams(window.location.search).get("token") ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const separator = path.includes("?") ? "&" : "?";
  const headers = new Headers(init?.headers ?? undefined);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${path}${separator}token=${encodeURIComponent(token)}`, {
    ...init,
    headers,
  });
  const payload = (await response.json()) as Envelope<T> | { error?: { message?: string } };
  if (!response.ok || !("data" in payload)) {
    throw new Error("error" in payload ? payload.error?.message ?? "Request failed" : "Request failed");
  }
  return payload.data;
}

export const api = {
  getGraph: () => request<ApiKnowledgeGraphSnapshot>("/api/graph-data"),
  getFileTree: () => request<FileTreeNode>("/api/files/tree"),
  readDocument: (documentPath: string) =>
    request<DocumentReadResponse>(`/api/files/read?path=${encodeURIComponent(documentPath)}`),
  writeDocument: (documentPath: string, content: string) =>
    request<{ path: string; indexedAt: string }>(`/api/files/write`, {
      method: "POST",
      body: JSON.stringify({ path: documentPath, content }),
    }),
};
