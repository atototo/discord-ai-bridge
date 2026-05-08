# 원본 repo 구조 확인

날짜: 2026-05-07

## 확인 내용

GitHub `DoBuDevel/discord-agent-bridge` README 기준:

- License: MIT
- 언어/런타임: TypeScript, Node.js 18+
- 주요 구조: `bin/`, `docs/`, `src/`, `tests/`
- 기존 지원 agent: Claude Code, OpenCode
- tmux capture polling 기반으로 Discord에 출력 변경분을 전송한다.
- custom agent는 `src/agents/`에서 `BaseAgentAdapter`를 확장하고 `src/agents/index.ts`에 등록하는 방식으로 안내되어 있다.

## 작업 영향

Codex 지원은 기존 adapter 구조에 `CodexAgentAdapter`를 추가하는 방식이 가장 작다. 원본 license 고지는 새 repo에서도 유지해야 한다.
