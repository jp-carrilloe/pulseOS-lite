import { useEffect, useMemo, useState } from "react";
import { GraphCanvas } from "./components/graph/GraphCanvas";
import { LiteBadge, LiteButton, LiteCard, LiteCardBody, LiteCardHeader, LiteEmptyState, LiteSectionHeader } from "./components/ui";
import { api } from "./lib/api";
import { getGraphEntityColor } from "./lib/graph-colors";
import type { ApiKnowledgeGraphSnapshot, DocumentReadResponse, FileTreeNode, GraphEdge, GraphNode, GraphSnapshot } from "./types/graph";

type ViewMode = "ontology" | "documents";

function getFolderChildren(source: ApiKnowledgeGraphSnapshot, folderId: string, childType: "folder" | "document") {
  const nodesById = new Map(source.nodes.map((node) => [node.id, node]));
  return source.edges
    .filter((edge) => edge.type === "CONTAINS" && edge.source === folderId)
    .map((edge) => nodesById.get(edge.target))
    .filter((node): node is NonNullable<typeof node> => Boolean(node) && node.type === childType);
}

function getParentFoldersForDocument(source: ApiKnowledgeGraphSnapshot, documentId: string) {
  const nodesById = new Map(source.nodes.map((node) => [node.id, node]));
  return source.edges
    .filter((edge) => edge.type === "CONTAINS" && edge.target === documentId)
    .map((edge) => nodesById.get(edge.source))
    .filter((node): node is NonNullable<typeof node> => Boolean(node) && node.type === "folder");
}

function toGraphSnapshot(source: ApiKnowledgeGraphSnapshot | null, mode: ViewMode, focusedNodeId?: string | null): GraphSnapshot {
  if (!source) {
    return {
      nodes: [],
      edges: [],
      groups: { anchors: [], documents: [], entities: [], edges: [], taxonomyDomains: [] },
      meta: { asOf: new Date().toISOString(), filtered: false, readLayer: "canonical" },
    };
  }

  const nodesById = new Map(source.nodes.map((node) => [node.id, node]));
  let includedNodeIds: Set<string>;
  let includedEdgeIds: Set<string>;

  if (mode === "documents") {
    includedNodeIds = new Set(source.nodes.filter((node) => node.type === "document").map((node) => node.id));
    includedEdgeIds = new Set(source.edges.filter((edge) => {
      if (!includedNodeIds.has(edge.source) || !includedNodeIds.has(edge.target)) return false;
      return edge.type === "REFERENCES";
    }).map((edge) => edge.id));
  } else {
    includedNodeIds = new Set(source.nodes.filter((node) => node.type === "folder").map((node) => node.id));
    includedEdgeIds = new Set(
      source.edges
        .filter((edge) => {
          if (edge.type !== "CONTAINS") return false;
          return nodesById.get(edge.source)?.type === "folder" && nodesById.get(edge.target)?.type === "folder";
        })
        .map((edge) => edge.id),
    );

    const includeDocument = (documentId: string) => {
      const documentNode = nodesById.get(documentId);
      if (documentNode?.type !== "document") return;
      includedNodeIds.add(documentId);
      source.edges
        .filter((edge) => edge.type === "CONTAINS" && edge.target === documentId && nodesById.get(edge.source)?.type === "folder")
        .forEach((edge) => {
          includedNodeIds.add(edge.source);
          includedEdgeIds.add(edge.id);
        });
    };

    const includeReferenceNeighborhood = (documentIds: Iterable<string>) => {
      const seedIds = new Set(documentIds);
      source.edges
        .filter((edge) => edge.type === "REFERENCES" && (seedIds.has(edge.source) || seedIds.has(edge.target)))
        .forEach((edge) => {
          includeDocument(edge.source);
          includeDocument(edge.target);
          includedEdgeIds.add(edge.id);
        });
    };

    const focusedNode = focusedNodeId ? nodesById.get(focusedNodeId) : null;
    if (focusedNode?.type === "folder") {
      const localDocuments = getFolderChildren(source, focusedNode.id, "document");
      localDocuments.forEach((documentNode) => includeDocument(documentNode.id));
      includeReferenceNeighborhood(localDocuments.map((documentNode) => documentNode.id));
    } else if (focusedNode?.type === "document") {
      includeDocument(focusedNode.id);
      const parentFolders = getParentFoldersForDocument(source, focusedNode.id);
      parentFolders
        .flatMap((folderNode) => getFolderChildren(source, folderNode.id, "document"))
        .forEach((documentNode) => includeDocument(documentNode.id));
      includeReferenceNeighborhood([focusedNode.id]);
    }

    includedEdges = source.edges.filter((edge) => includedEdgeIds.has(edge.id));
  }

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

function findTreeNode(root: FileTreeNode | null, documentPath: string): FileTreeNode | null {
  if (!root) return null;
  if (root.path === documentPath) return root;
  for (const child of root.children ?? []) {
    const found = findTreeNode(child, documentPath);
    if (found) return found;
  }
  return null;
}

function collectFolderPaths(node: FileTreeNode | null): string[] {
  if (!node) return [];
  const childFolderPaths = (node.children ?? []).flatMap((child) => collectFolderPaths(child));
  return node.type === "folder" ? [node.path, ...childFolderPaths] : childFolderPaths;
}

export function App() {
  const SIDEBAR_MIN_WIDTH = 280;
  const SIDEBAR_MAX_WIDTH = 540;
  const [graphData, setGraphData] = useState<ApiKnowledgeGraphSnapshot | null>(null);
  const [tree, setTree] = useState<FileTreeNode | null>(null);
  const [mode, setMode] = useState<ViewMode>("ontology");
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedDocumentPath, setSelectedDocumentPath] = useState<string | null>(null);
  const [document, setDocument] = useState<DocumentReadResponse | null>(null);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [openFolderPaths, setOpenFolderPaths] = useState<Set<string>>(new Set(["000_Company_Memory"]));
  const [documentPanelOpen, setDocumentPanelOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [sidebarResizing, setSidebarResizing] = useState(false);

  async function loadWorkspace() {
    setLoading(true);
    setError(null);
    try {
      const treePromise = api
        .getFileTree()
        .then((nextTree) => {
          setTree(nextTree);
          setOpenFolderPaths((current) => new Set([...current, nextTree.path]));
        })
        .catch((nextError) => {
          setError((current) =>
            current ?? (nextError instanceof Error ? nextError.message : "Could not load the Company Memory folders."),
          );
        });

      const graphPromise = api
        .getGraph()
        .then((nextGraph) => {
          setGraphData(nextGraph);
        })
        .catch((nextError) => {
          setError((current) =>
            current ?? (nextError instanceof Error ? nextError.message : "Could not load the Company Memory graph."),
          );
        });

      await Promise.allSettled([treePromise, graphPromise]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadWorkspace();
  }, []);

  useEffect(() => {
    if (!selectedDocumentPath) {
      setDocument(null);
      setDraft("");
      return;
    }

    let active = true;
    setError(null);
    void api
      .readDocument(selectedDocumentPath)
      .then((nextDocument) => {
        if (!active) return;
        setDocument(nextDocument);
        setDraft(nextDocument.content);
      })
      .catch((nextError) => {
        if (!active) return;
        setError(nextError instanceof Error ? nextError.message : "Could not read the selected document.");
      });

    return () => {
      active = false;
    };
  }, [selectedDocumentPath]);

  useEffect(() => {
    if (!sidebarResizing) return;

    function handlePointerMove(event: PointerEvent) {
      const nextWidth = Math.min(Math.max(event.clientX - 16, SIDEBAR_MIN_WIDTH), SIDEBAR_MAX_WIDTH);
      setSidebarWidth(nextWidth);
    }

    function handlePointerUp() {
      setSidebarResizing(false);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [sidebarResizing]);

  const graphSnapshot = useMemo(() => toGraphSnapshot(graphData, mode, selectedNode?.id), [graphData, mode, selectedNode?.id]);
  const selectedTreeNode = useMemo(
    () => (selectedDocumentPath ? findTreeNode(tree, selectedDocumentPath) : null),
    [selectedDocumentPath, tree],
  );
  const dirty = Boolean(document && draft !== document.content);

  function selectDocument(documentPath: string) {
    setSelectedDocumentPath(documentPath);
    setDocumentPanelOpen(true);
    setNotice(null);
  }

  function expandAllFolders() {
    setOpenFolderPaths(new Set(collectFolderPaths(tree)));
  }

  function collapseAllFolders() {
    setOpenFolderPaths(new Set(tree ? [tree.path] : []));
  }

  function expandFolderBranch(folder: FileTreeNode) {
    setOpenFolderPaths((current) => new Set([...current, ...collectFolderPaths(folder)]));
  }

  function collapseFolderBranch(folder: FileTreeNode) {
    const branchPaths = new Set(collectFolderPaths(folder));
    setOpenFolderPaths((current) => {
      const next = new Set(current);
      for (const folderPath of branchPaths) {
        if (folderPath !== folder.path) next.delete(folderPath);
      }
      return next;
    });
  }

  function toggleFolder(folderPath: string) {
    setOpenFolderPaths((current) => {
      const next = new Set(current);
      if (next.has(folderPath)) {
        next.delete(folderPath);
      } else {
        next.add(folderPath);
      }
      return next;
    });
  }

  function handleNodeSelect(node: GraphNode | null) {
    setSelectedNode(node);
    const path = node?.properties?.path;
    if (node?.type === "document" && typeof path === "string") {
      selectDocument(path);
    }
  }

  async function saveDocument() {
    if (!selectedDocumentPath || !document || !dirty) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.writeDocument(selectedDocumentPath, draft);
      setDocument({ ...document, content: draft, updatedAt: result.indexedAt });
      setNotice("Saved. The SQLite index and graph were refreshed.");
      await loadWorkspace();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not save this document.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main
      className={sidebarResizing ? "company-memory-workspace sidebar-resizing" : "company-memory-workspace"}
      style={{ gridTemplateColumns: `${sidebarWidth}px 10px minmax(0, 1fr)` }}
    >
      <aside className="workspace-sidebar" style={{ width: `${sidebarWidth}px` }}>
        <div className="brand-block">
          <p className="eyebrow">PulseOS</p>
          <h1>Company Memory</h1>
          <p>Browse, map, read, and safely edit Markdown inside 000_Company_Memory.</p>
        </div>

        <LiteCard className="explorer-card">
          <LiteCardHeader>
            <LiteSectionHeader
              eyebrow="Explorer"
              title="000_Company_Memory"
              description="Only this folder is editable in the UI."
              actions={
                <div className="explorer-actions">
                  <LiteButton variant="ghost" onClick={expandAllFolders}>
                    Expand all
                  </LiteButton>
                  <LiteButton variant="ghost" onClick={collapseAllFolders}>
                    Collapse all
                  </LiteButton>
                </div>
              }
            />
          </LiteCardHeader>
          <LiteCardBody>
            {tree ? (
              <TreeView
                node={tree}
                selectedPath={selectedDocumentPath}
                openFolderPaths={openFolderPaths}
                onSelect={selectDocument}
                onToggleFolder={toggleFolder}
                onExpandBranch={expandFolderBranch}
                onCollapseBranch={collapseFolderBranch}
              />
            ) : (
              <p className="muted-copy">Loading folders...</p>
            )}
          </LiteCardBody>
        </LiteCard>
      </aside>

      <button
        type="button"
        className={sidebarResizing ? "sidebar-resize-handle active" : "sidebar-resize-handle"}
        aria-label="Resize explorer sidebar"
        onPointerDown={() => setSidebarResizing(true)}
      />

      <section className="workspace-main">
        <div className="workspace-toolbar">
          <div>
            <p className="eyebrow">SQLite graph</p>
            <h2>PulseOS Lite graph workspace</h2>
          </div>
          <div className="toolbar-actions">
            <LiteButton variant={mode === "ontology" ? "primary" : "secondary"} onClick={() => setMode("ontology")}>
              Company Ontology
            </LiteButton>
            <LiteButton variant={mode === "documents" ? "primary" : "secondary"} onClick={() => setMode("documents")}>
              Document Relationships
            </LiteButton>
            <LiteButton variant="ghost" onClick={() => void loadWorkspace()}>
              Refresh
            </LiteButton>
            <LiteButton variant="secondary" onClick={() => setDocumentPanelOpen((value) => !value)}>
              {documentPanelOpen ? "Hide reader" : "Show reader"}
            </LiteButton>
          </div>
        </div>

        {error ? <div className="notice notice-error">{error}</div> : null}
        {notice ? <div className="notice notice-success">{notice}</div> : null}

        <div className="graph-shell">
          {loading ? (
            <LiteEmptyState title="Loading graph" detail="The daemon is reading the SQLite index and Company Memory tree." />
          ) : (
            <GraphCanvas
              key={`${mode}:${reloadKey}`}
              snapshot={graphSnapshot}
              colorForType={getGraphEntityColor}
              onNodeSelect={handleNodeSelect}
              onNodeOpen={handleNodeSelect}
              relayoutTrigger={reloadKey}
              headerBadges={
                <>
                  <LiteBadge tone="neutral">{graphSnapshot.nodes.length} nodes</LiteBadge>
                  <LiteBadge tone="neutral">{graphSnapshot.edges.length} edges</LiteBadge>
                </>
              }
              toolbarControls={
                <LiteButton variant="ghost" onClick={() => setReloadKey((value) => value + 1)}>
                  Re-layout
                </LiteButton>
              }
            />
          )}
        </div>
      </section>

      {documentPanelOpen ? <button type="button" className="document-panel-backdrop" aria-label="Close document panel" onClick={() => setDocumentPanelOpen(false)} /> : null}

      <aside className={documentPanelOpen ? "document-panel open" : "document-panel"} aria-hidden={!documentPanelOpen}>
        <LiteCard className="document-card">
          <LiteCardHeader>
            <LiteSectionHeader
              eyebrow="Reader + editor"
              title={selectedTreeNode?.name ?? selectedNode?.label ?? "Select a document"}
              description={selectedDocumentPath ?? "Click a Markdown file in the explorer or a document node in the graph."}
              actions={
                <div className="document-panel-actions">
                  {dirty ? <LiteBadge tone="warning">Unsaved</LiteBadge> : null}
                  <LiteButton variant="ghost" onClick={() => setDocumentPanelOpen(false)}>
                    Close
                  </LiteButton>
                </div>
              }
            />
          </LiteCardHeader>
          <LiteCardBody>
            {document ? (
              <div className="editor-stack">
                <div className="editor-actions">
                  <LiteButton onClick={() => void saveDocument()} disabled={!dirty || saving}>
                    {saving ? "Saving..." : "Save"}
                  </LiteButton>
                  <LiteButton variant="secondary" onClick={() => setDraft(document.content)} disabled={!dirty || saving}>
                    Revert
                  </LiteButton>
                </div>
                <textarea value={draft} onChange={(event) => setDraft(event.target.value)} spellCheck={false} />
              </div>
            ) : (
              <LiteEmptyState
                title="No document selected"
                detail="The editor only reads and saves Markdown files inside 000_Company_Memory."
              />
            )}
          </LiteCardBody>
        </LiteCard>
      </aside>
    </main>
  );
}

function TreeView({
  node,
  selectedPath,
  openFolderPaths,
  onSelect,
  onToggleFolder,
  onExpandBranch,
  onCollapseBranch,
}: {
  node: FileTreeNode;
  selectedPath: string | null;
  openFolderPaths: Set<string>;
  onSelect: (path: string) => void;
  onToggleFolder: (path: string) => void;
  onExpandBranch: (node: FileTreeNode) => void;
  onCollapseBranch: (node: FileTreeNode) => void;
}) {
  const isDocument = node.type === "document";

  if (isDocument) {
    return (
      <button
        type="button"
        className={selectedPath === node.path ? "tree-row tree-row-document active" : "tree-row tree-row-document"}
        onClick={() => onSelect(node.path)}
      >
        <span>MD</span>
        <strong>{node.name}</strong>
      </button>
    );
  }

  const open = openFolderPaths.has(node.path);

  return (
    <div className="tree-folder">
      <div className="tree-row tree-row-folder">
        <button type="button" className="tree-toggle" onClick={() => onToggleFolder(node.path)} aria-label={`${open ? "Collapse" : "Expand"} ${node.name}`}>
          {open ? "v" : ">"}
        </button>
        <button type="button" className="tree-label" onClick={() => onToggleFolder(node.path)}>
          <strong>{node.name}</strong>
        </button>
        <div className="tree-branch-actions">
          <button type="button" onClick={() => onExpandBranch(node)} aria-label={`Expand all folders inside ${node.name}`}>
            All
          </button>
          <button type="button" onClick={() => onCollapseBranch(node)} aria-label={`Collapse all folders inside ${node.name}`}>
            None
          </button>
        </div>
      </div>
      {open ? (
        <div className="tree-children">
          {(node.children ?? []).map((child) => (
            <TreeView
              key={child.path}
              node={child}
              selectedPath={selectedPath}
              openFolderPaths={openFolderPaths}
              onSelect={onSelect}
              onToggleFolder={onToggleFolder}
              onExpandBranch={onExpandBranch}
              onCollapseBranch={onCollapseBranch}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
