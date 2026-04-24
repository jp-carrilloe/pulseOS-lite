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

export interface IndexedDocumentRecord {
  id: string;
  relativePath: string;
  title: string;
  summary: string;
  ontologyDomain: string;
  status: string | null;
  ownerAgent: string | null;
  contentHash: string;
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

interface ScannedMarkdownFile {
  relativePath: string;
  fullPath: string;
  content: string;
  updatedAt: string;
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

      CREATE INDEX IF NOT EXISTS idx_documents_relative_path ON documents(relative_path);
      CREATE INDEX IF NOT EXISTS idx_vectors_owner ON knowledge_vectors(owner_type, owner_id);
      CREATE INDEX IF NOT EXISTS idx_index_runs_started_at ON index_runs(started_at);
      CREATE INDEX IF NOT EXISTS idx_crm_objects_provider_type ON crm_objects(provider, object_type);
      CREATE INDEX IF NOT EXISTS idx_crm_objects_email ON crm_objects(email);
      CREATE INDEX IF NOT EXISTS idx_crm_objects_company_name ON crm_objects(company_name);
      CREATE INDEX IF NOT EXISTS idx_crm_objects_pipeline_stage ON crm_objects(pipeline_stage);
      CREATE INDEX IF NOT EXISTS idx_crm_sync_runs_started_at ON crm_sync_runs(started_at);
    `);
    this.migrateDocumentsOntologyColumn();
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

      const seenPaths = new Set(files.map((file) => file.relativePath));
      this.db.exec("BEGIN");
      try {
        for (const file of files) {
          charCount += file.content.length;
          const parsed = summarizeMarkdown(file.relativePath, file.content, file.updatedAt, indexedAt);
          const vector = await provider.embed(parsed.summary);

          this.db
            .prepare(
              `INSERT INTO documents (
                 id, relative_path, title, summary, ontology_domain, status, owner_agent, content_hash, updated_at, indexed_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(relative_path) DO UPDATE SET
                 id = excluded.id,
                 title = excluded.title,
                 summary = excluded.summary,
                 ontology_domain = excluded.ontology_domain,
                 status = excluded.status,
                 owner_agent = excluded.owner_agent,
                 content_hash = excluded.content_hash,
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
        }

        const staleRows = this.db
          .prepare(`SELECT id, relative_path FROM documents`)
          .all() as Array<{ id: string; relative_path: string }>;
        for (const row of staleRows) {
          if (seenPaths.has(row.relative_path)) continue;
          this.db.prepare(`DELETE FROM knowledge_vectors WHERE owner_type = ? AND owner_id = ?`).run(SUMMARY_VECTOR_OWNER_TYPE, row.id);
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

    return {
      dbPath: this.options.dbPath,
      root: this.options.repoRoot,
      indexedDocuments: docRow.count,
      lastIndexedAt: docRow.lastIndexedAt,
      embeddingModel: vectorRow?.model ?? null,
      embeddingMode: vectorRow?.model && vectorRow.model !== HEURISTIC_MODEL ? "provider" : "heuristic",
      indexedCharCount: docRow.summaryChars ?? 0,
    };
  }

  async retrieve(query: string, topK = MAX_RETRIEVAL_RESULTS): Promise<RetrievalResult[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const storedModel = this.getStoredEmbeddingModel();
    const provider = createEmbeddingProvider(this.options.env ?? process.env, storedModel);
    const queryVector = await provider.embed(trimmed);
    const rows = this.db.prepare(
      `SELECT
         d.id,
         d.relative_path,
         d.title,
         d.summary,
         d.ontology_domain,
         d.status,
         d.owner_agent,
         d.content_hash,
         d.updated_at,
         d.indexed_at,
         kv.vector_json
       FROM documents d
       JOIN knowledge_vectors kv
         ON kv.owner_type = ?
        AND kv.owner_id = d.id
       ORDER BY d.relative_path`,
    ).all(SUMMARY_VECTOR_OWNER_TYPE) as Array<{
      id: string;
      relative_path: string;
      title: string;
      summary: string;
      ontology_domain: string;
      status: string | null;
      owner_agent: string | null;
      content_hash: string;
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
        "# Company Ops Knowledge Base",
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
      "# Company Ops Knowledge Base",
      "",
      "Use the retrieved company-brain documents below as the primary source of truth. Be specific, cite paths when relevant, and say when the answer is not fully grounded in the indexed docs.",
      "",
      "## Retrieved Document Summaries",
      ...summaries,
      "",
      "## Retrieved Full Documents",
    ].join("\n");

    for (const match of matches.slice(0, MAX_FULL_DOCUMENTS)) {
      const fullPath = path.join(this.options.repoRoot, match.document.relativePath);
      let content = "";
      try {
        content = await fsp.readFile(fullPath, "utf8");
      } catch {
        continue;
      }
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

    for (const row of rows) {
      const sourceId = documentPathToNodeId.get(row.relative_path);
      if (!sourceId) continue;

      let content = "";
      try {
        content = await fsp.readFile(path.join(this.options.repoRoot, row.relative_path), "utf8");
      } catch {
        continue;
      }

      for (const link of extractMarkdownLinks(content)) {
        const targetPath = resolveMarkdownLink(row.relative_path, link, documentPathToNodeId);
        if (!targetPath || targetPath === row.relative_path) continue;
        const targetId = documentPathToNodeId.get(targetPath);
        if (!targetId) continue;
        const edgeId = `references:${sourceId}->${targetId}`;
        edges.set(edgeId, {
          id: edgeId,
          type: "REFERENCES",
          source: sourceId,
          target: targetId,
          label: "references",
        });
      }
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

  private migrateDocumentsOntologyColumn(): void {
    const legacyDomainColumn = "tax" + "onomy_domain";
    const columns = this.db.prepare(`PRAGMA table_info(documents)`).all() as Array<{ name: string }>;
    const columnNames = new Set(columns.map((column) => column.name));
    if (columnNames.has(legacyDomainColumn) && !columnNames.has("ontology_domain")) {
      this.db.exec(`ALTER TABLE documents RENAME COLUMN ${legacyDomainColumn} TO ontology_domain;`);
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

  await walk(repoRoot);
  results.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  return results;
}

function isNonKnowledgeBasePath(relativePath: string): boolean {
  return (
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

function extractMarkdownLinks(content: string): string[] {
  const links: string[] = [];
  const pattern = /(?<!!)\[[^\]]+\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content))) {
    const raw = match[1]?.trim();
    if (raw) links.push(raw);
  }
  return links;
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
