import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";
import type { GraphEdge, GraphNode, GraphSnapshot } from "../../types/graph";
import {
  attachInteractions,
  chooseGraphLayout,
  cognitiveStylesheet,
  getIncrementalLayoutOptions,
  getLayoutOptions,
  getMicroRelaxationLayoutOptions,
  mapGraphSnapshotToElements,
} from "./graph-core";
import { LiteGraphControls } from "./LiteGraphControls";

cytoscape.use(fcose as cytoscape.Ext);

const INCREMENTAL_NODE_BATCH_SIZE = 12;
const MAX_INCREMENTAL_ELEMENT_SYNC = 48;

type CytoscapeCollection = cytoscape.CollectionReturnValue;

type GraphElementDefinition = cytoscape.ElementDefinition;

interface GraphCanvasProps {
  snapshot: GraphSnapshot;
  colorForType: (type: string) => string;
  mode?: "full" | "compact";
  searchText?: string;
  selectedEntityTypes?: Set<string>;
  selectedRelationshipTypes?: Set<string>;
  minConfidence?: number;
  onNodeSelect?: (node: GraphNode | null) => void;
  onEdgeSelect?: (edge: GraphEdge | null) => void;
  onNodeOpen?: (node: GraphNode) => void;
  headerBadges?: ReactNode;
  toolbarControls?: ReactNode;
  fitTrigger?: number;
  relayoutTrigger?: number;
}

function getElementId(element: GraphElementDefinition) {
  return String(element.data?.id ?? "");
}

function isEdgeElement(element: GraphElementDefinition) {
  return typeof element.data?.source === "string" && typeof element.data?.target === "string";
}

function getCollectionLength(collection: unknown) {
  if (!collection || typeof collection !== "object") {
    return 0;
  }

  const length = (collection as { length?: unknown }).length;
  return typeof length === "number" ? length : 0;
}

function getCollectionIds(collection: unknown) {
  if (!collection || typeof collection !== "object") {
    return [] as string[];
  }

  if (typeof (collection as { map?: unknown }).map === "function") {
    return (collection as { map: (mapper: (element: { id: () => string }) => string) => string[] }).map((element) => element.id());
  }

  if (typeof (collection as { toArray?: unknown }).toArray === "function") {
    return (collection as { toArray: () => Array<{ id: () => string }> }).toArray().map((element) => element.id());
  }

  return [] as string[];
}

function supportsIncrementalSync(cy: cytoscape.Core) {
  const candidate = cy as unknown as Record<string, unknown>;
  return ["batch", "add", "collection", "$id", "extent"].every((method) => typeof candidate[method] === "function");
}

function waitForNextFrame() {
  return new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

function buildCollectionFromIds(cy: cytoscape.Core, ids: string[]) {
  const collection = cy.collection();
  ids.forEach((id) => {
    const element = cy.$id(id);
    if (element.length > 0) {
      collection.merge(element);
    }
  });
  return collection;
}

function getViewportCenter(cy: cytoscape.Core) {
  const extent = cy.extent();
  return {
    x: (extent.x1 + extent.x2) / 2,
    y: (extent.y1 + extent.y2) / 2,
  };
}

function seedBatchNodePositions(
  cy: cytoscape.Core,
  nodeBatch: GraphElementDefinition[],
  relatedEdges: GraphElementDefinition[],
) {
  const anchorAssignments = new Map<string, number>();
  const viewportCenter = getViewportCenter(cy);

  return nodeBatch.map((nodeDef, index) => {
    const nodeId = getElementId(nodeDef);
    const connectedEdges = relatedEdges.filter((edgeDef) => {
      const source = String(edgeDef.data?.source ?? "");
      const target = String(edgeDef.data?.target ?? "");
      return source === nodeId || target === nodeId;
    });

    const anchorId = connectedEdges
      .map((edgeDef) => {
        const source = String(edgeDef.data?.source ?? "");
        const target = String(edgeDef.data?.target ?? "");
        return source === nodeId ? target : source;
      })
      .find((candidateId) => candidateId.length > 0 && cy.$id(candidateId).length > 0) ?? "__viewport__";

    const anchorPosition = anchorId === "__viewport__"
      ? viewportCenter
      : cy.$id(anchorId).position();

    const slot = anchorAssignments.get(anchorId) ?? 0;
    anchorAssignments.set(anchorId, slot + 1);

    const siblingCount = Math.max(
      connectedEdges.length,
      anchorId === "__viewport__" ? 8 : 6,
    );
    const angleOffset = index % 2 === 0 ? 0 : Math.PI / siblingCount;
    const angle = ((Math.PI * 2) / siblingCount) * slot + angleOffset;
    const radius = anchorId === "__viewport__"
      ? 44 + (slot % 3) * 12
      : 56 + (slot % 3) * 12;

    return {
      ...nodeDef,
      position: {
        x: anchorPosition.x + Math.cos(angle) * radius,
        y: anchorPosition.y + Math.sin(angle) * radius,
      },
    } satisfies GraphElementDefinition;
  });
}

async function runLayout(
  target: cytoscape.Core | CytoscapeCollection,
  options: cytoscape.LayoutOptions,
) {
  await new Promise<void>((resolve) => {
    const layout = target.layout(options);
    if (typeof layout.one === "function") {
      layout.one("layoutstop", () => resolve());
    } else {
      resolve();
    }
    layout.run();
  });
}

function applyElementUpdates(cy: cytoscape.Core, nextElements: GraphElementDefinition[]) {
  cy.batch(() => {
    nextElements.forEach((element) => {
      const elementId = getElementId(element);
      const existing = cy.$id(elementId);
      if (existing.length === 0) {
        return;
      }

      existing.data(element.data ?? {});
      existing.classes(element.classes ?? "");
    });
  });
}

export function GraphCanvas({
  snapshot,
  colorForType,
  mode = "full",
  searchText,
  selectedEntityTypes,
  selectedRelationshipTypes,
  minConfidence,
  onNodeSelect,
  onEdgeSelect,
  onNodeOpen,
  headerBadges,
  toolbarControls,
  fitTrigger,
  relayoutTrigger,
}: GraphCanvasProps) {
  const cyRef = useRef<cytoscape.Core | null>(null);
  const interactionsAttached = useRef(false);
  const manualLayoutSelection = useRef(false);
  const syncRunRef = useRef(0);
  const lastLayoutFingerprintRef = useRef("");
  const [cyReady, setCyReady] = useState(false);
  const autoLayoutName = useMemo(() => chooseGraphLayout(snapshot), [snapshot]);
  const [layoutName, setLayoutName] = useState<string>(() => chooseGraphLayout(snapshot));
  const [defaultViewTrigger, setDefaultViewTrigger] = useState(0);
  const legendEntityTypes = useMemo(
    () => Array.from(new Set(snapshot.nodes.map((node) => node.type))).sort((left, right) => left.localeCompare(right)),
    [snapshot.nodes],
  );
  const legendRelationshipTypes = useMemo(
    () => Array.from(new Set(snapshot.edges.map((edge) => edge.type))).sort((left, right) => left.localeCompare(right)),
    [snapshot.edges],
  );

  const nodesById = useMemo(() => new Map(snapshot.nodes.map((node) => [node.id, node])), [snapshot.nodes]);
  const edgesById = useMemo(() => new Map(snapshot.edges.map((edge) => [edge.id, edge])), [snapshot.edges]);

  const elements = useMemo(
    () =>
      mapGraphSnapshotToElements(snapshot, colorForType, {
        searchText,
        selectedEntityTypes,
        selectedRelationshipTypes,
        minConfidence,
      }),
    [snapshot, colorForType, searchText, selectedEntityTypes, selectedRelationshipTypes, minConfidence],
  );

  const visibleNodeCount = elements.filter((element) => !element.data?.source).length;
  const visibleEdgeCount = elements.filter((element) => Boolean(element.data?.source)).length;
  const elementCount = visibleNodeCount + visibleEdgeCount;
  const layoutFingerprint = useMemo(
    () => `${layoutName}:${elements.map(getElementId).join("|")}`,
    [elements, layoutName],
  );

  const handleCyReady = useCallback(
    (cy: cytoscape.Core) => {
      cyRef.current = cy;
      if (!interactionsAttached.current) {
        attachInteractions(cy);
        interactionsAttached.current = true;
      }
      cy.resize();
      setCyReady(true);
    },
    [],
  );

  useEffect(() => {
    if (manualLayoutSelection.current) {
      return;
    }

    setLayoutName(autoLayoutName);
  }, [autoLayoutName]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || cy.destroyed()) {
      return;
    }

    const handleNodeTap = (event: cytoscape.EventObject) => {
      const node = nodesById.get(event.target.id()) ?? null;
      onNodeSelect?.(node);
      onEdgeSelect?.(null);
    };

    const handleEdgeTap = (event: cytoscape.EventObject) => {
      const edge = edgesById.get(event.target.id()) ?? null;
      onEdgeSelect?.(edge);
      onNodeSelect?.(null);
    };

    const handleBackgroundTap = (event: cytoscape.EventObject) => {
      if (event.target !== cy) return;
      onNodeSelect?.(null);
      onEdgeSelect?.(null);
    };

    const handleNodeDoubleTap = (event: cytoscape.EventObject) => {
      const node = nodesById.get(event.target.id());
      if (node) {
        onNodeOpen?.(node);
      }
    };

    cy.on("tap", "node", handleNodeTap);
    cy.on("tap", "edge", handleEdgeTap);
    cy.on("tap", handleBackgroundTap);
    cy.on("dbltap", "node", handleNodeDoubleTap);

    return () => {
      cy.off("tap", "node", handleNodeTap);
      cy.off("tap", "edge", handleEdgeTap);
      cy.off("tap", handleBackgroundTap);
      cy.off("dbltap", "node", handleNodeDoubleTap);
    };
  }, [nodesById, edgesById, onNodeOpen, onNodeSelect, onEdgeSelect]);

  useEffect(() => {
    const cyRefValue = cyRef.current;
    if (!cyReady || !cyRefValue || cyRefValue.destroyed()) {
      return;
    }
    const cy = cyRefValue;

    let cancelled = false;
    const runId = ++syncRunRef.current;
    const isActive = () => !cancelled && syncRunRef.current === runId && !cy.destroyed();

    async function syncGraphElements() {
      cy.resize();

      if (!supportsIncrementalSync(cy)) {
        return;
      }

      if (elements.length === 0) {
        cy.elements().remove();
        return;
      }

      const currentIds = new Set(getCollectionIds(cy.elements()));
      const nextIds = new Set(elements.map(getElementId));
      const addedElements = elements.filter((element) => !currentIds.has(getElementId(element)));
      const removedIds = [...currentIds].filter((id) => !nextIds.has(id));
      const existingElements = elements.filter((element) => currentIds.has(getElementId(element)));
      const shouldIncrementalSync =
        currentIds.size > 0 &&
        removedIds.length === 0 &&
        addedElements.length > 0 &&
        addedElements.length <= MAX_INCREMENTAL_ELEMENT_SYNC;

      applyElementUpdates(cy, existingElements);

      if (!isActive() || (addedElements.length === 0 && removedIds.length === 0)) {
        return;
      }

      if (!shouldIncrementalSync) {
        cy.batch(() => {
          cy.elements().remove();
          cy.add(elements);
        });

        if (!isActive()) {
          return;
        }

        await runLayout(
          cy,
          getLayoutOptions(layoutName, {
            randomize: true,
            elementCount,
          }),
        );

        if (!isActive()) {
          return;
        }

        cy.fit(undefined, 10);
        lastLayoutFingerprintRef.current = layoutFingerprint;
        return;
      }

      const pendingNodeElements = addedElements.filter((element) => !isEdgeElement(element));
      const pendingEdgeElements = addedElements.filter(isEdgeElement);
      const temporarilyLockedNodes = cy.nodes().filter((node) => !node.locked());
      temporarilyLockedNodes.lock();

      try {
        for (let start = 0; start < pendingNodeElements.length; start += INCREMENTAL_NODE_BATCH_SIZE) {
          if (!isActive()) {
            return;
          }

          const nodeBatch = pendingNodeElements.slice(start, start + INCREMENTAL_NODE_BATCH_SIZE);
          const seededNodeBatch = seedBatchNodePositions(cy, nodeBatch, pendingEdgeElements);
          const nodeBatchIds = seededNodeBatch.map(getElementId);

          cy.batch(() => {
            cy.add(seededNodeBatch);
          });

          const edgeBatch = pendingEdgeElements.filter((edge) => {
            const edgeId = getElementId(edge);
            if (cy.$id(edgeId).length > 0) {
              return false;
            }

            const sourceId = String(edge.data?.source ?? "");
            const targetId = String(edge.data?.target ?? "");
            const sourceExists = cy.$id(sourceId).length > 0;
            const targetExists = cy.$id(targetId).length > 0;

            return sourceExists && targetExists && (nodeBatchIds.includes(sourceId) || nodeBatchIds.includes(targetId));
          });

          if (edgeBatch.length > 0) {
            cy.batch(() => {
              cy.add(edgeBatch);
            });
          }

          const newElements = buildCollectionFromIds(cy, [
            ...nodeBatchIds,
            ...edgeBatch.map(getElementId),
          ]);

          if (newElements.length > 0) {
            newElements.nodes().unlock();
            const layoutScope = newElements.union(newElements.neighborhood());

            await runLayout(
              layoutScope,
              getIncrementalLayoutOptions(layoutName, {
                elementCount: cy.elements().length,
                subsetCount: layoutScope.nodes().length,
              }),
            );

            if (!isActive()) {
              return;
            }

            await runLayout(
              layoutScope,
              getMicroRelaxationLayoutOptions({
                elementCount: layoutScope.nodes().length,
              }),
            );
          }

          if (!isActive()) {
            return;
          }

          await waitForNextFrame();
        }

        const remainingEdges = pendingEdgeElements.filter((edge) => {
          const edgeId = getElementId(edge);
          if (cy.$id(edgeId).length > 0) {
            return false;
          }

          const sourceId = String(edge.data?.source ?? "");
          const targetId = String(edge.data?.target ?? "");
          return cy.$id(sourceId).length > 0 && cy.$id(targetId).length > 0;
        });

        if (remainingEdges.length > 0) {
          cy.batch(() => {
            cy.add(remainingEdges);
          });

          const newEdges = buildCollectionFromIds(cy, remainingEdges.map(getElementId));
          const layoutScope = newEdges.union(newEdges.connectedNodes()).union(newEdges.connectedNodes().neighborhood());

          await runLayout(
            layoutScope,
            getIncrementalLayoutOptions(layoutName, {
              elementCount: cy.elements().length,
              subsetCount: layoutScope.nodes().length,
            }),
          );

          if (!isActive()) {
            return;
          }

          await runLayout(
            layoutScope,
            getMicroRelaxationLayoutOptions({
              elementCount: layoutScope.nodes().length,
            }),
          );
        }

        lastLayoutFingerprintRef.current = layoutFingerprint;
      } finally {
        if (!cy.destroyed()) {
          temporarilyLockedNodes.unlock();
        }
      }
    }

    void syncGraphElements();

    return () => {
      cancelled = true;
    };
  }, [cyReady, elementCount, elements, layoutFingerprint, layoutName]);

  useEffect(() => {
    const cyRefValue = cyRef.current;
    if (!cyReady || !cyRefValue || cyRefValue.destroyed() || getCollectionLength(cyRefValue.elements()) === 0) {
      return;
    }
    const cy = cyRefValue;

    if (lastLayoutFingerprintRef.current === layoutFingerprint) {
      return;
    }

    let cancelled = false;

    async function relayoutGraph() {
      cy.resize();
      await runLayout(
        cy,
        getLayoutOptions(layoutName, {
          randomize: false,
          elementCount: cy.elements().length,
        }),
      );

      if (cancelled || cy.destroyed()) {
        return;
      }

      cy.fit(undefined, 10);
      lastLayoutFingerprintRef.current = layoutFingerprint;
    }

    void relayoutGraph();

    return () => {
      cancelled = true;
    };
  }, [cyReady, layoutFingerprint, layoutName]);

  const applyLayout = useCallback((name: string) => {
    manualLayoutSelection.current = true;
    setLayoutName(name);
  }, []);

  const zoomIn = useCallback(() => {
    const cy = cyRef.current;
    if (!cy || cy.destroyed()) return;
    cy.zoom({ level: cy.zoom() * 1.2, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
  }, []);

  const zoomOut = useCallback(() => {
    const cy = cyRef.current;
    if (!cy || cy.destroyed()) return;
    cy.zoom({ level: cy.zoom() / 1.2, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
  }, []);

  const fitGraph = useCallback(() => {
    const cy = cyRef.current;
    if (!cy || cy.destroyed()) return;
    cy.fit(undefined, 12);
  }, []);

  const resetDefaultView = useCallback(() => {
    manualLayoutSelection.current = false;
    setLayoutName(autoLayoutName);
    setDefaultViewTrigger((value) => value + 1);
  }, [autoLayoutName]);

  useEffect(() => {
    if (fitTrigger === undefined || fitTrigger === 0) return;
    fitGraph();
  }, [fitTrigger, fitGraph]);

  useEffect(() => {
    if (!relayoutTrigger || !cyReady) return;
    const cy = cyRef.current;
    if (!cy || cy.destroyed() || cy.elements().length === 0) return;
    const activeCy = cy;

    let cancelled = false;
    async function redistribute() {
      activeCy.resize();
      await runLayout(
        activeCy,
        getLayoutOptions(layoutName, {
          randomize: true,
          elementCount: activeCy.elements().length,
        }),
      );
      if (!cancelled && !activeCy.destroyed()) {
        activeCy.fit(undefined, 24);
        lastLayoutFingerprintRef.current = `${layoutName}:${activeCy.elements().map((el) => el.id()).join("|")}`;
      }
    }
    void redistribute();
    return () => { cancelled = true; };
  }, [relayoutTrigger, cyReady, layoutName]);

  useEffect(() => {
    if (!defaultViewTrigger || !cyReady) return;
    const cy = cyRef.current;
    if (!cy || cy.destroyed() || getCollectionLength(cy.elements()) === 0) return;
    const activeCy = cy;

    let cancelled = false;

    async function restoreDefaultView() {
      activeCy.resize();
      await runLayout(
        activeCy,
        getLayoutOptions(autoLayoutName, {
          randomize: true,
          elementCount: getCollectionLength(activeCy.elements()),
        }),
      );

      if (!cancelled && !activeCy.destroyed()) {
        activeCy.fit(undefined, 28);
        lastLayoutFingerprintRef.current = `${autoLayoutName}:${elements.map(getElementId).join("|")}`;
      }
    }

    void restoreDefaultView();
    return () => {
      cancelled = true;
    };
  }, [autoLayoutName, cyReady, defaultViewTrigger, elements]);

  return (
    <div className={mode === "compact" ? "lite-graph-canvas lite-graph-canvas-compact" : "lite-graph-canvas"} data-testid="graph-canvas-shell">
      {mode === "full" ? (
        <LiteGraphControls
          title="Graph Explorer"
          subtitle="Use the control bar for graph scope and the sidebar for filtering. The canvas stays clear for inspection."
          headerBadges={headerBadges}
          toolbarControls={toolbarControls}
          layoutName={layoutName}
          onLayoutChange={applyLayout}
          onDefaultView={resetDefaultView}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onFit={fitGraph}
          entityTypes={legendEntityTypes}
          relationshipTypes={legendRelationshipTypes}
          readLayer={snapshot.meta.readLayer}
          colorForType={colorForType}
        />
      ) : null}

      <div className="lite-graph-surface">
        <CytoscapeComponent
          elements={[]}
          stylesheet={cognitiveStylesheet}
          cy={handleCyReady}
          className="lite-graph-cytoscape"
          style={{ width: "100%", height: "100%" }}
          minZoom={0.05}
          maxZoom={3}
        />
      </div>
    </div>
  );
}
