# Changelog

All notable changes to this project will be documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Added
- Initial open source release
- README, LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, issue templates

### Changed
- Bootstrap is now source-driven and validates real intake documents before onboarding continues
- `@RUNME.md` is the primary onboarding entry point and `HOW_IT_WORKS.md` now serves as the “How It Works” guide
- Meeting transcripts now live under Operations instead of the source-intake area

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
