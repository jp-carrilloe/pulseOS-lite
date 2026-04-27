import assert from "node:assert/strict";
import test from "node:test";

import { toGraphSnapshot } from "./frontend/src/lib/graph-snapshot.js";
import type { ApiKnowledgeGraphSnapshot } from "./frontend/src/types/graph.js";

function buildSampleGraph(): ApiKnowledgeGraphSnapshot {
  return {
    generatedAt: "2026-04-27T00:00:00.000Z",
    stats: { documents: 3, folders: 3, references: 2 },
    nodes: [
      { id: "folder:root", type: "folder", label: "000_Company_Memory", path: "000_Company_Memory", parentId: null, documentCount: 3 },
      { id: "folder:strategy", type: "folder", label: "102_Strategy", path: "000_Company_Memory/102_Strategy", parentId: "folder:root", documentCount: 2 },
      { id: "folder:sales", type: "folder", label: "203_Sales", path: "000_Company_Memory/203_Sales", parentId: "folder:root", documentCount: 1 },
      { id: "document:pricing", type: "document", label: "Pricing", path: "000_Company_Memory/102_Strategy/Pricing.md", parentId: "folder:strategy", summary: "Pricing summary" },
      { id: "document:gtm", type: "document", label: "GTM", path: "000_Company_Memory/102_Strategy/GTM.md", parentId: "folder:strategy", summary: "GTM summary" },
      { id: "document:deck", type: "document", label: "Sales Deck", path: "000_Company_Memory/203_Sales/Deck.md", parentId: "folder:sales", summary: "Deck summary" },
    ],
    edges: [
      { id: "contains-root-strategy", type: "CONTAINS", source: "folder:root", target: "folder:strategy", label: "contains" },
      { id: "contains-root-sales", type: "CONTAINS", source: "folder:root", target: "folder:sales", label: "contains" },
      { id: "contains-strategy-pricing", type: "CONTAINS", source: "folder:strategy", target: "document:pricing", label: "contains" },
      { id: "contains-strategy-gtm", type: "CONTAINS", source: "folder:strategy", target: "document:gtm", label: "contains" },
      { id: "contains-sales-deck", type: "CONTAINS", source: "folder:sales", target: "document:deck", label: "contains" },
      { id: "ref-pricing-gtm", type: "REFERENCES", source: "document:pricing", target: "document:gtm", label: "references" },
      { id: "ref-pricing-deck", type: "REFERENCES", source: "document:pricing", target: "document:deck", label: "references" },
    ],
  };
}

test("document mode includes only document nodes and reference edges", () => {
  const snapshot = toGraphSnapshot(buildSampleGraph(), "documents");
  assert.deepEqual(
    snapshot.nodes.map((node) => node.id).sort(),
    ["document:deck", "document:gtm", "document:pricing"],
  );
  assert.deepEqual(
    snapshot.edges.map((edge) => edge.id).sort(),
    ["ref-pricing-deck", "ref-pricing-gtm"],
  );
});

test("ontology mode includes folder hierarchy by default", () => {
  const snapshot = toGraphSnapshot(buildSampleGraph(), "ontology");
  assert.deepEqual(
    snapshot.nodes.map((node) => node.id).sort(),
    ["folder:root", "folder:sales", "folder:strategy"],
  );
  assert.deepEqual(
    snapshot.edges.map((edge) => edge.id).sort(),
    ["contains-root-sales", "contains-root-strategy"],
  );
});

test("ontology folder focus includes local documents and directly related documents", () => {
  const snapshot = toGraphSnapshot(buildSampleGraph(), "ontology", "folder:strategy");
  assert.deepEqual(
    snapshot.nodes.map((node) => node.id).sort(),
    ["document:deck", "document:gtm", "document:pricing", "folder:root", "folder:sales", "folder:strategy"],
  );
  assert.deepEqual(
    snapshot.edges.map((edge) => edge.id).sort(),
    [
      "contains-root-sales",
      "contains-root-strategy",
      "contains-sales-deck",
      "contains-strategy-gtm",
      "contains-strategy-pricing",
      "ref-pricing-deck",
      "ref-pricing-gtm",
    ],
  );
});

test("ontology document focus keeps folder context and related documents", () => {
  const snapshot = toGraphSnapshot(buildSampleGraph(), "ontology", "document:pricing");
  assert.deepEqual(
    snapshot.nodes.map((node) => node.id).sort(),
    ["document:deck", "document:gtm", "document:pricing", "folder:root", "folder:sales", "folder:strategy"],
  );
  assert.deepEqual(
    snapshot.edges.map((edge) => edge.id).sort(),
    [
      "contains-root-sales",
      "contains-root-strategy",
      "contains-sales-deck",
      "contains-strategy-gtm",
      "contains-strategy-pricing",
      "ref-pricing-deck",
      "ref-pricing-gtm",
    ],
  );
});

test("graph snapshot transformation does not throw for supported focus states", () => {
  const source = buildSampleGraph();
  assert.doesNotThrow(() => toGraphSnapshot(source, "ontology", "folder:strategy"));
  assert.doesNotThrow(() => toGraphSnapshot(source, "ontology", "document:pricing"));
  assert.doesNotThrow(() => toGraphSnapshot(source, "documents", "document:pricing"));
});
