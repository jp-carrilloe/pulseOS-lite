/**
 * Centralized configuration — loads .env from repo root and exports all keys.
 * Clean boilerplate version.
 */
const path = require('path');
require('dotenv').config({
    path: path.resolve(__dirname, '..', '..', '..', '..', '.env'),
});

const config = {
    port: parseInt(process.env.ARK_PORT || '3747', 10),

    // Repo root: 4 levels up from ark-engine/server/
    repoRoot: path.resolve(__dirname, '..', '..', '..', '..'),

    // Standard API Keys
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',

    // Database
    dbPath: path.resolve(__dirname, '..', '..', '..', '..', 'engine.db'),
};

module.exports = config;
