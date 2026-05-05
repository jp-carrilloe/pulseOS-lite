# @RUNME

Start here.

This is the fastest path to seeing the repo come alive, then turning it into a real company operating system.

If you only read one file before running anything, read this one first.

Important for AI assistants:
- do not run `npm run bootstrap` automatically just because this file was opened
- first tell the user to add real company source documents to `001_Data_Souces`
- only after the user has added source material should bootstrap be run in the terminal
- if source material has not been added yet, stop and instruct the user what to add

---

## First Run:

From the repo root, open the local chat:

```bash
cd cli
npm install
npm run chat
```

Then, in a second terminal, open the visual graph workspace:

```bash
cd cli
npm run graph
```

What you should see:
- `npm run chat` opens the SQL-backed company-memory REPL
- `npm run graph` builds the local React graph UI and prints a private localhost URL
- the graph UI lets you browse `000_Company_Memory`, inspect the ontology, open Markdown docs, and use the docked terminal

Useful first checks inside chat:
- `/files` shows what the local index can currently read
- `/status` shows daemon/session state
- `/reload` refreshes indexing after document edits
- after adding, creating, moving, or renaming Markdown docs in `000_Company_Memory`, use the graph `Rebuild index` / `Rebuild graph/index` button or run `cd cli && npm run index` so the graph sees the new files
- `/models` lists provider defaults and example model IDs
- `/model auto` auto-picks the first configured provider
- `/model openai gpt-4o` switches to a specific provider model

Before generating company-specific content, check whether there is real source data available:

```bash
cd cli
npm run status
```

If source material is missing, add real company docs before running bootstrap. The graph and chat can still show the template structure, but bootstrap should not run until intake has usable business information.

---

## What This Repo Does

This repo is a structured company brain.

It works like this:
1. you add real company source material
2. `bootstrap` reads that material and seeds the documents
3. `chat` or daemon startup uses the existing SQL index
4. `npm run index` or `:reload` manually refreshes indexing and vectorization when you want it
5. `@ARK` acts as the master orchestrator
6. the system writes canonical company knowledge into the correct domain folders

`@ARK` is the master agent for the repo.

Each major folder also has its own specialist agent:
- Strategy owns strategy folders
- Operations owns operations folders
- Finance owns finance folders
- GTM owns GTM folders
- Sales owns sales folders
- Delivery owns delivery folders

That is what bootstrap is doing behind the scenes: it is seeding the company brain into the correct agent-owned folders.

---

## Before You Bootstrap Anything

There are 2 things you need before generating company-specific content:
- at least one valid model API key
- real company source material

If you skip the source material, bootstrap should stop and ask you to add it first.

---

## Step 1: Add an API Key

At the repo root, copy `.env.example` to `.env.local` or `.env`.

Then add at least one of these:
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY`
- `GOOGLE_API_KEY`

Bootstrap checks providers in this order:
1. `OPENAI_API_KEY`
2. `ANTHROPIC_API_KEY`
3. `GEMINI_API_KEY` or `GOOGLE_API_KEY`

If your OpenAI key is valid, bootstrap will use OpenAI first.

Important:
- if you want to use the local CLI runtime, the SQL-backed index, or any vectorization/retrieval workflow after the files are created, you must add a valid local API key
- a hosted Codex, Claude, or Gemini subscription by itself is not enough for the local SQL/vectorization pipeline
- direct cloud model access can help seed documents, but local indexing and vectorization still depend on your local provider configuration

---

## Step 2: Add Real Company Source Material

Before bootstrapping, add company knowledge-base material to:
- [001_Data_Souces](./001_Data_Souces)

This repo also includes [000_Acme_Sample_Company_Memory](./000_Acme_Sample_Company_Memory) as a public example/template. Bootstrap does not delete it automatically, so the user should decide whether to keep it, archive it, or remove it manually.

Do not skip this step.

If Codex, Gemini, Claude, or another AI assistant is reading this file, it should pause here and tell the user to add source material first. It should not launch bootstrap automatically.

You have 2 valid ways to do that.

### Option A: Put Files Directly in the Intake Folder

Use:
- [001_Data_Souces/Data_Souces_Folder](./001_Data_Souces/Data_Souces_Folder)

Good examples:
- founder notes
- company overview
- pricing docs
- product docs
- project documentation
- GTM notes
- sales or ICP notes
- operating documents

### Option B: Point to an Existing External Knowledge Base

Use:
- [001_Data_Souces/Data_Sources_References](./001_Data_Souces/Data_Sources_References)

Add a Markdown note there that points to a real folder on your computer.

Use this if your company docs already exist somewhere else and you do not want to copy them into the repo.

After bootstrap, you can continue enriching the company brain with additional sources from external systems.

Examples:
- databases
- CRM exports
- email threads
- chat conversations
- support logs
- call notes
- operational exports from other tools

Those can be added later as additional source material or references when you want to improve and expand the company brain beyond the initial bootstrap.

---

## What Counts as Valid Source Material

Valid source material means real company documents with actual business information.

Examples:
- what the company does
- who the customer is
- how the product or service works
- how pricing works
- how sales or GTM works
- how delivery or operations work

These do **not** count as valid source material:
- helper README files
- empty folders
- placeholder notes with no real company detail
- just the company name by itself

Bootstrap now checks for this before it starts generation.

---

## Important Rule About Meeting Transcripts

Meeting transcripts should **not** live in source intake by default.

They should live here instead:
- [000_Company_Memory/103_Corporate_Operations/103.5_Internal_Meeting_Transcripts](./000_Company_Memory/103_Corporate_Operations/103.5_Internal_Meeting_Transcripts)

Why:
- `001_Data_Souces` is for bootstrap input
- the Operations area is for ongoing operational records

---

## Step 3: Run Bootstrap

Open a terminal and run:

```bash
cd cli
npm install
npm run bootstrap
```

What bootstrap does:
1. scans `001_Data_Souces`
2. checks that real usable source files exist
3. asks if you want to continue
4. asks for the company name
5. validates your available model provider
6. seeds the repo documents in dependency order

If source material is missing or invalid, bootstrap should stop before generating anything.

This command should be run only after the user has confirmed that source material is in place.

---

## Step 4: Review the Generated Repo

After bootstrap finishes:
- open a few generated files
- check that the company name is correct
- check that strategy, pricing, GTM, and operations content make sense
- confirm the output is grounded in your real source material

This review step is the responsibility of the user.

You should check:
- the documents that were created
- the folders that were populated
- the reliability of the information in those outputs

Bootstrap is only meant to populate the repo from the information that was available in the initial knowledge base and the ingestion/source documents folder.

It should be treated as a strong first draft of the company brain, not as automatic proof that every document is fully correct.

It is also the user’s responsibility to keep the company brain up to date over time.

That includes deciding when to add new external information such as:
- updated CRM data
- new database exports
- new email conversations
- new chat or support conversations
- new documents from other operating systems or tools

If the output is weak, the first thing to improve is usually the source material.

---

## Step 5: Start Chat

When you are ready to interact with the repo:

```bash
cd cli
npm run chat
```

What `npm run chat` does:
- starts the local daemon
- uses the existing local SQL index
- lets you query the repo through the CLI

Important:
- the `Document Relationships` graph is SQL-backed through `document_references`
- if you see document nodes without edges, open the left sidebar `Settings` tab and run `Rebuild graph/index`, or run `cd cli && npm run index`
- if you add, create, move, or rename Markdown documents in `000_Company_Memory`, rebuild before trusting the graph; refreshing the browser only reloads the current SQLite snapshot
- indexing and vectorization are refreshed deliberately, not silently on every chat launch

### Graph Rebuild Rule

The graph is not reading Markdown files directly from the browser. It reads the local SQLite index produced by the CLI.

Whenever a user, agent, or external tool adds, creates, moves, renames, or deletes Markdown files in `000_Company_Memory`, rebuild the graph/index before relying on the UI or retrieval layer:

```bash
cd cli
npm run index
```

You can also use `/reload` inside chat or the graph UI `Rebuild index` / `Rebuild graph/index` button. A normal browser refresh is only a visual reload of the last indexed snapshot.

Useful commands inside chat:
- `/help`
- `/models`
- `/model auto`
- `/model openai`
- `/model claude`
- `/model gemini`
- `/model openai gpt-4o`
- `/model claude claude-opus-4-6`
- `/model gemini gemini-2.0-flash`
- `/reload`
- `/files`
- `/status`
- `/reset`
- `/exit`

If you want the CLI to use its local retrieval layer after the repo is created:
- make sure your local API key is configured
- then run the CLI locally
- `bootstrap` seeds the documents
- `chat` or daemon startup uses the existing SQL index
- `npm run index` or `:reload` manually refreshes indexing and vectorization
- the SQL index and vector-based retrieval are part of the local CLI workflow, not just the cloud seeding workflow

The local SQL/vector layer stores:
- `documents`
  metadata, summaries, and `ontology_domain` placement for indexed company-brain docs
- `knowledge_vectors`
  the embeddings used for retrieval
- `index_runs`
  the history of indexing/vectorization runs
- `crm_objects`
  provider-neutral CRM records with normalized fields plus raw provider payload JSON
- `crm_sync_runs`
  CRM sync attempt history, provider, status, row counts, and errors

The canonical CRM sync documentation lives here:
- [000_Company_Memory/203_Sales_Enablement_Hub/203.8_CRM_and_Revenue_Data](./000_Company_Memory/203_Sales_Enablement_Hub/203.8_CRM_and_Revenue_Data)

In this repo, **ontology** means the structural map of the company brain. In v1 the ontology domain comes from the numbered folder where a document lives, for example Strategy, Operations, Sales Enablement, Fundraising, or Projects. The graph UI keeps this readable by separating the company ontology hierarchy from document-to-document references.

If you want to trigger that layer, run:
- `npm run chat`, or
- `npm run graph`, or
- `npm run daemon:start`, or
- `:reload` after chat has started

If you want to connect the same company brain through MCP-compatible clients after setup, read [05_MCP_SETUP.md](./05_MCP_SETUP.md).

To view the basic company-memory ontology visually, run:

```bash
npm run graph
```

That builds the local React workspace and prints a private local browser URL. The UI is scoped to `000_Company_Memory` and includes:
- a left folder/document explorer
- a center interactive graph
- a docked right terminal sidebar
- a right Markdown reader/editor

The graph UI has two focused modes:
- **Company Ontology** shows the `000_Company_Memory` folder hierarchy only
- **Document Relationships** shows indexed Markdown documents and direct Markdown references only

The printed graph URL uses a temporary token only for the first open. That first launch creates a local browser session and then redirects you to a clean localhost URL, so normal refresh works without keeping the token in the address bar. This still helps keep the local graph data endpoint from being casually read by unrelated local processes, browser tabs, extensions, or webpages while the daemon is running.

The graph is interactive: pan, zoom, fit, reset, and drag nodes to make the view easier to inspect. Those graph movements are visual only. Saving a Markdown document from the right editor updates that file inside `000_Company_Memory` and refreshes the SQLite/vector index.

If a user, agent, or external tool adds new Markdown files directly to `000_Company_Memory`, run the UI `Rebuild index` / `Rebuild graph/index` button, `cd cli && npm run index`, or `/reload` inside chat before relying on the graph. The graph reads from SQLite; it does not discover new files from a normal browser refresh alone.

The graph workspace terminal is a real local shell sidebar.

What it supports:
- `Run PulseOS`, which starts the shell if needed and sends `pulseos`
- normal local commands such as `git`, `npm`, `rg`, `claude`, and `gemini` when those CLIs are installed on your machine
- side-by-side document editing and terminal work, because the terminal remains visible even when the document panel is open

---

## Two Ways to Seed the Repo

There are 2 supported ways to seed the company brain:

1. Use the CLI bootstrap
2. Open an LLM directly in this repo and ask it to ingest `001_Data_Souces`

If you use the direct LLM path, tell the model to:
- read `001_Data_Souces`
- use local intake files and valid reference-note paths
- route outputs through `@ARK`
- write canonical outputs into the correct domain folders

The CLI bootstrap is still the most structured way to do the initial setup.

---

## If You Want the Full Explanation

Read:
- [03_HOW_IT_WORKS.md](./03_HOW_IT_WORKS.md)

That file explains the process in much more detail, including:
- how the repo structure works
- what `@ARK` does
- what the folder agents do
- where information should live
- how bootstrap routes information across the system

---

## Short Version

If you want the simplest possible checklist:

1. See it immediately:
   ```bash
   cd cli
   npm install
   npm run chat
   ```
2. Open the graph in another terminal:
   ```bash
   cd cli
   npm run graph
   ```
3. Check whether real intake/source material is available:
   ```bash
   cd cli
   npm run status
   ```
4. Add an API key to `.env.local`
5. Put real company docs into `001_Data_Souces/Data_Souces_Folder`
6. Only after source material is in place, run:
   ```bash
   npm run bootstrap
   ```
7. Review the generated docs
8. Run `npm run chat` again and use `/reload`, `npm run index`, or the graph UI rebuild button after adding new Markdown files
