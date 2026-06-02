# PulseOS Local Database Browser

**Version:** 0.1  
**Last Updated:** 2026-06-02  
**Author/Editor:** Ark  
**Status:** Active

---

## Purpose

- Provide a fast, responsive local UI for viewing, filtering, and editing persistent PulseOS SQLite databases.
- Start with the CRM and Research Agent databases, but expandable to others.
- Keep source databases in persistent storage under `~/.pulseos/` to avoid mixing data with code.

## Architecture & How It Works

The database browser consists of two main pieces:

1. **Frontend (Tableview UI)**
   - Built with **React**, **TypeScript**, and **Vite**.
   - Handles the visual rendering, dynamic column sizing, drag-and-drop column reordering, saved views, and data table interactions.
   - Runs locally on a development server (typically `http://localhost:5173` or `5174`).
   - Uses Tailwind CSS for modern, aesthetic styling without white borders or heavy cards.

2. **Backend (API Layer)**
   - Built with **Python FastAPI**.
   - Acts as a secure, local middleware between the React frontend and the SQLite database files.
   - Runs locally (typically on port `8787`).
   - Provides REST endpoints for querying data, applying SQL-level filters, fetching table schemas, and persisting user views.

## Data Storage

This project follows the strict rule of keeping data out of the repository.

### 1. SQLite Databases
The actual table data lives in persistent SQLite files located in your home directory:
- **CRM Database:** `~/.pulseos/crm/databases/attio_crm.db`
- **Research Agent Database:** `~/.pulseos/research-agent/databases/research_agent.db`
*(These paths can be overridden via `PULSEOS_DB_BROWSER_CRM_DB_PATH` and similar environment variables if needed).*

### 2. Saved Views
When a user configures a specific table layout (visible columns, sorting, advanced filters) and saves the view, this configuration is persisted globally across sessions.
- **Views Storage Path:** `~/.pulseos/db-browser/views.json`

Because views are saved in persistent storage outside the repo, upgrading the database browser codebase will never accidentally overwrite your personalized UI layouts.

## Run Locally

You must run both the API and the Frontend servers simultaneously.

### 1. Start the API Server
In one terminal window, install the Python dependencies and run the FastAPI server:

```bash
cd "PulseOS Lite/000_Company_Memory/600_Projects/608_Local_Database_Browser/sqlite-database-browser"
python3 -m venv .venv
source .venv/bin/activate
pip install -r api/requirements.txt
uvicorn api.profile_browser_api:app --host 127.0.0.1 --port 8787 --reload
```

### 2. Start the Frontend Tableview
In a second terminal window, run the Vite development server. This is the UI you will interact with.

```bash
cd "PulseOS Lite/000_Company_Memory/600_Projects/608_Local_Database_Browser/sqlite-database-browser"
npm install
npm run dev
```

Open the local URL printed in your terminal (usually `http://localhost:5173` or `http://localhost:5174`).

## Action Items

- Use this browser for direct local screening of CRM and Research Agent records.
- Add more persistent databases to `api/profile_browser_api.py` only when they should be exposed in this local UI.

## Operational Metadata

- **Owner Agent:** Ark
- **Project Area:** `600_Projects/608_Local_Database_Browser`
- **Document Role:** Subproject README
- **Update Trigger:** Update when database sources, local run commands, or browser capabilities change.
