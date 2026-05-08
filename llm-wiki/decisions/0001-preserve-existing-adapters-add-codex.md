# 결정 0001: 기존 adapter를 유지하고 Codex adapter를 추가한다

날짜: 2026-05-07

## 결정

`DoBuDevel/discord-agent-bridge`를 참고/기반으로 가져올 때 Claude/OpenCode adapter를 굳이 제거하지 않는다. 기존 구조를 유지하면서 `CodexAgentAdapter` 같은 Codex용 adapter를 추가하고, MVP 성공 기준은 Codex 기능 확정으로 둔다.

## 이유

- 기존 adapter를 제거하는 작업은 MVP 검증에 직접 도움이 되지 않는다.
- 원본 프로젝트의 adapter boundary를 유지하면 Codex 추가 작업이 더 작고 검증 가능하다.
- repo 이름은 `discord-ai-bridge`로 범용성을 열어두되, 초기 운영 문서와 테스트는 Codex 중심으로 작성한다.

## 영향

- README와 설정 예시는 Codex를 우선 설명한다.
- Claude/OpenCode 지원은 남아 있을 수 있지만, 이번 MVP의 필수 검증 대상은 아니다.
- adapter interface가 Codex CLI 특성과 맞지 않으면 Codex 쪽에 필요한 최소 확장을 추가한다.

