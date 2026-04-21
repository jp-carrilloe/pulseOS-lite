# README Agent Registry — [CLIENT_NAME]

**Version:** 1.1
**Last Updated:** 2026-04-14
**Author/Editor:** @ARK
**Status:** Template

---

## Purpose
Provides a central swarm view of all agents and defines how routing uses the machine-readable registry.

## Registry Source of Truth
- Machine-readable registry: `501_Agents_and_Workflows/agent_registry.yaml`
- This README is the operator view; registry YAML is authoritative for orchestration and validation.

## Routing Model
1. Parse request intent into capabilities and scope.
2. Select `status: active` agents matching required capabilities.
3. Rank by `routing_priority`.
4. Load selected `entry_doc` and declared dependencies.
5. If blocked, use `fallback_agents`.

## Relationship Change Protocol (Mandatory)
- If any dependency, fallback, upstream, or downstream relationship changes:
- Update affected agent docs in the same change set.
- Update `agent_registry.yaml` for each affected agent.
- Update this README if capability ownership or status changes.
- Run `scripts/docs_audit.sh` and require a clean pass.

## Agent Hub
All agents are browsable in one place: `502_Execution_Engine/agents/`
- Domain agent pointer stubs (link to canonical): 12
- Execution agent canonicals (live here): 4

## Swarm Index
- Domain agents (active): 12
- Execution agents (active): 4
- Specialty pointer agents (deprecated): 5

## Active Domain Agents
- `agent-102-strategy` -> `102_Corporate_Strategy_and_Foundation/102_Strategy_Agent.md`
- `agent-103-operations` -> `103_Corporate_Operations/103_Operations_Agent.md`
- `agent-104-finance` -> `104_Finance_and_Financial_Planning/104_Finance_Agent.md`
- `agent-105-infrastructure` -> `105_Technical_Infrastructure_and_Security/105_Infrastructure_Agent.md`
- `agent-106-legal` -> `106_Legal_and_Compliance/106_Legal_Agent.md`
- `agent-201-market-intel` -> `201_Market_Intelligence_and_ICP/201_Market_Intel_Agent.md`
- `agent-202-gtm-strategy` -> `202_Go-to-Market_Strategy/202_GTM_Strategy_Agent.md`
- `agent-203-sales-enablement` -> `203_Sales_Enablement_Hub/203_Sales_Enablement_Agent.md`
- `agent-301-delivery` -> `301_Client_Delivery_and_Onboarding/301_Delivery_Agent.md`
- `agent-302-analytics` -> `302_Analytics_and_Performance_Intelligence/302_Analytics_Agent.md`
- `agent-401-partnership` -> `401_Strategic_Partnerships/401_Partnership_Agent.md`
- `agent-402-fundraising` -> `402_Fundraising/402_Fundraising_Agent.md`

## Active Execution Agents
- `agent-502-exec-ai-sales` -> `502_Execution_Engine/agents/502.1_AI_Sales_Agent_Prompt.md`
- `agent-502-exec-ad-gen` -> `502_Execution_Engine/agents/502.2_Ad_Generation_Agent.md`
- `agent-502-exec-research` -> `502_Execution_Engine/agents/502.3_Insight_Research_Agent.md`
- `agent-502-exec-linkedin` -> `502_Execution_Engine/agents/502.4_LinkedIn_Post_Agent.md`

## Deprecated Pointer Agents
- `agent-501-ai-sales-pointer` -> `501_Agents_and_Workflows/Sub_Agents/501.1_AI_Sales_Agent_Prompt.md`
- `agent-501-ad-gen-pointer` -> `501_Agents_and_Workflows/Sub_Agents/501.2_Ad_Generation_Agent.md`
- `agent-501-linkedin-pointer` -> `501_Agents_and_Workflows/Sub_Agents/501.3_LinkedIn_Post_Agent.md`
- `agent-501-research-pointer` -> `501_Agents_and_Workflows/Sub_Agents/501.4_Insight_Research_Agent.md`
- `agent-501-elevenlabs-pointer` -> `501_Agents_and_Workflows/Sub_Agents/501.5_ElevenLabs_Sales_Agent_Prompt.md`

## Template Inputs
- Company Name: [CLIENT_NAME]

---

## Related Documents
- [Standard Document Format](../101_System_Overview/Standard_Document_Format.md)

## Operational Metadata
- **Owner Agent:** @ARK
- **Upstream Dependencies:**
  - [System Overview](../101_System_Overview/README_System_Overview.md)
  - [Sales Enablement Prep](../203_Sales_Enablement_Hub/README_Sales_Enablement_Hub.md)
- **Downstream Dependencies:**
  - TBD — Based on implementation requirements
- **Document Role:** Core documentation for [CLIENT_NAME]
- **Update Trigger:** Update when agent responsibilities, permissions, or protocols change
