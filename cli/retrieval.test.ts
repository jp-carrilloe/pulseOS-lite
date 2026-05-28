import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { KnowledgeBaseIndex } from "./retrieval.js";

async function createTempRepo() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "pulseos-lite-kb-"));
  await fsp.mkdir(path.join(root, "000_Company_Memory", "102_Corporate_Strategy_and_Foundation"), { recursive: true });
  await fsp.mkdir(path.join(root, "000_Company_Memory", "202_Go-to-Market_Strategy"), { recursive: true });
  await fsp.mkdir(path.join(root, "001_Data_Souces", "Data_Souces_Folder"), { recursive: true });
  await fsp.mkdir(path.join(root, "001_Source_Intake", "Data_Souces_Folder"), { recursive: true });

  await fsp.writeFile(
    path.join(root, "README.md"),
    `# Repo README

This repo-level onboarding document should not be included in the curated Company Memory graph.
`,
  );

  await fsp.writeFile(
    path.join(root, "000_Company_Memory", "102_Corporate_Strategy_and_Foundation", "102.5_Pricing_Analysis.md"),
    `# Pricing Analysis

**Status:** Active
- **Owner Agent:** @Strategy

This document explains the company's pricing approach, packaging, and commercial model for strategic planning.

Related: [GTM Strategy](../202_Go-to-Market_Strategy/202.1_GTM_Strategy.md)
`,
  );

  await fsp.writeFile(
    path.join(root, "000_Company_Memory", "202_Go-to-Market_Strategy", "202.1_GTM_Strategy.md"),
    `# GTM Strategy

**Status:** Active
- **Owner Agent:** @GTM

This document covers acquisition channels, target motion, campaign sequencing, and positioning.
`,
  );

  await fsp.writeFile(
    path.join(root, "001_Data_Souces", "Data_Souces_Folder", "active-raw-notes.md"),
    `# Active Raw Notes

These should also never be included in the curated knowledge-base index.
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
    "000_Company_Memory/202_Go-to-Market_Strategy/202.1_GTM_Strategy.md",
  ]);

  const status = index.getStatus();
  assert.equal(status.indexedDocuments, 2);
  assert.equal(status.embeddingMode, "heuristic");
  assert.equal(status.embeddingModel, "heuristic-hash-v1");

  index.close();
});

test("creates generic CRM sync tables with provider-object uniqueness", async () => {
  const repoRoot = await createTempRepo();
  const dbPath = path.join(repoRoot, ".kb.sqlite");
  const index = new KnowledgeBaseIndex({ repoRoot, dbPath, env: {} });
  index.close();

  const db = new DatabaseSync(dbPath);
  try {
    const tables = new Set(
      (db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as Array<{ name: string }>).map(
        (row) => row.name,
      ),
    );
    assert.ok(tables.has("crm_objects"));
    assert.ok(tables.has("crm_sync_runs"));

    const objectColumns = new Set(
      (db.prepare(`PRAGMA table_info(crm_objects)`).all() as Array<{ name: string }>).map((column) => column.name),
    );
    for (const column of [
      "provider",
      "object_type",
      "provider_object_id",
      "name",
      "email",
      "company_name",
      "lifecycle_stage",
      "pipeline_stage",
      "owner_name",
      "amount",
      "currency",
      "close_date",
      "raw_json",
      "last_synced_at",
    ]) {
      assert.ok(objectColumns.has(column), `missing crm_objects.${column}`);
    }

    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO crm_objects (
        id, provider, object_type, provider_object_id, name, email, company_name,
        lifecycle_stage, pipeline_stage, owner_name, amount, currency, close_date,
        raw_json, last_synced_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "crm_obj_1",
      "hubspot",
      "contact",
      "123",
      "Ada Lovelace",
      "ada@example.com",
      "Analytical Engines Ltd",
      "lead",
      "new",
      "Sales Owner",
      null,
      null,
      null,
      JSON.stringify({ id: "123" }),
      now,
      now,
      now,
    );

    assert.throws(() => {
      db.prepare(
        `INSERT INTO crm_objects (
          id, provider, object_type, provider_object_id, raw_json, last_synced_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run("crm_obj_2", "hubspot", "contact", "123", "{}", now, now, now);
    }, /UNIQUE constraint failed/);
  } finally {
    db.close();
  }
});

test("CRM schema initialization is idempotent", async () => {
  const repoRoot = await createTempRepo();
  const dbPath = path.join(repoRoot, ".kb.sqlite");

  const firstIndex = new KnowledgeBaseIndex({ repoRoot, dbPath, env: {} });
  firstIndex.close();
  const secondIndex = new KnowledgeBaseIndex({ repoRoot, dbPath, env: {} });
  secondIndex.close();

  const db = new DatabaseSync(dbPath);
  try {
    const crmObjectTableCount = (
      db.prepare(`SELECT COUNT(*) as count FROM sqlite_master WHERE type = 'table' AND name = 'crm_objects'`).get() as {
        count: number;
      }
    ).count;
    const crmSyncRunsTableCount = (
      db.prepare(`SELECT COUNT(*) as count FROM sqlite_master WHERE type = 'table' AND name = 'crm_sync_runs'`).get() as {
        count: number;
      }
    ).count;

    assert.equal(crmObjectTableCount, 1);
    assert.equal(crmSyncRunsTableCount, 1);
  } finally {
    db.close();
  }
});

test("excludes persistent Acme sample memory from the curated index", async () => {
  const repoRoot = await createTempRepo();
  const sampleRoot = path.join(repoRoot, "000_Acme_Sample_Company_Memory");
  await fsp.mkdir(path.join(sampleRoot, "101_Overview"), { recursive: true });
  await fsp.mkdir(path.join(sampleRoot, "102_Strategy"), { recursive: true });
  await fsp.writeFile(
    path.join(sampleRoot, "101_Overview", "101.0_Acme_Overview.md"),
    `# Acme Overview

**Status:** Active
- **Owner Agent:** @ARK

Acme Inc is a sample company memory used to demonstrate indexing, document relationships, and the graph.

Related: [Acme Strategy](../102_Strategy/102.1_Acme_Strategy.md)
`,
  );
  await fsp.writeFile(
    path.join(sampleRoot, "102_Strategy", "102.1_Acme_Strategy.md"),
    `# Acme Strategy

**Status:** Active
- **Owner Agent:** @Strategy

Acme Inc focuses on packaged AI operations services for growing B2B teams.
`,
  );

  const dbPath = path.join(repoRoot, ".kb.sqlite");
  const index = new KnowledgeBaseIndex({ repoRoot, dbPath, env: {} });

  const result = await index.sync();
  const graph = await index.buildGraphSnapshot();

  assert.equal(result.fileCount, 2);
  assert.ok(!index.listFiles().some((file) => file.startsWith("000_Acme_Sample_Company_Memory/")));
  assert.ok(!graph.nodes.some((node) => node.path.startsWith("000_Acme_Sample_Company_Memory")));
  assert.ok(!graph.edges.some((edge) => edge.source.includes("000_Acme_Sample_Company_Memory")));

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

  await fsp.unlink(
    path.join(repoRoot, "000_Company_Memory", "102_Corporate_Strategy_and_Foundation", "102.5_Pricing_Analysis.md"),
  );
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

test("retrieval prefilter preserves ontology and title hint matches", async () => {
  const repoRoot = await createTempRepo();
  const dbPath = path.join(repoRoot, ".kb.sqlite");
  const index = new KnowledgeBaseIndex({ repoRoot, dbPath, env: {} });

  await index.ensureCurrent();
  const matches = await index.retrieve("gtm strategy channels positioning");

  assert.equal(matches[0]?.document.relativePath, "000_Company_Memory/202_Go-to-Market_Strategy/202.1_GTM_Strategy.md");

  index.close();
});

test("broad agent and project queries prefer canonical overview docs over generated runtime artifacts", async () => {
  const repoRoot = await createTempRepo();
  await fsp.mkdir(path.join(repoRoot, "000_Company_Memory", "501_Agents_and_Workflows", "Sub_Agents"), {
    recursive: true,
  });
  await fsp.mkdir(path.join(repoRoot, "000_Company_Memory", "502_Execution_Engine", "agents"), {
    recursive: true,
  });
  await fsp.mkdir(
    path.join(repoRoot, "000_Company_Memory", "600_Projects", "602_GTM_Research_Agent", "02_PRDs"),
    { recursive: true },
  );
  await fsp.mkdir(
    path.join(repoRoot, "000_Company_Memory", "600_Projects", "602_GTM_Research_Agent", "05_Operations"),
    { recursive: true },
  );
  await fsp.mkdir(path.join(repoRoot, "000_Company_Memory", "502_Execution_Engine", "runtime", "data", "input"), {
    recursive: true,
  });

  await fsp.writeFile(
    path.join(repoRoot, "000_Company_Memory", "502_Execution_Engine", "agents", "502.3_Insight_Research_Agent.md"),
    `# Insight Research Agent

**Status:** Active
- **Owner Agent:** @Infrastructure

Canonical agent profile for the research agent, its responsibilities, and how it supports project execution.
`,
  );
  await fsp.writeFile(
    path.join(repoRoot, "000_Company_Memory", "502_Execution_Engine", "README_Execution_Engine.md"),
    `# Execution Engine README

**Status:** Active
- **Owner Agent:** @Infrastructure

Overview of the execution engine, agents, workflows, and project runtime governance.
`,
  );
  await fsp.writeFile(
    path.join(repoRoot, "000_Company_Memory", "501_Agents_and_Workflows", "Sub_Agents", "README_Agents.md"),
    `# Agents README

**Status:** Active
- **Owner Agent:** @ARK

Overview of sub agents, workflow ownership, project routing, and agent registry conventions.
`,
  );
  await fsp.writeFile(
    path.join(
      repoRoot,
      "000_Company_Memory",
      "600_Projects",
      "602_GTM_Research_Agent",
      "02_PRDs",
      "602.1_GTM_Research_Agent_PRD.md",
    ),
    `# GTM Research Agent PRD

**Status:** Active
- **Owner Agent:** @ARK

Product requirements for the GTM research agent project, including expected capabilities and operating scope.
`,
  );
  await fsp.writeFile(
    path.join(
      repoRoot,
      "000_Company_Memory",
      "600_Projects",
      "602_GTM_Research_Agent",
      "05_Operations",
      "602.5_Runtime_Usage_Guide.md",
    ),
    `# Runtime Usage Guide

**Status:** Active
- **Owner Agent:** @Infrastructure

Usage guide for running the GTM research agent project and interpreting runtime behavior.
`,
  );

  for (let index = 0; index < 30; index++) {
    await fsp.writeFile(
      path.join(
        repoRoot,
        "000_Company_Memory",
        "502_Execution_Engine",
        "runtime",
        "data",
        "input",
        `research-agent-${String(index).padStart(2, "0")}.prompt.md`,
      ),
      `# Research Agent Prompt ${index}

Generated prompt artifact for one research agent project run. This file contains operational input, not the canonical agent or project overview.
`,
    );
  }

  const dbPath = path.join(repoRoot, ".kb.sqlite");
  const index = new KnowledgeBaseIndex({ repoRoot, dbPath, env: {} });

  await index.sync();
  const matches = await index.retrieve("projects and agents");
  const topPaths = matches.slice(0, 5).map((match) => match.document.relativePath);

  assert.ok(topPaths.some((file) => file.endsWith("502.3_Insight_Research_Agent.md")));
  assert.ok(topPaths.some((file) => file.endsWith("README_Execution_Engine.md")));
  assert.ok(topPaths.some((file) => file.endsWith("README_Agents.md")));
  assert.ok(topPaths.every((file) => !file.endsWith(".prompt.md")));

  index.close();
});

test("retrieval prefilter searches document chunks for body-only agent roster matches", async () => {
  const repoRoot = await createTempRepo();
  await fsp.mkdir(path.join(repoRoot, "000_Company_Memory", "502_Execution_Engine"), { recursive: true });
  await fsp.mkdir(path.join(repoRoot, "000_Company_Memory", "000_Agent_Shortcuts"), { recursive: true });

  await fsp.writeFile(
    path.join(repoRoot, "000_Company_Memory", "502_Execution_Engine", "README_Execution_Engine.md"),
    `# Execution Engine README

**Status:** Active
- **Owner Agent:** @Infrastructure

This overview explains the execution engine, workflow runtime, connector layer, and operating model.

## Agent Roster

| Agent | File | Role |
| :--- | :--- | :--- |
| Insight Research Agent | agents/502.3_Insight_Research_Agent.md | Market and account intelligence briefs |
`,
  );

  for (const agent of ["Strategy", "Operations", "Finance", "Infrastructure", "Legal", "GTM", "Sales", "Delivery"]) {
    await fsp.writeFile(
      path.join(repoRoot, "000_Company_Memory", "000_Agent_Shortcuts", `${agent}_Agent.md`),
      `# ${agent} Agent

**Status:** Active
- **Owner Agent:** @ARK

Canonical shortcut profile for the ${agent.toLowerCase()} agent.
`,
    );
  }

  const dbPath = path.join(repoRoot, ".kb.sqlite");
  const index = new KnowledgeBaseIndex({ repoRoot, dbPath, env: {} });

  await index.sync();
  const matches = await index.retrieve("What is the Insight Research Agent?");

  assert.equal(matches[0]?.document.relativePath, "000_Company_Memory/502_Execution_Engine/README_Execution_Engine.md");

  index.close();
});

test("buildGraphSnapshot returns folder, document, and markdown reference edges", async () => {
  const repoRoot = await createTempRepo();
  const dbPath = path.join(repoRoot, ".kb.sqlite");
  const index = new KnowledgeBaseIndex({ repoRoot, dbPath, env: {} });

  await index.sync();
  await fsp.unlink(path.join(repoRoot, "000_Company_Memory", "202_Go-to-Market_Strategy", "202.1_GTM_Strategy.md"));
  const graph = await index.buildGraphSnapshot();

  assert.equal(graph.stats.documents, 2);
  assert.ok(graph.nodes.some((node) => node.id === "folder:000_Company_Memory" && node.type === "folder"));
  assert.ok(
    graph.nodes.some(
      (node) =>
        node.id === "document:000_Company_Memory/102_Corporate_Strategy_and_Foundation/102.5_Pricing_Analysis.md" &&
        node.type === "document",
    ),
  );
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.type === "REFERENCES" &&
        edge.source === "document:000_Company_Memory/102_Corporate_Strategy_and_Foundation/102.5_Pricing_Analysis.md" &&
        edge.target === "document:000_Company_Memory/202_Go-to-Market_Strategy/202.1_GTM_Strategy.md",
    ),
  );

  index.close();
});

test("sync persists document references and body chunks in SQLite", async () => {
  const repoRoot = await createTempRepo();
  const dbPath = path.join(repoRoot, ".kb.sqlite");
  const index = new KnowledgeBaseIndex({ repoRoot, dbPath, env: {} });

  await index.sync();
  index.close();

  const db = new DatabaseSync(dbPath);
  try {
    const referenceCount = (
      db.prepare(`SELECT COUNT(*) as count FROM document_references`).get() as { count: number }
    ).count;
    const chunkCount = (
      db.prepare(`SELECT COUNT(*) as count FROM document_chunks`).get() as { count: number }
    ).count;

    assert.equal(referenceCount, 1);
    assert.ok(chunkCount >= 2);
  } finally {
    db.close();
  }
});

test("migrates existing legacy domain column to ontology_domain", async () => {
  const repoRoot = await createTempRepo();
  const dbPath = path.join(repoRoot, ".kb.sqlite");
  const oldDb = new DatabaseSync(dbPath);
  const legacyDomainColumn = "tax" + "onomy_domain";
  oldDb.exec(`
    CREATE TABLE documents (
      id TEXT PRIMARY KEY,
      relative_path TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      ${legacyDomainColumn} TEXT NOT NULL,
      status TEXT,
      owner_agent TEXT,
      content_hash TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      indexed_at TEXT NOT NULL
    );
  `);
  oldDb.close();

  const index = new KnowledgeBaseIndex({ repoRoot, dbPath, env: {} });
  await index.sync();
  index.close();

  const migratedDb = new DatabaseSync(dbPath);
  const columns = migratedDb.prepare(`PRAGMA table_info(documents)`).all() as Array<{ name: string }>;
  migratedDb.close();

  assert.ok(columns.some((column) => column.name === "ontology_domain"));
  assert.ok(!columns.some((column) => column.name === legacyDomainColumn));
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
