# Local Codex Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `discord-ai-bridge` run Codex CLI as a local tmux-backed agent while tightening the minimum security controls needed before exposing local shell access through Discord.

**Architecture:** Keep the upstream adapter registry and add a `CodexAdapter` beside Claude/OpenCode. Add local-first guardrails in the existing Discord/tmux path: user allowlists for inbound Discord messages and approval reactions, plus escaped tmux targets for session/window operations.

**Tech Stack:** TypeScript, Node.js, discord.js, tmux, Vitest.

---

## File Map

- `src/types/index.ts`: Extend `DiscordConfig` with `allowedUserIds`.
- `src/config/index.ts`: Load `DISCORD_ALLOWED_USER_IDS` and persist `allowedUserIds`.
- `src/discord/client.ts`: Enforce allowlist for channel messages and approval reactions.
- `src/tmux/manager.ts`: Escape tmux targets consistently.
- `src/agents/codex.ts`: Add Codex CLI adapter.
- `src/agents/index.ts`: Export/register Codex adapter.
- `tests/config/index.test.ts`: Cover allowlist config.
- `tests/discord/client.test.ts`: Cover allowlist and approval filtering.
- `tests/tmux/manager.test.ts`: Cover escaped tmux targets.
- `tests/agents/adapters.test.ts`: Cover Codex adapter registration/config.
- `README.md`, `README.ko.md`, `docs/README.ko.md`: Document local Codex mode and security defaults.

## Tasks

### Task 1: Security Config

- [x] Add failing tests for `DISCORD_ALLOWED_USER_IDS` parsing and stored `allowedUserIds`.
- [x] Implement config fields.
- [x] Run config tests.

### Task 2: Discord Allowlist Enforcement

- [x] Add failing tests that messages from non-allowed users are ignored.
- [x] Add failing tests that approval reactions from non-allowed users are ignored.
- [x] Implement allowlist checks in `DiscordClient`.
- [x] Run Discord client tests.

### Task 3: Tmux Target Escaping

- [x] Add failing tests showing malicious session/window names are quoted in tmux target commands.
- [x] Escape `sessionName`, `windowName`, and combined targets consistently.
- [x] Run tmux tests.

### Task 4: Codex Adapter

- [x] Add failing adapter tests for Codex config, start command, and registry registration.
- [x] Implement `src/agents/codex.ts`.
- [x] Register Codex in default registry.
- [x] Run agent tests.

### Task 5: Docs, Wiki, Verification

- [x] Update README docs to describe local Codex mode and required security settings.
- [x] Update `llm-wiki/current-state.md` and `llm-wiki/log.md`.
- [x] Run full verification with bundled Node 24:

```bash
PATH=/Users/winter.e/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run typecheck
PATH=/Users/winter.e/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm test
```
