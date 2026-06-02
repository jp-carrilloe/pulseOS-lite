/**
 * Centralized configuration — loads .env.local first, then .env from repo root.
 */
const path = require('path');
const dotenv = require('dotenv');
const { preparePersistentStorage } = require('./storage');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const workspaceRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');

dotenv.config({
    path: path.resolve(workspaceRoot, '.env.local'),
});
dotenv.config({
    path: path.resolve(workspaceRoot, '.env'),
    override: false,
});

const storage = preparePersistentStorage({ repoRoot, env: process.env });

const config = {
    port: parseInt(process.env.ARK_PORT || '3747', 10),

    // Repo root: 3 levels up from ark-engine/server/
    repoRoot,

    // Persistent local memory root outside the repo
    homeRoot: storage.homeRoot,
    databasesDir: storage.databasesDir,

    // Path to tools/ for serving the legacy frontend
    toolsDir: path.resolve(__dirname, '..', '..', 'tools'),

    // API Keys
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    apolloApiKey: process.env.APOLLO_API_KEY || '',
    hunterApiKey: process.env.HUNTER_API_KEY || '',
    leadmagicApiKey: process.env.LEADMAGIC_API_KEY || '',
    attioApiKey: process.env.ATTIO_API_KEY || '',
    perplexityApiKey: process.env.PERPLEXITY_API_KEY || '',
    exaApiKey: process.env.EXA_API_KEY || '',
    braveSearchApiKey: process.env.BRAVE_API_KEY || process.env.BRAVE_SEARCH_API_KEY || '',
    tavilyApiKey: process.env.TAVILY_API_KEY || '',
    clickupToken: process.env.CLICKUP_TOKEN || process.env.CLICKUP || '',

    // Database
    dbPath: storage.dbPath,
    legacyDbPath: storage.legacyDbPath,
};

// Warn on missing critical keys
const warnings = [];
if (!config.openaiApiKey) warnings.push('OPENAI_API_KEY');
if (!config.apolloApiKey) warnings.push('APOLLO_API_KEY');
if (warnings.length) {
    console.warn(`⚠️  Missing env vars: ${warnings.join(', ')}`);
}

module.exports = config;
