import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import OpenAI from "openai";

const SUMMARY_VECTOR_OWNER_TYPE = "document_summary";
const HEURISTIC_MODEL = "heuristic-hash-v1";
const OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";
const VECTOR_DIMENSION = 128;
const MAX_SUMMARY_LENGTH = 320;
const MAX_FULL_DOCUMENTS = 4;
const MAX_RETRIEVAL_RESULTS = 8;
const MAX_PROMPT_CHARS = 120_000;
const MAX_CHUNK_CHARS = 1800;
const MAX_RETRIEVAL_CANDIDATES = 64;
const COMPANY_MEMORY_ROOT = "000_Company_Memory";

export interface IndexedDocumentRecord {
  id: string;
  relativePath: string;
  title: string;
  summary: string;
  ontologyDomain: string;
  status: string | null;
  ownerAgent: string | null;
  contentHash: string;
  contentLength: number;
  updatedAt: string;
  indexedAt: string;
}

export interface VectorRecord {
  id: string;
  ownerType: string;
  ownerId: string;
  model: string;
  vector: number[];
  createdAt: string;
}

export interface RetrievalResult {
  document: IndexedDocumentRecord;
  score: number;
}

export interface IndexStatusSummary {
  dbPath: string;
  root: string;
  indexedDocuments: number;
  lastIndexedAt: string | null;
  embeddingModel: string | null;
  embeddingMode: "provider" | "heuristic";
  indexedCharCount: number;
  referenceCount: number;
}

export type RebuildChangeType = "added" | "updated" | "deleted";
export type RebuildCostLevel = "none" | "low" | "medium" | "high";
export type RebuildWorkScope = "none" | "small" | "medium" | "large";

export interface RebuildTrackedChange {
  path: string;
  changeType: RebuildChangeType;
  previousHash: string | null;
  nextHash: string | null;
  previousUpdatedAt: string | null;
  nextUpdatedAt: string | null;
  charDelta: number;
}

export interface RebuildChangeLogEntry extends RebuildTrackedChange {
  id: string;
  firstDetectedAt: string;
  lastDetectedAt: string;
  resolvedAt: string | null;
}

export interface RebuildAdvisorStatus {
  checkedAt: string;
  indexedDocuments: number;
  indexedCharCount: number;
  lastIndexedAt: string | null;
  embeddingModel: string | null;
  embeddingMode: "provider" | "heuristic";
  needsRebuild: boolean;
  reasons: string[];
  suggestion: string;
  suggestedAction: "none" | "review" | "rebuild";
  weeklySchedule: {
    intervalDays: number;
    nextRecommendedAt: string | null;
    overdue: boolean;
    overdueDays: number;
  };
  pending: {
    totalChanges: number;
    added: number;
    updated: number;
    deleted: number;
    changedCharacters: number;
    changes: RebuildTrackedChange[];
  };
  cost: {
    level: RebuildCostLevel;
    likelyUsesProviderEmbeddings: boolean;
    requiresFullReindex: boolean;
    estimatedEmbeddingCalls: number;
    summary: string;
    warning: string | null;
  };
  recentLog: RebuildChangeLogEntry[];
}

export type KnowledgeGraphNodeType = "folder" | "document";
export type KnowledgeGraphEdgeType = "CONTAINS" | "REFERENCES";

export interface KnowledgeGraphNode {
  id: string;
  type: KnowledgeGraphNodeType;
  label: string;
  path: string;
  parentId: string | null;
  ontologyDomain?: string;
  status?: string | null;
  ownerAgent?: string | null;
  summary?: string;
  documentCount?: number;
}

export interface KnowledgeGraphEdge {
  id: string;
  type: KnowledgeGraphEdgeType;
  source: string;
  target: string;
  label: string;
}

export interface KnowledgeGraphSnapshot {
  generatedAt: string;
  stats: {
    documents: number;
    folders: number;
    references: number;
  };
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
}

export interface SyncIndexResult {
  fileCount: number;
  charCount: number;
  indexedAt: string;
  embeddingModel: string;
  embeddingMode: "provider" | "heuristic";
}

interface IndexedDocumentChunk {
  id: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  contentLength: number;
}

interface ScannedMarkdownFile {
  relativePath: string;
  fullPath: string;
  content: string;
  updatedAt: string;
}

interface RebuildInspectionOptions {
  persistLog?: boolean;
}

interface EmbeddingProvider {
  mode: "provider" | "heuristic";
  model: string;
  embed(text: string): Promise<number[]>;
}

export class KnowledgeBaseIndex {
  private readonly db: DatabaseSync;
  private graphSnapshotCache: KnowledgeGraphSnapshot | null = null;

  constructor(
    private readonly options: {
      repoRoot: string;
      dbPath: string;
      env?: NodeJS.ProcessEnv;
    },
  ) {
    fs.mkdirSync(path.dirname(options.dbPath), { recursive: true });
    this.db = new DatabaseSync(options.dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec("PRAGMA busy_timeout = 5000;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        relative_path TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        ontology_domain TEXT NOT NULL,
        status TEXT,
        owner_agent TEXT,
        content_hash TEXT NOT NULL,
        content_length INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        indexed_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS knowledge_vectors (
        id TEXT PRIMARY KEY,
        owner_type TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        model TEXT NOT NULL,
        vector_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(owner_type, owner_id)
      );

      CREATE TABLE IF NOT EXISTS index_runs (
        id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        files_seen INTEGER NOT NULL DEFAULT 0,
        files_indexed INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL,
        error TEXT
      );

      CREATE TABLE IF NOT EXISTS crm_objects (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        object_type TEXT NOT NULL,
        provider_object_id TEXT NOT NULL,
        name TEXT,
        email TEXT,
        company_name TEXT,
        lifecycle_stage TEXT,
        pipeline_stage TEXT,
        owner_name TEXT,
        amount REAL,
        currency TEXT,
        close_date TEXT,
        raw_json TEXT NOT NULL,
        last_synced_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(provider, object_type, provider_object_id)
      );

      CREATE TABLE IF NOT EXISTS crm_sync_runs (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        sync_type TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        objects_seen INTEGER NOT NULL DEFAULT 0,
        objects_upserted INTEGER NOT NULL DEFAULT 0,
        error TEXT
      );

      CREATE TABLE IF NOT EXISTS rebuild_change_log (
        id TEXT PRIMARY KEY,
        relative_path TEXT NOT NULL,
        change_type TEXT NOT NULL,
        previous_hash TEXT,
        next_hash TEXT,
        previous_updated_at TEXT,
        next_updated_at TEXT,
        char_delta INTEGER NOT NULL DEFAULT 0,
        first_detected_at TEXT NOT NULL,
        last_detected_at TEXT NOT NULL,
        resolved_at TEXT,
        UNIQUE(relative_path, change_type, previous_hash, next_hash)
      );

      CREATE TABLE IF NOT EXISTS document_references (
        id TEXT PRIMARY KEY,
        source_document_id TEXT NOT NULL,
        source_relative_path TEXT NOT NULL,
        target_relative_path TEXT NOT NULL,
        target_document_id TEXT,
        link_text TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(source_document_id, target_relative_path)
      );

      CREATE TABLE IF NOT EXISTS document_chunks (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        content_length INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(document_id, chunk_index)
      );

      CREATE INDEX IF NOT EXISTS idx_documents_relative_path ON documents(relative_path);
      CREATE INDEX IF NOT EXISTS idx_vectors_owner ON knowledge_vectors(owner_type, owner_id);
      CREATE INDEX IF NOT EXISTS idx_index_runs_started_at ON index_runs(started_at);
      CREATE INDEX IF NOT EXISTS idx_crm_objects_provider_type ON crm_objects(provider, object_type);
      CREATE INDEX IF NOT EXISTS idx_crm_objects_email ON crm_objects(email);
      CREATE INDEX IF NOT EXISTS idx_crm_objects_company_name ON crm_objects(company_name);
      CREATE INDEX IF NOT EXISTS idx_crm_objects_pipeline_stage ON crm_objects(pipeline_stage);
      CREATE INDEX IF NOT EXISTS idx_crm_sync_runs_started_at ON crm_sync_runs(started_at);
      CREATE INDEX IF NOT EXISTS idx_rebuild_change_log_path ON rebuild_change_log(relative_path, resolved_at);
      CREATE INDEX IF NOT EXISTS idx_rebuild_change_log_last_detected ON rebuild_change_log(last_detected_at DESC);
      CREATE INDEX IF NOT EXISTS idx_document_references_source ON document_references(source_document_id);
      CREATE INDEX IF NOT EXISTS idx_document_references_target ON document_references(target_relative_path);
      CREATE INDEX IF NOT EXISTS idx_document_chunks_document ON document_chunks(document_id, chunk_index);
    `);
    this.migrateDocumentsOntologyColumn();
    this.migrateDocumentsContentLengthColumn();
  }

  close() {
    this.db.close();
  }

  async sync(): Promise<SyncIndexResult> {
    const startedAt = new Date().toISOString();
    const runId = randomUUID();
    this.db
      .prepare(
        `INSERT INTO index_runs (id, started_at, files_seen, files_indexed, status, error)
         VALUES (?, ?, 0, 0, 'running', NULL)`,
      )
      .run(runId, startedAt);

    try {
      const files = await scanKnowledgeBaseMarkdown(this.options.repoRoot);
      const provider = createEmbeddingProvider(this.options.env ?? process.env);
      const indexedAt = new Date().toISOString();
      let charCount = 0;
      const parsedDocuments = files.map((file) => summarizeMarkdown(file.relativePath, file.content, file.updatedAt, indexedAt));
      const documentIdByPath = new Map(parsedDocuments.map((parsed) => [parsed.relativePath, parsed.id]));

      const seenPaths = new Set(files.map((file) => file.relativePath));
      this.db.exec("BEGIN");
      try {
        for (let index = 0; index < files.length; index++) {
          const file = files[index];
          const parsed = parsedDocuments[index];
          charCount += file.content.length;
          const vector = await provider.embed(parsed.summary);

          this.db
            .prepare(
              `INSERT INTO documents (
                 id, relative_path, title, summary, ontology_domain, status, owner_agent, content_hash, content_length, updated_at, indexed_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(relative_path) DO UPDATE SET
                 id = excluded.id,
                 title = excluded.title,
                 summary = excluded.summary,
                 ontology_domain = excluded.ontology_domain,
                 status = excluded.status,
                 owner_agent = excluded.owner_agent,
                 content_hash = excluded.content_hash,
                 content_length = excluded.content_length,
                 updated_at = excluded.updated_at,
                 indexed_at = excluded.indexed_at`,
            )
            .run(
              parsed.id,
              parsed.relativePath,
              parsed.title,
              parsed.summary,
              parsed.ontologyDomain,
              parsed.status,
              parsed.ownerAgent,
              parsed.contentHash,
              parsed.contentLength,
              parsed.updatedAt,
              parsed.indexedAt,
            );

          this.db
            .prepare(
              `INSERT INTO knowledge_vectors (id, owner_type, owner_id, model, vector_json, created_at)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(owner_type, owner_id) DO UPDATE SET
                 id = excluded.id,
                 model = excluded.model,
                 vector_json = excluded.vector_json,
                 created_at = excluded.created_at`,
            )
            .run(
              buildVectorId(parsed.id),
              SUMMARY_VECTOR_OWNER_TYPE,
              parsed.id,
              provider.model,
              JSON.stringify(vector),
              indexedAt,
            );

          this.db.prepare(`DELETE FROM document_references WHERE source_document_id = ?`).run(parsed.id);
          for (const reference of extractDocumentReferences(file.relativePath, file.content, documentIdByPath, indexedAt, parsed.id)) {
            this.db.prepare(
              `INSERT INTO document_references (
                 id, source_document_id, source_relative_path, target_relative_path, target_document_id, link_text, created_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            ).run(
              reference.id,
              reference.sourceDocumentId,
              reference.sourceRelativePath,
              reference.targetRelativePath,
              reference.targetDocumentId,
              reference.linkText,
              reference.createdAt,
            );
          }

          this.db.prepare(`DELETE FROM document_chunks WHERE document_id = ?`).run(parsed.id);
          for (const chunk of buildDocumentChunks(parsed.id, parsed.relativePath, file.content, indexedAt)) {
            this.db.prepare(
              `INSERT INTO document_chunks (
                 id, document_id, relative_path, chunk_index, content, content_length, created_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            ).run(
              chunk.id,
              chunk.documentId,
              parsed.relativePath,
              chunk.chunkIndex,
              chunk.content,
              chunk.contentLength,
              indexedAt,
            );
          }
        }

        const staleRows = this.db
          .prepare(`SELECT id, relative_path FROM documents`)
          .all() as Array<{ id: string; relative_path: string }>;
        for (const row of staleRows) {
          if (seenPaths.has(row.relative_path)) continue;
          this.db.prepare(`DELETE FROM knowledge_vectors WHERE owner_type = ? AND owner_id = ?`).run(SUMMARY_VECTOR_OWNER_TYPE, row.id);
          this.db.prepare(`DELETE FROM document_references WHERE source_document_id = ? OR target_document_id = ? OR source_relative_path = ? OR target_relative_path = ?`).run(row.id, row.id, row.relative_path, row.relative_path);
          this.db.prepare(`DELETE FROM document_chunks WHERE document_id = ?`).run(row.id);
          this.db.prepare(`DELETE FROM documents WHERE id = ?`).run(row.id);
        }

        this.db.exec("COMMIT");
      } catch (error) {
        this.db.exec("ROLLBACK");
        throw error;
      }

      this.db
        .prepare(
          `UPDATE index_runs
           SET completed_at = ?, files_seen = ?, files_indexed = ?, status = 'completed', error = NULL
           WHERE id = ?`,
        )
        .run(indexedAt, files.length, files.length, runId);

      this.graphSnapshotCache = null;
      this.recordRebuildChanges([], indexedAt);

      return {
        fileCount: files.length,
        charCount,
        indexedAt,
        embeddingModel: provider.model,
        embeddingMode: provider.mode,
      };
    } catch (error) {
      this.db
        .prepare(
          `UPDATE index_runs
           SET completed_at = ?, status = 'failed', error = ?
           WHERE id = ?`,
        )
        .run(new Date().toISOString(), error instanceof Error ? error.message : String(error), runId);
      throw error;
    }
  }

  async ensureCurrent(): Promise<SyncIndexResult> {
    const existingCount = this.db.prepare(`SELECT COUNT(*) as count FROM documents`).get() as { count: number };
    if (existingCount.count === 0) {
      return this.sync();
    }

    const configuredModel = getPreferredEmbeddingModel(this.options.env ?? process.env);
    const currentModel = this.getStoredEmbeddingModel();
    if (currentModel !== configuredModel) {
      return this.sync();
    }

    const scanned = await scanKnowledgeBaseMarkdown(this.options.repoRoot);
    const currentRows = this.db
      .prepare(`SELECT relative_path, content_hash FROM documents`)
      .all() as Array<{ relative_path: string; content_hash: string }>;

    const currentMap = new Map(currentRows.map((row) => [row.relative_path, row.content_hash]));
    let hasDrift = scanned.length !== currentRows.length;
    for (const file of scanned) {
      const nextHash = hashText(file.content);
      if (currentMap.get(file.relativePath) !== nextHash) {
        hasDrift = true;
        break;
      }
    }

    return hasDrift ? this.sync() : this.snapshotFromDb();
  }

  listFiles(): string[] {
    return (
      this.db
        .prepare(`SELECT relative_path FROM documents ORDER BY relative_path`)
        .all() as Array<{ relative_path: string }>
    ).map((row) => row.relative_path);
  }

  getDocumentCount(): number {
    const row = this.db.prepare(`SELECT COUNT(*) as count FROM documents`).get() as { count: number };
    return row.count;
  }

  getStatus(): IndexStatusSummary {
    const docRow = this.db.prepare(
      `SELECT COUNT(*) as count, MAX(indexed_at) as lastIndexedAt, COALESCE(SUM(LENGTH(summary)), 0) as summaryChars FROM documents`,
    ).get() as { count: number; lastIndexedAt: string | null; summaryChars: number };
    const vectorRow = this.db.prepare(
      `SELECT model FROM knowledge_vectors WHERE owner_type = ? ORDER BY created_at DESC LIMIT 1`,
    ).get(SUMMARY_VECTOR_OWNER_TYPE) as { model: string } | undefined;
    const referenceRow = this.db.prepare(
      `SELECT COUNT(*) as count FROM document_references`,
    ).get() as { count: number };

    return {
      dbPath: this.options.dbPath,
      root: this.options.repoRoot,
      indexedDocuments: docRow.count,
      lastIndexedAt: docRow.lastIndexedAt,
      embeddingModel: vectorRow?.model ?? null,
      embeddingMode: vectorRow?.model && vectorRow.model !== HEURISTIC_MODEL ? "provider" : "heuristic",
      indexedCharCount: docRow.summaryChars ?? 0,
      referenceCount: referenceRow.count ?? 0,
    };
  }

  async inspectRebuildStatus(options: RebuildInspectionOptions = {}): Promise<RebuildAdvisorStatus> {
    const checkedAt = new Date().toISOString();
    const status = this.getStatus();
    const { changes, scanned } = await this.collectRebuildChanges();
    const scannedDocumentIdByPath = new Map(
      scanned.map((file) => [file.relativePath, buildDocumentId(file.relativePath)]),
    );
    const expectedReferenceCount = scanned.reduce(
      (sum, file) =>
        sum +
        extractDocumentReferences(
          file.relativePath,
          file.content,
          scannedDocumentIdByPath,
          checkedAt,
          buildDocumentId(file.relativePath),
        ).length,
      0,
    );

    if (options.persistLog) {
      this.recordRebuildChanges(changes, checkedAt);
    }

    const pending = {
      totalChanges: changes.length,
      added: changes.filter((change) => change.changeType === "added").length,
      updated: changes.filter((change) => change.changeType === "updated").length,
      deleted: changes.filter((change) => change.changeType === "deleted").length,
      changedCharacters: changes.reduce((sum, change) => sum + Math.max(change.charDelta, 0), 0),
      changes: changes.slice(0, 25),
    };

    const weeklySchedule = buildWeeklySchedule(status.lastIndexedAt, checkedAt);
    const reasons: string[] = [];
    if (status.indexedDocuments === 0) reasons.push("No graph/index has been built yet for the current knowledge base.");
    if (status.indexedDocuments > 0 && expectedReferenceCount > 0 && status.referenceCount === 0) {
      reasons.push(
        "Documents are indexed, but no document relationships are stored in the SQL graph. Rebuild graph to restore Markdown reference edges.",
      );
    }
    if (pending.totalChanges > 0) {
      reasons.push(
        `${pending.totalChanges} documentation change${pending.totalChanges === 1 ? "" : "s"} ${pending.totalChanges === 1 ? "is" : "are"} waiting to be reflected in the graph and retrieval index.`,
      );
    }
    if (weeklySchedule.overdue) {
      reasons.push(
        `The default weekly refresh window has passed${weeklySchedule.overdueDays > 0 ? ` by ${weeklySchedule.overdueDays} day${weeklySchedule.overdueDays === 1 ? "" : "s"}` : ""}.`,
      );
    }

    const likelyUsesProviderEmbeddings = status.embeddingMode === "provider";
    const estimatedEmbeddingCalls =
      status.indexedDocuments === 0 || pending.totalChanges > 0 || weeklySchedule.overdue
        ? Math.max(scanned.length, pending.totalChanges)
        : 0;
    const costLevel = classifyRebuildCost({
      likelyUsesProviderEmbeddings,
      indexedDocuments: status.indexedDocuments,
      changedDocuments: pending.totalChanges,
      changedCharacters: pending.changedCharacters,
      overdue: weeklySchedule.overdue,
    });

    const needsRebuild = reasons.length > 0;
    const suggestion = buildRebuildSuggestion({
      indexedDocuments: status.indexedDocuments,
      pendingChanges: pending.totalChanges,
      overdue: weeklySchedule.overdue,
    });

    return {
      checkedAt,
      indexedDocuments: status.indexedDocuments,
      indexedCharCount: status.indexedCharCount,
      lastIndexedAt: status.lastIndexedAt,
      embeddingModel: status.embeddingModel,
      embeddingMode: status.embeddingMode,
      needsRebuild,
      reasons,
      suggestion,
      suggestedAction: needsRebuild ? (pending.totalChanges > 0 || status.indexedDocuments === 0 ? "rebuild" : "review") : "none",
      weeklySchedule,
      pending,
      cost: {
        level: costLevel,
        likelyUsesProviderEmbeddings,
        requiresFullReindex: needsRebuild,
        estimatedEmbeddingCalls,
        summary: buildCostSummary(costLevel, likelyUsesProviderEmbeddings, estimatedEmbeddingCalls, pending.totalChanges, scanned.length),
        warning: buildCostWarning(costLevel, likelyUsesProviderEmbeddings, pending.totalChanges, scanned.length),
      },
      recentLog: this.listRecentRebuildChanges(),
    };
  }

  async retrieve(query: string, topK = MAX_RETRIEVAL_RESULTS): Promise<RetrievalResult[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const storedModel = this.getStoredEmbeddingModel();
    const provider = createEmbeddingProvider(this.options.env ?? process.env, storedModel);
    const queryVector = await provider.embed(trimmed);
    const prefilteredRows = this.selectRetrievalCandidates(trimmed, MAX_RETRIEVAL_CANDIDATES);
    const shouldUsePrefilter = prefilteredRows.length >= Math.min(Math.max(topK * 2, 4), MAX_RETRIEVAL_CANDIDATES);
    const rows = (shouldUsePrefilter ? prefilteredRows : this.db.prepare(
      `SELECT
         d.id,
         d.relative_path,
         d.title,
         d.summary,
         d.ontology_domain,
         d.status,
         d.owner_agent,
         d.content_hash,
         d.content_length,
         d.updated_at,
         d.indexed_at,
         kv.vector_json
       FROM documents d
       JOIN knowledge_vectors kv
         ON kv.owner_type = ?
        AND kv.owner_id = d.id
       ORDER BY d.relative_path`,
    ).all(SUMMARY_VECTOR_OWNER_TYPE)) as Array<{
      id: string;
      relative_path: string;
      title: string;
      summary: string;
      ontology_domain: string;
      status: string | null;
      owner_agent: string | null;
      content_hash: string;
      content_length: number;
      updated_at: string;
      indexed_at: string;
      vector_json: string;
    }>;

    return rows
      .map((row) => ({
        document: {
          id: row.id,
          relativePath: row.relative_path,
          title: row.title,
          summary: row.summary,
          ontologyDomain: row.ontology_domain,
          status: row.status,
          ownerAgent: row.owner_agent,
          contentHash: row.content_hash,
          contentLength: row.content_length,
          updatedAt: row.updated_at,
          indexedAt: row.indexed_at,
        },
        score: cosineSimilarity(queryVector, parseVector(row.vector_json)),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, topK);
  }

  async buildPromptContext(query: string): Promise<string> {
    const matches = await this.retrieve(query, MAX_RETRIEVAL_RESULTS);
    if (matches.length === 0) {
      return [
        "# PulseOS Lite Open Source Knowledge Base",
        "",
        "No indexed knowledge-base documents were available for this query.",
      ].join("\n");
    }

    const summaries = matches.map((match, index) => {
      const bits = [
        `${index + 1}. ${match.document.title} (${match.document.relativePath})`,
        `   Summary: ${match.document.summary}`,
        `   Ontology: ${match.document.ontologyDomain}`,
      ];
      if (match.document.ownerAgent) bits.push(`   Owner: ${match.document.ownerAgent}`);
      if (match.document.status) bits.push(`   Status: ${match.document.status}`);
      bits.push(`   Similarity: ${match.score.toFixed(3)}`);
      return bits.join("\n");
    });

    let context = [
      "# PulseOS Lite Open Source Knowledge Base",
      "",
      "Use the retrieved company-brain documents below as the primary source of truth. Be specific, cite paths when relevant, and say when the answer is not fully grounded in the indexed docs.",
      "",
      "## Retrieved Document Summaries",
      ...summaries,
      "",
      "## Retrieved Full Documents",
    ].join("\n");

    for (const match of matches.slice(0, MAX_FULL_DOCUMENTS)) {
      const content = this.readIndexedDocumentBody(match.document.id);
      if (!content) continue;
      const block = `\n### ${match.document.relativePath}\n\n${content}\n`;
      if (context.length + block.length > MAX_PROMPT_CHARS) break;
      context += block;
    }

    return context;
  }

  async buildGraphSnapshot(): Promise<KnowledgeGraphSnapshot> {
    if (this.graphSnapshotCache) {
      return this.graphSnapshotCache;
    }

    const rows = this.db.prepare(
      `SELECT
         id,
         relative_path,
         title,
         summary,
         ontology_domain,
         status,
         owner_agent
       FROM documents
       ORDER BY relative_path`,
    ).all() as Array<{
      id: string;
      relative_path: string;
      title: string;
      summary: string;
      ontology_domain: string;
      status: string | null;
      owner_agent: string | null;
    }>;

    const nodes = new Map<string, KnowledgeGraphNode>();
    const edges = new Map<string, KnowledgeGraphEdge>();
    const documentPathToNodeId = new Map<string, string>();
    const documentDbIdToNodeId = new Map<string, string>();
    const folderDocumentCounts = new Map<string, number>();

    const addFolder = (folderPath: string): string => {
      const normalizedPath = folderPath || ".";
      const id = buildFolderNodeId(normalizedPath);
      if (nodes.has(id)) return id;

      const parentPath = normalizedPath === "." ? null : path.posix.dirname(normalizedPath);
      const normalizedParent = parentPath && parentPath !== "." ? parentPath : parentPath === "." ? "." : null;
      const parentId = normalizedPath === "." ? null : buildFolderNodeId(normalizedParent ?? ".");

      if (parentId && !nodes.has(parentId)) addFolder(normalizedParent ?? ".");

      nodes.set(id, {
        id,
        type: "folder",
        label: normalizedPath === "." ? "Knowledge Base" : path.posix.basename(normalizedPath),
        path: normalizedPath,
        parentId,
        documentCount: 0,
      });

      if (parentId) {
        const edgeId = `contains:${parentId}->${id}`;
        edges.set(edgeId, {
          id: edgeId,
          type: "CONTAINS",
          source: parentId,
          target: id,
          label: "contains",
        });
      }

      return id;
    };

    addFolder(".");

    for (const row of rows) {
      const documentId = buildDocumentNodeId(row.relative_path);
      const folderPath = path.posix.dirname(row.relative_path);
      const parentFolderPath = folderPath === "." ? "." : folderPath;
      const parentId = addFolder(parentFolderPath);

      for (const ancestorPath of getFolderAncestors(parentFolderPath)) {
        folderDocumentCounts.set(ancestorPath, (folderDocumentCounts.get(ancestorPath) ?? 0) + 1);
      }

      nodes.set(documentId, {
        id: documentId,
        type: "document",
        label: row.title,
        path: row.relative_path,
        parentId,
        ontologyDomain: row.ontology_domain,
        status: row.status,
        ownerAgent: row.owner_agent,
        summary: row.summary,
      });
      documentPathToNodeId.set(row.relative_path, documentId);
      documentDbIdToNodeId.set(row.id, documentId);

      const edgeId = `contains:${parentId}->${documentId}`;
      edges.set(edgeId, {
        id: edgeId,
        type: "CONTAINS",
        source: parentId,
        target: documentId,
        label: "contains",
      });
    }

    for (const [folderPath, count] of folderDocumentCounts.entries()) {
      const folder = nodes.get(buildFolderNodeId(folderPath));
      if (folder) folder.documentCount = count;
    }

    const referenceRows = this.db.prepare(
      `SELECT source_document_id, target_document_id
       FROM document_references
       WHERE target_document_id IS NOT NULL`,
    ).all() as Array<{ source_document_id: string; target_document_id: string }>;

    for (const row of referenceRows) {
      const sourceNodeId = documentDbIdToNodeId.get(row.source_document_id);
      const targetNodeId = documentDbIdToNodeId.get(row.target_document_id);
      if (!sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId) continue;
      const edgeId = `references:${sourceNodeId}->${targetNodeId}`;
      edges.set(edgeId, {
        id: edgeId,
        type: "REFERENCES",
        source: sourceNodeId,
        target: targetNodeId,
        label: "references",
      });
    }

    const graphNodes = Array.from(nodes.values()).sort((left, right) => {
      if (left.type !== right.type) return left.type === "folder" ? -1 : 1;
      return left.path.localeCompare(right.path);
    });
    const graphEdges = Array.from(edges.values()).sort((left, right) => left.id.localeCompare(right.id));

    const snapshot = {
      generatedAt: new Date().toISOString(),
      stats: {
        documents: rows.length,
        folders: graphNodes.filter((node) => node.type === "folder").length,
        references: graphEdges.filter((edge) => edge.type === "REFERENCES").length,
      },
      nodes: graphNodes,
      edges: graphEdges,
    };

    this.graphSnapshotCache = snapshot;
    return snapshot;
  }

  private snapshotFromDb(): SyncIndexResult {
    const status = this.getStatus();
    return {
      fileCount: status.indexedDocuments,
      charCount: status.indexedCharCount,
      indexedAt: status.lastIndexedAt ?? new Date(0).toISOString(),
      embeddingModel: status.embeddingModel ?? HEURISTIC_MODEL,
      embeddingMode: status.embeddingMode,
    };
  }

  private getStoredEmbeddingModel(): string | null {
    const row = this.db.prepare(
      `SELECT model FROM knowledge_vectors WHERE owner_type = ? ORDER BY created_at DESC LIMIT 1`,
    ).get(SUMMARY_VECTOR_OWNER_TYPE) as { model: string } | undefined;
    return row?.model ?? null;
  }

  private readIndexedDocumentBody(documentId: string): string {
    const rows = this.db.prepare(
      `SELECT content
       FROM document_chunks
       WHERE document_id = ?
       ORDER BY chunk_index`,
    ).all(documentId) as Array<{ content: string }>;
    return rows.map((row) => row.content).join("\n\n");
  }

  private selectRetrievalCandidates(query: string, limit: number): Array<{
    id: string;
    relative_path: string;
    title: string;
    summary: string;
    ontology_domain: string;
    status: string | null;
    owner_agent: string | null;
    content_hash: string;
    content_length: number;
    updated_at: string;
    indexed_at: string;
    vector_json: string;
  }> {
    const keywords = extractRetrievalKeywords(query).slice(0, 6);
    if (keywords.length === 0) return [];

    const clauses: string[] = [];
    const params: Array<string | number> = [SUMMARY_VECTOR_OWNER_TYPE];
    let scoreExpr = "0";

    for (const keyword of keywords) {
      const like = `%${keyword}%`;
      clauses.push(
        `(LOWER(d.title) LIKE ? OR LOWER(d.summary) LIKE ? OR LOWER(d.ontology_domain) LIKE ? OR LOWER(d.relative_path) LIKE ? OR LOWER(COALESCE(d.status, '')) LIKE ? OR LOWER(COALESCE(d.owner_agent, '')) LIKE ?)`,
      );
      for (let i = 0; i < 6; i++) params.push(like);

      scoreExpr += ` + CASE WHEN LOWER(d.title) LIKE ? THEN 6 ELSE 0 END`;
      params.push(like);
      scoreExpr += ` + CASE WHEN LOWER(d.ontology_domain) LIKE ? THEN 4 ELSE 0 END`;
      params.push(like);
      scoreExpr += ` + CASE WHEN LOWER(COALESCE(d.status, '')) LIKE ? THEN 3 ELSE 0 END`;
      params.push(like);
      scoreExpr += ` + CASE WHEN LOWER(d.summary) LIKE ? THEN 2 ELSE 0 END`;
      params.push(like);
      scoreExpr += ` + CASE WHEN LOWER(d.relative_path) LIKE ? THEN 2 ELSE 0 END`;
      params.push(like);
      scoreExpr += ` + CASE WHEN LOWER(COALESCE(d.owner_agent, '')) LIKE ? THEN 1 ELSE 0 END`;
      params.push(like);
    }

    params.push(limit);

    return this.db.prepare(
      `SELECT
         d.id,
         d.relative_path,
         d.title,
         d.summary,
         d.ontology_domain,
         d.status,
         d.owner_agent,
         d.content_hash,
         d.content_length,
         d.updated_at,
         d.indexed_at,
         kv.vector_json
       FROM documents d
       JOIN knowledge_vectors kv
         ON kv.owner_type = ?
        AND kv.owner_id = d.id
       WHERE ${clauses.join(" OR ")}
       ORDER BY (${scoreExpr}) DESC, d.relative_path
       LIMIT ?`,
    ).all(...params) as Array<{
      id: string;
      relative_path: string;
      title: string;
      summary: string;
      ontology_domain: string;
      status: string | null;
      owner_agent: string | null;
      content_hash: string;
      content_length: number;
      updated_at: string;
      indexed_at: string;
      vector_json: string;
    }>;
  }

  private async collectRebuildChanges(): Promise<{
    scanned: ScannedMarkdownFile[];
    changes: RebuildTrackedChange[];
  }> {
    const scanned = await scanKnowledgeBaseMarkdown(this.options.repoRoot);
    const currentRows = this.db.prepare(
      `SELECT relative_path, content_hash, content_length, updated_at FROM documents ORDER BY relative_path`,
    ).all() as Array<{
      relative_path: string;
      content_hash: string;
      content_length: number;
      updated_at: string;
    }>;

    const currentMap = new Map(currentRows.map((row) => [row.relative_path, row]));
    const scannedMap = new Map(
      scanned.map((file) => [
        file.relativePath,
        { hash: hashText(file.content), updatedAt: file.updatedAt, contentLength: file.content.length },
      ]),
    );

    const changes: RebuildTrackedChange[] = [];

    for (const file of scanned) {
      const current = currentMap.get(file.relativePath);
      const nextHash = hashText(file.content);
      const nextLength = file.content.length;
      if (!current) {
        changes.push({
          path: file.relativePath,
          changeType: "added",
          previousHash: null,
          nextHash,
          previousUpdatedAt: null,
          nextUpdatedAt: file.updatedAt,
          charDelta: nextLength,
        });
        continue;
      }
      if (current.content_hash !== nextHash) {
        changes.push({
          path: file.relativePath,
          changeType: "updated",
          previousHash: current.content_hash,
          nextHash,
          previousUpdatedAt: current.updated_at,
          nextUpdatedAt: file.updatedAt,
          charDelta: Math.max(1, Math.abs(nextLength - current.content_length)),
        });
      }
    }

    for (const row of currentRows) {
      if (scannedMap.has(row.relative_path)) continue;
      changes.push({
        path: row.relative_path,
        changeType: "deleted",
        previousHash: row.content_hash,
        nextHash: null,
        previousUpdatedAt: row.updated_at,
        nextUpdatedAt: null,
        charDelta: Math.max(row.content_length, 0),
      });
    }

    return { scanned, changes };
  }

  private recordRebuildChanges(changes: RebuildTrackedChange[], detectedAt: string): void {
    const activeKeys = new Set(changes.map((change) => buildRebuildChangeKey(change)));
    const unresolved = this.db.prepare(
      `SELECT id, relative_path, change_type, previous_hash, next_hash
       FROM rebuild_change_log
       WHERE resolved_at IS NULL`,
    ).all() as Array<{
      id: string;
      relative_path: string;
      change_type: string;
      previous_hash: string | null;
      next_hash: string | null;
    }>;

    this.db.exec("BEGIN");
    try {
      for (const change of changes) {
        this.db.prepare(
          `INSERT INTO rebuild_change_log (
             id, relative_path, change_type, previous_hash, next_hash, previous_updated_at, next_updated_at,
             char_delta, first_detected_at, last_detected_at, resolved_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
           ON CONFLICT(relative_path, change_type, previous_hash, next_hash) DO UPDATE SET
             previous_updated_at = excluded.previous_updated_at,
             next_updated_at = excluded.next_updated_at,
             char_delta = excluded.char_delta,
             last_detected_at = excluded.last_detected_at,
             resolved_at = NULL`,
        ).run(
          buildRebuildChangeId(change),
          change.path,
          change.changeType,
          change.previousHash ?? "",
          change.nextHash ?? "",
          change.previousUpdatedAt ?? "",
          change.nextUpdatedAt ?? "",
          change.charDelta,
          detectedAt,
          detectedAt,
        );
      }

      for (const row of unresolved) {
        const rowKey = buildRebuildChangeKey({
          path: row.relative_path,
          changeType: row.change_type as RebuildChangeType,
          previousHash: row.previous_hash,
          nextHash: row.next_hash,
          previousUpdatedAt: null,
          nextUpdatedAt: null,
          charDelta: 0,
        });
        if (activeKeys.has(rowKey)) continue;
        this.db.prepare(`UPDATE rebuild_change_log SET resolved_at = ? WHERE id = ?`).run(detectedAt, row.id);
      }

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  private listRecentRebuildChanges(limit = 12): RebuildChangeLogEntry[] {
    const rows = this.db.prepare(
      `SELECT
         id,
         relative_path,
         change_type,
         previous_hash,
         next_hash,
         previous_updated_at,
         next_updated_at,
         char_delta,
         first_detected_at,
         last_detected_at,
         resolved_at
       FROM rebuild_change_log
       ORDER BY resolved_at IS NULL DESC, last_detected_at DESC
       LIMIT ?`,
    ).all(limit) as Array<{
      id: string;
      relative_path: string;
      change_type: RebuildChangeType;
      previous_hash: string | null;
      next_hash: string | null;
      previous_updated_at: string | null;
      next_updated_at: string | null;
      char_delta: number;
      first_detected_at: string;
      last_detected_at: string;
      resolved_at: string | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      path: row.relative_path,
      changeType: row.change_type,
      previousHash: row.previous_hash || null,
      nextHash: row.next_hash || null,
      previousUpdatedAt: row.previous_updated_at || null,
      nextUpdatedAt: row.next_updated_at || null,
      charDelta: row.char_delta,
      firstDetectedAt: row.first_detected_at,
      lastDetectedAt: row.last_detected_at,
      resolvedAt: row.resolved_at,
    }));
  }

  private migrateDocumentsOntologyColumn(): void {
    const legacyDomainColumn = "tax" + "onomy_domain";
    const columns = this.db.prepare(`PRAGMA table_info(documents)`).all() as Array<{ name: string }>;
    const columnNames = new Set(columns.map((column) => column.name));
    if (columnNames.has(legacyDomainColumn) && !columnNames.has("ontology_domain")) {
      this.db.exec(`ALTER TABLE documents RENAME COLUMN ${legacyDomainColumn} TO ontology_domain;`);
    }
  }

  private migrateDocumentsContentLengthColumn(): void {
    const columns = this.db.prepare(`PRAGMA table_info(documents)`).all() as Array<{ name: string }>;
    const columnNames = new Set(columns.map((column) => column.name));
    if (!columnNames.has("content_length")) {
      this.db.exec(`ALTER TABLE documents ADD COLUMN content_length INTEGER NOT NULL DEFAULT 0;`);
    }

    const rowsNeedingBackfill = this.db.prepare(
      `SELECT relative_path FROM documents WHERE content_length IS NULL OR content_length = 0`,
    ).all() as Array<{ relative_path: string }>;

    for (const row of rowsNeedingBackfill) {
      const fullPath = path.join(this.options.repoRoot, row.relative_path);
      try {
        const size = fs.readFileSync(fullPath, "utf8").length;
        this.db.prepare(`UPDATE documents SET content_length = ? WHERE relative_path = ?`).run(size, row.relative_path);
      } catch {
        // Leave zero for deleted or inaccessible files until the next sync.
      }
    }
  }
}

export async function scanKnowledgeBaseMarkdown(repoRoot: string): Promise<ScannedMarkdownFile[]> {
  const results: ScannedMarkdownFile[] = [];

  async function walk(currentDir: string) {
    let entries;
    try {
      entries = await fsp.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (entry.name === "node_modules") continue;

      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(repoRoot, fullPath).replaceAll(path.sep, "/");

      if (isNonKnowledgeBasePath(relativePath)) {
        continue;
      }

      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const content = await fsp.readFile(fullPath, "utf8");
      const stat = await fsp.stat(fullPath);
      results.push({
        relativePath,
        fullPath,
        content,
        updatedAt: stat.mtime.toISOString(),
      });
    }
  }

  await walk(path.join(repoRoot, COMPANY_MEMORY_ROOT));
  results.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  return results;
}

function isNonKnowledgeBasePath(relativePath: string): boolean {
  return (
    (relativePath !== COMPANY_MEMORY_ROOT && !relativePath.startsWith(`${COMPANY_MEMORY_ROOT}/`)) ||
    relativePath === "001_Data_Souces" ||
    relativePath.startsWith("001_Data_Souces/") ||
    relativePath === "001_Source_Intake" ||
    relativePath.startsWith("001_Source_Intake/") ||
    relativePath === "000_Acme_Sample_Company_Memory" ||
    relativePath.startsWith("000_Acme_Sample_Company_Memory/")
  );
}

function summarizeMarkdown(relativePath: string, content: string, updatedAt: string, indexedAt: string) {
  const title = extractTitle(relativePath, content);
  const status = extractMetadataField(content, "Status");
  const ownerAgent = extractOwnerAgent(content);
  const ontologyDomain = inferOntologyDomain(relativePath);
  const summary = buildSummary(title, content);
  return {
    id: buildDocumentId(relativePath),
    relativePath,
    title,
    summary,
    ontologyDomain,
    status,
    ownerAgent,
    contentHash: hashText(content),
    contentLength: content.length,
    updatedAt,
    indexedAt,
  };
}

function extractTitle(relativePath: string, content: string): string {
  const heading = content.match(/^#\s+(.+?)\s*$/m)?.[1]?.trim();
  if (heading) return heading;
  return path.basename(relativePath, ".md").replaceAll("_", " ");
}

function extractMetadataField(content: string, field: string): string | null {
  const pattern = new RegExp(`^\\s*(?:[-*]\\s*)?\\*\\*${escapeRegex(field)}:\\*\\*\\s*(.+?)\\s*$`, "im");
  const match = content.match(pattern)?.[1]?.trim();
  return match ? stripMarkdown(match) : null;
}

function extractOwnerAgent(content: string): string | null {
  return extractMetadataField(content, "Owner Agent") ?? extractMetadataField(content, "Owner");
}

function inferOntologyDomain(relativePath: string): string {
  const segments = relativePath.split("/");
  if (segments[0] === "000_Company_Memory" && segments[1]) {
    return segments[1];
  }
  return segments[0] || "root";
}

function buildFolderNodeId(folderPath: string): string {
  return `folder:${folderPath || "."}`;
}

function buildDocumentNodeId(relativePath: string): string {
  return `document:${relativePath}`;
}

function getFolderAncestors(folderPath: string): string[] {
  const normalized = folderPath === "." ? "." : folderPath;
  const ancestors = new Set<string>(["."]);
  if (normalized === ".") return Array.from(ancestors);

  const segments = normalized.split("/").filter(Boolean);
  for (let index = 1; index <= segments.length; index++) {
    ancestors.add(segments.slice(0, index).join("/"));
  }
  return Array.from(ancestors);
}

function extractMarkdownLinks(content: string): Array<{ text: string; target: string }> {
  const links: Array<{ text: string; target: string }> = [];
  const pattern = /(?<!!)\[([^\]]+)\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content))) {
    const text = match[1]?.trim();
    const target = match[2]?.trim();
    if (target) links.push({ text: text || target, target });
  }
  return links;
}

function extractDocumentReferences(
  sourceRelativePath: string,
  content: string,
  documentIdByPath: Map<string, string>,
  createdAt: string,
  sourceDocumentId: string,
): Array<{
  id: string;
  sourceDocumentId: string;
  sourceRelativePath: string;
  targetRelativePath: string;
  targetDocumentId: string | null;
  linkText: string;
  createdAt: string;
}> {
  const references = new Map<string, {
    id: string;
    sourceDocumentId: string;
    sourceRelativePath: string;
    targetRelativePath: string;
    targetDocumentId: string | null;
    linkText: string;
    createdAt: string;
  }>();

  for (const link of extractMarkdownLinks(content)) {
    const targetPath = resolveMarkdownLink(sourceRelativePath, link.target, documentIdByPath);
    if (!targetPath || targetPath === sourceRelativePath) continue;
    references.set(targetPath, {
      id: buildDocumentReferenceId(sourceDocumentId, targetPath),
      sourceDocumentId,
      sourceRelativePath,
      targetRelativePath: targetPath,
      targetDocumentId: documentIdByPath.get(targetPath) ?? null,
      linkText: stripMarkdown(link.text),
      createdAt,
    });
  }

  return Array.from(references.values());
}

function buildDocumentChunks(
  documentId: string,
  relativePath: string,
  content: string,
  _createdAt: string,
): IndexedDocumentChunk[] {
  const sections = content
    .split(/\n\s*\n/)
    .map((section) => section.trim())
    .filter(Boolean);

  const chunks: IndexedDocumentChunk[] = [];
  let current = "";
  let chunkIndex = 0;

  const flush = () => {
    const trimmed = current.trim();
    if (!trimmed) return;
    chunks.push({
      id: buildDocumentChunkId(documentId, chunkIndex),
      documentId,
      chunkIndex,
      content: trimmed,
      contentLength: trimmed.length,
    });
    chunkIndex += 1;
    current = "";
  };

  for (const section of sections) {
    if (!current) {
      current = section;
      continue;
    }
    if (current.length + 2 + section.length > MAX_CHUNK_CHARS) {
      flush();
      current = section;
      continue;
    }
    current += `\n\n${section}`;
  }
  flush();

  if (chunks.length === 0) {
    const fallback = content.trim();
    if (fallback) {
      chunks.push({
        id: buildDocumentChunkId(documentId, 0),
        documentId,
        chunkIndex: 0,
        content: fallback.slice(0, MAX_CHUNK_CHARS),
        contentLength: Math.min(fallback.length, MAX_CHUNK_CHARS),
      });
    }
  }

  return chunks;
}

function extractRetrievalKeywords(query: string): string[] {
  const stopwords = new Set([
    "the", "and", "for", "that", "with", "from", "this", "what", "when", "where", "which", "does", "about",
    "into", "our", "your", "their", "have", "how", "are", "who", "why", "can", "use", "using",
  ]);
  const tokens = query
    .toLowerCase()
    .match(/[a-z0-9@._/-]+/g) ?? [];

  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const token of tokens) {
    if (token.length < 3) continue;
    if (stopwords.has(token)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    keywords.push(token);
  }
  return keywords;
}

function resolveMarkdownLink(
  sourceRelativePath: string,
  rawLink: string,
  documentPathToNodeId: Map<string, string>,
): string | null {
  const withoutFragment = rawLink.split("#")[0]?.trim();
  if (!withoutFragment) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(withoutFragment)) return null;

  const sourceDir = path.posix.dirname(sourceRelativePath);
  const decoded = decodeMarkdownPath(withoutFragment);
  const normalized = path.posix.normalize(path.posix.join(sourceDir === "." ? "" : sourceDir, decoded));

  if (documentPathToNodeId.has(normalized)) return normalized;
  if (!normalized.endsWith(".md") && documentPathToNodeId.has(`${normalized}.md`)) return `${normalized}.md`;
  if (documentPathToNodeId.has(path.posix.join(normalized, "README.md"))) {
    return path.posix.join(normalized, "README.md");
  }
  return null;
}

function decodeMarkdownPath(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function buildSummary(title: string, content: string): string {
  const paragraphs = content
    .replace(/```[\s\S]*?```/g, " ")
    .split(/\n\s*\n/)
    .map((chunk) => chunk.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((chunk) => !chunk.startsWith("#"))
    .filter((chunk) => !/^\*{2}(version|last updated|author\/editor|status|owner agent):/i.test(chunk))
    .filter((chunk) => !/^[-*]\s+\*{2}(version|last updated|author\/editor|status|owner agent):/i.test(chunk));

  const opening = paragraphs.find((paragraph) => paragraph.length >= 40) ?? paragraphs[0] ?? "";
  const cleanOpening = stripMarkdown(opening);
  const combined = cleanOpening
    ? `${title}. ${cleanOpening}`
    : `${title}. Knowledge base document for company operations.`;
  return combined.slice(0, MAX_SUMMARY_LENGTH).trim();
}

function getPreferredEmbeddingModel(env: NodeJS.ProcessEnv): string {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) return HEURISTIC_MODEL;
  return env.PULSEOS_CLI_EMBEDDING_MODEL?.trim() || OPENAI_EMBEDDING_MODEL;
}

function createEmbeddingProvider(env: NodeJS.ProcessEnv, forcedModel?: string | null): EmbeddingProvider {
  const apiKey = env.OPENAI_API_KEY?.trim();
  const preferredModel = forcedModel?.trim() || getPreferredEmbeddingModel(env);
  if (!apiKey || preferredModel === HEURISTIC_MODEL) {
    return {
      mode: "heuristic",
      model: HEURISTIC_MODEL,
      embed: async (text: string) => buildHeuristicVector(text),
    };
  }

  const timeout = Number(env.PULSEOS_CLI_EMBEDDING_TIMEOUT_MS ?? 1500);
  const client = new OpenAI({ apiKey, timeout: Number.isFinite(timeout) && timeout > 0 ? timeout : 1500 });
  const provider: EmbeddingProvider = {
    mode: "provider",
    model: preferredModel,
    embed: async (text: string) => {
      if (provider.mode === "heuristic") {
        return buildHeuristicVector(text);
      }
      try {
        const response = await client.embeddings.create({
          model: provider.model,
          input: text,
        });
        return response.data[0]?.embedding ?? buildHeuristicVector(text);
      } catch {
        provider.mode = "heuristic";
        provider.model = HEURISTIC_MODEL;
        return buildHeuristicVector(text);
      }
    },
  };
  return provider;
}

function buildHeuristicVector(text: string): number[] {
  const vector = new Array<number>(VECTOR_DIMENSION).fill(0);
  const tokens = text.toLowerCase().match(/[a-z0-9@._-]+/g) ?? [];
  for (const token of tokens) {
    let hash = 2166136261;
    for (let index = 0; index < token.length; index++) {
      hash ^= token.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    vector[Math.abs(hash) % VECTOR_DIMENSION] += 1;
  }
  return normalizeVector(vector);
}

function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!magnitude) return vector;
  return vector.map((value) => value / magnitude);
}

function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const length = Math.min(left.length, right.length);
  let sum = 0;
  for (let index = 0; index < length; index++) {
    sum += (left[index] ?? 0) * (right[index] ?? 0);
  }
  return sum;
}

function parseVector(value: string): number[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map((item) => Number(item) || 0) : [];
  } catch {
    return [];
  }
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function buildDocumentId(relativePath: string): string {
  return `doc_${createHash("sha1").update(relativePath).digest("hex")}`;
}

function buildVectorId(documentId: string): string {
  return `vec_${createHash("sha1").update(documentId).digest("hex")}`;
}

function buildDocumentReferenceId(sourceDocumentId: string, targetRelativePath: string): string {
  return `ref_${createHash("sha1").update(`${sourceDocumentId}::${targetRelativePath}`).digest("hex")}`;
}

function buildDocumentChunkId(documentId: string, chunkIndex: number): string {
  return `chk_${createHash("sha1").update(`${documentId}::${chunkIndex}`).digest("hex")}`;
}

function buildRebuildChangeId(change: RebuildTrackedChange): string {
  return `chg_${createHash("sha1").update(buildRebuildChangeKey(change)).digest("hex")}`;
}

function buildRebuildChangeKey(change: RebuildTrackedChange): string {
  return [
    change.path,
    change.changeType,
    change.previousHash ?? "",
    change.nextHash ?? "",
  ].join("::");
}

function buildWeeklySchedule(lastIndexedAt: string | null, checkedAt: string): RebuildAdvisorStatus["weeklySchedule"] {
  const intervalDays = 7;
  if (!lastIndexedAt) {
    return {
      intervalDays,
      nextRecommendedAt: null,
      overdue: true,
      overdueDays: 0,
    };
  }

  const base = new Date(lastIndexedAt).getTime();
  const nextRecommendedAt = new Date(base + intervalDays * 24 * 60 * 60 * 1000).toISOString();
  const overdueMs = new Date(checkedAt).getTime() - new Date(nextRecommendedAt).getTime();
  const overdueDays = overdueMs > 0 ? Math.floor(overdueMs / (24 * 60 * 60 * 1000)) : 0;
  return {
    intervalDays,
    nextRecommendedAt,
    overdue: overdueMs > 0,
    overdueDays,
  };
}

function classifyRebuildCost(options: {
  likelyUsesProviderEmbeddings: boolean;
  indexedDocuments: number;
  changedDocuments: number;
  changedCharacters: number;
  overdue: boolean;
}): RebuildCostLevel {
  if (!options.likelyUsesProviderEmbeddings) {
    return options.changedDocuments === 0 && !options.overdue ? "none" : "low";
  }
  if (options.indexedDocuments === 0) return "medium";
  if (options.changedDocuments >= 25 || options.changedCharacters >= 120_000) return "high";
  if (options.changedDocuments >= 8 || options.overdue) return "medium";
  if (options.changedDocuments > 0) return "low";
  return "none";
}

function buildCostSummary(
  level: RebuildCostLevel,
  likelyUsesProviderEmbeddings: boolean,
  estimatedEmbeddingCalls: number,
  changedDocuments: number,
  scannedDocuments: number,
): string {
  if (level === "none") {
    return "No rebuild cost is recommended right now.";
  }

  const providerText = likelyUsesProviderEmbeddings ? "provider embeddings may be called" : "heuristic embeddings avoid direct API cost";
  return `A rebuild currently reindexes the full knowledge base (${scannedDocuments} docs). ${changedDocuments} changed doc${changedDocuments === 1 ? "" : "s"} detected; ${providerText}; estimated embedding work: ${estimatedEmbeddingCalls} document summary call${estimatedEmbeddingCalls === 1 ? "" : "s"}.`;
}

function buildCostWarning(
  level: RebuildCostLevel,
  likelyUsesProviderEmbeddings: boolean,
  changedDocuments: number,
  scannedDocuments: number,
): string | null {
  if (level === "none") return null;
  if (!likelyUsesProviderEmbeddings) {
    return "This rebuild is mostly local compute. It may still take time because the CLI rescans the full knowledge base.";
  }
  if (level === "high") {
    return `This rebuild will rescan all ${scannedDocuments} indexed documents and may incur noticeable embedding cost. Consider waiting unless the ${changedDocuments} pending changes are important for current retrieval answers.`;
  }
  if (level === "medium") {
    return "This rebuild should be deliberate: the current implementation rescans the full knowledge base and may use paid embeddings.";
  }
  return "This rebuild is probably inexpensive, but it can still trigger provider embedding calls.";
}

function buildRebuildSuggestion(options: {
  indexedDocuments: number;
  pendingChanges: number;
  overdue: boolean;
}): string {
  if (options.indexedDocuments === 0) {
    return "Run the first rebuild to create the graph, document summaries, and retrieval vectors before relying on chat or graph answers.";
  }
  if (options.pendingChanges >= 8) {
    return "Rebuild now. The graph and retrieval layer are materially behind the documentation changes.";
  }
  if (options.pendingChanges > 0) {
    return "Rebuild when you need the latest docs reflected in chat, graph navigation, or retrieval. Small edits can wait if you are not using those files yet.";
  }
  if (options.overdue) {
    return "No drift was detected, but a weekly refresh is due. Rebuild only if you want a fresh validation pass or have reason to distrust the current index.";
  }
  return "No rebuild is necessary right now. The graph and retrieval index look current.";
}

function stripMarkdown(value: string): string {
  return value
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/[`*_>#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
