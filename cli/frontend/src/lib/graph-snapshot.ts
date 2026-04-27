import type { ApiKnowledgeGraphSnapshot, GraphEdge, GraphNode, GraphSnapshot } from "../types/graph";

export type ViewMode = "ontology" | "documents";
type ApiGraphNode = ApiKnowledgeGraphSnapshot["nodes"][number];
type ApiGraphEdge = ApiKnowledgeGraphSnapshot["edges"][number];
type FocusedNodeInput = Iterable<string> | string | null | undefined;

const EMPTY_GRAPH_SNAPSHOT: GraphSnapshot = {
  nodes: [],
  edges: [],
  groups: { anchors: [], documents: [], entities: [], edges: [], taxonomyDomains: [] },
  meta: { asOf: new Date(0).toISOString(), filtered: false, readLayer: "canonical" },
};

function getFolderChildren(source: ApiKnowledgeGraphSnapshot, folderId: string, childType: "folder" | "document") {
  const nodesById = new Map<string, ApiGraphNode>(source.nodes.map((node) => [node.id, node]));
  return source.edges
    .filter((edge) => edge.type === "CONTAINS" && edge.source === folderId)
    .map((edge) => nodesById.get(edge.target))
    .filter((node): node is ApiGraphNode => node !== undefined && node.type === childType);
}

function getParentFoldersForDocument(source: ApiKnowledgeGraphSnapshot, documentId: string) {
  const nodesById = new Map<string, ApiGraphNode>(source.nodes.map((node) => [node.id, node]));
  return source.edges
    .filter((edge) => edge.type === "CONTAINS" && edge.target === documentId)
    .map((edge) => nodesById.get(edge.source))
    .filter((node): node is ApiGraphNode => node !== undefined && node.type === "folder");
}

function includeDocumentContext(
  source: ApiKnowledgeGraphSnapshot,
  nodesById: Map<string, ApiGraphNode>,
  includedNodeIds: Set<string>,
  includedEdgeIds: Set<string>,
  documentId: string,
) {
  const documentNode = nodesById.get(documentId);
  if (documentNode?.type !== "document") return;

  includedNodeIds.add(documentId);
  source.edges
    .filter((edge) => edge.type === "CONTAINS" && edge.target === documentId && nodesById.get(edge.source)?.type === "folder")
    .forEach((edge) => {
      includedNodeIds.add(edge.source);
      includedEdgeIds.add(edge.id);
    });
}

function includeReferenceNeighborhood(
  source: ApiKnowledgeGraphSnapshot,
  nodesById: Map<string, ApiGraphNode>,
  includedNodeIds: Set<string>,
  includedEdgeIds: Set<string>,
  documentIds: Iterable<string>,
) {
  const seedIds = new Set(documentIds);
  source.edges
    .filter((edge) => edge.type === "REFERENCES" && (seedIds.has(edge.source) || seedIds.has(edge.target)))
    .forEach((edge) => {
      includeDocumentContext(source, nodesById, includedNodeIds, includedEdgeIds, edge.source);
      includeDocumentContext(source, nodesById, includedNodeIds, includedEdgeIds, edge.target);
      includedEdgeIds.add(edge.id);
    });
}

function buildOntologySelection(
  source: ApiKnowledgeGraphSnapshot,
  nodesById: Map<string, ApiGraphNode>,
  focusedNodeId?: string | null,
) {
  const includedNodeIds = new Set(source.nodes.filter((node) => node.type === "folder").map((node) => node.id));
  const includedEdgeIds = new Set(
    source.edges
      .filter((edge) => edge.type === "CONTAINS" && nodesById.get(edge.source)?.type === "folder" && nodesById.get(edge.target)?.type === "folder")
      .map((edge) => edge.id),
  );

  const focusedNode = focusedNodeId ? nodesById.get(focusedNodeId) : null;
  if (!focusedNode) {
    return { includedNodeIds, includedEdgeIds };
  }

  if (focusedNode.type === "folder") {
    const localDocuments = getFolderChildren(source, focusedNode.id, "document");
    localDocuments.forEach((documentNode) =>
      includeDocumentContext(source, nodesById, includedNodeIds, includedEdgeIds, documentNode.id),
    );
    includeReferenceNeighborhood(
      source,
      nodesById,
      includedNodeIds,
      includedEdgeIds,
      localDocuments.map((documentNode) => documentNode.id),
    );
    return { includedNodeIds, includedEdgeIds };
  }

  if (focusedNode.type === "document") {
    includeDocumentContext(source, nodesById, includedNodeIds, includedEdgeIds, focusedNode.id);
    const parentFolders = getParentFoldersForDocument(source, focusedNode.id);
    parentFolders
      .flatMap((folderNode) => getFolderChildren(source, folderNode.id, "document"))
      .forEach((documentNode) =>
        includeDocumentContext(source, nodesById, includedNodeIds, includedEdgeIds, documentNode.id),
      );
    includeReferenceNeighborhood(source, nodesById, includedNodeIds, includedEdgeIds, [focusedNode.id]);
  }

  return { includedNodeIds, includedEdgeIds };
}

export function buildEmptyGraphSnapshot(): GraphSnapshot {
  return {
    ...EMPTY_GRAPH_SNAPSHOT,
    meta: { ...EMPTY_GRAPH_SNAPSHOT.meta, asOf: new Date().toISOString() },
  };
}

export function toGraphSnapshot(
  source: ApiKnowledgeGraphSnapshot | null,
  mode: ViewMode,
  focusedNodeIds: FocusedNodeInput = [],
): GraphSnapshot {
  if (!source) {
    return buildEmptyGraphSnapshot();
  }

  const normalizedFocusedNodeIds =
    typeof focusedNodeIds === "string"
      ? [focusedNodeIds]
      : focusedNodeIds
        ? Array.from(focusedNodeIds)
        : [];

  const nodesById = new Map<string, ApiGraphNode>(source.nodes.map((node) => [node.id, node]));
  const { includedNodeIds, includedEdgeIds } =
    mode === "documents"
      ? {
          includedNodeIds: new Set(source.nodes.filter((node) => node.type === "document").map((node) => node.id)),
          includedEdgeIds: new Set(
            source.edges
              .filter((edge) => edge.type === "REFERENCES" && nodesById.get(edge.source)?.type === "document" && nodesById.get(edge.target)?.type === "document")
              .map((edge) => edge.id),
          ),
        }
      : normalizedFocusedNodeIds.reduce(
          (accumulator, focusedNodeId) => {
            const nextSelection = buildOntologySelection(source, nodesById, focusedNodeId);
            nextSelection.includedNodeIds.forEach((id) => accumulator.includedNodeIds.add(id));
            nextSelection.includedEdgeIds.forEach((id) => accumulator.includedEdgeIds.add(id));
            return accumulator;
          },
          buildOntologySelection(source, nodesById, null),
        );

  const nodes: GraphNode[] = source.nodes
    .filter((node) => includedNodeIds.has(node.id))
    .map((node) => ({
      id: node.id,
      label: node.label,
      type: node.type,
      nodeClass: node.type === "document" ? "document" : "entity",
      confidence: 1,
      evidenceCount: node.documentCount ?? 1,
      graphLayer: "canonical",
      readLayer: "canonical",
      properties: {
        path: node.path,
        parentId: node.parentId,
        ontologyDomain: node.ontologyDomain,
        status: node.status,
        ownerAgent: node.ownerAgent,
        summary: node.summary,
        documentCount: node.documentCount,
      },
    }));

  const edges: GraphEdge[] = source.edges
    .filter((edge) => includedEdgeIds.has(edge.id))
    .map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: edge.type,
      edgeClass: edge.type === "REFERENCES" ? "document_reference" : "entity",
      confidence: 1,
      graphLayer: "canonical",
      readLayer: "canonical",
      properties: { label: edge.label },
    }));

  return {
    nodes,
    edges,
    groups: {
      anchors: nodes.filter((node) => node.type === "folder"),
      documents: nodes.filter((node) => node.type === "document"),
      entities: nodes.filter((node) => node.type === "folder"),
      edges,
      taxonomyDomains: [],
    },
    meta: { asOf: source.generatedAt, filtered: true, readLayer: "canonical" },
  };
}
