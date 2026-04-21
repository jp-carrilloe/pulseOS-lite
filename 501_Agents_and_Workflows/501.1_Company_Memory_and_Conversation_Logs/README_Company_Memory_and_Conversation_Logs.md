# Company Memory and Conversation Logs

**Version:** 1.0
**Last Updated:** 2026-04-21
**Author/Editor:** @ARK
**Status:** Active

---

## Purpose
This folder is for durable company-memory notes created from AI working sessions, project conversations, and important decisions that happen outside the repo.

Use it when a cloud AI workspace, terminal assistant, or project-specific agent produces information that should become part of the long-term company brain.

Examples:
- decisions made while working in another repo
- useful summaries from Codex, ChatGPT, Claude, Gemini, or another cloud AI workspace
- project-specific discoveries that should inform future work
- important conversation summaries from client, product, GTM, or operations work
- memory notes that should be routed later into Strategy, Operations, GTM, Sales, Delivery, Finance, Legal, or Infrastructure

---

## What This Folder Is Not
This folder is not a raw transcript dump by default.

Use it for curated memory notes and important conversation summaries.

If you need to preserve full internal meeting transcripts, use:
- `103_Corporate_Operations/103.5_Internal_Meeting_Transcripts`

If you need to seed the repo from source documents, use:
- `001_Source_Intake`

---

## Recommended Log Format

Create one Markdown file per important session or project memory.

Suggested filename:
- `YYYY-MM-DD_project_or_topic_memory.md`

Suggested structure:

```md
# Project or Topic Memory

**Date:** YYYY-MM-DD
**Source:** Codex | ChatGPT | Claude | Gemini | Terminal CLI | Other
**Project:** Project or repo name
**Owner:** @ARK or relevant folder agent
**Status:** Draft | Reviewed | Routed

## Summary
Short explanation of what happened.

## Important Decisions
- Decision 1
- Decision 2

## Facts to Preserve
- Durable fact 1
- Durable fact 2

## Follow-Up Actions
- Action 1
- Action 2

## Suggested Routing
- Strategy:
- Operations:
- GTM:
- Sales:
- Delivery:
- Finance:
- Legal:
- Infrastructure:
```

---

## Agent Usage Rules
- Do not treat every conversation as permanent company truth.
- Summarize first, then route only durable facts or decisions into canonical domain folders.
- Mark assumptions clearly when the source conversation is incomplete.
- Do not store API keys, secrets, private credentials, or sensitive customer data here.
- If a memory note changes strategy, pricing, ICP, GTM, or delivery, route through `@ARK` before updating downstream documents.

---

## Operational Metadata
- **Owner Agent:** @ARK
- **File References:** relative paths from repo root
- **Document Role:** Conversation-memory scope and logging guide
- **Update Trigger:** Update when company-memory, AI-workspace, or project-session logging practices change
