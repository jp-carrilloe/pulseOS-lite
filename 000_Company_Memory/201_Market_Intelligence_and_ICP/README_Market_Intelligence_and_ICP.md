# 201 Market Intelligence and ICP

**Version:** 1.1
**Last Updated:** 2026-03-10
**Author/Editor:** @ARK
**Status:** Active

---

## Purpose

This folder contains the data and analysis required to identify and target the right customers with high precision. The outputs from this folder feed directly into the Execution Engine's outreach workflows. Owned and maintained by the **02_Market_Intel_Agent**.

## Sub-folders

### 201.1 Target Personas and Segmentation
- **Purpose:** Ideal Customer Profile definitions, segment tiers, anti-ICP exclusion criteria, and GTM sequencing rationale.
- **Key Asset:** [`201.1_ICP.md`](201.1_Target_Personas_and_Segmentation/201.1_ICP.md)

### 201.2 Competitive Intelligence
- **Purpose:** Benchmarking against competitors to identify gaps, differentiation opportunities, and positioning edges.
- **Key Asset:** [`201.2_Competitive_Intelligence.md`](201.2_Competitive_Intelligence/201.2_Competitive_Intelligence.md)

### 201.3 Market Signals and Intent Triggers
- **Purpose:** A catalog of high-intent signals (funding rounds, job postings, technology adoption, content, inference cost pain, context layer pain) used to trigger autonomous outreach sequences.
- **Key Asset:** [`201.3_Market_Signals_and_Intent_Triggers.md`](201.3_Market_Signals_and_Intent_Triggers/201.3_Market_Signals_and_Intent_Triggers.md)

### 201.4 Market Sizing
- **Purpose:** TAM/SAM/SOM analysis across PulseOS's three primary markets — agentic AI infrastructure, LLMOps/inference management, and enterprise knowledge graph. Grounds investor conversations and GTM prioritization in analyst data.
- **Key Asset:** [`201.4_Market_Sizing.md`](201.4_Market_Sizing/201.4_Market_Sizing.md)

## Dual ICP Framework
The 201 layer tracks two distinct customer types that interact through PulseOS's platform:
- **Agent Operators (Demand Side):** Companies using agents to run financially or operationally consequential workflows — primary GTM acquisition target
- **Agent Providers (Supply Side):** Companies building agents — join organically once the operator ecosystem has critical mass

See [`201.1_ICP.md`](201.1_Target_Personas_and_Segmentation/201.1_ICP.md) for full definitions, exclusion criteria, and GTM sequencing rationale.

## Action Items
- [x] Defined primary ICP (Tier 1): AI Orchestrators at consequential-action companies (Series A/B, 20–150 employees, $2M–$50M ARR)
- [x] Defined secondary ICPs (Tier 2A: AI-Enabled Ecommerce, 2B: AI Agent Builders) and Supply Side ICP
- [x] Expanded competitive landscape to 7 categories — added CrewAI, Relevance AI, Letta, E2B, Glean, Vertex AI Agent Builder, AWS Bedrock AgentCore, Azure AI Foundry, UiPath Maestro, ServiceNow
- [x] Added inference optimization and cloud-agnostic columns to competitive matrix
- [x] Added 7 new intent triggers: Signal E (inference cost pain) + Signal F (context layer pain) + C5 (hyperscaler lock-in) + A4 (AI Orchestrator role creation)
- [x] Created 201.4 Market Sizing with TAM/SAM/SOM grounded in 2025 analyst data (Grand View, Valuates, Gartner, Bessemer)
- [ ] Validate ICP with 10+ customer discovery interviews
- [ ] Configure signal monitoring (Apollo, LinkedIn Sales Nav, Crunchbase alerts, BuiltWith)
- [ ] Add inference cost monitoring to signal stack (content monitoring for AI cost posts)
- [ ] Export final segments to `502_Execution_Engine/workflows`
- [ ] Update 201.1 ICP with inference cost buying trigger for Tier 1 and Phase 1 segments

---

## Operational Metadata
- **Owner Agent:** [02_Market_Intel_Agent](201_Market_Intel_Agent.md)
- **Upstream Dependencies:**
  - [102 Corporate Strategy & Foundation](../102_Corporate_Strategy_and_Foundation/) — Strategic Spine; ICP must align with platform mission and positioning
- **Downstream Dependents:**
  - [202 Go-to-Market Strategy](../202_Go-to-Market_Strategy/) — ICP and signals feed GTM targeting and channel strategy
  - [203 Sales Enablement Hub](../203_Sales_Enablement_Hub/) — Persona data and competitive intel feed sequencing and battle cards
  - [502 Execution Engine](../502_Execution_Engine/) — Approved segments and signal triggers exported to outreach workflows
- **Related Files (within folder):**
  - [201_Market_Intel_Agent.md](201_Market_Intel_Agent.md)
  - [201.1 ICP & Persona Definitions](201.1_Target_Personas_and_Segmentation/201.1_ICP.md)
  - [201.2 Competitive Intelligence](201.2_Competitive_Intelligence/201.2_Competitive_Intelligence.md)
  - [201.3 Market Signals & Intent Triggers](201.3_Market_Signals_and_Intent_Triggers/201.3_Market_Signals_and_Intent_Triggers.md)
