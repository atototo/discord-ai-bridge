# discord-ai-bridge LLM Wiki Index

`/Users/winter.e/Documents/ai-bridge` 작업공간의 LLM 인수인계 wiki다. Discord에서 로컬 Codex CLI를 tmux 기반으로 양방향 중계하는 bridge 프로젝트다.

## 먼저 볼 문서

- [AGENTS.md](AGENTS.md): LLM 작업 규칙
- [current-state.md](current-state.md): 현재 상태, 목표, 블로커, 다음 작업
- [log.md](log.md): append-only 작업 로그

## Source Map

- workspace root: 새 git repo. GitHub `atototo/discord-ai-bridge`로 올릴 예정.
- upstream/reference: `DoBuDevel/discord-agent-bridge`. clone 후 새 repo로 운영할 계획.
- runtime target: Discord bot, tmux, Codex CLI adapter. Claude/OpenCode adapter는 제거하지 않는 방향.

## 주제별 문서

<!-- wiki/ 문서를 만들거나 크게 갱신할 때 한 줄 추가:
- [wiki/<topic>.md](wiki/<topic>.md): <한 줄 요약>
-->
- [wiki/architecture.md](wiki/architecture.md): Discord bot + tmux + Codex CLI bridge 아키텍처와 MCP 관계

## Goals

- [../docs/goals/2026-05-16-discord-codex-session-ux.md](../docs/goals/2026-05-16-discord-codex-session-ux.md): Discord category/channel/thread를 Codex 프로젝트/session/run UX로 확장하는 단계별 목표

## 결정 기록

<!-- decisions/ 기록을 만들 때 한 줄 추가:
- [decisions/0001-<slug>.md](decisions/0001-<slug>.md): <결정 요약>
-->
- [decisions/0001-preserve-existing-adapters-add-codex.md](decisions/0001-preserve-existing-adapters-add-codex.md): Claude/OpenCode adapter는 유지하고 Codex adapter를 추가해 Codex MVP를 확정
- [decisions/0002-codex-app-server-transport.md](decisions/0002-codex-app-server-transport.md): Codex 승인/이벤트 UX는 tmux capture 대신 app-server stdio JSON-RPC transport를 우선 사용

## 발견사항

<!-- findings/ 기록을 만들 때 한 줄 추가:
- [findings/YYYY-MM-DD-<slug>.md](findings/YYYY-MM-DD-<slug>.md): <발견 요약>
-->
- [findings/2026-05-07-upstream-structure.md](findings/2026-05-07-upstream-structure.md): 원본 repo license와 adapter 확장 지점 확인
- [findings/2026-05-07-baseline-security-and-tests.md](findings/2026-05-07-baseline-security-and-tests.md): baseline typecheck/test와 npm audit/security 확인 결과
- [findings/2026-05-07-codex-app-channel-research.md](findings/2026-05-07-codex-app-channel-research.md): Codex 앱 channel/plugin 가능성 1차 조사
- [findings/2026-05-07-official-codex-slack-integration.md](findings/2026-05-07-official-codex-slack-integration.md): 공식 Codex Slack integration은 local session이 아니라 cloud task 기반임
- [findings/2026-05-07-codex-realtime-audio-probe.md](findings/2026-05-07-codex-realtime-audio-probe.md): Codex app-server realtime audio probe 결과와 API key auth 제약 확인
- [findings/2026-05-09-bridge-background-process-heat-check.md](findings/2026-05-09-bridge-background-process-heat-check.md): bridge daemon은 실행 중이나 CPU 발열의 직접 원인은 아니며 `caffeinate`로 sleep을 막을 수 있음
- [findings/2026-05-16-codex-app-server-stalled-turn.md](findings/2026-05-16-codex-app-server-stalled-turn.md): Codex app-server turn 완료 이벤트 누락 시 Discord typing만 장시간 유지되는 문제와 watchdog 대응
