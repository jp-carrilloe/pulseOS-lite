import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { KnowledgeBaseIndex } from "./retrieval.js";

async function createTempRepo() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "company-ops-kb-"));
  await fsp.mkdir(path.join(root, "000_Company_Memory", "102_Corporate_Strategy_and_Foundation"), { recursive: true });
  await fsp.mkdir(path.join(root, "202_Go-to-Market_Strategy"), { recursive: true });
  await fsp.mkdir(path.join(root, "001_Source_Intake", "Data_Souces_Folder"), { recursive: true });

  await fsp.writeFile(
    path.join(root, "000_Company_Memory", "102_Corporate_Strategy_and_Foundation", "102.5_Pricing_Analysis.md"),
    `# Pricing Analysis

**Status:** Active
- **Owner Agent:** @Strategy

This document explains the company's pricing approach, packaging, and commercial model for strategic planning.
`,
  );

  await fsp.writeFile(
    path.join(root, "202_Go-to-Market_Strategy", "202.1_GTM_Strategy.md"),
    `# GTM Strategy

**Status:** Active
- **Owner Agent:** @GTM

This document covers acquisition channels, target motion, campaign sequencing, and positioning.
`,
  );

  await fsp.writeFile(
    path.join(root, "001_Source_Intake", "Data_Souces_Folder", "raw-notes.md"),
    `# Raw Notes

These should never be included in the curated knowledge-base index.
`,
  );

  return root;
}

test("indexes curated markdown docs and excludes source intake", async () => {
  const repoRoot = await createTempRepo();
  const dbPath = path.join(repoRoot, ".kb.sqlite");
  const index = new KnowledgeBaseIndex({ repoRoot, dbPath, env: {} });

  const result = await index.sync();
  assert.equal(result.fileCount, 2);
  assert.deepEqual(index.listFiles(), [
    "000_Company_Memory/102_Corporate_Strategy_and_Foundation/102.5_Pricing_Analysis.md",
    "202_Go-to-Market_Strategy/202.1_GTM_Strategy.md",
  ]);

  const status = index.getStatus();
  assert.equal(status.indexedDocuments, 2);
  assert.equal(status.embeddingMode, "heuristic");
  assert.equal(status.embeddingModel, "heuristic-hash-v1");

  index.close();
});

test("reindex updates documents without duplicating rows", async () => {
  const repoRoot = await createTempRepo();
  const dbPath = path.join(repoRoot, ".kb.sqlite");
  const index = new KnowledgeBaseIndex({ repoRoot, dbPath, env: {} });

  await index.sync();
  await fsp.writeFile(
    path.join(repoRoot, "000_Company_Memory", "102_Corporate_Strategy_and_Foundation", "102.5_Pricing_Analysis.md"),
    `# Pricing Analysis

**Status:** Active
- **Owner Agent:** @Strategy

This document now focuses on enterprise packaging, retained value pricing, and annual contract options.
`,
  );

  const result = await index.sync();
  assert.equal(result.fileCount, 2);
  assert.equal(index.getDocumentCount(), 2);

  const promptContext = await index.buildPromptContext("enterprise pricing and packaging");
  assert.match(promptContext, /enterprise packaging/i);

  index.close();
});

test("heuristic retrieval finds the most relevant KB document", async () => {
  const repoRoot = await createTempRepo();
  const dbPath = path.join(repoRoot, ".kb.sqlite");
  const index = new KnowledgeBaseIndex({ repoRoot, dbPath, env: {} });

  await index.ensureCurrent();
  const matches = await index.retrieve("How does our pricing and packaging work?");

  assert.equal(matches[0]?.document.relativePath, "000_Company_Memory/102_Corporate_Strategy_and_Foundation/102.5_Pricing_Analysis.md");
  assert.ok(matches[0]?.score >= matches[1]?.score);

  index.close();
});

test("ensureCurrent rebuilds when stored embedding model drifts from the configured mode", async () => {
  const repoRoot = await createTempRepo();
  const dbPath = path.join(repoRoot, ".kb.sqlite");
  const index = new KnowledgeBaseIndex({ repoRoot, dbPath, env: {} });

  const firstRun = await index.sync();
  assert.equal(firstRun.embeddingModel, "heuristic-hash-v1");
  index.close();

  const db = new DatabaseSync(dbPath);
  db.prepare(`UPDATE knowledge_vectors SET model = 'text-embedding-3-small'`).run();
  db.close();

  const reloadedIndex = new KnowledgeBaseIndex({ repoRoot, dbPath, env: {} });
  const secondRun = await reloadedIndex.ensureCurrent();
  assert.equal(secondRun.embeddingModel, "heuristic-hash-v1");
  assert.equal(reloadedIndex.getStatus().embeddingModel, "heuristic-hash-v1");

  reloadedIndex.close();
});
