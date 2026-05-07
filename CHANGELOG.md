# Changelog

All notable changes to this project will be documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Added
- Initial open source release
- README, LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, issue templates
- Portability & Upgrades section in onboarding documentation
- Interactive CLI prompt to cleanly delete sample memory (`000_Acme_Sample_Company_Memory`) during `npm run bootstrap`
- Graph workspace mini IDE with docked multi-tab Markdown editing, save/save-all flows, dirty indicators, and a resizable editor pane
- Graph workspace terminal dock toggle so the local shell can sit on the right or bottom
- Local-first workspace storage resolver with `PULSEOS_HOME` and `PULSEOS_WORKSPACE_ID`
- Reserved workspace directories for snapshots, logs, and cache under `~/.pulseos/workspaces/<workspace-id>/`
- One-time auto-migration from legacy repo-local CLI state into the new persistent workspace home
- Workspace-storage tests covering path resolution, compatibility overrides, and migration safety
- Local delivery backlog and project brief for Codex subscription auth work in `600_Projects`
- OpenAI auth abstraction with support for `PULSEOS_OPENAI_AUTH_MODE=auto|api_key|codex_cli_session`
- Local Codex-session-backed OpenAI path for CLI chat and bootstrap
- Claude auth abstraction with support for `PULSEOS_CLAUDE_AUTH_MODE=auto|api_key|claude_cli_session`
- Local Claude-session-backed Anthropic path for CLI chat and bootstrap
- Auth tests covering API-key and Codex-session resolution

### Changed
- Complete rename and rebranding across the repository from "PulseOS Lite Open Source" to "PulseOS-Lite"
- Core documentation files are now numbered (`01_RUNME.md`, `02_HOW_TO_RUN.md`, etc.) to force natural sorting in file explorers
- Updated MCP integration documentation and renamed launch script to `pulseos-lite-mcp-launch.sh`
- Bootstrap is now source-driven and validates real intake documents before onboarding continues
- `01_RUNME.md` is the primary onboarding entry point and `03_HOW_IT_WORKS.md` now serves as the “How It Works” guide
- Meeting transcripts now live under Operations instead of the source-intake area
- The graph UI no longer uses a blocking document modal; the graph controls stay visible when the map is hidden, and the editor/terminal can share the workspace like a lightweight IDE
- Default CLI persistence moved out of `cli/` and into `~/.pulseos/workspaces/<workspace-id>/`
- Chat, graph, daemon, bootstrap, index, and MCP flows now resolve the same shared workspace path before touching SQLite state
- Documentation now treats Git as code and Markdown sync, not database sync, and recommends mounting `PULSEOS_HOME` as the durable Docker volume root
- `npm run status` now reports model auth availability, including Codex-session-backed OpenAI detection
- OpenAI chat/bootstrap no longer require a manually pasted API key when a local Codex session is available; embeddings still fall back to API key or heuristic mode
- Claude chat/bootstrap no longer require a manually pasted API key when a local Claude Code session is available
- OpenAI `auto` auth now prefers a local signed-in Codex session before `OPENAI_API_KEY`
- `bootstrap` now hands off into the local chat session when source intake is empty instead of dropping the user back to the shell
- `npm run ui` is now the primary browser workspace command; `npm run graph` remains as a compatibility alias
- Default OpenAI model for chat and bootstrap is now `gpt-5.4`
- Main onboarding and runtime docs now explain the current auth defaults, UI command, and default model override paths

---

## [1.0.0] — 2026-04-14

### Added
- Full 13-domain Markdown operating system (101–502)
- `@ARK` master orchestrator with agent routing table
- 13 canonical domain agents with `@` handle routing
- 4 execution agents (sales outreach, ad generation, insight research, LinkedIn posts)
- TypeScript CLI daemon with multi-model support (Claude, OpenAI, Gemini)
- `npm run bootstrap` — AI-assisted placeholder fill in dependency order
- Chat REPL with `:model`, `:reset`, `:reload`, `:files`, `:status` commands
- `agent_registry.yaml` machine-readable routing source of truth
- Two-layer agent model: canonical domain files + centralized execution stubs
- `CLAUDE.md` repo-level programming for your preferred coding agent
