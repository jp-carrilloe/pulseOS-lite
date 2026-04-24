import cytoscape from "cytoscape";
import type { GraphEdge, GraphNode, GraphRowLayer, GraphSnapshot } from "../../types/graph";

const RING: Record<string, { width: number; style: string; opacity: number }> = {
  person: { width: 2.5, style: "double", opacity: 0.9 },
  organization: { width: 2, style: "dashed", opacity: 0.8 },
  department: { width: 2, style: "dashed", opacity: 0.8 },
  project: { width: 1.5, style: "solid", opacity: 0.85 },
  taxonomy_domain: { width: 1.5, style: "dotted", opacity: 0.85 },
  document: { width: 1, style: "solid", opacity: 0.7 },
};

const EDGE_COLORS: Record<string, string> = {
  CONTAINS: "rgba(242, 194, 106, 0.46)",
  REFERENCES: "rgba(148, 163, 184, 0.62)",
};

function buildTypeSelectors(): cytoscape.StylesheetStyle[] {
  return Object.entries(RING).map(([type, ring]) => ({
    selector: `node[type="${type}"]`,
    style: {
      "border-width": ring.width,
      "border-style": ring.style,
      "border-opacity": ring.opacity,
    } as unknown as cytoscape.Css.Node,
  }));
}

export const cognitiveStylesheet: cytoscape.StylesheetStyle[] = [
  {
    selector: "node",
    style: {
      label: "data(label)",
      width: "data(size)",
      height: "data(size)",
      "background-color": "data(color)",
      "background-opacity": 0.4,
      "border-width": 1.5,
      "border-color": "data(color)",
      "border-opacity": 0.8,
      "underlay-color": "data(color)",
      "underlay-padding": 10,
      "underlay-opacity": 0.1,
      "underlay-shape": "ellipse",
      "text-valign": "bottom",
      "text-halign": "center",
      "font-size": "10px",
      "font-family": "monospace",
      "font-weight": "500",
      color: "#94a3b8",
      "text-opacity": 0.92,
      "text-margin-y": 8,
      "text-outline-color": "#0a0c12",
      "text-outline-width": 2.5,
      "text-outline-opacity": 0.9,
      "text-max-width": "100px",
      "text-wrap": "ellipsis",
      "transition-property":
        "width, height, background-opacity, border-width, border-opacity, underlay-opacity, underlay-padding, text-opacity, opacity",
      "transition-duration": "350ms",
      "transition-timing-function": "ease-in-out-sine",
    } as unknown as cytoscape.Css.Node,
  },
  ...buildTypeSelectors(),
  {
    selector: 'node[type="document"]',
    style: {
      "font-size": "8px",
      "text-max-width": "78px",
      "text-opacity": 0,
      "background-opacity": 0.32,
      "underlay-padding": 4,
      "underlay-opacity": 0.06,
    } as unknown as cytoscape.Css.Node,
  },
  {
    selector: "node.hover",
    style: {
      "background-opacity": 0.55,
      "border-opacity": 1,
      "underlay-opacity": 0.2,
      "underlay-padding": 16,
      "text-opacity": 1,
      "z-index": 10,
    } as unknown as cytoscape.Css.Node,
  },
  {
    selector: "node.neighbor-highlight",
    style: {
      "background-opacity": 0.4,
      "border-opacity": 0.85,
      "underlay-opacity": 0.14,
      "text-opacity": 0.72,
    } as unknown as cytoscape.Css.Node,
  },
  {
    selector: 'node[type="document"].show-labels',
    style: {
      "text-opacity": 0,
    } as unknown as cytoscape.Css.Node,
  },
  {
    selector: 'node[type="document"].hover, node[type="document"].neighbor-highlight, node[type="document"]:selected',
    style: {
      "text-opacity": 1,
    } as unknown as cytoscape.Css.Node,
  },
  {
    selector: "node.dimmed",
    style: {
      "background-opacity": 0.1,
      "border-opacity": 0.2,
      "underlay-opacity": 0.02,
      "text-opacity": 0,
      opacity: 0.45,
    } as unknown as cytoscape.Css.Node,
  },
  {
    selector: "node:selected",
    style: {
      "background-opacity": 0.3,
      "border-width": 2.5,
      "border-color": "#38bdf8",
      "border-opacity": 1,
      "underlay-color": "#38bdf8",
      "underlay-padding": 18,
      "underlay-opacity": 0.1,
      "text-opacity": 1,
      "z-index": 1000,
    } as unknown as cytoscape.Css.Node,
  },
  {
    selector: "node.show-labels",
    style: {
      "text-opacity": 0.92,
    } as unknown as cytoscape.Css.Node,
  },
  {
    selector: "node.graph-layer-seed",
    style: {
      "border-style": "dashed",
      "border-width": 2,
      "border-color": "#cbd5e1",
      "background-opacity": 0.28,
      "underlay-opacity": 0.05,
    } as unknown as cytoscape.Css.Node,
  },
  {
    selector: "node.graph-layer-evidence",
    style: {
      "background-opacity": 0.48,
      "border-style": "double",
      "border-width": 2.5,
      "border-color": "#60a5fa",
      "underlay-opacity": 0.12,
      "underlay-padding": 18,
    } as unknown as cytoscape.Css.Node,
  },
  {
    selector: "edge",
    style: {
      width: "data(width)",
      "line-color": "data(color)",
      "target-arrow-color": "data(color)",
      "target-arrow-shape": "triangle",
      "curve-style": "bezier",
      "line-opacity": 0.58,
      "arrow-scale": 0.72,
      label: "data(label)",
      "font-size": "7px",
      color: "#cbd5e1",
      "text-opacity": 0,
      "text-rotation": "autorotate",
      "text-background-color": "#020617",
      "text-background-opacity": 0.9,
      "text-background-padding": 2,
      "transition-property": "line-opacity, width, text-opacity, opacity",
      "transition-duration": "250ms",
      "transition-timing-function": "ease-in-out-sine",
    } as unknown as cytoscape.Css.Edge,
  },
  {
    selector: 'edge[type="REFERENCES"]',
    style: {
      width: 1.2,
      "line-style": "solid",
      "target-arrow-shape": "none",
      "curve-style": "straight",
      "line-opacity": 0.68,
    } as unknown as cytoscape.Css.Edge,
  },
  {
    selector: 'edge[type="CONTAINS"]',
    style: {
      width: 1,
      "line-style": "solid",
      "line-opacity": 0.34,
      "target-arrow-shape": "triangle",
    } as unknown as cytoscape.Css.Edge,
  },
  {
    selector: "edge.highlight",
    style: {
      width: 2.2,
      opacity: 0.96,
      "line-opacity": 0.96,
      "text-opacity": 0.85,
    } as unknown as cytoscape.Css.Edge,
  },
  {
    selector: "edge.dimmed",
    style: {
      "line-opacity": 0.05,
      opacity: 0.2,
      "text-opacity": 0,
    } as unknown as cytoscape.Css.Edge,
  },
  {
    selector: "edge:selected",
    style: {
      "line-color": "#38bdf8",
      "target-arrow-color": "#38bdf8",
      width: 2,
      "line-opacity": 1,
      "text-opacity": 0.9,
      "z-index": 1000,
    } as unknown as cytoscape.Css.Edge,
  },
  {
    selector: "edge.graph-layer-seed",
    style: {
      "line-style": "dashed",
      opacity: 0.3,
      "line-opacity": 0.3,
    } as unknown as cytoscape.Css.Edge,
  },
  {
    selector: "edge.graph-layer-evidence",
    style: {
      "line-style": "dotted",
      opacity: 0.7,
      "line-opacity": 0.7,
    } as cytoscape.Css.Edge,
  },
];

export function attachInteractions(cy: cytoscape.Core) {
  let isHovering = false;

  cy.on("mouseover", "node", (event) => {
    isHovering = true;
    const node = event.target;
    const neighborhood = node.neighborhood();

    const origW = node.data("size") ?? 36;
    node.style({ width: origW * 1.12, height: origW * 1.12 });

    cy.elements().addClass("dimmed");
    node.removeClass("dimmed").addClass("hover");
    neighborhood.nodes().removeClass("dimmed").addClass("neighbor-highlight");
    neighborhood.edges().removeClass("dimmed").addClass("highlight");
    node.connectedEdges().removeClass("dimmed").addClass("highlight");
  });

  cy.on("mouseout", "node", (event) => {
    isHovering = false;
    const node = event.target;

    const origW = node.data("size") ?? 36;
    node.style({ width: origW, height: origW });

    cy.elements().removeClass("dimmed hover neighbor-highlight highlight");
  });

  cy.on("tap", "node", (event) => {
    const node = event.target;
    cy.animate({
      center: { eles: node },
      duration: 300,
      easing: "ease-in-out-sine",
    } as unknown as cytoscape.AnimateOptions);
  });

  const updateLabels = () => {
    if (cy.zoom() > 1.1 || isHovering) {
      cy.nodes().addClass("show-labels");
      return;
    }
    cy.nodes().removeClass("show-labels");
  };

  cy.on("zoom", updateLabels);
  updateLabels();
}

export function computeNodeSize(
  entityId: string,
  relationships: Array<{ source?: string; target?: string }>,
  confidence = 1,
  baseSize = 40,
  maxSize = 72,
  degreeStep = 5,
) {
  const degree = relationships.filter((relationship) => relationship.source === entityId || relationship.target === entityId).length;
  return Math.min(baseSize + degree * degreeStep + confidence * 3, maxSize);
}

function computeEdgeWidth(confidence: number): number {
  return 0.7 + confidence * 1;
}

export const GRAPH_LAYOUTS = [
  { name: "fcose", label: "Clustered", icon: "⚡" },
  { name: "concentric", label: "Radial", icon: "◎" },
  { name: "breadthfirst", label: "Hierarchy", icon: "🌳" },
  { name: "circle", label: "Circle", icon: "⭕" },
  { name: "grid", label: "Grid", icon: "⊞" },
] as const;

export function chooseGraphLayout(snapshot: GraphSnapshot): (typeof GRAPH_LAYOUTS)[number]["name"] {
  const nodeCount = snapshot.nodes.length;
  const edgeCount = snapshot.edges.length;

  if (nodeCount >= 300 || edgeCount >= 900) {
    return "grid";
  }

  if (nodeCount >= 140 || edgeCount >= 360) {
    return "concentric";
  }

  return "fcose";
}

type LayoutSizingOptions = {
  randomize?: boolean;
  elementCount?: number;
};

type IncrementalLayoutOptions = {
  elementCount?: number;
  subsetCount?: number;
};

function getGraphScale(elementCount: number) {
  return {
    largeGraph: elementCount >= 500,
    mediumGraph: elementCount >= 180,
  };
}

function createRadialScore(node: cytoscape.NodeSingular) {
  const degree = node.degree(false) as number;
  const confidence = (node.data("confidence") as number) ?? 0.5;
  return degree * 2 + confidence * 3;
}

export function getLayoutOptions(
  name: string,
  options?: LayoutSizingOptions,
): cytoscape.LayoutOptions {
  const randomize = options?.randomize ?? false;
  const elementCount = options?.elementCount ?? 0;
  const { largeGraph, mediumGraph } = getGraphScale(elementCount);

  if (name === "fcose") {
    return {
      name,
      animate: !mediumGraph,
      animationDuration: mediumGraph ? 0 : 700,
      animationEasing: "ease-out",
      quality: largeGraph ? "default" : "proof",
      randomize,
      nodeDimensionsIncludeLabels: false,
      idealEdgeLength: largeGraph ? 240 : mediumGraph ? 205 : 170,
      nodeRepulsion: largeGraph ? 28000 : mediumGraph ? 22000 : 16000,
      edgeElasticity: largeGraph ? 0.08 : 0.18,
      gravity: largeGraph ? 0.05 : mediumGraph ? 0.08 : 0.11,
      gravityCompound: 0.55,
      gravityRange: largeGraph ? 11.5 : 9.2,
      numIter: largeGraph ? 1400 : mediumGraph ? 1800 : 2800,
      fit: true,
      padding: 64,
      nodeOverlap: 120,
      nodeSeparation: largeGraph ? 120 : mediumGraph ? 100 : 86,
    } as unknown as cytoscape.LayoutOptions;
  }

  if (name === "concentric") {
    return {
      name,
      animate: !largeGraph,
      animationDuration: largeGraph ? 0 : 500,
      nodeDimensionsIncludeLabels: true,
      minNodeSpacing: largeGraph ? 42 : mediumGraph ? 52 : 62,
      avoidOverlap: true,
      preventOverlap: true,
      equidistant: false,
      concentric: createRadialScore,
      levelWidth: () => 2,
      fit: true,
      padding: 10,
    } as unknown as cytoscape.LayoutOptions;
  }

  if (name === "breadthfirst") {
    return {
      name,
      animate: !largeGraph,
      animationDuration: largeGraph ? 0 : 500,
      spacingFactor: largeGraph ? 1.05 : 1.18,
      nodeDimensionsIncludeLabels: true,
      avoidOverlap: true,
      fit: true,
      padding: 10,
    } as unknown as cytoscape.LayoutOptions;
  }

  if (name === "circle") {
    return {
      name,
      animate: !largeGraph,
      animationDuration: largeGraph ? 0 : 500,
      nodeDimensionsIncludeLabels: true,
      spacingFactor: largeGraph ? 1.05 : 1.18,
      avoidOverlap: true,
      fit: true,
      padding: 10,
    } as cytoscape.LayoutOptions;
  }

  return {
    name: name as "grid",
    animate: !largeGraph,
    animationDuration: largeGraph ? 0 : 500,
    nodeDimensionsIncludeLabels: true,
    avoidOverlap: true,
    fit: true,
    padding: 10,
  } as cytoscape.LayoutOptions;
}

export function getIncrementalLayoutOptions(
  name: string,
  options?: IncrementalLayoutOptions,
): cytoscape.LayoutOptions {
  const elementCount = options?.elementCount ?? 0;
  const subsetCount = options?.subsetCount ?? 0;
  const { largeGraph, mediumGraph } = getGraphScale(elementCount);
  const denseSubset = subsetCount >= 18;

  if (name === "fcose") {
    return {
      name,
      animate: true,
      animationDuration: denseSubset ? 120 : 180,
      animationEasing: "ease-out",
      quality: "default",
      randomize: false,
      fit: false,
      nodeDimensionsIncludeLabels: true,
      idealEdgeLength: largeGraph ? 185 : mediumGraph ? 168 : 146,
      nodeRepulsion: largeGraph ? 18500 : mediumGraph ? 14500 : 11000,
      edgeElasticity: 0.16,
      gravity: denseSubset ? 0.12 : 0.15,
      gravityCompound: 0.68,
      gravityRange: 7.4,
      numIter: denseSubset ? 320 : 240,
      nodeOverlap: denseSubset ? 96 : 78,
      nodeSeparation: denseSubset ? 88 : 70,
      padding: 14,
    } as unknown as cytoscape.LayoutOptions;
  }

  if (name === "concentric") {
    return {
      name,
      animate: true,
      animationDuration: 160,
      fit: false,
      nodeDimensionsIncludeLabels: true,
      avoidOverlap: true,
      preventOverlap: true,
      minNodeSpacing: denseSubset ? 62 : 48,
      equidistant: true,
      concentric: createRadialScore,
      levelWidth: () => 2,
      padding: 8,
    } as unknown as cytoscape.LayoutOptions;
  }

  if (name === "breadthfirst") {
    return {
      name,
      animate: true,
      animationDuration: 140,
      fit: false,
      nodeDimensionsIncludeLabels: true,
      avoidOverlap: true,
      spacingFactor: denseSubset ? 1.18 : 1.05,
      padding: 8,
    } as unknown as cytoscape.LayoutOptions;
  }

  if (name === "circle") {
    return {
      name,
      animate: true,
      animationDuration: 140,
      fit: false,
      nodeDimensionsIncludeLabels: true,
      avoidOverlap: true,
      spacingFactor: denseSubset ? 1.18 : 1.05,
      padding: 8,
    } as cytoscape.LayoutOptions;
  }

  return {
    name: "grid",
    animate: true,
    animationDuration: 120,
    fit: false,
    avoidOverlap: true,
    nodeDimensionsIncludeLabels: true,
    padding: 8,
  } as cytoscape.LayoutOptions;
}

export function getMicroRelaxationLayoutOptions(
  options?: { elementCount?: number },
): cytoscape.LayoutOptions {
  const elementCount = options?.elementCount ?? 0;
  const denseSubset = elementCount >= 18;

  return {
    name: "fcose",
    animate: true,
    animationDuration: 120,
    animationEasing: "ease-out",
    quality: "default",
    randomize: false,
    fit: false,
    nodeDimensionsIncludeLabels: true,
    idealEdgeLength: denseSubset ? 146 : 124,
    nodeRepulsion: denseSubset ? 12800 : 9200,
    edgeElasticity: 0.14,
    gravity: 0.16,
    gravityCompound: 0.72,
    gravityRange: 6.5,
    numIter: 160,
    nodeOverlap: 84,
    nodeSeparation: denseSubset ? 74 : 58,
    padding: 10,
  } as unknown as cytoscape.LayoutOptions;
}

export interface GraphElementData {
  id: string;
  label: string;
  color: string;
  type?: string;
  entityType?: string;
  size?: number;
  width?: number;
  source?: string;
  target?: string;
  graphLayer?: GraphRowLayer;
  confidence?: number;
}

export function mapGraphSnapshotToElements(
  snapshot: GraphSnapshot,
  colorForType: (type: string) => string,
  filters?: {
    searchText?: string;
    selectedEntityTypes?: Set<string>;
    selectedRelationshipTypes?: Set<string>;
    minConfidence?: number;
  },
): cytoscape.ElementDefinition[] {
  const minConfidence = filters?.minConfidence ?? 0;
  const searchText = filters?.searchText?.trim().toLowerCase() ?? "";

  const visibleNodes = snapshot.nodes.filter((node) => {
    if (filters?.selectedEntityTypes && filters.selectedEntityTypes.size > 0 && !filters.selectedEntityTypes.has(node.type)) {
      return false;
    }
    if (node.confidence < minConfidence) {
      return false;
    }
    if (searchText && !`${node.label} ${node.type}`.toLowerCase().includes(searchText)) {
      return false;
    }
    return true;
  });
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));

  const visibleEdges = snapshot.edges.filter((edge) => {
    if (!visibleNodeIds.has(edge.source) || !visibleNodeIds.has(edge.target)) {
      return false;
    }
    if (filters?.selectedRelationshipTypes && filters.selectedRelationshipTypes.size > 0 && !filters.selectedRelationshipTypes.has(edge.type)) {
      return false;
    }
    if (edge.confidence < minConfidence) {
      return false;
    }
    if (searchText && !`${edge.type} ${edge.source} ${edge.target}`.toLowerCase().includes(searchText)) {
      return false;
    }
    return true;
  });

  const relationshipsForSizing = visibleEdges.map((edge) => ({ source: edge.source, target: edge.target }));
  const denseDocumentGraph = visibleNodes.length >= 45 && visibleNodes.every((node) => node.type === "document");

  const nodes = visibleNodes.map((node) => ({
    classes: node.graphLayer && node.graphLayer !== "canonical" ? `graph-layer-${node.graphLayer}` : undefined,
    data: {
      id: node.id,
      label: node.label,
      color: colorForType(node.type),
      type: node.type.toLowerCase(),
      entityType: node.type,
      size:
        node.type === "document"
          ? computeNodeSize(node.id, relationshipsForSizing, node.confidence, denseDocumentGraph ? 12 : 16, denseDocumentGraph ? 21 : 28, denseDocumentGraph ? 0.85 : 1.2)
          : computeNodeSize(node.id, relationshipsForSizing, node.confidence, 24, 42, 1.2),
      graphLayer: node.graphLayer,
      confidence: node.confidence,
    } satisfies GraphElementData,
  }));

  const edges = visibleEdges.map((edge) => ({
    classes: edge.graphLayer && edge.graphLayer !== "canonical" ? `graph-layer-${edge.graphLayer}` : undefined,
    data: {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.type,
      type: edge.type,
      color: EDGE_COLORS[edge.type] ?? "rgba(148, 163, 184, 0.52)",
      width: computeEdgeWidth(edge.confidence),
      graphLayer: edge.graphLayer,
      confidence: edge.confidence,
    } satisfies GraphElementData,
  }));

  return [...nodes, ...edges];
}
