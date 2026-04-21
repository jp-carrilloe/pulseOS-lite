# README Document Governance

**Version:** 1.0
**Last Updated:** 2026-03-11
**Author/Editor:** @ARK
**Status:** Template

---

## Purpose
Defines the enforced documentation quality rules for this repository and the audit command that validates them.

## Mandatory Rules
- Naming:
  - Non-README docs: `NNN(.N)_Title_Case.md`
  - Section readmes: `README_<Section_Name>.md`
- Metadata header required in first 40 lines:
  - `**Version:**`
  - `**Last Updated:**`
  - `**Author/Editor:**`
  - `**Status:**`
- Template readiness:
  - Every document must include at least one placeholder token such as `[CLIENT_NAME]`, `[YYYY-MM-DD]`, or `[INSERT_FIELD]`.
- Legacy reference ban:
  - Do not reference legacy paths such as `10_Execution_Engine` or `01_Corporate_Strategy`.
- Relationship maintenance for agent docs:
  - If a dependency or routing relationship changes, update all impacted upstream/downstream agent docs in the same change.
  - Keep dependency lists and recommended file reads synchronized with relationship changes.
  - Keep central agent index/registry synchronized with the same relationship changes.

## Allowed Exceptions
- `101_System_Overview/Ark_Master_Agent/ARK_Master_Orchestrator.md`
- `101_System_Overview/Standard_Document_Format.md`

## Canonical Template Policy
- Keep exactly one canonical file when duplicates exist.
- Deprecated duplicate names are disallowed:
  - `203_Sales_Enablement_Hub/203.1_Core_Pitch_Decks/pitch_deck.md`

## Audit Command
```bash
scripts/docs_audit.sh
```

## Template Inputs
- Company Name: [CLIENT_NAME]

---

## Related Documents
- [Standard Document Format](Standard_Document_Format.md)

## Operational Metadata
- **Owner Agent:** @ARK
- **Upstream Dependencies:**
  - [Primary README](../README.md)
- **Downstream Dependencies:**
  - TBD — Based on implementation requirements
- **Document Role:** Core documentation for README Document Governance
- **Update Trigger:** Update when directory structure, folder logic, or category definitions change
