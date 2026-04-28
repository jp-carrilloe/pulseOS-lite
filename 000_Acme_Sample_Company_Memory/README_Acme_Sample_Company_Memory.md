# Acme Sample Company Memory

**Status:** Active
- **Owner Agent:** @ARK
- **Last Updated:** 2026-04-28
- **Purpose:** Persistent sample company memory for local testing

## What this folder is

This folder contains a reusable Acme Inc sample company memory with linked Markdown documents across strategy, operations, finance, infrastructure, legal, market intelligence, GTM, sales, and delivery.

It is intentionally kept in the repository so you can test document structure, references, prompts, and graph behavior without having to recreate the sample set each time.

## How it behaves

- `npm run bootstrap` does **not** delete this folder.
- The main curated SQLite knowledge-base index excludes this folder by design.
- That means the Acme sample stays available on disk without being merged into the primary company-memory tables used for normal retrieval.

## How to test it safely

### 1. Inspect the sample files directly

Open any document in this folder and review the cross-links:

- `101_Overview/101.0_Acme_Company_Overview.md`
- `102_Strategy/102.1_Acme_Strategy.md`
- `202_GTM/202.1_Acme_GTM_Strategy.md`
- `203_Sales/203.1_Acme_Sales_Enablement.md`

### 2. Use it as a reference pattern

Copy structure, metadata, and linking style from these files when building or validating a real company memory.

### 3. Test isolated ingestion logic

If you want to test indexing or graph behavior with the Acme sample included, temporarily point a separate test harness or temporary repo fixture at this folder rather than changing the main repo index rules.

Recommended approach:

- create a temporary test repo
- copy `000_Acme_Sample_Company_Memory/` into that fixture
- run the indexer against the fixture
- inspect the resulting SQLite rows and graph edges there

### 4. Keep production onboarding clean

Put real onboarding material in:

- `001_Data_Souces/Data_Souces_Folder/`
- `001_Data_Souces/Data_Sources_References/`

Then run:

```bash
cd cli
npm run bootstrap
```

That workflow will use the real intake sources and leave this Acme sample untouched.

## Important note

If you want the Acme sample to appear in the main SQLite `documents` table or graph snapshot for a one-off experiment, the current exclusion rule in `cli/retrieval.ts` would need to be changed temporarily. It is excluded on purpose so normal repo usage stays clean.
