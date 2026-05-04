# CLAUDE.md — Ops Repository Guide

This file programs your preferred coding agent's behavior in this repository. Read it before acting on any request.

---

## What this repo is

A structured Markdown operating system for [CLIENT_NAME]. Every folder is a domain. Every domain has one canonical agent that owns it. @ARK is the master orchestrator that routes across all of them.

---

## CLI — Ops Daemon

A local AI daemon (`cli/`) connects this repo to OpenAI, Claude, and Gemini. It indexes all `.md` files on startup and lets you query or edit the repo via a terminal REPL.

**Start chatting:**
```bash
cd cli && npm run chat                    # OpenAI (default)
npm run chat -- --model claude
npm run chat -- --model gemini
```

**Bootstrap a new company (fills all template placeholders from source material in one run):**
```bash
cd cli && npm run bootstrap
```
Bootstrap now asks only for the company name, then reads source material from `001_Data_Souces/Data_Souces_Folder` and `001_Data_Souces/Data_Sources_References`. It runs in dependency order: foundation docs first (102.x), then market + GTM (201-202), then sales and delivery (203+). Each document is grounded in intake evidence plus all previously generated documents.

Workflow note:
- `npm run bootstrap` seeds the documents
- `npm run chat` or daemon startup creates or refreshes the SQL index and runs vectorization
- `npm run index`, `/reload`, or the graph UI `Rebuild index` / `Rebuild graph/index` button refreshes indexing and vectorization
- after adding, creating, moving, renaming, or deleting Markdown documents in `000_Company_Memory`, rebuild before relying on the graph; a browser refresh only reloads the last SQLite snapshot

The local SQLite layer also includes provider-neutral CRM sync tables:
- `crm_objects`
- `crm_sync_runs`

The canonical CRM sync and revenue data model lives in `000_Company_Memory/203_Sales_Enablement_Hub/203.8_CRM_and_Revenue_Data/`.

Bootstrap safety rule:
- Do not run bootstrap automatically just because `@RUNME.md`, `README.md`, or this file was opened.
- First confirm that the user has added real company source material to `001_Data_Souces`.
- If source material is missing, instruct the user to add it before running `npm run bootstrap` in the terminal.

**REPL commands while chatting:**
```
/model auto                   — auto-pick the first configured provider
/model openai gpt-4o          — switch provider and concrete model ID
/models                       — list provider defaults and examples
/reset                        — clear conversation history
/reload                       — re-index repo files after edits or new docs
/files                        — list what's indexed
/status                       — daemon info
/exit                         — quit
```

**Daemon lifecycle:**
```bash
npm run index          # manual DB/table/index/vectorization rebuild without chat
npm run status         # workflow health check: bootstrap, intake, SQL, vectorization
npm run daemon:start   # start background daemon (auto-started on chat)
npm run daemon:stop    # stop it
npm run daemon:status  # health + session info
```

**API keys** — add to `.env` at repo root:
```
OPENAI_API_KEY=your_openai_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
```

Bootstrap validates available providers before generation begins and prefers them in this order:
1. `OPENAI_API_KEY`
2. `ANTHROPIC_API_KEY`
3. `GEMINI_API_KEY` or `GOOGLE_API_KEY`

The daemon stays alive between sessions (1hr idle timeout). Re-indexing happens automatically if files have changed since last start.

---

---

## Agent Routing Table

When a request maps to a domain, load the canonical agent file before responding. Do not guess — route first.

| Mention / Domain | Canonical Agent File |
|:---|:---|
| `@ARK`, cross-domain, orchestration | `000_Company_Memory/101_System_Overview/Ark_Master_Agent/ARK_Master_Orchestrator.md` |
| `@Strategy`, mission, vision, brand, pricing | `000_Company_Memory/102_Corporate_Strategy_and_Foundation/102_Strategy_Agent.md` |
| `@Operations`, SOPs, HR, vendors, processes | `000_Company_Memory/103_Corporate_Operations/103_Operations_Agent.md` |
| `@Finance`, budgets, models, forecasts | `000_Company_Memory/104_Finance_and_Financial_Planning/104_Finance_Agent.md` |
| `@Infrastructure`, architecture, APIs, security, compliance | `000_Company_Memory/105_Technical_Infrastructure_and_Security/105_Infrastructure_Agent.md` |
| `@Legal`, contracts, risk, regulatory | `000_Company_Memory/106_Legal_and_Compliance/106_Legal_Agent.md` |
| `@MarketIntel`, ICP, research, competitive | `000_Company_Memory/201_Market_Intelligence_and_ICP/201_Market_Intel_Agent.md` |
| `@GTM`, go-to-market, positioning, campaigns | `000_Company_Memory/202_Go-to-Market_Strategy/202_GTM_Strategy_Agent.md` |
| `@Sales`, enablement, sequences, outreach | `000_Company_Memory/203_Sales_Enablement_Hub/203_Sales_Enablement_Agent.md` |
| `@Delivery`, onboarding, client ops | `000_Company_Memory/301_Client_Delivery_and_Onboarding/301_Delivery_Agent.md` |
| `@Analytics`, reporting, KPIs, performance | `000_Company_Memory/302_Analytics_and_Performance_Intelligence/302_Analytics_Agent.md` |
| `@Partnerships`, BD, alliances | `000_Company_Memory/401_Strategic_Partnerships/401_Partnership_Agent.md` |
| `@Fundraising`, investors, decks, diligence | `000_Company_Memory/402_Fundraising/402_Fundraising_Agent.md` |

---

## Two-Layer Double-Link Model

We use a **Double Link** system to ensure every agent is accessible both centrally and locally:

1. **Canonical Source:** The authoritative agent file lives in its domain folder.
   - e.g., `000_Company_Memory/102_Corporate_Strategy_and_Foundation/102_Strategy_Agent.md`

2. **Shortcut Link:** Domain agents are symlinked into `000_Company_Memory/000_Agent_Shortcuts/` for central access.
   - e.g., `000_Company_Memory/000_Agent_Shortcuts/102_Strategy.md` -> canonical

3. **Local Link:** Every domain folder contains an `AGENT.md` symlink pointing to its canonical file.
   - e.g., `000_Company_Memory/102_Corporate_Strategy_and_Foundation/AGENT.md` -> `102_Strategy_Agent.md`

4. **Execution Tooling:** `000_Company_Memory/502_Execution_Engine/` contains local daemon and integration scaffolding. It does not contain private task-scoped agent prompt files.

**Rule:** Always edit the **canonical source**. Symlinks will update automatically.

---

## Prompting & CLI Usage

Refer to [HOW_TO_PROMPT.md](HOW_TO_PROMPT.md) for detailed instructions on multi-model prompting (`:model`) and using the AI daemon effectively.

---

## Routing Protocol

1. Parse the user's intent.
2. Match to one or more domains in the table above.
3. Load the canonical agent file for each matched domain.
4. If multi-domain: route through `@ARK` first.
5. If the domain is unclear: ask one targeted question, then route.

Never perform deep specialist work without first loading the relevant agent file — it defines scope, constraints, and dependencies.

---

## Document Conventions

- Dates: ISO 8601 (`2026-04-14`)
- File references: relative paths from repo root
- Status field: `Template` | `Active` | `Deprecated`
- Owner field: always one of the `@` agent handles above
- Update trigger: defined per-doc; cascade upstream → downstream when a strategic layer changes

---

## What NOT to do

- Do not create new agent files without updating `agent_registry.yaml` and the swarm index.
- Do not write to a domain folder that a different agent owns without routing through `@ARK`.
- Do not add placeholder content (`[TBD]`, `[INSERT_X]`) and leave it — fill it or remove it.
- Do not modify files inside `cli/node_modules/` — those are managed by npm.
- Do not hardcode API keys in any `.md` or source file — always use `.env`.
