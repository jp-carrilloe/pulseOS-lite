# PulseOS Lite Open Source — The Strategic Growth Engine

> "Complexity is the enemy of execution. Strategy is the art of focusing on the right things."

This is the strategic hub for **PulseOS Lite Open Source**. It is not a folder of documents; it is an **AI-driven growth organism** designed to turn your preferred coding agent into a high-performance executive team.

**Built for builders who value strategic clarity and 100x execution velocity.**

---

## The PulseOS Lite Open Source Standard: High-Alpha Execution

We don't do "templates." we do **Alpha**. Every file in this repo is a living component of our growth engine, governed by three core laws:

1. **Boil the Lake:** Completeness is our default. We don't ship placeholders or "TBD"s. If a document costs minutes to finish with AI, we ship the 100% version.
2. **Search Before Building:** We value the 1000x pattern over the 1x design. We search, validate, and then implement the battle-tested best practice.
3. **Strategic Coherence:** Execution without alignment is just noise. Everything we build (from sales sequences to code) must link back to the **Strategy Spine (102)**.

### The Compression Advantage

| Task type                   | Traditional Team | PulseOS Lite Open Source | Compression |
|-----------------------------|------------------|----------------------|-------------|
| GTM Strategy & Positioning  | 14 days          | 4 hours              | ~30x        |
| Financial Growth Models     | 5 days           | 1 hour               | ~40x        |
| Sales Enablement Assets     | 2 days           | 15 min               | ~60x        |
| Technical Audits            | 3 days           | 30 min               | ~50x        |

---

## 🚀 Quick Start

1. **Start with [`@RUNME.md`](./@RUNME.md):**
   That is the main onboarding document and the right place for a new user to begin.

2. **Add Source Material First:**
   Put company knowledge base material into [`001_Data_Souces`](./001_Data_Souces/).

   This repo also includes [`000_Acme_Sample_Company_Memory`](./000_Acme_Sample_Company_Memory/) as a public sample/template. It is reference material only. Bootstrap will not delete it automatically when you seed a real company.

   Good inputs include:
   - strategy docs
   - founder notes
   - product docs and PRDs
   - sales decks and ICP notes
   - implementation plans
   - project documentation
   - customer research, call notes, and operating docs

   You can provide that material in two ways:
   - through the CLI bootstrap flow, which reads local intake files and external folder references
   - by opening your preferred LLM directly in this repo and asking it to seed the company brain from `001_Data_Souces`

   After bootstrap, you can keep enriching the company brain with additional information from external systems such as databases, CRM exports, email threads, and chat conversations.

   Internal meeting transcripts should not be part of source intake by default. Store them under [`000_Company_Memory/103_Corporate_Operations/103.5_Internal_Meeting_Transcripts`](./000_Company_Memory/103_Corporate_Operations/103.5_Internal_Meeting_Transcripts/) when they become part of the operating system.

3. **Install and Bootstrap:**
   ```bash
   cd cli && npm install && npm run bootstrap
   ```

4. **Start the Engine:**
   ```bash
   npm run chat
   ```

Canonical company memory lives under [`000_Company_Memory`](./000_Company_Memory/). Bootstrap and direct LLM seeding use the raw source material in `001_Data_Souces`, then write durable company knowledge into the numbered folders inside `000_Company_Memory`.

Bootstrap now asks only for the company name, but only after it has confirmed that real source material exists. It then reads:
- local files from [`001_Data_Souces/Data_Souces_Folder`](./001_Data_Souces/Data_Souces_Folder/)
- external folder references from [`001_Data_Souces/Data_Sources_References`](./001_Data_Souces/Data_Sources_References/)

In simple terms:
- `bootstrap` seeds the documents
- `chat` or daemon startup uses the existing SQL index
- `npm run index` or the graph `Rebuild graph` action refreshes indexing and vectorization manually

Important relationship note:
- the `Document Relationships` graph is backed by the local SQL index, not by direct client-side Markdown parsing at render time
- if document nodes appear without relationship edges, use the graph `Settings` tab and run `Rebuild graph`, or run `cd cli && npm run index`

The bootstrap engine now auto-detects your available model provider and prefers `OPENAI_API_KEY` first, then Anthropic, then Gemini.

If you want to use the local CLI runtime, SQL-backed indexing, or vectorization/retrieval after the repo is created, you still need a valid local provider API key. A hosted Codex, Claude, or Gemini subscription alone is not enough for that local pipeline.

Keeping that information current is the responsibility of the user. Bootstrap gives the initial population layer, but the company brain stays useful only if the user continues to add or reference updated source material over time.

### Local SQL + Vector Retrieval

The local CLI creates a SQLite database for retrieval.

By default it lives at:
- `cli/.pulseos-lite-open-source-cli-state/knowledge-base.sqlite`

The main tables are:
- `documents`
  one row per indexed knowledge-base markdown document, including its title, summary, owner, status, and `ontology_domain`
- `knowledge_vectors`
  one embedding per document summary
- `index_runs`
  one row per indexing/vectorization run
- `crm_objects`
  a provider-neutral CRM mirror for contacts, companies, deals, activities, tickets, and custom records, with normalized fields plus `raw_json`
- `crm_sync_runs`
  one row per CRM sync attempt, including provider, status, row counts, and error text

The `ontology_domain` is the document's structural placement in the company brain. For files inside `000_Company_Memory`, it is inferred from the numbered domain folder, such as `102_Corporate_Strategy_and_Foundation`, `203_Sales_Enablement_Hub`, or `600_Projects`. In v1, this is the basic ontology layer: it lets the CLI and graph understand where each document belongs before any richer organization, department, project, or people ontology is added.

What uses this database today:
- the local CLI chat flow (`npm run chat`) uses the SQLite database and stored vectors to retrieve relevant company-brain documents before answering
- the local daemon uses the same database, so a different terminal can access the same indexed company brain as long as it runs from this repo's `cli/` folder
- the local graph UI (`npm run graph`) uses the same SQLite index in two focused views: Company Ontology for the folder hierarchy, and Document Relationships for a gravity-style Markdown reference map with quiet connector lines and hover-only document labels; the graph can be panned, zoomed, fitted, reset, and manually rearranged by dragging nodes
- `npm run index` can create or refresh the same database without opening chat
- `npm run status` checks whether the database, tables, and latest indexing/vectorization run are healthy

### 💻 IDE-First & Agent-First Architecture

The UI provided by `npm run graph` is primarily a visually friendly interface. While it is useful as an additional visual guide to the company structure, **the true power of the company memory is harnessed directly via the CLI and your IDE**. 

The best way to run the CLI, the agents, and the company memory is natively inside your preferred IDE (Cursor, VS Code, Antigravity, etc.). 

You can run your agents (Codex, Claude, Gemini) in your terminal or directly in the IDE and simply tell them to call the CLI tools. This allows the models to autonomously:
- Perform document ingestion and retrieval (`npm run chat` or `npm run index`)
- Read, edit, and update markdown files and their relationships
- Maintain and update the knowledge graph directly from the terminal

Because the graph and company memory are backed by markdown files and a local SQLite CLI layer, the models have full autonomy to read and rewrite the strategy without needing a complex UI layer in between. Build your documents and agents inside the graph, and use the CLI to supercharge them.

Commands:
- `npm run bootstrap`
  seeds the markdown documents only
- `npm run chat`
  starts the daemon, creates or refreshes the SQL index, and runs vectorization
- `npm run graph`
  starts the daemon and prints a private local browser URL for the interactive two-mode ontology/document graph UI
- `npm run index`
  manually creates the SQLite database, creates the SQL tables if needed, and runs indexing/vectorization without starting chat
- `npm run status`
  checks bootstrap status, intake readiness, daemon state, SQL table creation, and the latest indexing/vectorization status
- `npm run daemon:start`
  starts the daemon directly and also creates or refreshes the SQL index plus vectorization
- `:reload`
  re-indexes the repo and re-runs vectorization from inside chat

### Manual Fallback for Terminal-Based LLMs

If an LLM is working through the terminal and you do not want to rely on `npm run chat` to create the retrieval layer, use this fallback:

```bash
cd cli
npm install
npm run index
```

That command:
- creates `knowledge-base.sqlite` if it does not exist
- creates the `documents`, `knowledge_vectors`, `index_runs`, `crm_objects`, and `crm_sync_runs` tables if they do not exist
- scans the curated markdown knowledge base
- writes document metadata into `documents`
- writes embeddings into `knowledge_vectors`
- records the run in `index_runs`

If you want to force a full re-index from the terminal, run:

```bash
cd cli
node --import tsx/esm index-kb.ts --force
```

### Cloud AI Workspace Company Memory

This repo can also be used as a company memory layer for cloud AI workspaces such as Codex, ChatGPT, Claude, Gemini, or any assistant that can read a local repo or synced workspace.

Recommended pattern:
- keep this repo as the canonical company brain
- link or open it alongside other project repos when working in a cloud AI workspace
- tell the model to read this repo before drafting strategy, product, GTM, sales, operations, or delivery work
- save important project decisions and conversation summaries back into the repo so the company memory improves over time

Use this folder for durable AI/project conversation memory:
- [`000_Company_Memory/501_Agents_and_Workflows/501.1_Company_Memory_and_Conversation_Logs`](./000_Company_Memory/501_Agents_and_Workflows/501.1_Company_Memory_and_Conversation_Logs/)

Important:
- cloud AI workspace access can read and update the Markdown company brain
- the local SQL/vector retrieval layer is still powered by the CLI and daemon
- conversation logging is not automatic unless the user or an external automation saves those summaries into the repo
- users are responsible for reviewing logged memories before treating them as reliable company knowledge

> **🔒 Privacy & Security:** All information, API keys, and data inputs run entirely locally on your machine and are securely stored within your local environment.

For the full setup flow, process explanation, and agent structure, read **[@RUNME.md](./@RUNME.md)** first and then **[HOW_IT_WORKS.md](./HOW_IT_WORKS.md)** for the deeper “How It Works” walkthrough.
For MCP/client integration, also read **[MCP_SETUP.md](./MCP_SETUP.md)**.

---

## 🏗️ The Hybrid 100s Framework

All core memory folders are grouped inside [`000_Company_Memory`](./000_Company_Memory/) so the repo root stays focused on onboarding, source intake, and local tooling.

| Layer | Domain | canonical Agent |
|:---|:---|:---|
| **101** | [System Control](000_Company_Memory/101_System_Overview/) | **@ARK** (Chief of Staff) |
| **102** | [Corporate Strategy](000_Company_Memory/102_Corporate_Strategy_and_Foundation/) | **@Strategy** |
| **103** | [Operations Hub](000_Company_Memory/103_Corporate_Operations/) | **@Operations** |
| **104** | [Finance & Economy](000_Company_Memory/104_Finance_and_Financial_Planning/) | **@Finance** |
| **105** | [Tech & Infrastructure](000_Company_Memory/105_Technical_Infrastructure_and_Security/) | **@Infrastructure** |
| **106** | [Legal & Compliance](000_Company_Memory/106_Legal_and_Compliance/) | **@Legal** |
| **201** | [Market Intel](000_Company_Memory/201_Market_Intelligence_and_ICP/) | **@MarketIntel** |
| **202** | [GTM Strategy](000_Company_Memory/202_Go-to-Market_Strategy/) | **@GTM** |
| **203** | [Sales Enablement](000_Company_Memory/203_Sales_Enablement_Hub/) | **@Sales** |
| **301** | [Client Delivery](000_Company_Memory/301_Client_Delivery_and_Onboarding/) | **@Delivery** |
| **302** | [Analytics](000_Company_Memory/302_Analytics_and_Performance_Intelligence/) | **@Analytics** |
| **401** | [Partnerships](000_Company_Memory/401_Strategic_Partnerships/) | **@Partnerships** |
| **402** | [Fundraising](000_Company_Memory/402_Fundraising/) | **@Fundraising** |
| **502** | [Execution Engine](000_Company_Memory/502_Execution_Engine/) | **@AUTONOMOUS** |
| **600** | [Projects](000_Company_Memory/600_Projects/) | **@ARK** |

Inside `203_Sales_Enablement_Hub`, the CRM sync and revenue data model now lives in [`203.8_CRM_and_Revenue_Data`](./000_Company_Memory/203_Sales_Enablement_Hub/203.8_CRM_and_Revenue_Data/). That section defines the provider-neutral CRM landing shape used by the local SQLite layer for future HubSpot, Attio, Salesforce, or CSV syncs.

---

## 🤖 The "Double Link" Agent Network

We use a **Double Link** architecture to ensure agents are never more than one click away:
- **Fast Call:** Domain agent shortcuts live in [`000_Company_Memory/000_Agent_Shortcuts/`](./000_Company_Memory/000_Agent_Shortcuts/) for instant terminal reference.
- **Local Context:** Every domain folder has an `AGENT.md` link for local orchestration.
- **Execution Tooling:** [`000_Company_Memory/502_Execution_Engine/`](./000_Company_Memory/502_Execution_Engine/) holds execution infrastructure and integration scaffolding, not private task-agent prompts.
- **Machine Registry:** A strictly formatted [`agent_registry.yaml`](./000_Company_Memory/501_Agents_and_Workflows/agent_registry.yaml) acts as a machine-readable dictionary, enabling non-LLM external pipelines (like Make.com, local Python scripts, or GitHub Actions) to query and route exactly which agents exist without having to parse complex Markdown text.

### The Lazy-Loader Libraries
To prevent prompt-bloat, the system inherently supports separating actionable knowledge into dynamic registries:
- [`/skills/`](./skills/) — Standard Operating Procedures (SOPs) or exact logic steps that agents map and load only when instructed.
- [`/tools/`](./tools/) — Payload parameters and API schema definitions that grant external software interaction.

---

## 🤝 Attribution
Part of this repository's architecture and 100x efficiency philosophy are inspired by the [gstack](https://github.com/garrytan/gstack) methodology by Garry Tan. We acknowledge and appreciate the open-source concepts of "Boil the Lake" and the dual-layer agent framework which serve as the foundation of this engine's execution logic.

---

## License
MIT — Fork it, build it, ship it.

*Powered by PulseOS Lite Open Source — Built by JP Carrillo for Strategic Clarity at Scale.*
