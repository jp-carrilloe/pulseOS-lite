# How It Works

This guide is the detailed, step-by-step explanation of how to use this repo.

If you are new here, start with [01_RUNME.md](./01_RUNME.md) first. That file is the short version. This file is the full walkthrough.

The goal of this repo is simple:
- you add real company source material
- the bootstrap process reads that material
- `@ARK` routes the information into the correct domain folders
- the domain agents then own and maintain those folders over time

---

## 0. The IDE-First Philosophy

The absolute best way to run the CLI, the agents, and the company memory is normally inside your IDE, whatever that is—Cursor, VS Code, or Antigravity. 

While the system provides a visually friendly UI (`npm run graph`), **most of the power is harnessed directly via the CLI**. 

You can run Codex, Claude, or Gemini in your terminal or directly in the IDE and just tell them to call the CLI tools. This allows the models to handle document ingestion, semantic retrieval, and maintaining the graph. You can build your documents and agents inside the company memory graph and just use the UI as an additional visual guide. The real power is happening directly via the CLI, calling on the models to read, edit, update files and relationships, and update the knowledge graph.

---

## 1. The 2 Ways to Use This Repo

There are **two different ways** to use this repo, and it is important not to confuse them.

### Way 1: Seed the Repo Directly with Codex, Claude or Another LLM provider

This means:
- you open this repo directly in Codex, Gemini, ChatGPT, or another AI workspace that can read the files in this repo
- you add source material to `001_Data_Souces`
- you ask the model to seed the repo from that source material, you can tag @Ark master agent orchestrator to help you with the seeding process

This path is useful because:
- you can seed the company brain without using the local CLI first
- you may not need to add a local API key for the initial seeding step if your Codex or cloud subscription is already providing the model access
- it is good for one-time setup, manual seeding, or iterative document generation inside the repo

Important limitation:
- this path is mainly for **reading the repo and generating or updating the company documents**
- it does **not** replace the local CLI runtime if you want the terminal-based daemon, `npm run chat`, or local model switching inside the repo

### Way 2: Run the Local CLI

This means:
- you use the terminal inside `cli/`
- you run `npm run bootstrap`
- you run `npm run chat`

This path is useful because:
- it gives you the local daemon and REPL experience
- it supports repeatable local workflows
- it lets you interact with the repo as an ongoing local company brain

Important requirement:
- if you want to run the local CLI, you need to add a valid model API key first
- for example: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, or `GOOGLE_API_KEY`

In simple terms:
- **direct Codex/cloud use** can be enough to seed the repo
- **local CLI use** requires a valid provider API key

If someone does not understand which one to choose, use this rule:
- if you only want to seed or update documents directly inside the repo with Codex or another connected AI workspace, use **Way 1**
- if you want to use `npm run bootstrap`, `npm run chat`, or the local daemon, use **Way 2**

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
- `102_Corporate_Strategy_and_Foundation` is owned by `@Strategy`
- `103_Corporate_Operations` is owned by `@Operations`
- `104_Finance_and_Financial_Planning` is owned by `@Finance`
- `105_Technical_Infrastructure_and_Security` is owned by `@Infrastructure`
- `201_Market_Intelligence_and_ICP` is owned by `@MarketIntel`
- `202_Go-to-Market_Strategy` is owned by `@GTM`
- `203_Sales_Enablement_Hub` is owned by `@Sales`
- `301_Client_Delivery_and_Onboarding` is owned by `@Delivery`

Inside Sales, `203.8_CRM_and_Revenue_Data` is the canonical place for CRM sync rules, revenue object definitions, and local CRM landing-table governance.

This matters because bootstrap does not write information randomly. It writes canonical outputs into the folders those agents own.

So:
- source material goes into `001_Data_Souces`
- final company knowledge gets written into the domain folders

---

## 4. What Goes Into `001_Data_Souces`

`001_Data_Souces` is the input area for bootstrap.

Think of it as the temporary intake zone for raw company knowledge.

You should place source material here before running bootstrap.

This repo also includes [000_Acme_Sample_Company_Memory](./000_Acme_Sample_Company_Memory) as a public example/template. It is reference material only. Bootstrap does not delete it automatically when you seed a real company.

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

---

## 5. What Does Not Go Into `001_Data_Souces`

Do not use `001_Data_Souces` for everything.

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
- [001_Data_Souces/Data_Souces_Folder](./001_Data_Souces/Data_Souces_Folder)

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
- [001_Data_Souces/Data_Sources_References](./001_Data_Souces/Data_Sources_References)

This option is for cases where your real documents already live somewhere else on your computer and you do not want to copy them into the repo.

In that case:
- create a Markdown note inside `Data_Sources_References`
- point that note to the external folder path
- bootstrap will read from that referenced location

This is useful when your company knowledge base already exists in another workspace.

---

## 7. What a Good Source Folder Looks Like

A good intake folder usually contains a mix of documents that together explain the company.

For example:

`001_Data_Souces/Data_Souces_Folder/`
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

## 9. Step-by-Step: First-Time Setup for the Local CLI

If you want to use the **local CLI**, follow these steps in order.

### Step 1: Open the Repo Root

Make sure you are in:

```bash
cd path/to/pulseos-lite
```

### Step 2: Add API Keys

Create `.env.local` from `.env.example` and add at least one provider key.

You need this step for the **local CLI path**.

If you are only using Codex or another cloud AI workspace to seed the repo directly, you may not need to do this first.

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

### Step 3: Add Real Company Source Material

Put documents into:
- [001_Data_Souces/Data_Souces_Folder](./001_Data_Souces/Data_Souces_Folder)

Or create reference notes in:
- [001_Data_Souces/Data_Sources_References](./001_Data_Souces/Data_Sources_References)

If you are unsure what to add, start with:
- company overview
- founder notes
- product or service notes
- pricing notes
- ICP or market notes
- GTM or sales notes

### Step 4: Install CLI Dependencies

```bash
cd cli
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
6. it generates the repo documents in dependency order

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

### Step 7: Start Chat

```bash
cd cli
npm run chat
```

This starts the local CLI chat system so you can query or edit the repo with AI assistance.

---

## 10. Step-by-Step: Direct Seeding Without the Local CLI

If you are using Codex, Gemini, ChatGPT, or another AI workspace that can already read this repo directly, you can seed the repo without starting with the local CLI.

Use this path when:
- you want to generate the company brain directly in the repo
- you have an AI workspace subscription already handling model access
- you do not yet want to configure local CLI API keys

Steps:

1. Open this repo in your AI workspace
2. Add real company source material to `001_Data_Souces`
3. Tell the model to read the source material first
4. Tell it to route outputs through `@ARK`
5. Tell it to write final canonical content into the appropriate domain folders
6. Review the generated documents

Important:
- this path is valid for seeding and maintaining the company documents
- if you later want to use the local CLI with `npm run chat`, you still need to add a valid local API key

Example instruction:

```text
Read 001_Data_Souces first. Use @ARK to route the information into the correct domain folders. Seed the company brain from the source materials, keep originals in place, and do not run the local bootstrap command automatically.
```

---

## 11. What Bootstrap Actually Does

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

---

## 12. Where Information Ends Up

Here is a simple mental model for where generated knowledge usually lands.

- strategy, mission, positioning, pricing:
  `102_Corporate_Strategy_and_Foundation`
- operations, SOPs, internal process, meeting records:
  `103_Corporate_Operations`
- finance, budgets, financial planning:
  `104_Finance_and_Financial_Planning`
- infrastructure, systems, security, technical operations:
  `105_Technical_Infrastructure_and_Security`
- market research and ICP:
  `201_Market_Intelligence_and_ICP`
- GTM strategy:
  `202_Go-to-Market_Strategy`
- sales assets and enablement:
  `203_Sales_Enablement_Hub`
- delivery and onboarding:
  `301_Client_Delivery_and_Onboarding`

If a piece of source material spans several areas, `@ARK` coordinates that routing.

---

## 13. After Bootstrap: How to Work With the Repo

Once the repo is seeded, you can keep using the CLI.

Start chat:

```bash
cd cli
npm run chat
```

Useful commands inside chat:
- `:model openai`
- `:model claude`
- `:model gemini`
- `:reload`
- `:files`
- `:status`
- `:reset`
- `:exit`

Use `:reload` only when you manually add or edit repo files and want the CLI to refresh its indexed view and vectors.

When you add or create new Markdown documents in `000_Company_Memory` outside the graph editor, rebuild the graph before relying on it. Use `/reload` in chat, the graph UI `Rebuild graph` button, or `cd cli && npm run index`; a normal browser refresh only reloads the current SQLite-backed graph snapshot.

To inspect the company-memory structure visually, run:

```bash
npm run graph
```

That builds the local React workspace, starts the same local daemon, and prints a private browser URL. The UI is scoped to `000_Company_Memory` and has three working areas:
- **Left explorer:** a VS Code-style folder/document tree for `000_Company_Memory`
- **Center graph:** an interactive graph backed by the SQLite index
- **Right terminal sidebar:** a real local shell docked into the workspace
- **Right reader/editor:** a basic Markdown reader and editor for selected documents

The graph has two intentionally separate views so the company brain does not become visually overloaded:
- **Company Ontology** shows only the `000_Company_Memory` folder hierarchy
- **Document Relationships** shows only indexed Markdown documents and direct Markdown links between them

The printed graph URL uses a temporary token only for the first open. That first launch creates a local browser session and then redirects you to a clean localhost URL, so normal refresh works without keeping the token in the address bar. This is still a lightweight local access guard: the daemon is an HTTP server on `127.0.0.1`, so the one-time token plus local session help prevent unrelated local processes, browser tabs, extensions, or webpages from casually calling the graph data endpoint while the daemon is running.

The graph is interactive. You can drag nodes, pan the canvas, zoom in or out, fit the graph to the viewport, and reset to the generated default layout. Graph movements are visual only and do not persist layout changes. If you edit and save a Markdown document in the right panel, the daemon writes that file and refreshes the SQLite index/vector layer so chat and graph retrieval stay current.

If a new Markdown file is created by a user, agent, IDE, or external tool, run `Rebuild graph` in the UI or `cd cli && npm run index` from the terminal so the file is inserted into SQLite and can appear in the graph, summaries, and retrieval results.

The graph workspace terminal is meant for local repo work without leaving the browser UI.

What it supports:
- a real local interactive shell
- a `Run PulseOS` button that starts the shell if needed and sends `pulseos`
- normal local CLI commands such as `git`, `npm`, `rg`, `claude`, and `gemini` when those tools are installed on the machine
- side-by-side document editing and terminal work, because the terminal stays visible when the document panel is open

The graph read path is now more SQL-native than before:
- document metadata still comes from the `documents` table
- document-to-document links are persisted during indexing into `document_references`
- graph reads no longer need to reopen every Markdown file just to rebuild reference edges

The retrieval prompt path is also more stable:
- semantic ranking still uses summary vectors from `knowledge_vectors`
- the full prompt context for top matches is assembled from persisted `document_chunks`
- the daemon and MCP server no longer need to reread those top documents from disk on every query

The graph UI also includes a rebuild advisor. It compares the current Markdown documents to the indexed SQLite state, warns when the weekly refresh window has passed, and estimates whether a rebuild is likely to be cheap or more deliberate. The advisor view itself is read-only. It does not rewrite the rebuild change log on every refresh. The audit log is updated by daemon startup, MCP startup, or explicit rebuild/scan flows so the history reflects real maintenance events instead of simple page loads.

If document nodes appear in `Document Relationships` without edges, that usually means the SQL graph layer needs to be refreshed, not that the Markdown links disappeared from the source files. In that case, use the left sidebar `Settings` tab and run `Rebuild graph`, or run `cd cli && npm run index`.

The same rebuild step is required when newly created documents are missing from the graph. The UI reads the indexed SQL layer; it does not rescan the filesystem on every browser refresh.

The editor is intentionally narrow. It only reads and saves Markdown inside `000_Company_Memory`; source intake, CLI files, repo configuration, generated assets, and hidden/system folders are not editable from the graph UI.

This is a practical ontology view, not a full semantic knowledge graph yet. It uses the SQLite `documents` table, each document's ontology domain, the folder structure, and direct Markdown references.

Alongside the retrieval tables, the local SQLite database also includes provider-neutral CRM sync tables:
- `crm_objects`
- `crm_sync_runs`

Those CRM tables are the landing zone for future CRM imports and syncs. The canonical documentation for that layer lives in `203_Sales_Enablement_Hub/203.8_CRM_and_Revenue_Data`.

In this repo, **ontology** means the company-brain map that tells the system where knowledge belongs and how it can be traversed. The v1 ontology has three layers:
- **Folder/domain ontology:** the numbered folders inside `000_Company_Memory`, such as Strategy, Operations, GTM, Sales, Fundraising, and Projects.
- **Document ontology placement:** every indexed Markdown file gets an `ontology_domain` in SQLite based on the folder it belongs to.
- **Document relationship ontology:** the graph shows reference links from Markdown links between documents in a separate document-only view.

That gives the system a basic vertical and horizontal map:
- vertical means moving from company memory → domain folder → subfolder → document
- horizontal means moving from one document to another through direct Markdown references

The richer ontology you described earlier, such as organizations → departments → projects → people → documents, is still a future layer. The naming now leaves room for that future semantic graph while keeping the current structural map simple.

---

## 14. Using This Repo as a Company Brain Across Other Projects

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
2. either expose it as an accessible local workspace/filesystem context or start the local MCP server using the wrapper script in `.codex/pulseos-lite-mcp-launch.sh`
3. tell the model explicitly that this repo is the company brain
4. reference the relevant folders or docs when you want grounded output

The step-by-step MCP/client setup guide lives in [05_MCP_SETUP.md](./05_MCP_SETUP.md). *(Note: If you use Claude Code, the MCP server is already auto-configured out-of-the-box via the hidden `.claude.json` file!)*

The local MCP server exposes a small tool surface:
- `repo_status`
- `rebuild_advisor`
- `rebuild_now`
- `list_files`
- `retrieve_context`

Important behavior:
- `retrieve_context` is read-only by default
- if the index is stale, callers should inspect `rebuild_advisor` first
- if they intentionally want retrieval to refresh the index first, they can pass `refresh_if_stale: true`
- if no index exists yet, `retrieve_context` tells the caller to run `rebuild_now` or opt into `refresh_if_stale`

Example instruction:

```text
Use path/to/pulseos-lite as the company brain. Read the relevant domain docs there before drafting anything in this project.
```

This repo can therefore work in either of these roles:
- the main private working space where you build and maintain the company brain directly
- the canonical knowledge base that other repos, tools, workflows, or MCP-connected assistants read from

---

## 15. If You Want to Seed the Repo Without the CLI

You can also open an LLM directly inside this repo and ask it to seed the company brain.

If you do that, tell the model to:
- read `001_Data_Souces`
- use both the local intake files and any valid external reference notes
- route outputs through `@ARK`
- write final canonical content into the appropriate domain folders
- treat folder agents as owners of their respective folders

This works, but `npm run bootstrap` is still the most structured and reliable way to do the initial setup.

---

## 16. Common Mistakes to Avoid

- Do not run bootstrap with only the company name and no documents.
- Do not assume helper README files count as source material.
- Do not put final canonical company docs back into `001_Data_Souces`.
- Do not use meeting transcripts as the default intake area.
- Do not assume that direct Codex/cloud seeding automatically means the local CLI is ready to run.
- Do not forget that the local CLI still needs a valid model API key.
- Do not expect one tiny note to produce a high-quality company brain.

If the output feels weak, the first thing to improve is usually the source material.

---

## 17. Simple Recommended Workflow

If you want the simplest possible workflow, use this:

1. Open [01_RUNME.md](./01_RUNME.md)
2. Add an API key to `.env.local`
3. Put real company docs into `001_Data_Souces/Data_Souces_Folder`
4. Run:
   ```bash
   cd cli
   npm install
   npm run bootstrap
   ```
5. Review the generated docs
6. Run `npm run chat`
7. Keep refining the repo with the domain agents and `@ARK`

That is the main path.
