# Local Database Browser

**Version:** 0.1  
**Last Updated:** 2026-05-28  
**Author/Editor:** Ark  
**Status:** Active

---

## Purpose

- Houses local tooling for screening persistent SQLite databases used by PulseOS workflows.

## Executive Summary

- The active implementation is [`sqlite-database-browser/`](./sqlite-database-browser/).
- It exposes the CRM and Research Agent databases from `~/.pulseos/` through a local FastAPI API and Vite React UI.

## Core Content

- CRM source: `~/.pulseos/crm/databases/attio_crm.db`
- Research Agent source: `~/.pulseos/research-agent/databases/research_agent.db`
- Browser README: [`sqlite-database-browser/README.md`](./sqlite-database-browser/README.md)

## Action Items

- Keep local database paths in persistent storage.
- Add new database sources through the browser API whitelist before exposing them in the UI.

## Operational Metadata

- **Owner Agent:** Ark
- **Document Role:** Project README
- **Update Trigger:** Update when local database sources or browser ownership changes.
