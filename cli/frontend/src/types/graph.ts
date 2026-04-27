export type GraphReadLayer = "canonical";
export type GraphRowLayer = "canonical";

export interface GraphNode {
  id: string;
  label: string;
  type: "folder" | "document";
  nodeClass?: "anchor" | "document" | "entity";
  confidence: number;
  properties?: Record<string, unknown>;
  sourceDocumentId?: string | null;
  sourceDocumentIds?: string[];
  readLayer?: GraphReadLayer;
  graphLayer?: GraphRowLayer;
  createdAt?: string;
  supersededAt?: string | null;
  evidenceCount: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: "CONTAINS" | "REFERENCES";
  edgeClass?: "document_reference" | "entity";
  confidence: number;
  properties?: Record<string, unknown>;
  sourceDocumentId?: string | null;
  sourceDocumentIds?: string[];
  readLayer?: GraphReadLayer;
  graphLayer?: GraphRowLayer;
  createdAt?: string;
  supersededAt?: string | null;
}

export interface GraphSnapshot {
  nodes: GraphNode[];
  edges: GraphEdge[];
  groups: {
    anchors: GraphNode[];
    documents: GraphNode[];
    entities: GraphNode[];
    edges: GraphEdge[];
    taxonomyDomains: string[];
  };
  meta: {
    asOf: string;
    filtered: boolean;
    readLayer: GraphReadLayer;
  };
}

export interface ApiGraphNode {
  id: string;
  type: "folder" | "document";
  label: string;
  path: string;
  parentId: string | null;
  ontologyDomain?: string;
  status?: string | null;
  ownerAgent?: string | null;
  summary?: string;
  documentCount?: number;
}

export interface ApiGraphEdge {
  id: string;
  type: "CONTAINS" | "REFERENCES";
  source: string;
  target: string;
  label: string;
}

export interface ApiKnowledgeGraphSnapshot {
  generatedAt: string;
  stats: {
    documents: number;
    folders: number;
    references: number;
  };
  nodes: ApiGraphNode[];
  edges: ApiGraphEdge[];
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: "folder" | "document";
  children?: FileTreeNode[];
}

export interface DocumentReadResponse {
  path: string;
  content: string;
  updatedAt: string;
}

export interface RebuildTrackedChange {
  path: string;
  changeType: "added" | "updated" | "deleted";
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
    level: "none" | "low" | "medium" | "high";
    likelyUsesProviderEmbeddings: boolean;
    requiresFullReindex: boolean;
    estimatedEmbeddingCalls: number;
    summary: string;
    warning: string | null;
  };
  recentLog: RebuildChangeLogEntry[];
}

export interface UiCapabilities {
  daemonVersion: string;
  uiApiVersion: number;
  buildId: string;
  features: {
    terminalPanel: boolean;
    rebuildAdvisor: boolean;
    documentContext: boolean;
    graphSessionCookie: boolean;
  };
}
