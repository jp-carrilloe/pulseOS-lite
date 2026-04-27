import { Component, type ErrorInfo, type MouseEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { GraphCanvas } from "./components/graph/GraphCanvas";
import { TerminalPanel } from "./components/terminal/TerminalPanel";
import { LiteBadge, LiteButton, LiteCard, LiteCardBody, LiteCardHeader, LiteEmptyState, LiteSectionHeader } from "./components/ui";
import { api } from "./lib/api";
import { getGraphEntityColor } from "./lib/graph-colors";
import { buildEmptyGraphSnapshot, toGraphSnapshot, type ViewMode } from "./lib/graph-snapshot";
import type { ApiKnowledgeGraphSnapshot, DocumentReadResponse, FileTreeNode, GraphNode, RebuildAdvisorStatus, UiCapabilities } from "./types/graph";

const REQUIRED_UI_API_VERSION = 1;

class GraphErrorBoundary extends Component<
  { children: ReactNode },
  { errorMessage: string | null }
> {
  state = { errorMessage: null };

  static getDerivedStateFromError(error: Error) {
    return { errorMessage: error.message || "Unknown graph render error." };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    console.error("Graph canvas crashed", error);
  }

  render() {
    if (this.state.errorMessage) {
      return (
        <LiteEmptyState
          title="Graph render failed"
          detail={`The graph canvas crashed while rendering: ${this.state.errorMessage}. Refresh the page or run npm run graph again.`}
        />
      );
    }

    return this.props.children;
  }
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

function formatTimestamp(value: string | null): string {
  if (!value) return "Not yet";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function parseFrontmatterTags(content: string): string[] {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) return [];
  const frontmatter = frontmatterMatch[1];

  const bracketTags = frontmatter.match(/(?:^|\n)tags:\s*\[([^\]]*)\]/i);
  if (bracketTags) {
    return bracketTags[1]
      .split(",")
      .map((tag) => tag.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }

  const blockTags = frontmatter.match(/(?:^|\n)tags:\s*\n((?:\s*-\s*.+\n?)*)/i);
  if (!blockTags) return [];
  return blockTags[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

export function App() {
  const SIDEBAR_MIN_WIDTH = 280;
  const SIDEBAR_MAX_WIDTH = 540;
  const [graphData, setGraphData] = useState<ApiKnowledgeGraphSnapshot | null>(null);
  const [tree, setTree] = useState<FileTreeNode | null>(null);
  const [mode, setMode] = useState<ViewMode>("ontology");
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [expandedOntologyNodeIds, setExpandedOntologyNodeIds] = useState<Set<string>>(new Set());
  const [selectedDocumentPath, setSelectedDocumentPath] = useState<string | null>(null);
  const [document, setDocument] = useState<DocumentReadResponse | null>(null);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [rebuildAdvisor, setRebuildAdvisor] = useState<RebuildAdvisorStatus | null>(null);
  const [uiCapabilities, setUiCapabilities] = useState<UiCapabilities | null>(null);
  const [compatibilityError, setCompatibilityError] = useState<string | null>(null);
  const [openFolderPaths, setOpenFolderPaths] = useState<Set<string>>(new Set(["000_Company_Memory"]));
  const [documentPanelOpen, setDocumentPanelOpen] = useState(false);
  const [documentPanelExpanded, setDocumentPanelExpanded] = useState(false);
  const [documentMetaOpen, setDocumentMetaOpen] = useState(false);
  const [terminalPanelOpen, setTerminalPanelOpen] = useState(false);
  const [terminalPanelExpanded, setTerminalPanelExpanded] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [sidebarResizing, setSidebarResizing] = useState(false);
  const [folderContextMenu, setFolderContextMenu] = useState<{
    x: number;
    y: number;
    folder: FileTreeNode;
  } | null>(null);

  async function loadWorkspace() {
    setLoading(true);
    setError(null);
    setCompatibilityError(null);
    try {
      let capabilities: UiCapabilities;
      try {
        capabilities = await api.getUiCapabilities();
      } catch (nextError) {
        setCompatibilityError(
          nextError instanceof Error
            ? nextError.message
            : "The local graph daemon could not confirm UI compatibility. Restart `npm run graph` and open the new link.",
        );
        setGraphData(null);
        setTree(null);
        setRebuildAdvisor(null);
        setUiCapabilities(null);
        return;
      }

      if (capabilities.uiApiVersion !== REQUIRED_UI_API_VERSION) {
        setCompatibilityError(
          `This graph page expects UI API v${REQUIRED_UI_API_VERSION}, but the running daemon reports v${capabilities.uiApiVersion}. Restart \`npm run graph\` and open the newly printed link.`,
        );
        setGraphData(null);
        setTree(null);
        setRebuildAdvisor(null);
        setUiCapabilities(capabilities);
        return;
      }

      setUiCapabilities(capabilities);

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

      const advisorPromise = capabilities.features.rebuildAdvisor
        ? api
            .getRebuildAdvisor()
            .then((nextAdvisor) => {
              setRebuildAdvisor(nextAdvisor);
            })
            .catch((nextError) => {
              setError((current) =>
                current ?? (nextError instanceof Error ? nextError.message : "Could not load the rebuild advisor."),
              );
            })
        : Promise.resolve(setRebuildAdvisor(null));

      await Promise.allSettled([treePromise, graphPromise, advisorPromise]);
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
    if (uiCapabilities?.features.terminalPanel) return;
    setTerminalPanelOpen(false);
    setTerminalPanelExpanded(false);
  }, [uiCapabilities?.features.terminalPanel]);

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

  useEffect(() => {
    if (!folderContextMenu) return;

    function handleClose() {
      setFolderContextMenu(null);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setFolderContextMenu(null);
      }
    }

    window.addEventListener("pointerdown", handleClose);
    window.addEventListener("contextmenu", handleClose);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("pointerdown", handleClose);
      window.removeEventListener("contextmenu", handleClose);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [folderContextMenu]);

  const { graphSnapshot, graphSnapshotError } = useMemo(() => {
    try {
      return {
        graphSnapshot: toGraphSnapshot(graphData, mode, mode === "ontology" ? expandedOntologyNodeIds : []),
        graphSnapshotError: null as string | null,
      };
    } catch (nextError) {
      return {
        graphSnapshot: buildEmptyGraphSnapshot(),
        graphSnapshotError:
          nextError instanceof Error
            ? `The graph workspace hit a rendering error: ${nextError.message}`
            : "The graph workspace hit a rendering error.",
      };
    }
  }, [graphData, mode, expandedOntologyNodeIds]);
  const selectedTreeNode = useMemo(
    () => (selectedDocumentPath ? findTreeNode(tree, selectedDocumentPath) : null),
    [selectedDocumentPath, tree],
  );
  const selectedApiNode = useMemo(
    () => graphData?.nodes.find((node) => node.path === selectedDocumentPath) ?? null,
    [graphData, selectedDocumentPath],
  );
  const documentTags = useMemo(() => (document ? parseFrontmatterTags(document.content) : []), [document]);
  const relatedDocuments = useMemo(() => {
    if (!graphData || !selectedApiNode) return [];
    const relatedIds = new Set<string>();
    for (const edge of graphData.edges) {
      if (edge.type !== "REFERENCES") continue;
      if (edge.source === selectedApiNode.id) relatedIds.add(edge.target);
      if (edge.target === selectedApiNode.id) relatedIds.add(edge.source);
    }
    return graphData.nodes
      .filter((node) => node.type === "document" && relatedIds.has(node.id))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [graphData, selectedApiNode]);
  const dirty = Boolean(document && draft !== document.content);

  function selectDocument(documentPath: string) {
    setSelectedDocumentPath(documentPath);
    setDocumentPanelOpen(true);
    setDocumentPanelExpanded(true);
    setDocumentMetaOpen(false);
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

  function openFolderMenu(event: MouseEvent, folder: FileTreeNode) {
    event.preventDefault();
    event.stopPropagation();
    setFolderContextMenu({ x: event.clientX, y: event.clientY, folder });
  }

  function handleNodeSelect(node: GraphNode | null) {
    setSelectedNode(node);
    if (mode === "ontology" && node) {
      setExpandedOntologyNodeIds((current) => {
        if (current.has(node.id)) return current;
        return new Set([...current, node.id]);
      });
    }
  }

  function handleNodeOpen(node: GraphNode) {
    setSelectedNode(node);
    const path = node?.properties?.path;
    if (node.type === "document" && typeof path === "string") {
      selectDocument(path);
    }
  }

  async function saveDocument(): Promise<boolean> {
    if (!selectedDocumentPath || !document || !dirty) return true;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.writeDocument(selectedDocumentPath, draft);
      setDocument({ ...document, content: draft, updatedAt: result.indexedAt });
      setNotice("Saved. The SQLite index and graph were refreshed.");
      await loadWorkspace();
      return true;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not save this document.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function closeDocumentPanel() {
    setDocumentPanelOpen(false);
    setDocumentPanelExpanded(false);
  }

  function attemptCloseDocumentPanel() {
    if (dirty) {
      setNotice("Unsaved changes are still open. Use Save + close to keep them, or Revert before closing the reader.");
      return;
    }
    closeDocumentPanel();
  }

  async function saveAndCloseDocument() {
    const ok = await saveDocument();
    if (ok) closeDocumentPanel();
  }

  async function rebuildGraphNow() {
    if (!uiCapabilities?.features.rebuildAdvisor) return;
    setRebuilding(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.rebuildGraph();
      setRebuildAdvisor(result.advisor);
      setNotice(`Rebuild finished. ${result.files} docs reindexed with ${result.embeddingModel} [${result.embeddingMode}].`);
      await loadWorkspace();
      setReloadKey((value) => value + 1);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not rebuild the graph and retrieval index.");
    } finally {
      setRebuilding(false);
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
                onContextMenu={openFolderMenu}
                contextMenuFolderPath={folderContextMenu?.folder.path ?? null}
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
        {compatibilityError ? (
          <LiteCard className="compatibility-card">
            <LiteCardHeader>
              <LiteSectionHeader
                eyebrow="Compatibility"
                title="Graph UI and daemon are out of sync"
                description={compatibilityError}
              />
            </LiteCardHeader>
            <LiteCardBody>
              <p className="muted-copy">
                This browser tab is talking to a daemon that does not match the current UI bundle. Restart <code>npm run graph</code>, then open the
                newly printed tokenized localhost link once so the session is refreshed.
              </p>
            </LiteCardBody>
          </LiteCard>
        ) : null}

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
            {uiCapabilities?.features.terminalPanel ? (
              <LiteButton variant="secondary" onClick={() => setTerminalPanelOpen((value) => !value)}>
                {terminalPanelOpen ? "Hide terminal" : "Show terminal"}
              </LiteButton>
            ) : null}
          </div>
        </div>

        {error ? <div className="notice notice-error">{error}</div> : null}
        {graphSnapshotError ? (
          <div className="notice notice-error">
            {graphSnapshotError} Refresh the graph, or run <code>npm run graph</code> again if the session is stale.
          </div>
        ) : null}
        {notice ? <div className="notice notice-success">{notice}</div> : null}
        <div className="graph-shell">
          {compatibilityError ? (
            <LiteEmptyState
              title="Graph workspace paused"
              detail="Restart `npm run graph`, open the new local link once, and then refresh this page so the UI and daemon are on the same version."
            />
          ) : loading ? (
            <LiteEmptyState title="Loading graph" detail="The daemon is reading the SQLite index and Company Memory tree." />
          ) : (
            <GraphErrorBoundary>
              <GraphCanvas
                key={`${mode}:${reloadKey}`}
                snapshot={graphSnapshot}
                colorForType={getGraphEntityColor}
                onNodeSelect={handleNodeSelect}
                onNodeOpen={handleNodeOpen}
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
            </GraphErrorBoundary>
          )}
        </div>
      </section>

      {folderContextMenu ? (
        <div
          className="tree-context-menu"
          style={{ left: folderContextMenu.x, top: folderContextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          {folderContextMenu.folder.path === "000_Company_Memory" ? (
            <>
              <button
                type="button"
                onClick={() => {
                  expandAllFolders();
                  setFolderContextMenu(null);
                }}
              >
                Expand all folders
              </button>
              <button
                type="button"
                onClick={() => {
                  collapseAllFolders();
                  setFolderContextMenu(null);
                }}
              >
                Collapse all folders
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => {
              expandFolderBranch(folderContextMenu.folder);
              setFolderContextMenu(null);
            }}
          >
            Expand this branch
          </button>
          <button
            type="button"
            onClick={() => {
              collapseFolderBranch(folderContextMenu.folder);
              setFolderContextMenu(null);
            }}
          >
            Collapse this branch
          </button>
        </div>
      ) : null}

      {documentPanelOpen ? (
        <button
          type="button"
          className="document-panel-backdrop"
          aria-label="Close document panel"
          onClick={attemptCloseDocumentPanel}
        />
      ) : null}

      <aside
        className={documentPanelOpen ? `document-panel open${documentPanelExpanded ? " expanded" : ""}` : "document-panel"}
        aria-hidden={!documentPanelOpen}
      >
        <LiteCard className="document-card">
          <LiteCardHeader>
            <LiteSectionHeader
              eyebrow="Reader + editor"
              title={selectedTreeNode?.name ?? selectedNode?.label ?? "Select a document"}
              description={selectedDocumentPath ?? "Click a Markdown file in the explorer or a document node in the graph."}
              actions={
                <div className="document-panel-actions">
                  {dirty ? <LiteBadge tone="warning">Unsaved</LiteBadge> : null}
                  {dirty ? (
                    <LiteButton onClick={() => void saveAndCloseDocument()} disabled={saving}>
                      {saving ? "Saving..." : "Save + close"}
                    </LiteButton>
                  ) : null}
                  <LiteButton variant="secondary" onClick={() => setDocumentPanelExpanded((current) => !current)}>
                    {documentPanelExpanded ? "Windowed" : "Expand"}
                  </LiteButton>
                  <LiteButton
                    variant="ghost"
                    onClick={attemptCloseDocumentPanel}
                  >
                    Close
                  </LiteButton>
                </div>
              }
            />
          </LiteCardHeader>
          <LiteCardBody>
            {document ? (
              <div className="editor-stack">
                <section className="document-meta-panel">
                  <div className="document-meta-header">
                    <div>
                      <p className="lite-graph-legend-label">Document context</p>
                      <p className="muted-copy">Tags, relationships, and indexed metadata for this file.</p>
                    </div>
                    <LiteButton variant="secondary" onClick={() => setDocumentMetaOpen((current) => !current)}>
                      {documentMetaOpen ? "Hide details" : "Show details"}
                    </LiteButton>
                  </div>

                  {documentMetaOpen ? (
                    <div className="document-meta-grid">
                      <section className="document-meta-section">
                        <p className="lite-graph-legend-label">Tags</p>
                        <div className="document-meta-chips">
                          {documentTags.length ? (
                            documentTags.map((tag) => (
                              <span key={tag} className="document-meta-chip">
                                {tag}
                              </span>
                            ))
                          ) : (
                            <span className="muted-copy">No frontmatter tags found.</span>
                          )}
                        </div>
                      </section>

                      <section className="document-meta-section">
                        <p className="lite-graph-legend-label">Relationships</p>
                        <div className="document-meta-list">
                          {relatedDocuments.length ? (
                            relatedDocuments.map((node) => (
                              <button
                                key={node.id}
                                type="button"
                                className="document-meta-link"
                                onClick={() => selectDocument(node.path)}
                              >
                                {node.label}
                              </button>
                            ))
                          ) : (
                            <span className="muted-copy">No direct document references were found in the graph.</span>
                          )}
                        </div>
                      </section>

                      <section className="document-meta-section">
                        <p className="lite-graph-legend-label">Metadata</p>
                        <dl className="document-meta-table">
                          <div>
                            <dt>Path</dt>
                            <dd>{document.path}</dd>
                          </div>
                          <div>
                            <dt>Updated</dt>
                            <dd>{new Date(document.updatedAt).toLocaleString()}</dd>
                          </div>
                          <div>
                            <dt>Ontology</dt>
                            <dd>{selectedApiNode?.ontologyDomain ?? "Not set"}</dd>
                          </div>
                          <div>
                            <dt>Status</dt>
                            <dd>{selectedApiNode?.status ?? "Not set"}</dd>
                          </div>
                          <div>
                            <dt>Owner</dt>
                            <dd>{selectedApiNode?.ownerAgent ?? "Not set"}</dd>
                          </div>
                          <div>
                            <dt>Summary</dt>
                            <dd>{selectedApiNode?.summary ?? "No summary indexed yet."}</dd>
                          </div>
                        </dl>
                      </section>
                    </div>
                  ) : null}
                </section>

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

      {uiCapabilities?.features.terminalPanel ? (
        <TerminalPanel
          open={terminalPanelOpen}
          expanded={terminalPanelExpanded}
          onClose={() => {
            setTerminalPanelOpen(false);
            setTerminalPanelExpanded(false);
          }}
          onToggleExpanded={() => setTerminalPanelExpanded((current) => !current)}
        />
      ) : null}
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
  onContextMenu,
  contextMenuFolderPath,
}: {
  node: FileTreeNode;
  selectedPath: string | null;
  openFolderPaths: Set<string>;
  onSelect: (path: string) => void;
  onToggleFolder: (path: string) => void;
  onExpandBranch: (node: FileTreeNode) => void;
  onCollapseBranch: (node: FileTreeNode) => void;
  onContextMenu: (event: MouseEvent, node: FileTreeNode) => void;
  contextMenuFolderPath: string | null;
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
      <div
        className={contextMenuFolderPath === node.path ? "tree-row tree-row-folder context-open" : "tree-row tree-row-folder"}
        onContextMenu={(event) => onContextMenu(event, node)}
      >
        <button type="button" className="tree-toggle" onClick={() => onToggleFolder(node.path)} aria-label={`${open ? "Collapse" : "Expand"} ${node.name}`}>
          {open ? "v" : ">"}
        </button>
        <button type="button" className="tree-label" onClick={() => onToggleFolder(node.path)}>
          <strong>{node.name}</strong>
        </button>
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
              onContextMenu={onContextMenu}
              contextMenuFolderPath={contextMenuFolderPath}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
