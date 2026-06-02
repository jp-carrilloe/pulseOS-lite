# 502 Execution Engine

**Version:** 1.0
**Last Updated:** 2026-05-06
**Author/Editor:** @ARK
**Status:** Template

---

## Purpose

The Execution Engine is the **action layer** of the GTM Operating System. It translates strategic intent (from the 100–400s knowledge base) into autonomous execution by coordinating AI agents, API connectors, and automated workflows.

This folder contains two layers:
1. **Documentation layer** — agent prompt specs, connector briefs, and architecture references used by @ARK and domain agents
2. **Implementation layer** (`ark-engine/`) — the working Node.js application that runs the pipelines

---

## Folder Structure

```
502_Execution_Engine/
├── agents/          # Agent prompt specs (role definitions, operating protocols)
├── connectors/      # API connector documentation and .env configuration
├── tools/           # Utility scripts and standalone tools
├── workflows/       # Workflow blueprints and orchestration diagrams
├── assets/          # React ad templates and design components
└── ark-engine/      # Node.js application (Express server, agent classes, route handlers)
    ├── connectors/  # API wrapper modules (OpenAI, Apollo, Attio, Perplexity, Exa)
    ├── server/
    │   ├── agents/      # Agent class implementations
    │   ├── routes/      # Express route handlers
    │   ├── workflows/   # Workflow orchestration logic
    │   └── chat/        # Conversational command router
    └── tools/           # CLI utilities
```

---

## Agent Roster

| Agent | File | Role |
| :--- | :--- | :--- |
| AI Sales Agent | `agents/AI_Sales_Agent_Prompt.md` | Voice/chat qualification and handover |
| Ad Generation Agent | `agents/Ad_Generation_Agent.md` | Multi-variant ad copy from pain point research |
| Insight Research Agent | `agents/Insight_Research_Agent.md` | Market and account intelligence briefs |
| LinkedIn Post Agent | `agents/LinkedIn_Post_Agent.md` | Thought leadership content from GTM signals |

---

## API Connectors

| Connector | File | Service |
| :--- | :--- | :--- |
| OpenAI | `ark-engine/connectors/openai.js` | LLM inference (GPT-4o) |
| Apollo | `ark-engine/connectors/apollo.js` | B2B lead search and enrichment |
| Attio | `ark-engine/connectors/attio.js` | CRM sync |
| Perplexity | `ark-engine/connectors/perplexity.js` | Deep research with live internet access |
| Exa | `ark-engine/connectors/exa.js` | Neural web search |

All API keys are configured via `.env`. See `connectors/README_Connectors.md` for setup.

---

## Workflows

| Workflow | Endpoint | Description |
| :--- | :--- | :--- |
| GTM Pipeline | `POST /api/workflows/run/gtm-pipeline` | Full pipeline: ICP → Prospecting → Research → Email → Ads → LinkedIn |
| Bulk Creative Engine | `POST /api/workflows/run/bulk-creative` | Research topic → Pain points → Ad angle variants |
| Prospecting | `POST /api/workflows/run/prospecting` | ICP extraction → Apollo company/people search → CRM save |
| Email Campaign | `POST /api/workflows/run/email-campaign` | Personalized 3-email cold sequence generation |
| Social Content | `POST /api/workflows/run/social-content` | LinkedIn post variants from GTM signals |
| Chat Interface | `POST /api/chat/message` | Conversational workflow trigger via NL command |

---

## Setup

```bash
cd ark-engine
npm install

# Copy and populate environment variables
cp .env.template .env
```

Required keys (add to `.env`):

```
OPENAI_API_KEY=...
APOLLO_API_KEY=...
ATTIO_API_KEY=...
PERPLEXITY_API_KEY=...
EXA_API_KEY=...
CLICKUP_API_KEY=...        # optional — for task sync
ARK_PORT=3747              # default server port
```

Start the server:

```bash
node server/index.js
```

---

## Architecture Notes

- **Orchestration:** Workflows trigger via REST or conversational chat. Streaming progress is delivered via Server-Sent Events (SSE) at `GET /api/workflows/stream/:id`.
- **Intelligence layer:** Agents use OpenAI (structured JSON output) with Perplexity/Exa as research waterfalls.
- **Data layer:** Local SQLite databases now live in persistent storage under `~/.pulseos/ark-engine/databases/`. The CRM store is `crm.db` there, and new execution-engine databases should follow the same pattern. Attio sync is triggered manually via `POST /api/sync/attio`.
- **Vault layer:** The knowledge base files in this repo are readable/writable via `GET|POST /api/file` — agents pull strategic context (ICP, brand voice, objection handling) directly from the KB at runtime.

---

## Operational Metadata
- **Owner Agent:** @ARK
- **Related Files:**
  - [Agents & Workflows Protocols](../501_Agents_and_Workflows/README_Agents_and_Workflows.md)
  - [Technical Infrastructure](../105_Technical_Infrastructure_and_Security/README_Technical_Infrastructure_and_Security.md)
