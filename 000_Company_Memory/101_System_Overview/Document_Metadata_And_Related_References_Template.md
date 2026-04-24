# Document Metadata and Related References Template

**Version:** 1.0
**Last Updated:** 2026-04-10
**Author/Editor:** @ARK
**Status:** Active Template

---

## Purpose
Provide a reusable standard for writing the end-of-document metadata and related-document reference sections across PulseOS Lite Open Source docs.

This template is designed for project docs, PRDs, specs, operating notes, and internal planning documents that need a clean footer showing ownership, role, and adjacent source material.

## When To Use
- Add this footer pattern near the end of every working document unless the owning domain has a stricter documented alternative.
- Prefer `## Related Documents` for nearby files that help a reader navigate the project.
- Prefer `## Operational Metadata` for ownership, scope, and maintenance context.
- Use relative links only.

## Footer Template
```markdown
## Related Documents
- [Primary README](../README.md)
- [Adjacent Spec or Reference](../03_Specifications/example.md)
- [Operational Runbook or Tracking Doc](../05_Operations/example.md)

## Operational Metadata
- **Owner Agent:** [Agent name]
- **Upstream Dependencies:**
  - [Strategy or PRD](../01_Planning/example.md)
- **Downstream Dependencies:**
  - [Implementation Plan/Code](../06_Implementation/example.md)
- **Document Role:** [What this file is for]
- **Update Trigger:** [What should cause this file to be reviewed or updated]
```

## Writing Guidance
- Keep the related-document list short and useful. Three to five links is usually enough.
- Put the most important or most likely next-click document first.
- Name the document role in plain language, not internal shorthand alone.
- Write the update trigger as an operational rule, for example:
  - "Update when schema contracts or enum values change"
  - "Update when sprint sequencing or backlog priorities change"
  - "Update when runtime commands or setup assumptions change"

## Example
```markdown
## Related Documents
- [PRD-001 — Data Model and ontology](../02_PRDs/02.1_PRD_Data_Model_And_ontology.md)
- [Runtime Usage Guide](../05_Operations/05.3_Runtime_Usage_Guide.md)

## Operational Metadata
- **Owner Agent:** Ark
- **Upstream Dependencies:**
  - [Build Plan](../01_Planning/01.2_Content_Strategy_Build_Plan.md)
- **Downstream Dependencies:**
  - `600_Projects/604_Content_Strategy_Engine/03_Specifications`
- **Document Role:** Search/index contract specification
- **Update Trigger:** Update when indexed fields, search use cases, or rebuild assumptions change
```

## Related Documents
- [Standard Document Format](../Standard_Document_Format.md)
- [ARK Master Orchestrator](./ARK_Master_Orchestrator.md)
