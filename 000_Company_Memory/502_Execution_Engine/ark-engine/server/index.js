#!/usr/bin/env node
/**
 * ARK Engine — Unified Server
 * Replaces both ark-server.js (Node :3747) and content_api.py (Python :8000)
 * into a single Express server.
 *
 * Run: node server/index.js
 * Dashboard: http://localhost:3747
 */
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const db = require('./db');

// ── Initialize database ──────────────────────────────
db.initDb();

// ── Create Express app ───────────────────────────────
const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ── Mount route modules ──────────────────────────────
app.use(require('./routes/content'));
app.use(require('./routes/research'));
app.use(require('./routes/apollo'));
app.use(require('./routes/crm'));
app.use(require('./routes/vault'));
app.use(require('./routes/git'));
app.use(require('./routes/clickup'));
app.use(require('./routes/workflows'));
app.use(require('./routes/system'));

// ── Serve React App (Production) ──────────────────────
const clientDistPath = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDistPath));

app.get('*', (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
});

// ── Error handler ────────────────────────────────────
app.use((err, _req, res, _next) => {
    console.error('❌ Error:', err.message);
    res.status(err.status || 500).json({
        error: err.message || 'Internal server error',
    });
});

// ── Start ────────────────────────────────────────────
app.listen(config.port, '127.0.0.1', () => {
    console.log('');
    console.log('🤖 ARK Engine — Unified Server');
    console.log(`   Dashboard   → http://localhost:${config.port}`);
    console.log(`   Repo root   → ${config.repoRoot}`);
    console.log(`   Home root   → ${config.homeRoot}`);
    console.log(`   Tools dir   → ${config.toolsDir}`);
    console.log(`   Database    → ${config.dbPath}`);
    console.log('   Press Ctrl+C to stop.');
    console.log('');
});
