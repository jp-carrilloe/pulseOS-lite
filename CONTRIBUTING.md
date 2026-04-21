# Contributing

Contributions are welcome — bug fixes, new domain templates, agent improvements, CLI enhancements, and documentation.

---

## Before you start

- Check [open issues](../../issues) to avoid duplicate work.
- For significant changes, open an issue first to align on scope.

---

## How to contribute

1. Fork the repo and create a branch: `git checkout -b feat/your-feature`
2. Make your changes (see conventions below).
3. Open a pull request against `main` with a clear description of what and why.

---

## Document conventions

- Dates: ISO 8601 (`2026-04-14`)
- File references: relative paths from repo root
- Status field on agent docs: `Template` | `Active` | `Deprecated`
- Owner field: always one of the `@` agent handles defined in `CLAUDE.md`
- No placeholder content (`[TBD]`, `[INSERT_X]`) — fill it or remove it

## Agent conventions

- Every new domain folder needs a canonical agent file.
- Any new agent must be registered in `501_Agents_and_Workflows/agent_registry.yaml` and the swarm index `README_Agent_Registry.md`.
- Stubs in `502_Execution_Engine/agents/` are read-only pointers — edit the canonical in the domain folder.

## CLI conventions

- TypeScript, strict mode.
- No hardcoded API keys — use `.env`.
- Don't modify `cli/node_modules/`.

---

## What we won't merge

- Hardcoded secrets or API keys
- Placeholder content left unfilled
- Agent files that bypass the routing protocol
- Breaking changes to the bootstrap or chat REPL without a migration path

---

## Questions

Open a [Discussion](../../discussions) or file an issue.
