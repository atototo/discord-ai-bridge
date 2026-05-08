# 공식 Codex Slack integration 확인

날짜: 2026-05-07

## 확인 문서

- https://developers.openai.com/codex/integrations/slack

## 핵심 내용

공식 Slack integration은 Slack channel/thread에서 `@Codex`를 mention하면 Codex가 task를 만들고 결과를 thread에 reply하는 구조다.

중요한 제약:

- Codex cloud tasks 설정이 필요하다.
- GitHub account와 Codex environment가 필요하다.
- task는 environment repo map의 repository/default branch 기준으로 실행된다.
- Slack thread history를 받아 task context로 사용한다.
- 결과는 task link와 선택적 answer로 Slack thread에 게시된다.

## 판단

이 기능은 "Slack -> Codex inbound channel"이 맞지만, 실행 대상은 로컬 Codex 앱/CLI 세션이 아니라 Codex cloud task다.

따라서 우리 목표와의 관계는 다음과 같다.

- 로컬 Codex CLI를 Discord에서 그대로 쓰는 목표에는 직접 적용되지 않는다.
- Codex 앱의 현재 open thread로 메시지를 push하는 API라는 증거도 아니다.
- 다만 UX와 permission model은 참고할 수 있다: mention 기반 task 시작, thread history context, environment/repo 선택, task link reply, enterprise answer posting control.

## 설계 영향

`discord-ai-bridge`는 두 mode를 분리해 설계할 수 있다.

- `local` mode: Discord bot -> tmux -> local Codex CLI.
- `cloud` mode: Discord bot -> Codex cloud task API/SDK/App Server(공식 API 확인 필요) -> Discord reply.

현재 MVP는 `local` mode가 맞다.
