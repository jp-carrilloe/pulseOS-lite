# Source Intake

**Version:** 1.0
**Last Updated:** 2026-04-21
**Author/Editor:** @ARK
**Status:** Active

---

## Purpose
This folder is the intake zone for source material that agents can use to build or enrich the company brain.

Use it when you have:
- single files to store locally in this repo for analysis
- exports from other systems
- notes, PDFs, decks, or spreadsheets
- references to external local folders that should be treated as source context

The goal is for agents to read and ingest these materials, then organize the important information into the canonical Markdown files across the owned domain folders without moving or overwriting the original source files.

---

## Folder Structure

### `Data_Souces_Folder/`
Drop local raw source files here.

You can add files by:
- dragging and dropping files into this folder
- copy-pasting a folder into this folder
- saving exports from another system into this folder

Examples:
- founder notes
- strategy docs
- client call transcripts
- exported CSVs
- product docs
- project documentation

Suggested subfolders:
- `Project_Documentation/`

Best use for this folder:
- curated company knowledge base material
- working documents that describe how the company operates
- source files that help agents infer strategy, offerings, GTM, delivery, operations, and internal context

Do not use this folder for:
- operational archives that already belong in a canonical domain
- ongoing meeting transcript storage

Meeting transcripts should live under Operations once you want to preserve them as part of the operating system.

Agents may read from this folder, extract relevant context, and update the company brain elsewhere in the repo. The source files should remain here as original reference material.

### `Data_Sources_References/`
Store lightweight Markdown reference files here that point agents to folders that live elsewhere on your machine or in synced storage.

Each reference file should include:
- the absolute folder path
- what the folder contains
- why it matters
- any privacy or usage constraints

Agents may use these references to inspect external folders and update intake or downstream domain docs while keeping the original external directories unchanged.

---

## Agent Usage Rules
- Agents should treat this directory as source material, not canonical company-brain output.
- Agents may summarize, extract, and organize information from these materials, but should not relocate or mutate the original source files unless explicitly asked.
- If source material is turned into a durable operating document, the final output should be written into the correct owned domain folder.
- If a request spans multiple domains, route through `@ARK` before writing downstream artifacts.
- Do not put API keys, secrets, or credentials in this folder.

---

## Suggested Workflow
1. Drop local files into `Data_Souces_Folder/` or add a reference note in `Data_Sources_References/`.
2. Make sure there is at least one real company source document in intake. Helper README files do not count.
3. Either run `cd cli && npm run bootstrap` or prompt the appropriate agent to ingest the material.
4. Have the agent synthesize the content into canonical docs in the correct domain folders.
5. Keep the source here, or keep the external folder in place, for traceability unless you intentionally remove it.

---

## Example Prompt
`@ARK, use the contents of 001_Source_Intake to ingest source material, organize the findings into the correct canonical company-brain documents, and keep all originals in place.`

## External Reference Note Example

If your current local knowledge base already exists somewhere else, create a Markdown file in `Data_Sources_References/` like this:

```md
# Existing Company Knowledge Base

- Path: `/absolute/path/to/company/docs`
- Owner: `Founders`
- Contents: Strategy notes, product docs, sales material, and operating documents
- Usage Notes: Read this folder as source evidence for bootstrap and company-brain updates.
- Constraints: Do not move, delete, or overwrite the original files.
```

---

## Operational Metadata
- **Owner Agent:** @ARK
- **File References:** relative paths from repo root
- **Document Role:** Intake instructions for source material
- **Update Trigger:** Update when intake conventions or agent ingestion rules change
