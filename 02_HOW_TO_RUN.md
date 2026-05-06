# How It Works

This document explains how the repo works, how bootstrap seeds it, and how agents are organized across the folder structure.

---

## Start Here

The expected starting point is [01_RUNME.md](./01_RUNME.md).

That file gives the short setup flow. This document explains the underlying process in more detail so you understand what bootstrap is doing and where information should live.

---

## System Model

This repo is a structured company brain.

- `@ARK` is the master agent and overall orchestrator.
- Each major folder has its own canonical sub-agent.
- Each sub-agent owns its domain folder and is responsible for the canonical information inside it.
- Bootstrap uses source material plus this folder ownership model to seed the repo into the correct domains.

In practice:
- Strategy material should land in `102_*`
- operations material in `103_*`
- finance material in `104_*`
- GTM material in `202_*`
- sales material in `203_*`
- delivery material in `301_*`

`@ARK` coordinates across those domains when the source material spans multiple areas.

---

## Source Material

Bootstrap does not work from a manual questionnaire anymore. It works from source evidence.

Before running bootstrap, place company knowledge-base material in [`001_Source_Intake`](./001_Source_Intake/).

Use this folder for:
- strategy docs
- founder notes
- pricing notes
- product docs
- project documentation
- GTM, sales, and ICP docs
- implementation plans
- research notes
- customer feedback
- exports or working documents that reflect the actual company brain

You can provide source material in two ways:
1. Put local files into `001_Source_Intake/Data_Souces_Folder`
2. Add Markdown reference notes in `001_Source_Intake/Data_Sources_References` that point to external folders

Important rules:
- `001_Source_Intake` is for source evidence, not final canonical outputs
- bootstrap validates that usable source documents exist before generation starts
- helper README files inside the intake structure do not count as valid source material
- original source files stay in place
- final canonical outputs are written into the owned domain folders across the repo

Meeting transcripts are not part of source intake by default. Store those in Operations under the meeting-transcripts area when you want them preserved as operational records.

---

## Bootstrap Process

When you run bootstrap:

1. The CLI loads your local API keys from `.env.local` or `.env`
2. It validates available providers and chooses one
   OpenAI first, then Anthropic, then Gemini
3. It scans `001_Source_Intake`
4. It verifies there are real usable source documents
5. It asks only for the company name
6. It builds an intake evidence block from local files and valid external references
7. It fills template documents in dependency order
8. Earlier generated docs become grounding context for later docs
9. The final outputs are written into the owned domain folders

This is why `@ARK` and the folder agents matter: bootstrap is effectively seeding the strategic and operational spine of the repo into the domains those agents own.

---

## CLI

The CLI (`cli/`) is your primary gateway. It provides bootstrap plus a local chat daemon.

### 1. Configure Provider Access
Before running the daemon or bootstrap, configure at least one usable model path. Copy the `.env.example` file, rename it to `.env.local` (or `.env`), and fill in the key(s) for your preferred model when needed:
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `GEMINI_API_KEY`

OpenAI now supports two local auth paths for chat and bootstrap:
1. `OPENAI_API_KEY`
2. a local signed-in Codex session from `codex login`

Claude now supports two local auth paths for chat and bootstrap:
1. `ANTHROPIC_API_KEY`
2. a local signed-in Claude Code session from `claude auth login`

Gemini still requires a provider API key.

Optional OpenAI auth controls:
- `PULSEOS_OPENAI_AUTH_MODE=auto|api_key|codex_cli_session`
- `PULSEOS_OPENAI_CODEX_BIN=/path/to/codex`

Optional Claude auth controls:
- `PULSEOS_CLAUDE_AUTH_MODE=auto|api_key|claude_cli_session`
- `PULSEOS_CLAUDE_BIN=/path/to/claude`

If your OpenAI or Claude API key is present, PulseOS prefers it in `auto` mode. Otherwise it can use the matching local signed-in CLI session when available.

### 2. Bootstrap the Repo
```bash
cd cli && npm install
npm run bootstrap
```

Bootstrap now asks only for the company name, then reads the intake folder and referenced external folders to generate the repo documents in dependency order.

### 3. Basic Interaction
```bash
cd cli && npm install
npm run chat
```

### 3.1 Persistent Workspace Storage

The CLI now stores mutable runtime state outside the repo by default.

- default workspace root: `~/.pulseos/workspaces/<workspace-id>/`
- stored there: `knowledge-base.sqlite`, daemon state, bootstrap state, snapshots, logs, and cache
- preferred override: `PULSEOS_HOME`
- optional explicit workspace selector: `PULSEOS_WORKSPACE_ID`
- legacy direct workspace overrides still work: `PULSEOS_LITE_OPEN_SOURCE_CLI_HOME`, `PULSEOS_CLI_HOME`

This keeps Git focused on code and Markdown documents instead of pretending it is a database replication layer.

### 3.2 Embedding Limitation

In Phase 1:
- OpenAI Codex-session auth is used for chat and bootstrap
- embeddings still use `OPENAI_API_KEY` when available
- without that key, indexing and retrieval fall back to heuristic vectors

### 4. Keep the Graph Current

The graph UI reads the local SQLite index, not the Markdown folders directly. If you add, create, move, rename, or delete Markdown documents in `000_Company_Memory`, rebuild the graph/index before relying on the graph or retrieval results.

Use the graph UI `Rebuild index` / `Rebuild graph/index` button, `/reload` inside chat, or:

```bash
cd cli
npm run index
```

A browser refresh only reloads the last indexed snapshot; it does not discover newly created Markdown files by itself.

If you are containerizing the CLI or daemon:
- mount `~/.pulseos` as a persistent volume
- set `PULSEOS_HOME` to the mounted path inside the container

### Model Switching
You can switch models mid-conversation, enabling you to run whatever foundation model you prefer:
- `:model openai` (Default)
- `:model claude`
- `:model gemini`

---

## 🤖 Prompting Protocol

### 1. Domain-Specific Routing
Every domain is owned by a canonical agent. Always start your request by mentioning the agent handle or the domain.
*   "**@Strategy**: Review our mission statement for [YOUR_NAME/COMPANY]."
*   "**@Finance**: Update the budget projection for Q3."

### 2. The "Double Link" Advantage
You can "call" an agent from three locations:
1.  **Directly:** Through its canonical file (e.g., `102_Strategy_Agent.md`).
2.  **Locally:** Every domain folder has an `AGENT.md` link.
3.  **Fast Access:** All domain agents are indexed in the root `/agents/` folder (e.g., `agents/102_Strategy.md`).
4.  **Centrally:** All agents are also in `502_Execution_Engine/agents/`.

When prompting, emphasize the **link**. "Read the local `AGENT.md` before making changes to this folder."

### 3. Advanced Prompting Tips

Regardless of the model you use, here are some helpful prompting patterns:
- **Context Loading:** "Read the domain canonical and all related SOPs before proposing the new structure."
- **Logic Audits:** "Review the agent registry for inconsistencies between domains."
- **Bulk Processing:** "Process these 50 LinkedIn post templates using the @Sales tone of voice."

### Direct LLM Seeding

You can also skip the CLI and open your preferred LLM directly in this repo.

In that flow:
- point the model at `001_Source_Intake`
- ask it to ingest the source folder contents and any reference-note paths
- tell it to route outputs through `@ARK` and write canonical information into the correct owned folders

This is useful for manual or iterative seeding, but `npm run bootstrap` remains the most structured way to seed the repo in one pass.

---

## ⚡ 100x Efficiency Patterns (based on gstack)

### Boil the Lake
Don't ask for a "draft." Ask for the **complete, production-ready version**.
*   *Bad:* "Give me an outline for a GTM plan."
*   *Good:* "Write the complete 202_GTM_Strategy.md document, including mission, channel mix, and KPI trackers. Boil the lake."

### Strategic Coherence
Ensure your prompts respect the dependency chain:
1.  **FOUNDATION (102)** must exist before...
2.  **GTM (202)** can be written, which must exist before...
3.  **SALES (203)** can be executed.

If a prompt breaks this chain, ask: "Does this change in @Finance require an update to the @Strategy spine?"

---

## 🔍 Commands Reference
- `:reload` — Refresh the AI's memory after you manually add, create, or edit files.
- `cd cli && npm run index` — Rebuild the SQL-backed graph and retrieval index after documents are added, created, moved, renamed, or deleted outside the graph editor.
- graph UI `Rebuild index` / `Rebuild graph/index` — Same rebuild path from the browser UI.
- `:files` — Audit what the AI can see.
- `:status` — Check which model is currently active and session lifetime.

*Some reference concepts from where adapted from [gstack](https://github.com/garrytan/gstack).*
