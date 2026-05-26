// Auto-generated from 000_Acme_Sample_Company_Memory. Do not edit by hand.
export interface AcmeDoc {
  path: string;
  folder: string;
  name: string;
  title: string;
  content: string;
}
export const ACME_DOCS: AcmeDoc[] = [
  {
    "path": "101_Overview/101.0_Acme_Company_Overview.md",
    "folder": "101_Overview",
    "name": "101.0_Acme_Company_Overview.md",
    "title": "Acme Inc Company Overview",
    "content": "# Acme Inc Company Overview\n\n**Version:** 101.0\n**Last Updated:** 2026-04-28\n**Author/Editor:** @ARK\n**Status:** Active\n\n---\n\n## Purpose\nThis persistent sample memory shows how a populated company operating system can look without being mixed into the main indexed knowledge-base tables. Acme Inc is a fictional B2B operations company kept in the repo for repeatable testing.\n\n## Company Snapshot\nAcme Inc helps growing B2B teams standardize sales, onboarding, reporting, and internal operating rhythms through packaged AI-assisted operations services. The company sells to founder-led teams that have customer demand but inconsistent internal systems.\n\n## Operating Model\n- Strategy defines the service portfolio and commercial thesis in [Acme Strategy](../102_Strategy/102.1_Acme_Strategy.md).\n- Operations turns the thesis into repeatable cadence in [Acme Operations](../103_Operations/103.1_Acme_Operations.md).\n- GTM converts the strategy into campaigns in [Acme GTM](../202_GTM/202.1_Acme_GTM_Strategy.md).\n- Delivery turns sold work into onboarding and adoption in [Acme Delivery](../301_Delivery/301.1_Acme_Delivery_Model.md).\n\n## Relationship Table\n| Source Document | Target Document | Owner Agent | Relationship Type | Reason |\n|---|---|---|---|---|\n| Acme Overview | [Acme Strategy](../102_Strategy/102.1_Acme_Strategy.md) | @Strategy | Defines | Strategy sets the sample company's positioning and offer spine. |\n| [Acme Strategy](../102_Strategy/102.1_Acme_Strategy.md) | [Acme GTM](../202_GTM/202.1_Acme_GTM_Strategy.md) | @GTM | Informs | GTM uses the positioning, ICP, and packaging constraints. |\n| [Acme Market Intelligence](../201_Market_Intel/201.1_Acme_Market_Intelligence.md) | [Acme Sales Enablement](../203_Sales/203.1_Acme_Sales_Enablement.md) | @Sales | Grounds | Sales messaging is based on buyer pains and triggers. |\n| [Acme Legal](../106_Legal/106.1_Acme_Legal_Compliance.md) | [Acme Delivery](../301_Delivery/301.1_Acme_Delivery_Model.md) | @Delivery | Constrains | Delivery must follow privacy and contracting boundaries. |\n\n## Operational Metadata\n- **Owner Agent:** @ARK\n- **File References:** relative paths from repo root\n- **Document Role:** Persistent sample company memory overview\n- **Update Trigger:** Update only when the Acme sample structure changes\n"
  },
  {
    "path": "102_Strategy/102.1_Acme_Strategy.md",
    "folder": "102_Strategy",
    "name": "102.1_Acme_Strategy.md",
    "title": "Acme Inc Strategy",
    "content": "# Acme Inc Strategy\n\n**Version:** 102.1\n**Last Updated:** 2026-04-28\n**Author/Editor:** @Strategy\n**Status:** Active\n\n---\n\n## Purpose\nDefines the sample strategy spine for Acme Inc so users can test cross-document relationships without affecting the main knowledge-base tables.\n\n## Mission\nAcme Inc helps B2B teams turn scattered operating knowledge into repeatable systems that improve revenue execution, onboarding quality, and leadership visibility.\n\n## Positioning\nAcme Inc is positioned as an AI-assisted operations partner for companies that need practical operating leverage without hiring a full internal RevOps, CS Ops, or strategy team.\n\n## Sample Offers\n- **Ops Foundation Sprint:** A short implementation that maps current workflows, standardizes handoffs, and creates the first operating dashboard.\n- **Revenue System Buildout:** A guided build of sales stages, qualification notes, proposal assets, and follow-up automation.\n- **Client Delivery Control Room:** A packaged onboarding and reporting layer for post-sale teams.\n\n## Strategic Dependencies\n- Uses ICP and pain points from [Acme Market Intelligence](../201_Market_Intel/201.1_Acme_Market_Intelligence.md).\n- Shapes acquisition choices in [Acme GTM](../202_GTM/202.1_Acme_GTM_Strategy.md).\n- Sets sales narrative boundaries for [Acme Sales Enablement](../203_Sales/203.1_Acme_Sales_Enablement.md).\n\n## Operational Metadata\n- **Owner Agent:** @Strategy\n- **File References:** relative paths from repo root\n- **Document Role:** Persistent sample strategy foundation\n- **Update Trigger:** Update when Acme positioning, offers, or ICP assumptions change\n"
  },
  {
    "path": "103_Operations/103.1_Acme_Operations.md",
    "folder": "103_Operations",
    "name": "103.1_Acme_Operations.md",
    "title": "Acme Inc Operations",
    "content": "# Acme Inc Operations\n\n**Version:** 103.1\n**Last Updated:** 2026-04-28\n**Author/Editor:** @Operations\n**Status:** Active\n\n---\n\n## Purpose\nShows how operating standards can be documented for the Acme sample company memory.\n\n## Operating Cadence\nAcme Inc runs on a weekly leadership rhythm: pipeline review on Monday, delivery risk review on Wednesday, and finance and capacity review on Friday. Each meeting produces short action records that feed into the company memory.\n\n## Core SOPs\n- Every new opportunity must map to an offer in [Acme Strategy](../102_Strategy/102.1_Acme_Strategy.md).\n- Every closed-won client must receive a delivery plan from [Acme Delivery](../301_Delivery/301.1_Acme_Delivery_Model.md).\n- Vendor and tooling decisions must respect the data boundaries in [Acme Infrastructure](../105_Infrastructure/105.1_Acme_Infrastructure.md).\n\n## Operational Metadata\n- **Owner Agent:** @Operations\n- **File References:** relative paths from repo root\n- **Document Role:** Persistent sample operations and SOP overview\n- **Update Trigger:** Update when Acme cadence, SOPs, or tool assumptions change\n"
  },
  {
    "path": "104_Finance/104.1_Acme_Finance_Model.md",
    "folder": "104_Finance",
    "name": "104.1_Acme_Finance_Model.md",
    "title": "Acme Inc Finance Model",
    "content": "# Acme Inc Finance Model\n\n**Version:** 104.1\n**Last Updated:** 2026-04-28\n**Author/Editor:** @Finance\n**Status:** Active\n\n---\n\n## Purpose\nProvides sample financial assumptions for Acme Inc so the persistent sample includes measurable business context.\n\n## Revenue Assumptions\nAcme Inc sells fixed-scope packages and monthly retainers. The sample model assumes a blended average first engagement of USD 18,000 and a follow-on monthly retainer of USD 6,000 for retained clients.\n\n## Dependencies\nFinancial assumptions depend on packaging from [Acme Strategy](../102_Strategy/102.1_Acme_Strategy.md) and acquisition volume from [Acme GTM](../202_GTM/202.1_Acme_GTM_Strategy.md).\n\n## Operational Metadata\n- **Owner Agent:** @Finance\n- **File References:** relative paths from repo root\n- **Document Role:** Persistent sample financial model\n- **Update Trigger:** Update when Acme pricing, delivery costs, or growth assumptions change\n"
  },
  {
    "path": "105_Infrastructure/105.1_Acme_Infrastructure.md",
    "folder": "105_Infrastructure",
    "name": "105.1_Acme_Infrastructure.md",
    "title": "Acme Inc Infrastructure",
    "content": "# Acme Inc Infrastructure\n\n**Version:** 105.1\n**Last Updated:** 2026-04-28\n**Author/Editor:** @Infrastructure\n**Status:** Active\n\n---\n\n## Purpose\nDocuments the sample technical and data architecture for Acme Inc.\n\n## Architecture Overview\nAcme Inc keeps client operating knowledge in structured Markdown documents, uses a local SQLite index for retrieval, and exposes a graph view to inspect document relationships. The sample stays in the repo for testing, but it is excluded from the curated index and graph data.\n\n## Integration Notes\nInfrastructure constraints support [Acme Legal](../106_Legal/106.1_Acme_Legal_Compliance.md) and help [Acme Delivery](../301_Delivery/301.1_Acme_Delivery_Model.md) keep client onboarding safe and repeatable.\n\n## Operational Metadata\n- **Owner Agent:** @Infrastructure\n- **File References:** relative paths from repo root\n- **Document Role:** Persistent sample infrastructure and data architecture\n- **Update Trigger:** Update when Acme indexing, security, or integration assumptions change\n"
  },
  {
    "path": "106_Legal/106.1_Acme_Legal_Compliance.md",
    "folder": "106_Legal",
    "name": "106.1_Acme_Legal_Compliance.md",
    "title": "Acme Inc Legal And Compliance",
    "content": "# Acme Inc Legal And Compliance\n\n**Version:** 106.1\n**Last Updated:** 2026-04-28\n**Author/Editor:** @Legal\n**Status:** Active\n\n---\n\n## Purpose\nDefines sample legal and compliance boundaries for Acme Inc's operating memory.\n\n## Compliance Guardrails\n- No secrets, API keys, or client credentials are stored in Markdown.\n- Client documents are treated as confidential source material.\n- Delivery workflows must respect data minimization principles from [Acme Infrastructure](../105_Infrastructure/105.1_Acme_Infrastructure.md).\n- Sales claims in [Acme Sales Enablement](../203_Sales/203.1_Acme_Sales_Enablement.md) must avoid unsupported guarantees.\n\n## Operational Metadata\n- **Owner Agent:** @Legal\n- **File References:** relative paths from repo root\n- **Document Role:** Persistent sample legal and compliance guardrails\n- **Update Trigger:** Update when Acme contracting, privacy, or risk assumptions change\n"
  },
  {
    "path": "201_Market_Intel/201.1_Acme_Market_Intelligence.md",
    "folder": "201_Market_Intel",
    "name": "201.1_Acme_Market_Intelligence.md",
    "title": "Acme Inc Market Intelligence",
    "content": "# Acme Inc Market Intelligence\n\n**Version:** 201.1\n**Last Updated:** 2026-04-28\n**Author/Editor:** @MarketIntel\n**Status:** Active\n\n---\n\n## Purpose\nCaptures sample ICP, buying triggers, and competitive context for Acme Inc.\n\n## Ideal Customer Profile\nAcme Inc targets B2B companies with 10 to 80 employees, founder-led revenue oversight, and growing pains across sales handoffs, onboarding, and reporting.\n\n## Downstream Use\nMarket intelligence informs [Acme Strategy](../102_Strategy/102.1_Acme_Strategy.md), [Acme GTM](../202_GTM/202.1_Acme_GTM_Strategy.md), and [Acme Sales Enablement](../203_Sales/203.1_Acme_Sales_Enablement.md).\n\n## Operational Metadata\n- **Owner Agent:** @MarketIntel\n- **File References:** relative paths from repo root\n- **Document Role:** Persistent sample market intelligence and ICP\n- **Update Trigger:** Update when Acme buyer segments, triggers, or competitors change\n"
  },
  {
    "path": "202_GTM/202.1_Acme_GTM_Strategy.md",
    "folder": "202_GTM",
    "name": "202.1_Acme_GTM_Strategy.md",
    "title": "Acme Inc GTM Strategy",
    "content": "# Acme Inc GTM Strategy\n\n**Version:** 202.1\n**Last Updated:** 2026-04-28\n**Author/Editor:** @GTM\n**Status:** Active\n\n---\n\n## Purpose\nShows how sample market and strategy inputs become a go-to-market plan for Acme Inc.\n\n## GTM Motion\nAcme Inc uses a focused founder-led outbound motion supported by proof-based content and partner referrals. The first call diagnoses operating friction, then routes qualified buyers into a fixed-scope foundation sprint.\n\n## Handoff\nQualified opportunities move into the discovery flow described in [Acme Sales Enablement](../203_Sales/203.1_Acme_Sales_Enablement.md).\n\n## Operational Metadata\n- **Owner Agent:** @GTM\n- **File References:** relative paths from repo root\n- **Document Role:** Persistent sample go-to-market strategy\n- **Update Trigger:** Update when Acme channels, campaigns, or offer motion change\n"
  },
  {
    "path": "203_Sales/203.1_Acme_Sales_Enablement.md",
    "folder": "203_Sales",
    "name": "203.1_Acme_Sales_Enablement.md",
    "title": "Acme Inc Sales Enablement",
    "content": "# Acme Inc Sales Enablement\n\n**Version:** 203.1\n**Last Updated:** 2026-04-28\n**Author/Editor:** @Sales\n**Status:** Active\n\n---\n\n## Purpose\nProvides sample sales messaging and qualification logic for Acme Inc.\n\n## Core Pitch\nAcme Inc helps teams document the operating system already inside the founder's head, then turns it into reusable workflows, dashboards, and delivery playbooks.\n\n## Dependencies\nMessaging uses buyer triggers from [Acme Market Intelligence](../201_Market_Intel/201.1_Acme_Market_Intelligence.md), campaign themes from [Acme GTM](../202_GTM/202.1_Acme_GTM_Strategy.md), and legal guardrails from [Acme Legal](../106_Legal/106.1_Acme_Legal_Compliance.md).\n\n## Operational Metadata\n- **Owner Agent:** @Sales\n- **File References:** relative paths from repo root\n- **Document Role:** Persistent sample sales enablement and qualification guide\n- **Update Trigger:** Update when Acme messaging, qualification, or sales assets change\n"
  },
  {
    "path": "301_Delivery/301.1_Acme_Delivery_Model.md",
    "folder": "301_Delivery",
    "name": "301.1_Acme_Delivery_Model.md",
    "title": "Acme Inc Delivery Model",
    "content": "# Acme Inc Delivery Model\n\n**Version:** 301.1\n**Last Updated:** 2026-04-28\n**Author/Editor:** @Delivery\n**Status:** Active\n\n---\n\n## Purpose\nDefines a sample delivery model so the Acme demo memory shows how sold work becomes client implementation.\n\n## Quality Standards\n- Every delivery plan must trace back to the sold offer in [Acme Strategy](../102_Strategy/102.1_Acme_Strategy.md).\n- Every implementation must respect [Acme Legal](../106_Legal/106.1_Acme_Legal_Compliance.md) and [Acme Infrastructure](../105_Infrastructure/105.1_Acme_Infrastructure.md).\n- Every client engagement should produce reusable lessons for [Acme Operations](../103_Operations/103.1_Acme_Operations.md).\n\n## Operational Metadata\n- **Owner Agent:** @Delivery\n- **File References:** relative paths from repo root\n- **Document Role:** Persistent sample client delivery model\n- **Update Trigger:** Update when Acme onboarding, implementation, or quality standards change\n"
  },
  {
    "path": "README_Acme_Sample_Company_Memory.md",
    "folder": "",
    "name": "README_Acme_Sample_Company_Memory.md",
    "title": "Acme Sample Company Memory",
    "content": "# Acme Sample Company Memory\n\n**Status:** Active\n- **Owner Agent:** @ARK\n- **Last Updated:** 2026-04-28\n- **Purpose:** Persistent sample company memory for local testing\n\n## What this folder is\n\nThis folder contains a reusable Acme Inc sample company memory with linked Markdown documents across strategy, operations, finance, infrastructure, legal, market intelligence, GTM, sales, and delivery.\n\nIt is intentionally kept in the repository so you can test document structure, references, prompts, and graph behavior without having to recreate the sample set each time.\n\n## How it behaves\n\n- `npm run bootstrap` does **not** delete this folder.\n- The main curated SQLite knowledge-base index excludes this folder by design.\n- That means the Acme sample stays available on disk without being merged into the primary company-memory tables used for normal retrieval.\n\n## How to test it safely\n\n### 1. Inspect the sample files directly\n\nOpen any document in this folder and review the cross-links:\n\n- `101_Overview/101.0_Acme_Company_Overview.md`\n- `102_Strategy/102.1_Acme_Strategy.md`\n- `202_GTM/202.1_Acme_GTM_Strategy.md`\n- `203_Sales/203.1_Acme_Sales_Enablement.md`\n\n### 2. Use it as a reference pattern\n\nCopy structure, metadata, and linking style from these files when building or validating a real company memory.\n\n### 3. Test isolated ingestion logic\n\nIf you want to test indexing or graph behavior with the Acme sample included, temporarily point a separate test harness or temporary repo fixture at this folder rather than changing the main repo index rules.\n\nRecommended approach:\n\n- create a temporary test repo\n- copy `000_Acme_Sample_Company_Memory/` into that fixture\n- run the indexer against the fixture\n- inspect the resulting SQLite rows and graph edges there\n\n### 4. Keep production onboarding clean\n\nPut real onboarding material in:\n\n- `001_Data_Souces/Data_Souces_Folder/`\n- `001_Data_Souces/Data_Sources_References/`\n\nThen run:\n\n```bash\ncd cli\nnpm run bootstrap\n```\n\nThat workflow will use the real intake sources and leave this Acme sample untouched.\n\n## Important note\n\nIf you want the Acme sample to appear in the main SQLite `documents` table or graph snapshot for a one-off experiment, the current exclusion rule in `cli/retrieval.ts` would need to be changed temporarily. It is excluded on purpose so normal repo usage stays clean.\n"
  }
];
