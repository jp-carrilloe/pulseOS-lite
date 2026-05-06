import { REPO_ROOT, ensureCliWorkspaceReady, getCliDbPath, loadRepoEnv } from "./shared.js";
import { openWorkspaceStore } from "./workspace-store.js";

async function main(argv = process.argv.slice(2), env: NodeJS.ProcessEnv = process.env) {
  await loadRepoEnv(env);
  const workspace = await ensureCliWorkspaceReady(env, { log: (message) => process.stdout.write(message) });
  const force = argv.includes("--force");
  const dbPath = getCliDbPath(env);
  const index = openWorkspaceStore({ repoRoot: REPO_ROOT, dbPath, env });

  try {
    process.stdout.write(
      `Preparing local knowledge-base index for workspace ${workspace.paths.workspaceId} at:\n${dbPath}\n`,
    );
    process.stdout.write(
      force
        ? "Running a full re-index. This will create the SQLite database, create the SQL tables, and re-run vectorization.\n"
        : "Running index sync. This will create the SQLite database and SQL tables if they do not exist, then index and vectorize the knowledge base.\n",
    );

    const result = force ? await index.sync() : await index.ensureCurrent();
    process.stdout.write(
      `Done.\n- Indexed documents: ${result.fileCount}\n- Indexed characters: ${result.charCount}\n- Embedding model: ${result.embeddingModel}\n- Embedding mode: ${result.embeddingMode}\n- Indexed at: ${result.indexedAt}\n`,
    );
  } finally {
    index.close();
  }
}

await main();
