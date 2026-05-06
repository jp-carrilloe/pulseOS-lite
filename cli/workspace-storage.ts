import { createHash } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_HOME_DIRNAME = ".pulseos";
const WORKSPACES_DIRNAME = "workspaces";
const CONFIG_DIRNAME = "config";
const SNAPSHOTS_DIRNAME = "snapshots";
const LOGS_DIRNAME = "logs";
const CACHE_DIRNAME = "cache";
const MIGRATION_MARKER_FILENAME = "storage-migration-v1.json";
const LEGACY_STATE_DIR_CANDIDATES = [
  path.join("cli", ".pulseos-lite-cli-state"),
  path.join("cli", ".pulseos-lite-open-source-cli-state"),
  path.join("cli", ".pulseos-cli-state"),
];
const RESERVED_WORKSPACE_DIRS = new Set([SNAPSHOTS_DIRNAME, LOGS_DIRNAME, CACHE_DIRNAME]);
const JSON_STATE_FILENAMES = new Set(["daemon-state.json", "bootstrap-state.json"]);

export interface WorkspacePaths {
  homeRoot: string;
  configRoot: string;
  workspaceId: string;
  workspaceRoot: string;
  dbPath: string;
  daemonStateFilePath: string;
  bootstrapStateFilePath: string;
  snapshotsDir: string;
  logsDir: string;
  cacheDir: string;
  migrationMarkerPath: string;
  legacyStateDir: string;
  usesLegacyWorkspaceOverride: boolean;
}

export interface WorkspaceMigrationResult {
  migrated: boolean;
  sourcePath: string | null;
  targetPath: string;
  markerPath: string;
  skippedReason: string | null;
}

interface LegacyStateCandidate {
  path: string;
  exists: boolean;
  hasEntries: boolean;
  hasDatabase: boolean;
  hasDaemonState: boolean;
  newestMtimeMs: number;
  score: number;
}

export interface WorkspaceSetupResult {
  paths: WorkspacePaths;
  migration: WorkspaceMigrationResult;
}

function resolveLegacyWorkspaceOverride(env: NodeJS.ProcessEnv): string | null {
  const configured =
    env.PULSEOS_LITE_OPEN_SOURCE_CLI_HOME?.trim() ?? env.PULSEOS_CLI_HOME?.trim() ?? "";
  return configured ? path.resolve(configured) : null;
}

export function getPulseosHomeRoot(env: NodeJS.ProcessEnv = process.env): string {
  const explicitHome = env.PULSEOS_HOME?.trim();
  if (explicitHome) return path.resolve(explicitHome);
  const legacyOverride = resolveLegacyWorkspaceOverride(env);
  if (legacyOverride) return legacyOverride;
  return path.join(os.homedir(), DEFAULT_HOME_DIRNAME);
}

export function getWorkspaceId(
  repoRoot: string = DEFAULT_REPO_ROOT,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const explicitId = env.PULSEOS_WORKSPACE_ID?.trim();
  if (explicitId) {
    return explicitId
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "workspace";
  }

  const baseName = path.basename(repoRoot).toLowerCase();
  const slug = baseName.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "workspace";
  const hash = createHash("sha1").update(path.resolve(repoRoot)).digest("hex").slice(0, 10);
  return `${slug}-${hash}`;
}

export function getLegacyStateDir(repoRoot: string = DEFAULT_REPO_ROOT): string {
  const candidates = getLegacyStateCandidates(repoRoot);
  const best = candidates.find((candidate) => candidate.exists && candidate.hasEntries);
  if (best) return best.path;
  return path.join(repoRoot, LEGACY_STATE_DIR_CANDIDATES[0]);
}

function getLegacyStateCandidates(repoRoot: string = DEFAULT_REPO_ROOT): LegacyStateCandidate[] {
  return LEGACY_STATE_DIR_CANDIDATES.map((candidatePath, index) => {
    const fullPath = path.join(repoRoot, candidatePath);
    if (!fs.existsSync(fullPath)) {
      return {
        path: fullPath,
        exists: false,
        hasEntries: false,
        hasDatabase: false,
        hasDaemonState: false,
        newestMtimeMs: 0,
        score: Number.NEGATIVE_INFINITY,
      };
    }

    const entries = fs.readdirSync(fullPath, { withFileTypes: true });
    const names = new Set(entries.map((entry) => entry.name));
    let newestMtimeMs = 0;
    for (const entry of entries) {
      const entryPath = path.join(fullPath, entry.name);
      try {
        newestMtimeMs = Math.max(newestMtimeMs, fs.statSync(entryPath).mtimeMs);
      } catch {
        // ignore transient files
      }
    }

    const hasEntries = entries.length > 0;
    const hasDatabase = names.has("knowledge-base.sqlite");
    const hasDaemonState = names.has("daemon-state.json");
    const score =
      (hasEntries ? 1_000 : 0)
      + (hasDatabase ? 10_000 : 0)
      + (hasDaemonState ? 100 : 0)
      + newestMtimeMs
      - index;

    return {
      path: fullPath,
      exists: true,
      hasEntries,
      hasDatabase,
      hasDaemonState,
      newestMtimeMs,
      score,
    };
  }).sort((left, right) => right.score - left.score);
}

export function resolveWorkspacePaths(
  repoRoot: string = DEFAULT_REPO_ROOT,
  env: NodeJS.ProcessEnv = process.env,
): WorkspacePaths {
  const legacyWorkspaceOverride = resolveLegacyWorkspaceOverride(env);
  const homeRoot = getPulseosHomeRoot(env);
  const configRoot = path.join(homeRoot, CONFIG_DIRNAME);
  const workspaceId = getWorkspaceId(repoRoot, env);
  const workspaceRoot = legacyWorkspaceOverride
    ? legacyWorkspaceOverride
    : path.join(homeRoot, WORKSPACES_DIRNAME, workspaceId);

  return {
    homeRoot,
    configRoot,
    workspaceId,
    workspaceRoot,
    dbPath: path.join(workspaceRoot, "knowledge-base.sqlite"),
    daemonStateFilePath: path.join(workspaceRoot, "daemon-state.json"),
    bootstrapStateFilePath: path.join(workspaceRoot, "bootstrap-state.json"),
    snapshotsDir: path.join(workspaceRoot, SNAPSHOTS_DIRNAME),
    logsDir: path.join(workspaceRoot, LOGS_DIRNAME),
    cacheDir: path.join(workspaceRoot, CACHE_DIRNAME),
    migrationMarkerPath: path.join(workspaceRoot, MIGRATION_MARKER_FILENAME),
    legacyStateDir: getLegacyStateDir(repoRoot),
    usesLegacyWorkspaceOverride: Boolean(legacyWorkspaceOverride),
  };
}

async function ensureWorkspaceDirectories(paths: WorkspacePaths): Promise<void> {
  await fsp.mkdir(paths.workspaceRoot, { recursive: true });
  if (!paths.usesLegacyWorkspaceOverride) {
    await fsp.mkdir(paths.homeRoot, { recursive: true });
    await fsp.mkdir(configRootFor(paths), { recursive: true });
  }
  await Promise.all([
    fsp.mkdir(paths.snapshotsDir, { recursive: true }),
    fsp.mkdir(paths.logsDir, { recursive: true }),
    fsp.mkdir(paths.cacheDir, { recursive: true }),
  ]);
}

function configRootFor(paths: WorkspacePaths): string {
  return paths.configRoot;
}

async function workspaceHasUserState(paths: WorkspacePaths): Promise<boolean> {
  if (!fs.existsSync(paths.workspaceRoot)) return false;
  const entries = await fsp.readdir(paths.workspaceRoot, { withFileTypes: true });
  return entries.some((entry) => {
    if (entry.name === MIGRATION_MARKER_FILENAME) return true;
    if (entry.isFile()) return true;
    if (entry.isDirectory() && !RESERVED_WORKSPACE_DIRS.has(entry.name)) return true;
    const reservedPath = path.join(paths.workspaceRoot, entry.name);
    return entry.isDirectory() && fs.existsSync(reservedPath) && fs.readdirSync(reservedPath).length > 0;
  });
}

async function safeReadJson(filePath: string): Promise<unknown | null> {
  try {
    return JSON.parse(await fsp.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function shouldSkipMigrationForLiveLegacyDaemon(legacyStateDir: string): Promise<boolean> {
  const daemonStatePath = path.join(legacyStateDir, "daemon-state.json");
  const parsed = await safeReadJson(daemonStatePath);
  if (!parsed || typeof parsed !== "object" || parsed === null || !("pid" in parsed)) return false;
  const pid = Number((parsed as { pid?: unknown }).pid);
  return Number.isInteger(pid) && pid > 0 && isProcessAlive(pid);
}

async function verifyCopiedSqlite(sourcePath: string, targetPath: string): Promise<void> {
  if (path.basename(sourcePath) !== "knowledge-base.sqlite") return;
  const sourceStat = fs.statSync(sourcePath);
  const targetStat = fs.statSync(targetPath);
  if (sourceStat.size !== targetStat.size) {
    throw new Error(`SQLite migration verification failed for ${targetPath}: file sizes differ.`);
  }
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(targetPath);
  try {
    const result = db.prepare("PRAGMA integrity_check").get() as { integrity_check?: string } | undefined;
    if (result?.integrity_check !== "ok") {
      throw new Error(`SQLite migration verification failed for ${targetPath}: integrity_check returned ${result?.integrity_check ?? "unknown"}.`);
    }
  } finally {
    db.close();
  }
}

async function copyEntry(sourcePath: string, targetPath: string): Promise<void> {
  const stat = await fsp.stat(sourcePath);
  if (stat.isDirectory()) {
    await fsp.mkdir(targetPath, { recursive: true });
    const entries = await fsp.readdir(sourcePath, { withFileTypes: true });
    for (const entry of entries) {
      await copyEntry(path.join(sourcePath, entry.name), path.join(targetPath, entry.name));
    }
    return;
  }
  await fsp.mkdir(path.dirname(targetPath), { recursive: true });
  await fsp.copyFile(sourcePath, targetPath);
  await verifyCopiedSqlite(sourcePath, targetPath);
}

async function writeMigrationMarker(paths: WorkspacePaths, sourcePath: string): Promise<void> {
  const marker = {
    version: 1,
    migratedAt: new Date().toISOString(),
    sourcePath,
    workspaceId: paths.workspaceId,
  };
  await fsp.writeFile(paths.migrationMarkerPath, JSON.stringify(marker, null, 2), "utf8");
}

async function migrateLegacyState(
  paths: WorkspacePaths,
  log?: (message: string) => void,
): Promise<WorkspaceMigrationResult> {
  if (paths.usesLegacyWorkspaceOverride) {
    return {
      migrated: false,
      sourcePath: null,
      targetPath: paths.workspaceRoot,
      markerPath: paths.migrationMarkerPath,
      skippedReason: "legacy-workspace-override",
    };
  }
  if (!fs.existsSync(paths.legacyStateDir)) {
    return {
      migrated: false,
      sourcePath: null,
      targetPath: paths.workspaceRoot,
      markerPath: paths.migrationMarkerPath,
      skippedReason: "legacy-state-missing",
    };
  }
  if (fs.existsSync(paths.migrationMarkerPath)) {
    return {
      migrated: false,
      sourcePath: paths.legacyStateDir,
      targetPath: paths.workspaceRoot,
      markerPath: paths.migrationMarkerPath,
      skippedReason: "already-migrated",
    };
  }
  if (await workspaceHasUserState(paths)) {
    return {
      migrated: false,
      sourcePath: paths.legacyStateDir,
      targetPath: paths.workspaceRoot,
      markerPath: paths.migrationMarkerPath,
      skippedReason: "workspace-not-empty",
    };
  }

  if (await shouldSkipMigrationForLiveLegacyDaemon(paths.legacyStateDir)) {
    log?.(
      `[pulseos-lite-cli] Skipping legacy state migration because a daemon still appears to be using ${paths.legacyStateDir}. Stop it first, then rerun the command.\n`,
    );
    return {
      migrated: false,
      sourcePath: paths.legacyStateDir,
      targetPath: paths.workspaceRoot,
      markerPath: paths.migrationMarkerPath,
      skippedReason: "legacy-daemon-running",
    };
  }

  const entries = await fsp.readdir(paths.legacyStateDir, { withFileTypes: true });
  if (entries.length === 0) {
    return {
      migrated: false,
      sourcePath: paths.legacyStateDir,
      targetPath: paths.workspaceRoot,
      markerPath: paths.migrationMarkerPath,
      skippedReason: "legacy-state-empty",
    };
  }

  for (const entry of entries) {
    const sourcePath = path.join(paths.legacyStateDir, entry.name);
    const targetPath = path.join(paths.workspaceRoot, entry.name);
    if (entry.isFile() && JSON_STATE_FILENAMES.has(entry.name)) {
      const parsed = await safeReadJson(sourcePath);
      if (!parsed) continue;
    }
    await copyEntry(sourcePath, targetPath);
  }

  await writeMigrationMarker(paths, paths.legacyStateDir);
  log?.(
    `[pulseos-lite-cli] Migrated workspace state from ${paths.legacyStateDir} to ${paths.workspaceRoot}. Repo-local state remains untouched.\n`,
  );
  return {
    migrated: true,
    sourcePath: paths.legacyStateDir,
    targetPath: paths.workspaceRoot,
    markerPath: paths.migrationMarkerPath,
    skippedReason: null,
  };
}

export async function prepareWorkspaceStorage(options?: {
  repoRoot?: string;
  env?: NodeJS.ProcessEnv;
  log?: (message: string) => void;
}): Promise<WorkspaceSetupResult> {
  const repoRoot = options?.repoRoot ?? DEFAULT_REPO_ROOT;
  const env = options?.env ?? process.env;
  const paths = resolveWorkspacePaths(repoRoot, env);

  await ensureWorkspaceDirectories(paths);
  const migration = await migrateLegacyState(paths, options?.log);

  return { paths, migration };
}

export async function snapshotWorkspaceDatabase(options?: {
  repoRoot?: string;
  env?: NodeJS.ProcessEnv;
  timestamp?: string;
}): Promise<string | null> {
  const repoRoot = options?.repoRoot ?? DEFAULT_REPO_ROOT;
  const env = options?.env ?? process.env;
  const paths = resolveWorkspacePaths(repoRoot, env);
  if (!fs.existsSync(paths.dbPath)) return null;
  await ensureWorkspaceDirectories(paths);
  const timestamp = (options?.timestamp ?? new Date().toISOString()).replace(/[:]/g, "-");
  const snapshotPath = path.join(paths.snapshotsDir, `${timestamp}-knowledge-base.sqlite`);
  await fsp.copyFile(paths.dbPath, snapshotPath);
  return snapshotPath;
}
