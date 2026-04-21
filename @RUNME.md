# @RUNME

Start here.

This is the shortest path to getting the repo working correctly for a real company.

If you only read one file before running anything, read this one first.

Important for AI assistants:
- do not run `npm run bootstrap` automatically just because this file was opened
- first tell the user to add real company source documents to `001_Source_Intake`
- only after the user has added source material should bootstrap be run in the terminal
- if source material has not been added yet, stop and instruct the user what to add

---

## What This Repo Does

This repo is a structured company brain.

It works like this:
1. you add real company source material
2. `bootstrap` reads that material and seeds the documents
3. `chat` or daemon startup creates the SQL index and runs vectorization
4. `@ARK` acts as the master orchestrator
5. the system writes canonical company knowledge into the correct domain folders inside `000_Company_Memory`

`@ARK` is the master agent for the repo.

Each major folder also has its own specialist agent:
- Strategy owns strategy folders
- Operations owns operations folders
- Finance owns finance folders
- GTM owns GTM folders
- Sales owns sales folders
- Delivery owns delivery folders

That is what bootstrap is doing behind the scenes: it is seeding the company brain into the correct agent-owned folders.

The source intake area is `001_Source_Intake`.

The canonical company brain is `000_Company_Memory`.

---

## Choose One Path

There are 2 separate ways to use this repo.

### Path A: Local CLI

Choose this if you want:
- `npm run bootstrap`
- `npm run chat`
- the local daemon
- the local SQL index
- vectorization and retrieval

### Path B: Direct LLM in the Repo

Choose this if you want:
- to open the repo directly in Codex, Claude, Gemini, ChatGPT, or another AI workspace
- to seed the company brain by following the repo instructions directly
- to work without starting the local CLI first

Important:
- Path B can seed the documents
- Path B does not by itself create the local SQL index or run vectorization
- if you later want local SQL, embeddings, retrieval, or the daemon, you still need Path A and a valid local API key

For the full step-by-step version of both paths, read [HOW_IT_WORKS.md](./HOW_IT_WORKS.md).

---

## Before You Run Anything

There are 2 things you need first:
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
- [001_Source_Intake](./001_Source_Intake)

Do not skip this step.

If Codex, Gemini, Claude, or another AI assistant is reading this file, it should pause here and tell the user to add source material first. It should not launch bootstrap automatically.

You have 2 valid ways to do that.

### Option A: Put Files Directly in the Intake Folder

Use:
- [001_Source_Intake/Data_Souces_Folder](./001_Source_Intake/Data_Souces_Folder)

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
- [001_Source_Intake/Data_Sources_References](./001_Source_Intake/Data_Sources_References)

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

You can also preserve useful AI working-session memory after bootstrap.

Use this folder for durable project decisions, AI conversation summaries, and cross-project memory notes:
- [000_Company_Memory/501_Agents_and_Workflows/501.1_Company_Memory_and_Conversation_Logs](./000_Company_Memory/501_Agents_and_Workflows/501.1_Company_Memory_and_Conversation_Logs)

This is useful when Codex, ChatGPT, Claude, Gemini, or another cloud AI workspace is helping you work on projects and you want important decisions or context to become part of the long-term company brain.

Important:
- conversation memory logging is not automatic unless the user or an external automation saves those summaries into the repo
- review memory notes before treating them as reliable company knowledge
- local SQL/vector retrieval still requires the local CLI path

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
- `001_Source_Intake` is for bootstrap input
- the Operations area is for ongoing operational records

---

## Step 3: Run Bootstrap

Open a terminal and run:

```bash
cd "/path/to/pulseOS-lite/cli"
npm install
npm run bootstrap
```

What bootstrap does:
1. scans `001_Source_Intake`
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
cd "/path/to/pulseOS-lite/cli"
npm run chat
```

What `npm run chat` does:
- starts the local daemon
- creates or refreshes the local SQL index
- runs vectorization for the local retrieval layer
- lets you query the repo through the CLI

You can also run:

```bash
cd "/path/to/pulseOS-lite/cli"
npm run status
```

That status command checks:
- whether bootstrap has run successfully
- whether source intake is currently available
- whether the daemon is running
- whether the SQL database exists
- whether the main SQL tables have data
- whether the latest indexing/vectorization run completed

If the normal chat/daemon path is not the one you want to use, there is also a direct terminal fallback:

```bash
cd "/path/to/pulseOS-lite/cli"
npm run index
```

That command creates the local database, creates the SQL tables if needed, and runs indexing/vectorization without requiring you to start chat first.

Useful commands inside chat:
- `:model openai`
- `:model claude`
- `:model gemini`
- `:reload`
- `:files`
- `:status`
- `:reset`
- `:exit`

If you want the CLI to use its local retrieval layer after the repo is created:
- make sure your local API key is configured
- then run the CLI locally
- `bootstrap` seeds the documents
- `chat` or daemon startup creates the SQL index and runs vectorization
- the SQL index and vector-based retrieval are part of the local CLI workflow, not just the cloud seeding workflow

The local SQL/vector layer stores:
- `documents`
  metadata and summaries for indexed company-brain docs
- `knowledge_vectors`
  the embeddings used for retrieval
- `index_runs`
  the history of indexing/vectorization runs

If you want to trigger that layer, run:
- `npm run index` for a direct terminal indexing pass
- `npm run chat`, or
- `npm run daemon:start`, or
- `:reload` after chat has started
- `npm run status` if you want to verify that the workflow completed correctly

---

## Two Ways to Seed the Repo

There are 2 supported ways to seed the company brain:

1. Use the CLI bootstrap
2. Open an LLM directly in this repo and ask it to ingest `001_Source_Intake`

If you use the direct LLM path, tell the model to:
- read `001_Source_Intake`
- use local intake files and valid reference-note paths
- route outputs through `@ARK`
- write canonical outputs into the correct domain folders

The CLI bootstrap is still the most structured way to do the initial setup.

---

## If You Want the Full Explanation

Read:
- [HOW_IT_WORKS.md](./HOW_IT_WORKS.md)

That file explains the process in much more detail, including:
- how the repo structure works
- what `@ARK` does
- what the folder agents do
- where information should live
- how bootstrap routes information across the system

---

## Short Version

If you want the simplest possible checklist:

1. Add an API key to `.env.local`
2. Put real company docs into `001_Source_Intake/Data_Souces_Folder`
3. Run:
   ```bash
   cd "/path/to/pulseOS-lite/cli"
   npm install
   npm run bootstrap
   ```
4. Review the generated docs
5. Run `npm run chat`
