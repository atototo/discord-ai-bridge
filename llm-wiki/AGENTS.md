# discord-ai-bridge LLM Wiki 운영 규칙

이 파일은 `/Users/winter.e/Documents/ai-bridge`에서 작업하는 Claude, Codex, Cursor, GPT, 사람 모두가 공유하는 작업 규칙이다. `llm-wiki/` 디렉터리는 이 프로젝트의 장기 기억과 인수인계 문서다.

## 우선순위

1. 사용자의 명시 지시를 최우선으로 따른다.
2. 프로젝트 메모리, 인수인계, wiki 업데이트 규칙은 이 파일을 따른다.
3. 루트의 `AGENTS.md`, `CLAUDE.md` 같은 도구별 지침은 이 파일과 충돌하지 않는 범위에서 따른다.

## 언어

- 문서, 작업 요약, 발견사항, 결정 기록, 현재 상태는 기본적으로 한국어로 작성한다.
- 코드 식별자, 파일 경로, 명령어, 패키지명, API 필드명, DB 이름, 에러 메시지는 원문을 유지한다.

## 보안

- 비밀값, 실제 `.env` 값, token, cookie, session ID, credential, API key, private key, OAuth secret은 절대 기록하지 않는다.
- 변수명, 파일 위치, sanitizing 된 예시는 기록할 수 있다.

## Source Layout

현재 workspace root가 `discord-ai-bridge` repo다.

- `/Users/winter.e/Documents/ai-bridge`: GitHub `atototo/discord-ai-bridge`로 올릴 새 repo 작업공간. 현재는 빈 git repo에서 시작했다.
- 예정 코드 출처: `DoBuDevel/discord-agent-bridge`를 참고/기반으로 가져오되, upstream fork 흐름보다 새 repo로 운영한다.
- 예정 주요 런타임: Discord bot, tmux, Codex CLI adapter. 기존 Claude/OpenCode adapter는 제거하지 않고 유지 가능하면 유지한다.

이 workspace 안에 독립 git repository가 nested 되어 있다면 명확히 적는다. 사용자가 명시적으로 결정하기 전까지 workspace root를 monorepo로 취급하지 않는다.

## 작업 시작 전

의미 있는 프로젝트 작업 전에는 다음을 확인한다.

1. `llm-wiki/current-state.md`를 읽는다.
2. `llm-wiki/index.md`를 읽는다.
3. 현재 작업과 관련된 `wiki/`, `decisions/`, `findings/` 문서만 골라서 읽는다.
4. 최근 맥락이 필요하면 `log.md`의 마지막 항목만 훑는다.

매번 wiki 전체를 읽지 않는다. `index.md`를 기준으로 필요한 문서만 고른다.

## 작업 종료 전

의미 있는 작업 후에는 필요한 항목만 갱신한다.

1. 중요한 일이 있었다면 `log.md`에 append-only로 기록한다.
2. 상태, 목표, 블로커, 다음 작업이 바뀌었으면 `current-state.md`를 갱신한다.
3. 장기적인 architecture, scope, tooling, workflow 결정은 `decisions/000N-<slug>.md`에 새로 기록한다.
4. 운영 이슈, 환경 제약, 검증된 디버깅 결과, 도구 gotcha는 `findings/YYYY-MM-DD-<slug>.md`에 기록한다.
5. 재사용 가능한 주제 지식은 `wiki/<topic>.md`에 추가하거나 갱신한다.
6. 새 wiki/decision/finding 파일을 만들면 `index.md`에 링크를 추가한다.

재사용 가치가 없는 사소한 작업은 wiki에 기록하지 않는다.

## 프로젝트별 규칙

- MVP 성공 기준은 Discord에서 로컬 Codex CLI를 양방향으로 안정적으로 쓰는 것이다.
- Claude/OpenCode 지원 코드는 굳이 제거하지 않는다. Codex adapter와 Codex 운영 문서를 우선 추가한다.
- Discord MCP는 메인 브리지가 아니라 Codex 내부 보조 도구로 본다.
- 보안 기본값은 allowlist 기반이다. Discord channel/user 제한, 위험 명령/승인 UX를 설계에서 빠뜨리지 않는다.
