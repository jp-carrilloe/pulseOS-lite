import { Component, type ErrorInfo, type MouseEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { GraphCanvas } from "./components/graph/GraphCanvas";
import { TerminalPanel } from "./components/terminal/TerminalPanel";
import { LiteBadge, LiteButton, LiteCard, LiteCardBody, LiteCardHeader, LiteEmptyState, LiteSectionHeader } from "./components/ui";
import { api } from "./lib/api";
import { getGraphEntityColor } from "./lib/graph-colors";
import { buildEmptyGraphSnapshot, toGraphSnapshot, type ViewMode } from "./lib/graph-snapshot";
import type { ApiKnowledgeGraphSnapshot, DocumentReadResponse, FileTreeNode, GraphNode, RebuildAdvisorStatus, UiCapabilities } from "./types/graph";

const REQUIRED_UI_API_VERSION = 1;

interface OpenDocumentTab {
  path: string;
  document: DocumentReadResponse | null;
  draft: string;
  loading: boolean;
  metaOpen: boolean;
}

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
          detail={`The memory map crashed while rendering: ${this.state.errorMessage}. Refresh the page or run npm run ui again.`}
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
  const SIDEBAR_MAX_WIDTH = 300;
  const DOCUMENT_PANEL_MIN_WIDTH = 380;
  const DOCUMENT_PANEL_MAX_WIDTH = 760;
  const TERMINAL_MIN_WIDTH = 360;
  const TERMINAL_MAX_WIDTH = 420;
  const TERMINAL_MIN_HEIGHT = 220;
  const TERMINAL_MAX_HEIGHT = 420;
  const MIN_MAIN_CONTENT_WIDTH = 320;
  const MIN_MAIN_CONTENT_HEIGHT = 320;
  const SHELL_GUTTER = 12;
  const WORKSPACE_PADDING = 12;
  const LAYOUT_GAP = 12;
  const RESIZE_HANDLE_WIDTH = 4;
  const [graphData, setGraphData] = useState<ApiKnowledgeGraphSnapshot | null>(null);
  const [tree, setTree] = useState<FileTreeNode | null>(null);
  const [mode, setMode] = useState<ViewMode>("ontology");
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [expandedOntologyNodeIds, setExpandedOntologyNodeIds] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildConfirmOpen, setRebuildConfirmOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [rebuildAdvisor, setRebuildAdvisor] = useState<RebuildAdvisorStatus | null>(null);
  const [uiCapabilities, setUiCapabilities] = useState<UiCapabilities | null>(null);
  const [compatibilityError, setCompatibilityError] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<"explorer" | "settings">("explorer");
  const [openFolderPaths, setOpenFolderPaths] = useState<Set<string>>(new Set(["000_Company_Memory"]));
  const [graphVisible, setGraphVisible] = useState(true);
  const [documentPanelVisible, setDocumentPanelVisible] = useState(false);
  const [documentPanelWidth, setDocumentPanelWidth] = useState(540);
  const [documentPanelResizing, setDocumentPanelResizing] = useState(false);
  const [openDocuments, setOpenDocuments] = useState<OpenDocumentTab[]>([]);
  const [activeDocumentPath, setActiveDocumentPath] = useState<string | null>(null);
  const [terminalPanelOpen, setTerminalPanelOpen] = useState(false);
  const [terminalDockMode, setTerminalDockMode] = useState<"right" | "bottom">("bottom");
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [sidebarResizing, setSidebarResizing] = useState(false);
  const [terminalWidth, setTerminalWidth] = useState(360);
  const [terminalHeight, setTerminalHeight] = useState(280);
  const [terminalResizing, setTerminalResizing] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight);
  const [folderContextMenu, setFolderContextMenu] = useState<{
    x: number;
    y: number;
    folder: FileTreeNode;
  } | null>(null);
  const workspaceMainAreaRef = useRef<HTMLDivElement | null>(null);
  const documentWorkspaceRef = useRef<HTMLDivElement | null>(null);
  const desktopLayout = viewportWidth >= 1180;
  const dockedTerminalOpen = Boolean(uiCapabilities?.features.terminalPanel && terminalPanelOpen && desktopLayout);
  const terminalDockRight = dockedTerminalOpen && terminalDockMode === "right";
  const terminalDockBottom = dockedTerminalOpen && terminalDockMode === "bottom";
  const documentPanelOpen = documentPanelVisible && desktopLayout;
  const baseViewportWidth = viewportWidth - SHELL_GUTTER * 2 - WORKSPACE_PADDING * 2;
  const workspaceMainAreaHeight = workspaceMainAreaRef.current?.getBoundingClientRect().height ?? Math.max(0, viewportHeight - 220);
  const terminalDockWidthBudget = terminalDockRight ? terminalWidth + RESIZE_HANDLE_WIDTH + LAYOUT_GAP * 2 : 0;
  const documentWorkspaceWidth =
    documentWorkspaceRef.current?.getBoundingClientRect().width ??
    Math.max(0, baseViewportWidth - sidebarWidth - RESIZE_HANDLE_WIDTH - LAYOUT_GAP * 2 - terminalDockWidthBudget);
  const maxSidebarWidthForViewport = Math.max(
    SIDEBAR_MIN_WIDTH,
    Math.min(
      SIDEBAR_MAX_WIDTH,
      baseViewportWidth -
        RESIZE_HANDLE_WIDTH -
        LAYOUT_GAP * 2 -
        terminalDockWidthBudget -
        MIN_MAIN_CONTENT_WIDTH,
    ),
  );
  const maxTerminalHeightForViewport = Math.max(
    TERMINAL_MIN_HEIGHT,
    Math.min(
      TERMINAL_MAX_HEIGHT,
      workspaceMainAreaHeight - MIN_MAIN_CONTENT_HEIGHT - RESIZE_HANDLE_WIDTH - LAYOUT_GAP,
    ),
  );
  const maxTerminalWidthForViewport = Math.max(
    TERMINAL_MIN_WIDTH,
    Math.min(
      TERMINAL_MAX_WIDTH,
      baseViewportWidth -
        sidebarWidth -
        RESIZE_HANDLE_WIDTH -
        LAYOUT_GAP * 2 -
        RESIZE_HANDLE_WIDTH -
        LAYOUT_GAP * 2 -
        MIN_MAIN_CONTENT_WIDTH,
    ),
  );
  const maxDocumentWidthForViewport = Math.max(
    DOCUMENT_PANEL_MIN_WIDTH,
    Math.min(
      DOCUMENT_PANEL_MAX_WIDTH,
      documentWorkspaceWidth - MIN_MAIN_CONTENT_WIDTH - RESIZE_HANDLE_WIDTH - LAYOUT_GAP,
    ),
  );

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
            : "The local daemon could not confirm UI compatibility. Restart `npm run ui` and open the new link.",
        );
        setGraphData(null);
        setTree(null);
        setRebuildAdvisor(null);
        setUiCapabilities(null);
        return;
      }

      if (capabilities.uiApiVersion !== REQUIRED_UI_API_VERSION) {
        setCompatibilityError(
          `This UI page expects UI API v${REQUIRED_UI_API_VERSION}, but the running daemon reports v${capabilities.uiApiVersion}. Restart \`npm run ui\` and open the newly printed link.`,
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
    if (uiCapabilities?.features.terminalPanel) return;
    setTerminalPanelOpen(false);
  }, [uiCapabilities?.features.terminalPanel]);

  useEffect(() => {
    if (!sidebarResizing) return;

    function handlePointerMove(event: PointerEvent) {
      const nextWidth = Math.min(Math.max(event.clientX - SHELL_GUTTER, SIDEBAR_MIN_WIDTH), maxSidebarWidthForViewport);
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
  }, [maxSidebarWidthForViewport, sidebarResizing]);

  useEffect(() => {
    if (!terminalResizing) return;

    function handlePointerMove(event: PointerEvent) {
      if (terminalDockBottom && workspaceMainAreaRef.current) {
        const bounds = workspaceMainAreaRef.current.getBoundingClientRect();
        const nextHeight = Math.min(
          Math.max(bounds.bottom - event.clientY, TERMINAL_MIN_HEIGHT),
          maxTerminalHeightForViewport,
        );
        setTerminalHeight(nextHeight);
        return;
      }

      const nextWidth = Math.min(Math.max(window.innerWidth - event.clientX, TERMINAL_MIN_WIDTH), maxTerminalWidthForViewport);
      setTerminalWidth(nextWidth);
    }

    function handlePointerUp() {
      setTerminalResizing(false);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [maxTerminalHeightForViewport, maxTerminalWidthForViewport, terminalDockBottom, terminalResizing]);

  useEffect(() => {
    if (!documentPanelResizing) return;

    function handlePointerMove(event: PointerEvent) {
      if (!documentWorkspaceRef.current) return;
      const bounds = documentWorkspaceRef.current.getBoundingClientRect();
      const nextWidth = Math.min(
        Math.max(bounds.right - event.clientX, DOCUMENT_PANEL_MIN_WIDTH),
        maxDocumentWidthForViewport,
      );
      setDocumentPanelWidth(nextWidth);
    }

    function handlePointerUp() {
      setDocumentPanelResizing(false);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [DOCUMENT_PANEL_MIN_WIDTH, documentPanelResizing, maxDocumentWidthForViewport]);

  useEffect(() => {
    function handleResize() {
      setViewportWidth(window.innerWidth);
      setViewportHeight(window.innerHeight);
    }

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    setSidebarWidth((current) => Math.min(current, maxSidebarWidthForViewport));
  }, [maxSidebarWidthForViewport]);

  useEffect(() => {
    setTerminalWidth((current) => Math.min(current, maxTerminalWidthForViewport));
  }, [maxTerminalWidthForViewport]);

  useEffect(() => {
    setTerminalHeight((current) => Math.min(current, maxTerminalHeightForViewport));
  }, [maxTerminalHeightForViewport]);

  useEffect(() => {
    setDocumentPanelWidth((current) => Math.min(current, maxDocumentWidthForViewport));
  }, [maxDocumentWidthForViewport]);

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
  const activeDocumentTab = useMemo(
    () => openDocuments.find((tab) => tab.path === activeDocumentPath) ?? null,
    [activeDocumentPath, openDocuments],
  );
  const activeDocument = activeDocumentTab?.document ?? null;
  const selectedTreeNode = useMemo(
    () => (activeDocumentPath ? findTreeNode(tree, activeDocumentPath) : null),
    [activeDocumentPath, tree],
  );
  const selectedApiNode = useMemo(
    () => graphData?.nodes.find((node) => node.path === activeDocumentPath) ?? null,
    [activeDocumentPath, graphData],
  );
  const documentTags = useMemo(
    () => parseFrontmatterTags(activeDocumentTab?.draft ?? activeDocument?.content ?? ""),
    [activeDocument?.content, activeDocumentTab?.draft],
  );
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
  const dirty = Boolean(activeDocumentTab?.document && activeDocumentTab.draft !== activeDocumentTab.document.content);
  const dirtyDocumentCount = useMemo(
    () => openDocuments.filter((tab) => tab.document && tab.draft !== tab.document.content).length,
    [openDocuments],
  );

  function updateDocumentTab(documentPath: string, updater: (tab: OpenDocumentTab) => OpenDocumentTab) {
    setOpenDocuments((current) => current.map((tab) => (tab.path === documentPath ? updater(tab) : tab)));
  }

  async function loadDocumentTab(documentPath: string) {
    setError(null);
    try {
      const nextDocument = await api.readDocument(documentPath);
      updateDocumentTab(documentPath, (tab) => {
        const dirtyTab = Boolean(tab.document && tab.draft !== tab.document.content);
        return {
          ...tab,
          document: nextDocument,
          draft: dirtyTab ? tab.draft : nextDocument.content,
          loading: false,
        };
      });
    } catch (nextError) {
      updateDocumentTab(documentPath, (tab) => ({ ...tab, loading: false }));
      setError(nextError instanceof Error ? nextError.message : "Could not read the selected document.");
    }
  }

  function selectDocument(documentPath: string) {
    setNotice(null);
    setDocumentPanelVisible(true);
    setGraphVisible(true);
    setActiveDocumentPath(documentPath);
    setOpenDocuments((current) => {
      if (current.some((tab) => tab.path === documentPath)) {
        return current;
      }
      return [
        ...current,
        {
          path: documentPath,
          document: null,
          draft: "",
          loading: true,
          metaOpen: false,
        },
      ];
    });
    if (!openDocuments.some((tab) => tab.path === documentPath)) {
      void loadDocumentTab(documentPath);
    }
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

  async function saveDocument(documentPath = activeDocumentPath): Promise<boolean> {
    if (!documentPath) return true;
    const targetTab = openDocuments.find((tab) => tab.path === documentPath) ?? null;
    if (!targetTab?.document || targetTab.draft === targetTab.document.content) return true;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.writeDocument(documentPath, targetTab.draft);
      updateDocumentTab(documentPath, (tab) =>
        tab.document
          ? {
              ...tab,
              document: { ...tab.document, content: tab.draft, updatedAt: result.indexedAt },
            }
          : tab,
      );
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

  async function saveAllDocuments(): Promise<boolean> {
    const dirtyTabs = openDocuments.filter((tab) => tab.document && tab.draft !== tab.document.content);
    if (!dirtyTabs.length) return true;
    for (const tab of dirtyTabs) {
      const ok = await saveDocument(tab.path);
      if (!ok) return false;
    }
    setNotice(`Saved ${dirtyTabs.length} document${dirtyTabs.length === 1 ? "" : "s"}.`);
    return true;
  }

  function closeDocumentTab(documentPath: string) {
    const closingTab = openDocuments.find((tab) => tab.path === documentPath) ?? null;
    if (closingTab?.document && closingTab.draft !== closingTab.document.content) {
      setNotice("Unsaved changes are still open. Save or revert this tab before closing it.");
      return;
    }
    setOpenDocuments((current) => {
      const next = current.filter((tab) => tab.path !== documentPath);
      setActiveDocumentPath((currentPath) => (currentPath === documentPath ? next.at(-1)?.path ?? null : currentPath));
      if (!next.length) {
        setDocumentPanelVisible(false);
      }
      return next;
    });
  }

  function closeDocumentPanel() {
    if (dirtyDocumentCount) {
      setNotice("Unsaved changes are still open. Save or revert them before hiding the editor.");
      return;
    }
    setDocumentPanelVisible(false);
  }

  function discardActiveDocumentChanges() {
    if (!activeDocumentTab?.document || saving) return;
    updateDocumentTab(activeDocumentTab.path, (tab) => ({ ...tab, draft: tab.document?.content ?? tab.draft }));
    setNotice("Discarded unsaved changes in the active tab.");
  }

  async function rebuildGraphNow() {
    if (!uiCapabilities?.features.rebuildAdvisor) return;
    setRebuilding(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.rebuildGraph();
      setRebuildAdvisor(result.advisor);
      setNotice(
        `Rebuild finished. ${result.files} docs reindexed with ${result.embeddingModel} [${result.embeddingMode}]. New and edited docs are now reflected in the graph.`,
      );
      await loadWorkspace();
      setReloadKey((value) => value + 1);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not rebuild the graph and retrieval index.");
    } finally {
      setRebuilding(false);
    }
  }

  function requestRebuildGraph() {
    if (!uiCapabilities?.features.rebuildAdvisor || rebuilding || compatibilityError) return;
    setRebuildConfirmOpen(true);
  }

  return (
    <div className="company-memory-app-shell">
      <header className="app-shell-header">
        <div className="app-shell-header-copy">
          <h1 className="app-shell-title">PulseOS Lite - Agentic Company Memory</h1>
          <p className="app-shell-subtitle">graph workspace</p>
        </div>
        <div className="app-shell-header-actions">
          <div className="app-shell-header-meta">
            <span>Local UI</span>
            <span>SQLite-backed</span>
          </div>
        </div>
      </header>

      <main
        className={[
          "company-memory-workspace",
          sidebarResizing ? "sidebar-resizing" : "",
          documentPanelResizing ? "document-resizing" : "",
          terminalResizing && terminalDockBottom ? "terminal-resizing-vertical" : "",
          terminalResizing && !terminalDockBottom ? "terminal-resizing-horizontal" : "",
          terminalDockRight ? "terminal-docked-right" : "",
          terminalDockBottom ? "terminal-docked-bottom" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={
          desktopLayout
            ? {
                gridTemplateColumns: terminalDockRight
                  ? `${sidebarWidth}px ${RESIZE_HANDLE_WIDTH}px minmax(0, 1fr) ${RESIZE_HANDLE_WIDTH}px ${terminalWidth}px`
                  : `${sidebarWidth}px ${RESIZE_HANDLE_WIDTH}px minmax(0, 1fr)`,
              }
            : undefined
        }
      >
        <aside className="workspace-sidebar" style={desktopLayout ? { width: `${sidebarWidth}px` } : undefined}>
          <LiteCard className="explorer-card">
            <LiteCardHeader>
              <LiteSectionHeader
                eyebrow={sidebarTab === "explorer" ? "Explorer" : "Settings"}
                title={sidebarTab === "explorer" ? "Folder explorer" : "Graph maintenance"}
                description={
                  sidebarTab === "explorer"
                    ? "Browse the editable Markdown tree."
                    : "Refresh the SQLite graph and retrieval layer from the local workspace."
                }
              />
              <div className="sidebar-tabbar" role="tablist" aria-label="Sidebar sections">
                <button
                  type="button"
                  className={sidebarTab === "explorer" ? "sidebar-tab active" : "sidebar-tab"}
                  onClick={() => setSidebarTab("explorer")}
                  role="tab"
                  aria-selected={sidebarTab === "explorer"}
                >
                  Explorer
                </button>
                <button
                  type="button"
                  className={sidebarTab === "settings" ? "sidebar-tab active" : "sidebar-tab"}
                  onClick={() => setSidebarTab("settings")}
                  role="tab"
                  aria-selected={sidebarTab === "settings"}
                >
                  Settings
                </button>
              </div>
            </LiteCardHeader>
            <LiteCardBody>
              {sidebarTab === "explorer" ? (
                tree ? (
                  <TreeView
                    node={tree}
                    selectedPath={activeDocumentPath}
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
                )
              ) : (
                <div className="sidebar-settings-stack">
                  {uiCapabilities?.features.rebuildAdvisor ? (
                    <LiteButton
                      variant={rebuildAdvisor?.needsRebuild ? "primary" : "secondary"}
                      onClick={requestRebuildGraph}
                      disabled={rebuilding || Boolean(compatibilityError)}
                      title="Recompute the full memory index and graph"
                      aria-label="Recompute memory index"
                    >
                      {rebuilding ? "Recomputing..." : "Recompute memory index"}
                    </LiteButton>
                  ) : null}
                  <p className="muted-copy sidebar-settings-note">
                    Rebuild is intentionally tucked into Settings so the main graph UI stays focused and expensive actions are harder to trigger by accident.
                  </p>
                  <div className="sidebar-settings-meta">
                    <span>
                      Last indexed: {formatTimestamp(rebuildAdvisor?.lastIndexedAt ?? graphData?.generatedAt ?? null)}
                    </span>
                    <span>
                      Status: {rebuildAdvisor?.needsRebuild ? "Refresh recommended" : "Up to date"}
                    </span>
                  </div>
                  {rebuildAdvisor?.reasons?.[0] ? <p className="muted-copy sidebar-settings-note">{rebuildAdvisor.reasons[0]}</p> : null}
                </div>
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

        <div
          ref={workspaceMainAreaRef}
          className={terminalDockBottom ? "workspace-main-area terminal-bottom-docked" : "workspace-main-area"}
          style={
            terminalDockBottom
              ? { gridTemplateRows: `minmax(0, 1fr) ${RESIZE_HANDLE_WIDTH}px ${terminalHeight}px` }
              : undefined
          }
        >
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
                    This browser tab is talking to a daemon that does not match the current UI bundle. Restart <code>npm run ui</code>, then open the
                    newly printed tokenized localhost link once so the session is refreshed.
                  </p>
                </LiteCardBody>
              </LiteCard>
            ) : null}

            {error ? <div className="notice notice-error">{error}</div> : null}
            {graphSnapshotError ? (
              <div className="notice notice-error">
                {graphSnapshotError} Refresh the UI data, or run <code>npm run ui</code> again if the session is stale.
              </div>
            ) : null}
            {notice ? <div className="notice notice-success">{notice}</div> : null}

            <div
              ref={documentWorkspaceRef}
              className={[
                "workspace-main-content",
                documentPanelOpen ? "document-workspace-open" : "",
                !graphVisible ? "graph-hidden" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={documentPanelOpen && graphVisible ? { gridTemplateColumns: `minmax(0, 1fr) ${RESIZE_HANDLE_WIDTH}px ${documentPanelWidth}px` } : undefined}
            >
              <div className={graphVisible ? "graph-shell" : "graph-shell graph-shell-surface-hidden"}>
                  {compatibilityError ? (
                    <LiteEmptyState
                      title="Graph workspace paused"
                      detail="Restart `npm run ui`, open the new local link once, and then refresh this page so the UI and daemon are on the same version."
                    />
                  ) : loading ? (
                    <LiteEmptyState title="Loading graph" detail="The daemon is reading the SQLite index and Company Memory tree." />
                  ) : (
                    <GraphErrorBoundary>
                      <GraphCanvas
                        key={`${mode}:${reloadKey}`}
                        snapshot={graphSnapshot}
                        colorForType={getGraphEntityColor}
                        hideSurface={!graphVisible}
                        selectedNodeId={selectedNode?.id ?? null}
                        onNodeSelect={handleNodeSelect}
                        onNodeOpen={handleNodeOpen}
                        relayoutTrigger={reloadKey}
                        headerBadges={
                          <>
                            <LiteBadge tone="neutral">{graphSnapshot.nodes.length} nodes</LiteBadge>
                            <LiteBadge tone="neutral">{graphSnapshot.edges.length} edges</LiteBadge>
                            <LiteBadge tone={rebuildAdvisor?.needsRebuild ? "warning" : "success"}>
                              {rebuildAdvisor?.needsRebuild ? "Refresh recommended" : "Index current"}
                            </LiteBadge>
                            {dirtyDocumentCount ? <LiteBadge tone="warning">{dirtyDocumentCount} unsaved</LiteBadge> : null}
                          </>
                        }
                        toolbarControls={
                          <div className="graph-toolbar-cluster">
                            <div className="graph-toolbar-toggle-strip" role="group" aria-label="Workspace panels">
                              <LiteButton
                                className="graph-toolbar-compact-button"
                                variant={documentPanelOpen ? "primary" : "secondary"}
                                onClick={() => {
                                  if (documentPanelOpen) {
                                    closeDocumentPanel();
                                    return;
                                  }
                                  setDocumentPanelVisible(true);
                                }}
                                title={documentPanelOpen ? "Hide editor" : "Show editor"}
                              >
                                Editor
                              </LiteButton>
                              <LiteButton
                                className="graph-toolbar-compact-button"
                                variant={graphVisible ? "primary" : "secondary"}
                                onClick={() => {
                                  if (graphVisible) {
                                    setGraphVisible(false);
                                    setDocumentPanelVisible(true);
                                    return;
                                  }
                                  setGraphVisible(true);
                                }}
                                title={graphVisible ? "Hide memory map" : "Show memory map"}
                              >
                                Map
                              </LiteButton>
                              {uiCapabilities?.features.terminalPanel ? (
                                <LiteButton
                                  className="graph-toolbar-compact-button"
                                  variant={terminalPanelOpen ? "primary" : "secondary"}
                                  onClick={() => setTerminalPanelOpen((value) => !value)}
                                  title={terminalPanelOpen ? "Hide terminal" : "Show terminal"}
                                >
                                  Term
                                </LiteButton>
                              ) : null}
                            </div>
                            <div className="graph-inline-mode-switch graph-toolbar-mode-strip" role="group" aria-label="Graph mode">
                              <LiteButton
                                className="graph-tooltip-target graph-toolbar-compact-button"
                                data-tooltip="Show the folder hierarchy view"
                                variant={mode === "ontology" ? "primary" : "secondary"}
                                onClick={() => setMode("ontology")}
                                title="Company Ontology"
                              >
                                Ontology
                              </LiteButton>
                              <LiteButton
                                className="graph-tooltip-target graph-toolbar-compact-button"
                                data-tooltip="Show document-to-document references"
                                variant={mode === "documents" ? "primary" : "secondary"}
                                onClick={() => setMode("documents")}
                                title="Document Relationships"
                              >
                                Docs
                              </LiteButton>
                            </div>
                            <LiteButton
                              className="graph-tooltip-target graph-toolbar-refresh-button"
                              data-tooltip="Refresh graph data already stored in SQLite"
                              variant="ghost"
                              onClick={() => void loadWorkspace()}
                              title="Refresh graph data"
                              aria-label="Refresh graph data"
                            >
                              ↻
                            </LiteButton>
                          </div>
                        }
                      />
                    </GraphErrorBoundary>
                  )}
              </div>

              {documentPanelOpen ? (
                <>
                  {graphVisible ? (
                    <button
                      type="button"
                      className={documentPanelResizing ? "document-resize-handle active" : "document-resize-handle"}
                      aria-label="Resize document editor"
                      onPointerDown={() => setDocumentPanelResizing(true)}
                    />
                  ) : null}
                  <aside className="document-ide-panel">
                    <LiteCard className="document-card document-ide-card">
                      <LiteCardHeader>
                        <div className="document-ide-header">
                          <div>
                            <p className="eyebrow">Mini IDE</p>
                            <h3>{selectedTreeNode?.name ?? selectedNode?.label ?? "Documents"}</h3>
                            <p className="muted-copy document-ide-subtitle">
                              {activeDocumentPath ?? "Open a Markdown document from the explorer or graph."}
                            </p>
                          </div>
                          <div className="document-panel-actions">
                            {dirty ? <LiteBadge tone="warning">Unsaved</LiteBadge> : null}
                            {dirtyDocumentCount > 1 ? (
                              <LiteButton onClick={() => void saveAllDocuments()} disabled={saving}>
                                {saving ? "Saving..." : "Save all"}
                              </LiteButton>
                            ) : null}
                            <LiteButton variant="secondary" onClick={() => setGraphVisible((value) => !value)}>
                              {graphVisible ? "Hide map" : "Show map"}
                            </LiteButton>
                            <LiteButton onClick={() => void saveDocument()} disabled={!dirty || saving}>
                              {saving ? "Saving..." : "Save"}
                            </LiteButton>
                            <LiteButton
                              variant="secondary"
                              onClick={discardActiveDocumentChanges}
                              disabled={!dirty || saving}
                            >
                              Discard
                            </LiteButton>
                            {activeDocumentTab ? (
                              <LiteButton variant="secondary" onClick={() => closeDocumentTab(activeDocumentTab.path)}>
                                Close tab
                              </LiteButton>
                            ) : null}
                            <LiteButton variant="ghost" onClick={closeDocumentPanel}>
                              Hide
                            </LiteButton>
                          </div>
                        </div>
                      </LiteCardHeader>
                      <LiteCardBody>
                        <div className="document-tab-strip" role="tablist" aria-label="Open documents">
                          {openDocuments.map((tab) => {
                            const tabDirty = Boolean(tab.document && tab.draft !== tab.document.content);
                            return (
                              <div
                                key={tab.path}
                                className={activeDocumentPath === tab.path ? "document-tab active" : "document-tab"}
                              >
                                <button type="button" className="document-tab-button" onClick={() => setActiveDocumentPath(tab.path)}>
                                  <span className="document-tab-name">{tab.document?.path.split("/").at(-1) ?? tab.path.split("/").at(-1) ?? tab.path}</span>
                                  {tabDirty ? <span className="document-tab-dirty" aria-hidden="true" /> : null}
                                </button>
                                <button type="button" className="document-tab-close" onClick={() => closeDocumentTab(tab.path)} aria-label={`Close ${tab.path}`}>
                                  ×
                                </button>
                              </div>
                            );
                          })}
                        </div>

                        {activeDocumentTab ? (
                          activeDocumentTab.loading ? (
                            <LiteEmptyState title="Loading document" detail="Fetching the latest Markdown content from the workspace." />
                          ) : activeDocument ? (
                            <div className="editor-stack">
                              <section className="document-meta-panel">
                                <div className="document-meta-header">
                                  <div>
                                    <p className="lite-graph-legend-label">Document context</p>
                                    <p className="muted-copy">Tags, relationships, and indexed metadata for this file.</p>
                                  </div>
                                  <LiteButton
                                    variant="secondary"
                                    onClick={() =>
                                      updateDocumentTab(activeDocumentTab.path, (tab) => ({ ...tab, metaOpen: !tab.metaOpen }))
                                    }
                                  >
                                    {activeDocumentTab.metaOpen ? "Hide details" : "Show details"}
                                  </LiteButton>
                                </div>

                                {activeDocumentTab.metaOpen ? (
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
                                          <dd>{activeDocument.path}</dd>
                                        </div>
                                        <div>
                                          <dt>Updated</dt>
                                          <dd>{new Date(activeDocument.updatedAt).toLocaleString()}</dd>
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

                              <textarea
                                value={activeDocumentTab.draft}
                                onChange={(event) =>
                                  updateDocumentTab(activeDocumentTab.path, (tab) => ({ ...tab, draft: event.target.value }))
                                }
                                spellCheck={false}
                              />
                            </div>
                          ) : (
                            <LiteEmptyState title="Document unavailable" detail="This tab is open, but the latest file contents could not be loaded." />
                          )
                        ) : (
                          <LiteEmptyState
                            title="No document selected"
                            detail="Open a Markdown file from the explorer or graph to start editing."
                          />
                        )}
                      </LiteCardBody>
                    </LiteCard>
                  </aside>
                </>
              ) : null}
            </div>
          </section>

          {terminalDockBottom ? (
            <button
              type="button"
              className={terminalResizing ? "terminal-resize-handle terminal-resize-handle-bottom active" : "terminal-resize-handle terminal-resize-handle-bottom"}
              aria-label="Resize terminal panel"
              onPointerDown={() => setTerminalResizing(true)}
            />
          ) : null}

          {terminalDockBottom ? (
            <TerminalPanel
              open={terminalPanelOpen}
              onClose={() => {
                setTerminalPanelOpen(false);
              }}
              width={terminalWidth}
              height={terminalHeight}
              dockMode={terminalDockMode}
              canDock={desktopLayout}
              onDockModeChange={setTerminalDockMode}
            />
          ) : null}
        </div>

        {terminalDockRight ? (
          <button
            type="button"
            className={terminalResizing ? "terminal-resize-handle active" : "terminal-resize-handle"}
            aria-label="Resize terminal sidebar"
            onPointerDown={() => setTerminalResizing(true)}
          />
        ) : null}

        {terminalDockRight ? (
          <TerminalPanel
            open={terminalPanelOpen}
            onClose={() => {
              setTerminalPanelOpen(false);
            }}
            width={terminalWidth}
            height={terminalHeight}
            dockMode={terminalDockMode}
            canDock={desktopLayout}
            onDockModeChange={setTerminalDockMode}
          />
        ) : null}

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

      {rebuildConfirmOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setRebuildConfirmOpen(false)}>
          <div
            className="confirmation-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rebuild-confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="eyebrow">Maintenance</p>
            <h2 id="rebuild-confirm-title">Recompute memory index?</h2>
            <p className="section-description">
              This action triggers full re-vectorization of all data, rebuilds the entire graph from scratch, and consumes API tokens that may incur cost.
            </p>
            <p className="muted-copy confirmation-modal-note">
              Use this after adding, moving, renaming, or deleting Markdown in <code>000_Company_Memory</code>, or when the Memory Map says a refresh is recommended.
            </p>
            <div className="confirmation-modal-actions">
              <LiteButton variant="ghost" onClick={() => setRebuildConfirmOpen(false)} disabled={rebuilding}>
                Cancel
              </LiteButton>
              <LiteButton
                onClick={() => {
                  setRebuildConfirmOpen(false);
                  void rebuildGraphNow();
                }}
                disabled={rebuilding}
              >
                {rebuilding ? "Recomputing..." : "Confirm rebuild"}
              </LiteButton>
            </div>
          </div>
        </div>
      ) : null}

      {uiCapabilities?.features.terminalPanel && !terminalPanelOpen ? (
        <button
          type="button"
          className="terminal-edge-trigger"
          onClick={() => setTerminalPanelOpen(true)}
          aria-label="Open terminal"
        >
          <span>Terminal</span>
        </button>
      ) : null}

      {uiCapabilities?.features.terminalPanel && !desktopLayout ? (
        <>
          {terminalPanelOpen ? (
            <button
              type="button"
              className={terminalResizing ? "terminal-resize-handle terminal-resize-handle-right active" : "terminal-resize-handle terminal-resize-handle-right"}
              aria-label="Resize terminal sidebar"
              style={{ right: `${terminalWidth - 2}px` }}
              onPointerDown={() => setTerminalResizing(true)}
            />
          ) : null}
          <TerminalPanel
            open={terminalPanelOpen}
            onClose={() => {
              setTerminalPanelOpen(false);
            }}
            width={terminalWidth}
            height={terminalHeight}
            dockMode="right"
          />
        </>
      ) : null}

      </main>
    </div>
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
