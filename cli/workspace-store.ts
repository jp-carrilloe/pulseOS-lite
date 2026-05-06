import { KnowledgeBaseIndex, type KnowledgeGraphSnapshot, type RebuildAdvisorStatus, type RetrievalResult, type SyncIndexResult } from "./retrieval.js";

export interface WorkspaceStoreStatus {
  root: string;
  indexedDocuments: number;
  indexedCharCount: number;
  embeddingModel?: string;
  embeddingMode?: string;
}

export interface WorkspaceStore {
  close(): void;
  ensureCurrent(): Promise<SyncIndexResult>;
  sync(): Promise<SyncIndexResult>;
  retrieve(query: string, topK?: number): Promise<RetrievalResult[]>;
  buildGraphSnapshot(): Promise<KnowledgeGraphSnapshot>;
  inspectRebuildStatus(options?: { persistLog?: boolean }): Promise<RebuildAdvisorStatus>;
  buildPromptContext(message: string): Promise<string>;
  listFiles(): string[];
  getStatus(): WorkspaceStoreStatus;
}

export interface WorkspaceStoreProvider {
  readonly kind: "sqlite";
  open(options: {
    repoRoot: string;
    dbPath: string;
    env?: NodeJS.ProcessEnv;
  }): WorkspaceStore;
}

export const sqliteWorkspaceStoreProvider: WorkspaceStoreProvider = {
  kind: "sqlite",
  open(options) {
    return new KnowledgeBaseIndex(options);
  },
};

export function openWorkspaceStore(options: {
  repoRoot: string;
  dbPath: string;
  env?: NodeJS.ProcessEnv;
}): WorkspaceStore {
  return sqliteWorkspaceStoreProvider.open(options);
}
