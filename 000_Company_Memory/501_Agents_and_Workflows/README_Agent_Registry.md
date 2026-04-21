# README Agent Registry — [CLIENT_NAME]

**Version:** 1.1
**Last Updated:** 2026-04-14
**Author/Editor:** @ARK
**Status:** Template

---

## Purpose
Provides a central swarm view of all agents and defines how routing uses the machine-readable registry.

## Registry Source of Truth
- Machine-readable registry: `000_Company_Memory/501_Agents_and_Workflows/agent_registry.yaml`
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

## Agent Shortcuts
All domain agents are browsable in one place:
- `000_Company_Memory/000_Agent_Shortcuts/`

These are shortcut symlinks to canonical domain agent files. Edit the canonical source in the owned domain folder, not the shortcut.

## Swarm Index
- Domain agents (active): 12
- Execution agents (active): 0
- Specialty pointer agents (deprecated): 0

## Active Domain Agents
- `agent-102-strategy` -> `000_Company_Memory/102_Corporate_Strategy_and_Foundation/102_Strategy_Agent.md`
- `agent-103-operations` -> `000_Company_Memory/103_Corporate_Operations/103_Operations_Agent.md`
- `agent-104-finance` -> `000_Company_Memory/104_Finance_and_Financial_Planning/104_Finance_Agent.md`
- `agent-105-infrastructure` -> `000_Company_Memory/105_Technical_Infrastructure_and_Security/105_Infrastructure_Agent.md`
- `agent-106-legal` -> `000_Company_Memory/106_Legal_and_Compliance/106_Legal_Agent.md`
- `agent-201-market-intel` -> `000_Company_Memory/201_Market_Intelligence_and_ICP/201_Market_Intel_Agent.md`
- `agent-202-gtm-strategy` -> `000_Company_Memory/202_Go-to-Market_Strategy/202_GTM_Strategy_Agent.md`
- `agent-203-sales-enablement` -> `000_Company_Memory/203_Sales_Enablement_Hub/203_Sales_Enablement_Agent.md`
- `agent-301-delivery` -> `000_Company_Memory/301_Client_Delivery_and_Onboarding/301_Delivery_Agent.md`
- `agent-302-analytics` -> `000_Company_Memory/302_Analytics_and_Performance_Intelligence/302_Analytics_Agent.md`
- `agent-401-partnership` -> `000_Company_Memory/401_Strategic_Partnerships/401_Partnership_Agent.md`
- `agent-402-fundraising` -> `000_Company_Memory/402_Fundraising/402_Fundraising_Agent.md`

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
