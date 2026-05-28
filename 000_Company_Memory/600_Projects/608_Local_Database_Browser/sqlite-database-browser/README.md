# PulseOS Local Database Browser

**Version:** 0.1  
**Last Updated:** 2026-05-28  
**Author/Editor:** Ark  
**Status:** Active

---

## Purpose

- Provide a local UI for screening persistent PulseOS SQLite databases.
- Start with the CRM and Research Agent databases.
- Keep source databases in persistent storage under `~/.pulseos/`.

## Executive Summary

- The frontend is a Vite React table browser adapted from the Sigma/Profile Browser pattern.
- The backend is a local FastAPI service that exposes only configured SQLite databases.
- The UI supports database switching, table switching, global search, generated filter facets, column visibility, row height controls, detail drawer, and inline cell editing for tables with a primary key or `id` column.

## Core Content

### Configured Databases

- CRM:
  - Default path: `~/.pulseos/crm/databases/attio_crm.db`
  - Override: `PULSEOS_DB_BROWSER_CRM_DB_PATH`
- Research Agent:
  - Default path: `~/.pulseos/research-agent/databases/research_agent.db`
  - Override: `PULSEOS_DB_BROWSER_RESEARCH_AGENT_DB_PATH`

### Run Locally

Install frontend dependencies:

```bash
cd "PulseOS Lite/000_Company_Memory/600_Projects/608_Local_Database_Browser/sqlite-database-browser"
npm install
```

Install API dependencies:

```bash
cd "PulseOS Lite/000_Company_Memory/600_Projects/608_Local_Database_Browser/sqlite-database-browser"
python3 -m venv .venv
source .venv/bin/activate
pip install -r api/requirements.txt
```

Run the API:

```bash
uvicorn api.profile_browser_api:app --host 127.0.0.1 --port 8787 --reload
```

Run the frontend:

```bash
npm run dev
```

Open `http://localhost:5173` or the Vite URL printed in the terminal.

## Action Items

- Use this browser for direct local screening of CRM and Research Agent records.
- Add more persistent databases to `api/profile_browser_api.py` only when they should be exposed in this local UI.

## Operational Metadata

- **Owner Agent:** Ark
- **Project Area:** `600_Projects/608_Local_Database_Browser`
- **Document Role:** Subproject README
- **Update Trigger:** Update when database sources, local run commands, or browser capabilities change.
