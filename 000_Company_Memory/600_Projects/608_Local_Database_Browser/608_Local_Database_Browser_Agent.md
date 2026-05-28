# Local Database Browser Agent

**Version:** 0.1  
**Last Updated:** 2026-05-28  
**Author/Editor:** Ark  
**Status:** Active

---

## Purpose

- Own local database browser tooling for persistent SQLite sources.

## Executive Summary

- This agent maintains the browser that screens CRM and Research Agent database tables from `~/.pulseos/`.
- The browser is a local developer/operator utility, not a production web app.

## Core Content

- Primary implementation: [`sqlite-database-browser/`](./sqlite-database-browser/)
- Default database sources:
  - CRM: `~/.pulseos/crm/databases/attio_crm.db`
  - Research Agent: `~/.pulseos/research-agent/databases/research_agent.db`
- Access model:
  - Local-only FastAPI server.
  - Whitelisted database paths.
  - No arbitrary file-path browsing.

## Action Items

- Validate browser changes against both configured databases.
- Keep README run commands current.
- Preserve persistent-storage defaults.

## Operational Metadata

- **Owner Agent:** Ark
- **Document Role:** Specialist agent file
- **Update Trigger:** Update when ownership, exposed databases, or local operating rules change.
