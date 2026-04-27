import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { KnowledgeBaseIndex } from "./retrieval.js";

async function makeTempRepo() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pulseos-rebuild-advisor-"));
  const docPath = path.join(root, "000_Company_Memory", "102_Strategy");
  await fs.mkdir(docPath, { recursive: true });
  await fs.writeFile(
    path.join(docPath, "Strategy.md"),
    "# Strategy\n\n**Status:** Active\n\nWe help operators keep their company memory current.\n",
    "utf8",
  );
  return root;
}

test("rebuild advisor detects markdown drift and clears after sync", async () => {
  const repoRoot = await makeTempRepo();
  const dbPath = path.join(repoRoot, ".state", "knowledge-base.sqlite");
  const index = new KnowledgeBaseIndex({ repoRoot, dbPath, env: {} });

  try {
    await index.sync();

    const initial = await index.inspectRebuildStatus();
    assert.equal(initial.pending.totalChanges, 0);
    assert.equal(initial.needsRebuild, false);

    const documentPath = path.join(repoRoot, "000_Company_Memory", "102_Strategy", "Strategy.md");
    await fs.writeFile(
      documentPath,
      "# Strategy\n\n**Status:** Active\n\nWe updated the strategy with a new go-to-market note.\n",
      "utf8",
    );

    const drifted = await index.inspectRebuildStatus();
    assert.equal(drifted.pending.totalChanges, 1);
    assert.equal(drifted.pending.updated, 1);
    assert.equal(drifted.needsRebuild, true);
    assert.match(drifted.pending.changes[0]?.path ?? "", /Strategy\.md$/);
    assert.equal(drifted.pending.changes[0]?.charDelta, 1);

    const db = new DatabaseSync(dbPath);
    try {
      const logCountBeforePersist = (
        db.prepare(`SELECT COUNT(*) as count FROM rebuild_change_log`).get() as { count: number }
      ).count;
      assert.equal(logCountBeforePersist, 0);
    } finally {
      db.close();
    }

    const persisted = await index.inspectRebuildStatus({ persistLog: true });
    assert.equal(persisted.pending.totalChanges, 1);

    const dbAfterPersist = new DatabaseSync(dbPath);
    try {
      const unresolvedCount = (
        dbAfterPersist.prepare(`SELECT COUNT(*) as count FROM rebuild_change_log WHERE resolved_at IS NULL`).get() as {
          count: number;
        }
      ).count;
      assert.equal(unresolvedCount, 1);
    } finally {
      dbAfterPersist.close();
    }

    await index.sync();
    const refreshed = await index.inspectRebuildStatus();
    assert.equal(refreshed.pending.totalChanges, 0);
    assert.equal(refreshed.needsRebuild, false);
  } finally {
    index.close();
    await fs.rm(repoRoot, { recursive: true, force: true });
  }
});
