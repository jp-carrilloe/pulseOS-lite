# [CLIENT_NAME] — GTM Operating System

**Version:** 101.0
**Last Updated:** 2026-03-09
**Author/Editor:** @ARK
**Status:** Template

---

## 🎯 Purpose

This repository is the complete **[CORE_CATEGORY_DEFINITION]** for **[CLIENT_NAME]**. It is organized into a scalable **Hybrid 100s Framework** that separates high-level strategy from autonomous execution:

- **100s Foundation:** The "Spine." Corporate strategy, legal, finance, and technical risk infrastructure.
- **200s Discovery & GTM:** The "Intelligence." Market dossiers, ICP definition, and sales enablement assets.
- **300s Delivery & Ops:** The "Fulfilment." Client onboarding, success blueprints, and performance analytics.
- **400s Expansion:** The "Scale." Strategic partnerships and fundraising narrative engines.
- **500s Execution Engine:** The "Muscle." Centralized agent protocols and high-velocity autonomous workflows.

---

## 🏗️ Architecture Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                   101_System_Overview                       │
│              @ARK Master Orchestrator (ARK)                 │
│              + Agent Economy Protocol & Governance          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  FOUNDATION (100s)           DISCOVERY & GTM (200s)         │
│  ┌────────────┐  ┌────────────┐  ┌──────────────────┐       │
│  │ 102 Corp   │  │ 201 Market │  │ 202 GTM          │       │
│  │ Strategy   │◄─┤ Intel/ICP  │◄─┤ Strategy Engine  │       │
│  └────────────┘  └────────────┘  └────────┬─────────┘       │
│                                           │                 │
│  ┌────────────┐  ┌────────────┐  ┌────────▼─────────┐       │
│  │ 103 Legal  │  │ 104 Finance│  │ 203 Sales        │       │
│  │ & Ops      │  │ & Economy  │  │ Enablement Hub   │       │
│  └────────────┘  └────────────┘  └──────────────────┘       │
│                                                             │
│  DELIVERY (300s)             EXPANSION (400s)               │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐             │
│  │ 301 Client │  │ 302 Perf & │  │ 401 Partn'  │             │
│  │ Onboarding │  │ Analytics  │  │ Ecosystems  │             │
│  └────────────┘  └────────────┘  └────────────┘             │
│                                  ┌────────────┐             │
│                                  │ 402 Fund-  │             │
│                                  │ raising    │             │
│                                  └────────────┘             │
│                                                             │
│  EXECUTION ENGINE (500s)                                    │
│  ┌──────────────────┐      ┌─────────────────────────┐      │
│  │ 501 Agents &     │      │ 502 Execution Engine    │      │
│  │     Workflows    │      │ (Autonomous Loops)      │      │
│  └──────────────────┘      └─────────────────────────┘      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 How to Use This Repository

### First time: seed all documents in one run

```bash
cd cli
npm install
npm run bootstrap
```

Bootstrap asks only for the company name, then reads source material from `001_Data_Souces` and fills every template document in dependency order — foundation docs first, each subsequent document grounded in intake evidence and what was generated before it. Safe to re-run.

### Talk to the repo

```bash
cd cli && npm run chat                   # OpenAI (default)
npm run chat -- --model claude          # Claude
npm run chat -- --model gemini          # Gemini Flash
```

The daemon indexes all `.md` files and maintains conversation history. Switch models mid-session with `:model <name>`. Type `:reload` after editing files to refresh context.

### Manual workflow (without CLI)

1. **Strategic Discovery (100s/200s):** Work through Corporate Strategy (102) and Market Intel (201) to establish the "Strategic Spine."
2. **Asset Creation (200s):** Configure Sales Enablement (203) with the intelligence dossiers from 201.
3. **Autonomous Activation (500s):** Deploy the Execution Engine (502) using the system prompts and agent protocols defined in 501.
4. **Performance Loop (300s):** Monitor Delivery (301) and Performance Analytics (302) to feed results back into the 200s discovery layer for continuous optimization.

---

## 📂 Directory Index

| Folder | Name | Layer | Agent |
|--------|------|-------|-------|
| **101** | System Overview | Control | @ARK |
| **102** | Corporate Strategy & Foundation | Foundation | @STRATEGY |
| **103** | Legal & Corporate Operations | Foundation | @LEGAL |
| **104** | Finance & Financial Planning | Foundation | @FINANCE |
| **105** | Technical Infrastructure & Security | Foundation | @INFRA |
| **201** | Market Intelligence & ICP | Discovery | @INTEL |
| **202** | Go-to-Market Strategy | Discovery | @STRATEGY |
| **203** | Sales Enablement Hub | Discovery | @SCRIBE |
| **301** | Client Delivery & Onboarding | Delivery | @DELIVERY |
| **302** | Analytics & Performance Intel | Delivery | @ANALYTICS |
| **401** | Strategic Partnerships | Expansion | @PARTNER |
| **402** | Fundraising | Expansion | @RAISE |
| **501** | Agents & Workflows | Execution | @ARK |
| **502** | Execution Engine | Execution | @AUTONOMOUS |

---
*Powered by [CORE_CATEGORY_DEFINITION] — Strategic Clarity at Scale.*

---

## Related Documents
- [Standard Document Format](Standard_Document_Format.md)

## Operational Metadata
- **Owner Agent:** @ARK
- **Upstream Dependencies:**
  - [Primary README](../README.md)
- **Downstream Dependencies:**
  - TBD — Based on implementation requirements
- **Document Role:** Core documentation for GTM Operating System
- **Update Trigger:** Update when directory structure, folder logic, or category definitions change
