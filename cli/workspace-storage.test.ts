import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  getLegacyStateDir,
  getPulseosHomeRoot,
  getWorkspaceId,
  prepareWorkspaceStorage,
  resolveWorkspacePaths,
} from "./workspace-storage.js";
import { getCliDbPath } from "./shared.js";

async function createTempRepo(): Promise<string> {
  const repoRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "pulseos-lite-workspace-"));
  await fsp.mkdir(path.join(repoRoot, "cli"), { recursive: true });
  return repoRoot;
}

async function createSqliteFile(dbPath: string): Promise<void> {
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(`
      CREATE TABLE documents (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL
      );
      INSERT INTO documents (id, title) VALUES ('doc-1', 'Doc 1');
    `);
  } finally {
    db.close();
  }
}

test("default home resolves to ~/.pulseos", () => {
  const homeRoot = getPulseosHomeRoot({});
  assert.equal(homeRoot, path.join(os.homedir(), ".pulseos"));
});

test("workspace id generation is stable for the same repo path", async () => {
  const repoRoot = await createTempRepo();
  assert.equal(getWorkspaceId(repoRoot, {}), getWorkspaceId(repoRoot, {}));
});

test("legacy CLI home env vars continue to override the workspace root directly", async () => {
  const repoRoot = await createTempRepo();
  const overrideRoot = path.join(repoRoot, "custom-state");
  const paths = resolveWorkspacePaths(repoRoot, { PULSEOS_CLI_HOME: overrideRoot });
  assert.equal(paths.workspaceRoot, overrideRoot);
  assert.equal(paths.dbPath, path.join(overrideRoot, "knowledge-base.sqlite"));
  assert.equal(getCliDbPath({ PULSEOS_CLI_HOME: overrideRoot }), path.join(overrideRoot, "knowledge-base.sqlite"));
});

test("prepareWorkspaceStorage creates the new home layout with reserved directories", async () => {
  const repoRoot = await createTempRepo();
  const pulseosHome = await fsp.mkdtemp(path.join(os.tmpdir(), "pulseos-home-"));
  const result = await prepareWorkspaceStorage({ repoRoot, env: { PULSEOS_HOME: pulseosHome } });

  assert.ok(result.paths.workspaceRoot.startsWith(path.join(pulseosHome, "workspaces")));
  assert.ok(fs.existsSync(result.paths.snapshotsDir));
  assert.ok(fs.existsSync(result.paths.logsDir));
  assert.ok(fs.existsSync(result.paths.cacheDir));
  assert.ok(fs.existsSync(path.join(pulseosHome, "config")));
});

test("prepareWorkspaceStorage auto-migrates repo-local state once", async () => {
  const repoRoot = await createTempRepo();
  const pulseosHome = await fsp.mkdtemp(path.join(os.tmpdir(), "pulseos-home-"));
  const legacyDir = getLegacyStateDir(repoRoot);
  await fsp.mkdir(legacyDir, { recursive: true });
  await createSqliteFile(path.join(legacyDir, "knowledge-base.sqlite"));
  await fsp.writeFile(path.join(legacyDir, "bootstrap-state.json"), JSON.stringify({ status: "completed" }), "utf8");
  await fsp.writeFile(path.join(legacyDir, "daemon-state.json"), "{not-valid-json", "utf8");

  const firstRun = await prepareWorkspaceStorage({ repoRoot, env: { PULSEOS_HOME: pulseosHome } });
  assert.equal(firstRun.migration.migrated, true);
  const migratedDb = new DatabaseSync(firstRun.paths.dbPath);
  try {
    const count = (migratedDb.prepare(`SELECT COUNT(*) as count FROM documents`).get() as { count: number }).count;
    assert.equal(count, 1);
  } finally {
    migratedDb.close();
  }
  assert.ok(fs.existsSync(firstRun.paths.bootstrapStateFilePath));
  assert.ok(!fs.existsSync(firstRun.paths.daemonStateFilePath));
  assert.ok(fs.existsSync(firstRun.paths.migrationMarkerPath));

  await createSqliteFile(path.join(legacyDir, "knowledge-base.sqlite.tmp"));
  const secondRun = await prepareWorkspaceStorage({ repoRoot, env: { PULSEOS_HOME: pulseosHome } });
  assert.equal(secondRun.migration.migrated, false);
  assert.equal(secondRun.migration.skippedReason, "already-migrated");
  const secondDb = new DatabaseSync(secondRun.paths.dbPath);
  try {
    const count = (secondDb.prepare(`SELECT COUNT(*) as count FROM documents`).get() as { count: number }).count;
    assert.equal(count, 1);
  } finally {
    secondDb.close();
  }
});

test("prepareWorkspaceStorage does not overwrite a non-empty workspace", async () => {
  const repoRoot = await createTempRepo();
  const pulseosHome = await fsp.mkdtemp(path.join(os.tmpdir(), "pulseos-home-"));
  const paths = resolveWorkspacePaths(repoRoot, { PULSEOS_HOME: pulseosHome });
  await fsp.mkdir(paths.workspaceRoot, { recursive: true });
  await fsp.writeFile(paths.dbPath, "existing-workspace-state", "utf8");

  const legacyDir = getLegacyStateDir(repoRoot);
  await fsp.mkdir(legacyDir, { recursive: true });
  await fsp.writeFile(path.join(legacyDir, "knowledge-base.sqlite"), "legacy-workspace-state", "utf8");

  const result = await prepareWorkspaceStorage({ repoRoot, env: { PULSEOS_HOME: pulseosHome } });
  assert.equal(result.migration.migrated, false);
  assert.equal(result.migration.skippedReason, "workspace-not-empty");
  assert.equal(await fsp.readFile(paths.dbPath, "utf8"), "existing-workspace-state");
});

test("legacy state selection prefers the best populated and newest candidate", async () => {
  const repoRoot = await createTempRepo();
  const oldLegacyDir = path.join(repoRoot, "cli", ".pulseos-lite-open-source-cli-state");
  const newLegacyDir = path.join(repoRoot, "cli", ".pulseos-lite-cli-state");
  await fsp.mkdir(oldLegacyDir, { recursive: true });
  await fsp.mkdir(newLegacyDir, { recursive: true });
  await fsp.writeFile(path.join(oldLegacyDir, "notes.txt"), "older", "utf8");
  await createSqliteFile(path.join(newLegacyDir, "knowledge-base.sqlite"));

  const resolved = getLegacyStateDir(repoRoot);
  assert.equal(resolved, newLegacyDir);
});
