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
