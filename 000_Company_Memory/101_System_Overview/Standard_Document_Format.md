# 📄 PulseOS GTM - Standard Document Format

This document defines the mandatory structure and formatting standards for all Markdown (`.md`) files within the PulseOS GTM repository. **@ARK** and all Sub-Agents must strictly adhere to this format to ensure consistency, readability, and efficient parsing.

---

## 1. File Metadata Header (Required)

Every document must begin with the following metadata block. This ensures version control and accountability without relying solely on git history.

```markdown
# [Document Title]

**Version:** [X.Y] (e.g., 1.0)  
**Last Updated:** 2026-03-09
**Author/Editor:** [Agent Name] (e.g., @ARK, 01_Strategy_Agent)  
**Status:** Template

---
```

## 2. Standard Structure

Following the header, documents should organize content into these core sections where applicable:

### 2.1. Purpose / Objective
*   **What:** A brief 1-2 sentence summary of what this document achieves.
*   **Why:** Why this document exists and who it serves.

### 2.2. Executive Summary (Optional for long docs)
*   Bullet points highlighting the key takeaways.

### 2.3. Core Content
*   Use standard Markdown headers (`##`, `###`) for hierarchy.
*   **Do not use H1 (`#`)** for anything other than the main document title.
*   Use **bold** for emphasis and *italics* for nuance.

### 2.4. Action Items / Next Steps (If applicable)
*   Clear checkbox list (`- [ ]`) of tasks derived from this document.

### 2.5. Operational Metadata (For Agents)
*   **Related Files:** Links to relative paths of connected documents.
*   **Owner Agent:** The specific Sub-Agent responsible for maintaining this file.

---

## 4. Formatting Rules

1.  **Dates:** ISO 8601 Format (`YYYY-MM-DD`).
2.  **Links:** Relative paths are preferred over absolute paths.
    *   *Good:* `[Strategy](../01_Corporate_Strategy_and_Foundation/strategy.md)`
    *   *Bad:* `[USER_HOME]/...`
3.  **Lists:** Use hyphens (`-`) for unordered lists and numbers (`1.`) for ordered lists.
4.  **Bullet Points over Tables:** **Strictly prefer bullet points and sub-bullet points over table formats.** Tables can be difficult to read and parse; bulleted lists provide better clarity and visual flow.
5.  **Code Blocks:** Always specify the language for syntax highlighting (e.g., \`\`\`bash).

---

## 5. Example Template

```markdown
# PulseOS Master Sales Script

**Version:** 1.2  
**Last Updated:** 2026-03-09
**Author/Editor:** 03_Sales_Enablement_Agent  
**Status:** Template

---

## Purpose
To provide a standardized script for the initial discovery call with prospective clients.

## Core Script
### Introduction
"Hi [Name], this is..."

## Related Files
*   [Objection Handling](objections.md)
```
