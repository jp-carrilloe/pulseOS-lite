# How It Works

This guide is the detailed, step-by-step explanation of how to use this repo.

If you are new here, start with [@RUNME.md](./@RUNME.md) first. That file is the short version. This file is the full walkthrough.

The goal of this repo is simple:
- you add real company source material
- `bootstrap` reads that material and seeds the documents
- `chat` or daemon startup creates the SQL index and runs vectorization
- `@ARK` routes the information into the correct domain folders
- the domain agents then own and maintain those folders over time

The two most important top-level folders are:
- `001_Source_Intake` — where raw source material goes before seeding or ingestion
- `000_Company_Memory` — where canonical, durable company knowledge lives after seeding or review

---

## Simple Recommended Flow

Choose **one path** first.

This repo supports two different ways of working. They are related, but they are not the same setup.

### Path A: Local CLI

Choose this if you want:
- `npm run bootstrap`
- `npm run chat`
- the local daemon
- the SQL index
- embeddings and vector retrieval

Recommended steps:
1. Add real company source material to `001_Source_Intake`
2. Add a valid local API key to `.env.local`
3. Run `npm run bootstrap` from `cli/`
4. Review the generated documents and folders
5. Run `npm run chat`
6. Run `npm run status` if you want a workflow health check across bootstrap, intake, SQL, and vectorization

### Path B: Direct LLM in the Repo

Choose this if you want:
- to open the repo directly in Codex, Claude, Gemini, ChatGPT, or another AI workspace
- to seed the company documents by following the repo instructions
- to avoid starting with the local CLI

Recommended steps:
1. Add real company source material to `001_Source_Intake`
2. Open the repo in your LLM workspace
3. Tell the model to read the source material first
4. Tell it to route outputs through `@ARK`
5. Review the generated documents and folders

Important:
- Path B can seed the company documents without starting the local CLI first
- Path B does not by itself create the local SQL index or run vectorization
- if you later want local SQL, embeddings, or retrieval, you still need to switch to Path A and add a valid local API key

---

## 0. Choose Your Path First

There are **two different ways** to use this repo, and it is important not to confuse them.

If you are new here, stop and choose one:
- choose **Path A** if you want local terminal commands, the daemon, SQL indexing, embeddings, or vector search
- choose **Path B** if you want to work directly with Codex, Claude, Gemini, ChatGPT, or another LLM that can already read this repo

You can use both over time, but they are still two separate workflows.

### Path B: Seed the Repo Directly with Codex or Another Cloud AI Workspace

This means:
- you open this repo directly in Codex, Gemini, ChatGPT, or another AI workspace that can read the files in this repo
- you add source material to `001_Source_Intake`
- you ask the model to seed the repo from that source material

This path is useful because:
- you can seed the company brain without using the local CLI first
- you may not need to add a local API key for the initial seeding step if your Codex or cloud subscription is already providing the model access
- it is good for one-time setup, manual seeding, or iterative document generation inside the repo

Important limitation:
- this path is mainly for **reading the repo and generating or updating the company documents**
- it does **not** replace the local CLI runtime if you want the terminal-based daemon, `npm run chat`, or local model switching inside the repo
- it also does **not** replace the local SQL indexing and vectorization pipeline

### Path A: Run the Local CLI

This means:
- you use the terminal inside `cli/`
- you run `npm run bootstrap` to seed the documents
- you run `npm run chat` to start the daemon, create the SQL index, and run vectorization

This path is useful because:
- it gives you the local daemon and REPL experience
- it supports repeatable local workflows
- it lets you interact with the repo as an ongoing local company brain

Important requirement:
- if you want to run the local CLI, you need to add a valid model API key first
- for example: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, or `GOOGLE_API_KEY`
- this also applies if you want to use the local SQL table, vectorization, embeddings, or retrieval layer after the documents are created

In simple terms:
- **Path B** can be enough to seed the repo
- **Path A** requires a valid provider API key
- **Path A** is also the path for the local SQL table, vectorization, and retrieval layer

If someone does not understand which one to choose, use this rule:
- if you only want to seed or update documents directly inside the repo with Codex, Claude, Gemini, ChatGPT, or another connected AI workspace, choose **Path B**
- if you want to use `npm run bootstrap`, `npm run chat`, `npm run index`, or the local daemon, choose **Path A**

One more important rule:
- if you want local indexing, embeddings, vector search, or retrieval after the repo is populated, that belongs to **Path A**, not just Path B

---

## 1. What This Repo Is

This repo is a structured company knowledge base.

It is not just a place to dump notes. It is a mapped operating system with:
- one master orchestrator: `@ARK`
- one primary agent for each major domain folder
- one canonical place for each type of company information

That means the repo is designed to answer questions like:
- where should pricing information live?
- where should GTM strategy live?
- where should sales enablement live?
- who owns each folder?

The answer is: each major folder already has an owner agent, and bootstrap uses that ownership structure when it generates the initial company brain.

---

## 2. What `@ARK` Does

`@ARK` is the master agent for the repo.

Its role is to:
- understand the overall company context
- coordinate across multiple domains
- route information into the correct folders
- make sure the structure stays coherent

In simple terms:
- `@ARK` is the orchestrator
- sub-agents are the specialists

Examples:
- if a document talks about mission, positioning, and pricing, `@ARK` will route that toward Strategy
- if a document talks about onboarding workflows or internal SOPs, `@ARK` will route that toward Operations
- if a document contains ICP or market insights, `@ARK` will route that toward Market Intel or GTM

---

## 3. What the Folder Agents Do

Each major folder has its own canonical agent.

Examples:
- `000_Company_Memory/102_Corporate_Strategy_and_Foundation` is owned by `@Strategy`
- `000_Company_Memory/103_Corporate_Operations` is owned by `@Operations`
- `000_Company_Memory/104_Finance_and_Financial_Planning` is owned by `@Finance`
- `000_Company_Memory/105_Technical_Infrastructure_and_Security` is owned by `@Infrastructure`
- `000_Company_Memory/201_Market_Intelligence_and_ICP` is owned by `@MarketIntel`
- `000_Company_Memory/202_Go-to-Market_Strategy` is owned by `@GTM`
- `000_Company_Memory/203_Sales_Enablement_Hub` is owned by `@Sales`
- `000_Company_Memory/301_Client_Delivery_and_Onboarding` is owned by `@Delivery`

This matters because bootstrap does not write information randomly. It writes canonical outputs into the folders those agents own.

So:
- source material goes into `001_Source_Intake`
- final company knowledge gets written into the domain folders

---

## 4. What Goes Into `001_Source_Intake`

`001_Source_Intake` is the input area for bootstrap.

Think of it as the temporary intake zone for raw company knowledge.

You should place source material here before running bootstrap.

Good examples of source material:
- founder notes
- business plans
- product docs
- service descriptions
- pricing notes
- ICP research
- sales decks
- GTM plans
- implementation plans
- market research
- customer research
- project documentation
- operating notes that describe how the company actually works

This folder is for real company evidence, not polished final outputs.

It should contain the kinds of documents that help the system understand:
- what the company does
- who the customer is
- how the company sells
- how the company operates
- what the product or service is
- how work is delivered

After bootstrap, you can also keep enriching the company brain with additional information from external systems.

Examples:
- databases
- CRM exports
- email threads
- chat conversations
- support conversations
- call logs
- analytics exports
- other operational systems

Those are not required for the first bootstrap, but they are useful for improving and updating the company brain over time.

---

## 5. What Does Not Go Into `001_Source_Intake`

Do not use `001_Source_Intake` for everything.

These should not be treated as default bootstrap intake:
- helper README files
- empty placeholder folders
- final canonical operating-system documents
- internal meeting transcripts you want to preserve as records

Meeting transcripts should live here instead:
- [000_Company_Memory/103_Corporate_Operations/103.5_Internal_Meeting_Transcripts](./000_Company_Memory/103_Corporate_Operations/103.5_Internal_Meeting_Transcripts)

Why:
- source intake is meant to seed the company brain
- meeting transcripts are usually ongoing operational records after the system exists

If you later want an agent to use meeting transcripts as input for updates, that can still happen, but they should not be the default bootstrap location.

---

## 6. The Two Ways to Add Source Material

There are two supported ways to provide source material.

### Option A: Put Files Directly Into the Intake Folder

Use:
- [001_Source_Intake/Data_Souces_Folder](./001_Source_Intake/Data_Souces_Folder)

This is the simplest option.

Put files there if you already have copies of the documents you want bootstrap to read.

Examples:
- `founder-notes.md`
- `pricing.txt`
- `product-roadmap.md`
- `icp-research.csv`
- `project-summary.json`

Supported text-style formats for bootstrap ingestion are:
- `.md`
- `.txt`
- `.json`
- `.csv`

### Option B: Reference External Folders

Use:
- [001_Source_Intake/Data_Sources_References](./001_Source_Intake/Data_Sources_References)

This option is for cases where your real documents already live somewhere else on your computer and you do not want to copy them into the repo.

In that case:
- create a Markdown note inside `Data_Sources_References`
- point that note to the external folder path
- bootstrap will read from that referenced location

This is useful when your company knowledge base already exists in another workspace.

It is also useful later when you want to add more context from other systems after bootstrap, such as CRM exports, chat exports, database snapshots, or email archives.

---

## 7. What a Good Source Folder Looks Like

A good intake folder usually contains a mix of documents that together explain the company.

For example:

`001_Source_Intake/Data_Souces_Folder/`
- `founder-story.md`
- `company-overview.md`
- `pricing-and-packages.md`
- `product-roadmap.md`
- `ideal-customer-profile.md`
- `go-to-market-notes.md`
- `Project_Documentation/project-alpha-summary.md`

That is enough to help bootstrap infer:
- strategy
- positioning
- offers
- market
- GTM
- sales context
- delivery context

What is usually not enough:
- only a single empty README
- only the company name
- only one shallow note like “we help startups grow”

Bootstrap works best when the source material contains actual business detail.

---

## 8. What Bootstrap Validates Before It Starts

Before bootstrap begins generation, it now checks that usable source material actually exists.

That means:
- helper README files do not count
- empty folders do not count
- invalid reference notes do not count
- missing external folders do not count

If bootstrap does not find real source documents, it stops early and tells you to add valid material first.

This is intentional.

It prevents the system from generating a fake company brain from almost no information.

---

## 9. Path A Runbook: First-Time Setup for the Local CLI

This section is only for **Path A**.

Use this section if you want:
- `npm run bootstrap`
- `npm run chat`
- the local daemon
- the local SQL index
- vectorization and retrieval

If you are using Codex, Claude, Gemini, ChatGPT, or another AI workspace directly inside the repo and you do **not** want to run local CLI commands yet, skip this section and go to **Section 10** instead.

### Step 1: Open the Repo Root

Make sure you are in:

```bash
cd "/path/to/pulseOS-lite"
```

### Step 2: Add API Keys

Create `.env.local` from `.env.example` and add at least one provider key.

You need this step for the **local CLI path**.

If you are only using Codex or another cloud AI workspace to seed the repo directly, you may not need to do this first.

However, if you want any of the following local features, you do need this step:
- `npm run bootstrap`
- `npm run chat`
- the local daemon
- the SQL-backed index
- vectorization
- embeddings
- retrieval over the local knowledge base

Supported keys:
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY`
- `GOOGLE_API_KEY`

Bootstrap prefers providers in this order:
1. `OPENAI_API_KEY`
2. `ANTHROPIC_API_KEY`
3. `GEMINI_API_KEY` or `GOOGLE_API_KEY`

If your OpenAI key is valid, bootstrap will use OpenAI first.

This is important because the local runtime is not powered just by your hosted Codex, Claude, or Gemini subscription.

If you want the repo to build or use the local SQL/vector layer after files are created, you must configure a local provider key.

### Step 3: Add Real Company Source Material

Put documents into:
- [001_Source_Intake/Data_Souces_Folder](./001_Source_Intake/Data_Souces_Folder)

Or create reference notes in:
- [001_Source_Intake/Data_Sources_References](./001_Source_Intake/Data_Sources_References)

If you are unsure what to add, start with:
- company overview
- founder notes
- product or service notes
- pricing notes
- ICP or market notes
- GTM or sales notes

### Step 4: Install CLI Dependencies

```bash
cd "/path/to/pulseOS-lite/cli"
npm install
```

### Step 5: Run Bootstrap

```bash
npm run bootstrap
```

What happens next:
1. bootstrap scans the source intake folders
2. it verifies that real usable documents exist
3. it asks if you want to continue
4. it asks for the company name
5. it validates available model providers
6. it seeds the repo documents in dependency order

### Step 6: Review the Output

After bootstrap finishes:
- open a few generated docs in the major domain folders
- check if the company name, positioning, pricing, and operating logic are reasonable
- confirm the outputs match the real source material

This review step is part of the user’s responsibility.

You should review:
- each important document that was created
- the main folders that were populated by bootstrap
- whether the information is reliable, grounded, and complete enough for your real use

Bootstrap is only intended to populate the repo from the information that was available in the initial knowledge base and the ingestion/source documents folder.

That means:
- it can organize and synthesize what was available
- it can infer missing connections
- but it cannot guarantee perfect accuracy when the source material is incomplete, weak, or ambiguous

You should therefore treat bootstrap as the initial population layer, then validate and refine the resulting company brain.

The user is also responsible for keeping the company brain current over time.

That means deciding when to bring in new information from additional systems, for example:
- CRM updates
- new database exports
- recent email threads
- recent chat conversations
- support logs
- operational records from other tools

Bootstrap gives you the initial structure and first population pass. Ongoing freshness depends on the user continuing to add or reference updated information.

### Step 7: Start Chat

```bash
cd "/path/to/pulseOS-lite/cli"
npm run chat
```

This starts the local CLI chat system so you can query or edit the repo with AI assistance.

It also:
- starts the local daemon
- creates or refreshes the SQL-backed local index
- runs vectorization for the local retrieval layer

---

## 10. Path B Runbook: Direct Seeding Without the Local CLI

This section is only for **Path B**.

If you are using Codex, Claude, Gemini, ChatGPT, or another AI workspace that can already read this repo directly, you can seed the repo without starting with the local CLI.

Use this path when:
- you want to generate the company brain directly in the repo
- you have an AI workspace subscription already handling model access
- you do not yet want to configure local CLI API keys

Steps:

1. Open this repo in your AI workspace
2. Add real company source material to `001_Source_Intake`
3. Tell the model to read the source material first
4. Tell it to route outputs through `@ARK`
5. Tell it to write final canonical content into the appropriate domain folders
6. Review the generated documents

Important:
- this path is valid for seeding and maintaining the company documents
- if you later want to use the local CLI with `npm run chat`, you still need to add a valid local API key
- if you later want to run local SQL indexing, embeddings, vectorization, or retrieval, you also need to add a valid local API key

Example instruction:

```text
Read 001_Source_Intake first. Use @ARK to route the information into the correct domain folders. Seed the company brain from the source materials, keep originals in place, and do not run the local bootstrap command automatically.
```

---

## 11. How the SQL and Vector Layer Works

The local CLI has a separate retrieval layer that lives alongside the markdown repo.

This layer is not the same thing as bootstrap.

Use this mental model:
- `bootstrap` creates or updates the markdown documents
- `chat` or daemon startup creates and refreshes the local SQL index
- the SQL index stores document metadata and embeddings
- vectorization powers semantic retrieval over the curated company brain

### Where the Database Lives

By default, the local CLI stores its state here:

`cli/.pulseos-lite-open-source-cli-state/knowledge-base.sqlite`

This path comes from the CLI runtime configuration.

If you override the CLI home with environment variables, the database path can move, but by default it stays in the local CLI state folder.

### What the SQL Database Stores

The local SQLite database stores the retrieval layer for the company brain.

The main tables are:

1. `documents`
   - one row per indexed knowledge-base document
   - stores path, title, summary, taxonomy domain, status, owner agent, content hash, and timestamps

2. `knowledge_vectors`
   - one row per document summary embedding
   - stores the embedding model and the vector itself
   - this is the vector search layer

3. `index_runs`
   - one row per indexing run
   - stores when indexing started and finished, how many files were seen, how many were indexed, and whether the run succeeded or failed

Important:
- this SQL database indexes the curated knowledge-base markdown docs in the repo
- it does not treat `001_Source_Intake` as the searchable company-brain output
- intake is for source evidence; the SQL/vector layer is for the canonical repo knowledge base

### What Uses the SQL Database

The implemented SQL/vector path today is the **local CLI and daemon**.

That means:
- when you run `npm run chat`, the CLI starts or connects to the local daemon
- the daemon uses the SQLite database to retrieve relevant company-brain documents
- the CLI embeds the user question, compares it to stored vectors, and builds a smaller grounded prompt from the matching docs
- when you run `:reload`, the daemon refreshes that indexed view
- when you run `npm run index`, the same SQL database is created or refreshed without opening chat
- when you run `npm run status`, the CLI checks whether that database and indexing/vectorization state look healthy

This works from the same terminal or a different terminal because the database is a persistent local file.

The default file is:

`cli/.pulseos-lite-open-source-cli-state/knowledge-base.sqlite`

So if you open a new terminal later and run:

```bash
cd "/path/to/pulseOS-lite/cli"
npm run chat
```

the CLI will use the same local company-brain index, refreshing it if needed.

### What MCP Does and Does Not Do Today

This repo does **not** currently include a dedicated MCP server that exposes the SQL/vector database as a formal MCP tool.

So the current state is:
- implemented today: local CLI, local daemon, SQLite index, vector retrieval
- not implemented yet: a standalone MCP server for querying the SQL/vector database

When the docs mention MCP-style usage, they mean this practical pattern:
- keep this repo as the canonical company brain
- give your MCP-compatible assistant access to this repo as a local workspace or filesystem context
- tell the assistant to read the relevant markdown folders when working in another project
- if the assistant has terminal access and needs vector retrieval, tell it to run the CLI commands from `cli/`

In other words:
- direct workspace/MCP-style access can read the markdown company brain
- the local CLI/daemon is what uses the SQL table and vectors today
- a future dedicated MCP server could expose that SQL/vector retrieval layer directly, but that is not part of the current implementation

### What Vectorization Means Here

Vectorization means:
- the CLI creates an embedding for the summary of each indexed markdown document
- those embeddings are stored in `knowledge_vectors`
- when you ask a question in `npm run chat`, the CLI compares your query embedding to those stored vectors
- it then retrieves the most relevant documents and uses them to build the prompt context

This is what enables semantic retrieval instead of only keyword matching.

### What Creates the SQL Tables and Runs Vectorization

These commands matter:

1. `npm run bootstrap`
   - seeds the markdown documents
   - does **not** create the SQL index
   - does **not** run vectorization

2. `npm run chat`
   - starts the daemon
   - creates or refreshes the SQL index
   - runs vectorization
   - enables retrieval-backed chat

3. `npm run daemon:start`
   - starts the daemon directly
   - also creates or refreshes the SQL index
   - also runs vectorization

4. `:reload` inside chat
   - re-indexes the repo
   - re-runs vectorization for the local retrieval layer

5. `npm run status`
   - checks whether bootstrap completed
   - checks whether source intake is available
   - checks whether the daemon is running
   - checks whether the SQL database exists
   - checks whether the main SQL tables contain data
   - checks the latest indexing/vectorization run status

6. `npm run index`
   - manually creates the SQLite database if it does not exist
   - manually creates the SQL tables if they do not exist
   - manually runs indexing and vectorization without starting chat

### What You Need in Order to Use It

To use the SQL/vector layer locally, you need a valid local provider API key.

Examples:
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY`
- `GOOGLE_API_KEY`

A hosted Codex, Claude, or Gemini subscription alone is not enough for this local runtime layer.

That hosted access may be enough to seed documents directly in the repo, but the local SQL/vector pipeline still depends on local configuration.

### Manual Terminal Fallback

If an LLM is operating via the terminal and you want explicit manual steps instead of relying on `npm run chat`, use:

```bash
cd "/path/to/pulseOS-lite/cli"
npm install
npm run index
```

What this does:
- creates the SQLite database file if missing
- creates the `documents` table if missing
- creates the `knowledge_vectors` table if missing
- creates the `index_runs` table if missing
- scans the curated markdown company brain
- writes document metadata into the SQL database
- creates the embeddings/vector records
- records the indexing run

If you want a forced full rebuild, run:

```bash
cd "/path/to/pulseOS-lite/cli"
node --import tsx/esm index-kb.ts --force
```

This manual fallback is especially useful when:
- you want a terminal-based LLM to perform the retrieval setup step directly
- you want to rebuild the SQL/vector layer without entering chat first
- you want to separate document seeding from retrieval setup in a very explicit way

---

## 12. What Bootstrap Actually Does

Bootstrap does not fill every file randomly.

It follows dependency order.

That means it generates the repo from the top down:
- first the core strategic foundation
- then market and GTM layers
- then sales and delivery layers

Why this matters:
- later files can use earlier files as grounding
- the repo becomes more internally consistent
- strategy can flow into GTM, and GTM can flow into sales

So bootstrap is not just “fill placeholders.”
It is really:
- read source evidence
- infer the company structure
- route the information through `@ARK`
- seed the correct domain folders in order

It is not a guarantee that every generated statement is already verified to production quality.
It is also not the step that creates the local SQL index or runs vectorization.

---

## 13. Where Information Ends Up

Here is a simple mental model for where generated knowledge usually lands.

- strategy, mission, positioning, pricing:
  `000_Company_Memory/102_Corporate_Strategy_and_Foundation`
- operations, SOPs, internal process, meeting records:
  `000_Company_Memory/103_Corporate_Operations`
- finance, budgets, financial planning:
  `000_Company_Memory/104_Finance_and_Financial_Planning`
- infrastructure, systems, security, technical operations:
  `000_Company_Memory/105_Technical_Infrastructure_and_Security`
- market research and ICP:
  `000_Company_Memory/201_Market_Intelligence_and_ICP`
- GTM strategy:
  `000_Company_Memory/202_Go-to-Market_Strategy`
- sales assets and enablement:
  `000_Company_Memory/203_Sales_Enablement_Hub`
- delivery and onboarding:
  `000_Company_Memory/301_Client_Delivery_and_Onboarding`

If a piece of source material spans several areas, `@ARK` coordinates that routing.

---

## 14. After Bootstrap: How to Work With the Repo

Once the repo is seeded, you can keep using the CLI.

Start chat:

```bash
cd "/path/to/pulseOS-lite/cli"
npm run chat
```

This is the step that creates or refreshes the local SQL index and runs vectorization for retrieval.

Useful commands inside chat:
- `:model openai`
- `:model claude`
- `:model gemini`
- `:reload`
- `:files`
- `:status`
- `:reset`
- `:exit`

Use `:reload` after you manually add or edit repo files and want the CLI to refresh its indexed view.

---

## 15. Using This Repo as a Company Brain Across Other Projects

You can use this repo as your central private company brain even when you are working somewhere else.

There are two common ways to do that.

### Option A: Use This Repo as a Separate Knowledge Base Workspace

This means:
- keep this repo as the main company brain
- open it when you need strategy, GTM, operations, pricing, or delivery context
- query it directly through Codex or the local CLI

This is the simplest model.

Use it when:
- you want one canonical place for company knowledge
- you do not want your company brain mixed into every working repo
- you want to maintain this repo as your private operating workspace

### Option B: Link It Into Other Work Through Codex or MCP

This means:
- keep this repo as the canonical company brain
- when working in another project, also give your AI workspace access to this repo
- instruct the model to read from this company-brain repo when answering questions or drafting work

In practice, that can mean:
- opening this repo alongside another repo in Codex
- adding this repo as a filesystem or workspace context in your local MCP-compatible setup
- telling the model to use this repo as the company knowledge source while working on a separate codebase, document set, or execution workflow

Examples:
- you are writing a new sales deck in another workspace and want the model to use the ICP and pricing from this repo
- you are drafting onboarding material in another repo and want it aligned with the strategy and operations docs here
- you are building automation or agent workflows and want those workflows to read from this repo as the source of truth

Simple rule:
- this repo should remain the **canonical source of company knowledge**
- other repos or tools can read from it, but this is the place to keep the strategic and operational truth organized

If you want to use this repo through MCP-style tooling, the practical pattern is:
1. keep this repo clean and up to date
2. expose it as an accessible local workspace or filesystem context
3. tell the model explicitly that this repo is the company brain
4. reference the relevant folders or docs when you want grounded output

Example instruction:

```text
Use `/path/to/pulseOS-lite` as the company brain. Read the relevant domain docs there before drafting anything in this project.
```

This repo can therefore work in either of these roles:
- the main private working space where you build and maintain the company brain directly
- the canonical knowledge base that other repos, tools, workflows, or MCP-connected assistants read from

To keep it useful in either role, the user should continue adding updated information from external systems when needed. The repo does not stay fresh automatically unless the user keeps feeding it new context.

---

## 16. Cloud AI Workspace Memory and Conversation Logs

This repo can also be linked as a company-memory companion when you work in cloud AI workspaces such as Codex, ChatGPT, Claude, Gemini, or another assistant that can read local files, synced files, or multiple project folders.

This is useful when:
- you are working in another codebase but want the model to remember company strategy
- you are drafting documents outside this repo but want them aligned to the company brain
- you are making project decisions that should be remembered later
- you want important AI conversations to become durable company memory instead of disappearing in a chat history

Recommended pattern:
1. Keep this repo as the canonical company brain.
2. Open or link this repo alongside the active project.
3. Tell the model to read the relevant folders in this repo before doing project work.
4. At the end of important work, ask the model to summarize durable decisions, facts, and follow-ups.
5. Save that summary into the company memory log folder.
6. Periodically route reviewed memories into the correct canonical domain folders.

Use this folder for durable AI/project conversation memory:
- [000_Company_Memory/501_Agents_and_Workflows/501.1_Company_Memory_and_Conversation_Logs](./000_Company_Memory/501_Agents_and_Workflows/501.1_Company_Memory_and_Conversation_Logs)

Example instruction for another project:

```text
Use `/path/to/pulseOS-lite` as the company brain. Read the relevant Strategy, GTM, Sales, Operations, and Delivery docs before answering. At the end, create a short memory summary of durable decisions and suggested updates for the company brain.
```

Important:
- this does not mean every raw conversation should become permanent truth
- save durable decisions, facts, and useful project memory, not every chat message
- the user is responsible for reviewing these memories before routing them into canonical documents
- cloud workspace access can read and update the Markdown brain
- the local SQL/vector database is still created and queried by the CLI/daemon, not by a dedicated MCP server

This makes company memory part of the project scope:
- source documents seed the first company brain
- domain folders hold the canonical operating knowledge
- conversation memory logs preserve useful work that happens after bootstrap
- the CLI/vector layer indexes curated Markdown so the local daemon can retrieve it later

---

## 17. If You Want to Seed the Repo Without the CLI

You can also open an LLM directly inside this repo and ask it to seed the company brain.

If you do that, tell the model to:
- read `001_Source_Intake`
- use both the local intake files and any valid external reference notes
- route outputs through `@ARK`
- write final canonical content into the appropriate domain folders
- treat folder agents as owners of their respective folders

This works, but `npm run bootstrap` is still the most structured and reliable way to do the initial setup.

---

## 18. Common Mistakes to Avoid

- Do not run bootstrap with only the company name and no documents.
- Do not assume helper README files count as source material.
- Do not put final canonical company docs back into `001_Source_Intake`.
- Do not use meeting transcripts as the default intake area.
- Do not assume that direct Codex/cloud seeding automatically means the local CLI is ready to run.
- Do not forget that the local CLI still needs a valid model API key.
- Do not expect one tiny note to produce a high-quality company brain.

If the output feels weak, the first thing to improve is usually the source material.

---

## 19. Simple Recommended Workflow

If you want the simplest possible workflow, use this:

1. Open [@RUNME.md](./@RUNME.md)
2. Add an API key to `.env.local`
3. Put real company docs into `001_Source_Intake/Data_Souces_Folder`
4. Run:
   ```bash
   cd "/path/to/pulseOS-lite/cli"
   npm install
   npm run bootstrap
   ```
5. Review the generated docs
6. Run `npm run chat`
7. Keep refining the repo with the domain agents and `@ARK`

That is the main path.
