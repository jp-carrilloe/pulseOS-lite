# Tools Registry

This directory stores instructions, schemas, and usage patterns for external **Tools** that the Agents use to interact with the real world.

When an Agent needs to use an external system (e.g., a CRM, an API, or a web scraper), it loads the corresponding tool doc to understand the exact JSON schema or constraints required to execute the action.

### Example Tools to add here:
- `hubspot_ingestion.md` - Schema and rules for updating the CRM
- `crunchbase_query.md` - Parameters for searching startup databases
- `slack_notification.md` - Formatting rules for reporting back to human executives

### Usage trigger:
*"@MarketIntel, find new leads. Load the `crunchbase_query` tool to formulate your search parameters."*
