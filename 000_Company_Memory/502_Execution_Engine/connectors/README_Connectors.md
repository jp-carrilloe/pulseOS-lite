# Connectors — API Wrappers

**Version:** 1.0
**Last Updated:** 2026-03-09
**Author/Editor:** @ARK
**Status:** Template

---

API wrappers for all external services used in the GTM stack.

## Files
- `apollo_api.js` — B2B lead database and enrichment
- `heygen_api.js` — AI video generation for UGC-style ads
- `strapi_api.js` — Headless CMS for bulk content publishing
- `instantly_api.js` — High-volume cold email automation

## Configuration
All API keys are stored in `/.env.template`. Copy to `.env` and fill with live credentials before use.

## Template Inputs
- Company Name: [CLIENT_NAME]

---

## Related Documents
- [Standard Document Format](../../101_System_Overview/Standard_Document_Format.md)

## Operational Metadata
- **Owner Agent:** @AUTONOMOUS
- **Upstream Dependencies:**
  - [System Overview](../../101_System_Overview/README_System_Overview.md)
  - [Sales Enablement Prep](../../203_Sales_Enablement_Hub/README_Sales_Enablement_Hub.md)
- **Downstream Dependencies:**
  - TBD — Based on implementation requirements
- **Document Role:** Core documentation for API Wrappers
- **Update Trigger:** Update when directory structure, folder logic, or category definitions change
