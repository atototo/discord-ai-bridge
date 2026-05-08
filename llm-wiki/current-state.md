# 현재 상태

날짜: 2026-05-07

## 작업공간

- Root: `/Users/winter.e/Documents/ai-bridge`
- Project: `discord-ai-bridge`
- Wiki language: 한국어
- Source layout:
  - workspace root: GitHub `atototo/discord-ai-bridge`로 올릴 새 repo
  - 참고/기반 repo: `DoBuDevel/discord-agent-bridge`
  - 예정 구성: Discord bot + tmux + Codex CLI adapter

## 현재 상태

- 원본 `DoBuDevel/discord-agent-bridge`를 `_upstream/discord-agent-bridge`에 clone하고, root working tree로 소스 파일을 복사했다.
- root git remote `origin`은 `https://github.com/atototo/discord-ai-bridge.git`로 설정했다.
- root repo local git config는 `user.name=atototo`, `user.email=atoto0311@gmail.com`로 설정했다.
- 현재 branch는 `main`이다.
- `llm-wiki/`, 루트 `AGENTS.md`, 루트 `CLAUDE.md`를 초기화했다.
- 목표 아키텍처는 Discord bot이 로컬 Codex/Claude/OpenCode 세션을 Discord와 양방향 중계하는 상시 브리지다. Codex는 app-server 기반 structured transport를 우선하고, tmux 기반 경로는 기존 adapter 호환용으로 남기는 방향이다.
- 사용자는 Claude/OpenCode adapter를 굳이 제거하지 않고, Codex adapter를 추가해서 Codex 기능을 확정하는 방향을 선호한다.
- bundled Node 24.14.0 기준 baseline `typecheck`와 `test`는 통과했다.
- baseline `npm audit`은 8 vulnerabilities(3 moderate, 5 high)를 보고했다.
- local-first Codex MVP 1차 구현을 완료했다: `CodexAdapter`, Discord user allowlist, approval allowlist, tmux target escaping, README 업데이트.
- bundled Node 24 기준 `typecheck`, `test`, `build`가 통과했다. 현재 테스트 수는 149개다.
- Discord smoke test에서 입력은 Codex로 전달되지만, 기존 poller가 tmux 전체 화면을 보내 시작 배너/이전 출력까지 Discord에 올라오는 문제가 확인됐다.
- `CapturePoller`를 첫 capture baseline 저장 + 완료 시 lastReported 이후 delta 전송 방식으로 수정했다.
- Codex 전용 formatter를 추가해 startup/update chrome, prompt echo, `Explored` summary, status prompt line을 제거하고 최종 응답 중심으로 Discord에 보내도록 했다.
- `CapturePoller` 기본 interval을 30초에서 3초로 낮췄고 `CAPTURE_POLL_INTERVAL_MS`로 조정 가능하다.
- formatter가 줄바꿈된 Codex `Tip:` 본문과 `superpowers:... 스킬 지침` 내부 준비 문구를 제거하도록 보강됐다.
- Discord 첨부 파일/이미지 수신 MVP를 추가했다. 첨부는 `.agent-discord/attachments/<message-id>/`에 저장되고 Codex 입력에 로컬 경로로 전달된다.
- Codex가 `[[discord-attach:/absolute/path]]` 마커를 응답에 넣으면 bridge가 프로젝트 내부 파일만 Discord 첨부로 업로드한다. 이 처리는 tmux poller와 app-server 최종 응답 경로 모두에 연결되어 있다.
- Codex가 마커 없이 최종 답변 본문에 프로젝트 내부 이미지 파일 경로를 적는 경우에도 bridge가 해당 이미지를 자동 감지해 Discord 첨부로 업로드한다.
- Codex 이미지 생성 도구가 저장하는 `~/.codex/generated_images/` 아래 이미지도 bridge outbound 업로드 허용 루트에 포함한다. 테스트에서는 `CODEX_GENERATED_IMAGES_DIR`로 이 루트를 대체할 수 있다.
- Codex app-server transport 1차 구현을 추가했다. `CODEX_TRANSPORT=app-server`로 daemon을 시작하면 Codex 메시지는 tmux capture 대신 `codex app-server --listen stdio://` JSON-RPC로 처리된다.
- app-server transport는 `thread/start`, `turn/start`, `item/agentMessage/delta`, `turn/completed`, `item/commandExecution/requestApproval`, `item/fileChange/requestApproval`, `item/permissions/requestApproval` 흐름을 사용한다.
- Discord approval UX는 Codex app-server의 `reason` 필드를 우선 보여주는 간결한 한국어 메시지로 표시한다. 전체 JSON payload는 기본 승인 카드에서 숨긴다.
- app-server transport에서 Discord 이미지 첨부는 `localImage` user input으로 전달된다.
- app-server transport에서 일반 파일 첨부는 로컬 파일 경로를 text input에 포함해 전달한다.
- app-server transport는 Discord에서 온 모든 사용자 입력에 outbound 파일 전송 지침을 덧붙인다. 이미지/파일을 보여줘야 하면 로컬 경로 링크나 Markdown image가 아니라 `[[discord-attach:/absolute/path]]` 마커를 별도 줄로 포함하도록 Codex에 안내한다.
- app-server transport는 `item/started` notification을 Discord 상태 메시지로 변환해 웹 검색/명령 실행/도구 사용 시작을 먼저 보여준다.
- app-server transport의 assistant 답변 본문은 중간 delta를 조각내 보내지 않고, `item/completed`의 `agentMessage.text`와 `turn/completed`를 기준으로 한 번에 전송한다.
- Discord 최종 답변은 코드블럭으로 감싸지 않고 일반 Markdown 메시지로 보내 bold/list/link가 Discord에서 렌더링되도록 한다.
- 프로젝트/채널 매핑은 state의 `projectName -> projectPath -> discordChannels` 기준이다. 한 Discord 채널은 저장된 프로젝트 경로의 Codex thread로 계속 라우팅되며, 다른 로컬 경로는 별도 project/channel로 등록하는 모델이다.
- Discord 채널 생성 시 프로젝트명 category를 만들거나 재사용하고, 해당 프로젝트의 agent 채널을 category 아래에 둔다.
- 로컬 사용은 npm publish 없이 source install + `npm link`를 기본으로 한다. `agent-discord-codex`는 현재 디렉터리에서 app-server daemon을 재시작하고 `go codex --no-attach`를 실행하며, `agent-discord-down`은 daemon stop 별칭이다.
- Discord voice message는 `.ogg`/Opus 첨부로 정상 다운로드되고 Codex에 파일 경로로 전달된다.
- Codex app-server realtime audio protocol probe 결과, `thread/realtime/*` methods는 `--experimental` 타입에 존재하지만 `realtime_conversation` feature enable이 필요하고 현재 ChatGPT auth app-server 세션에서는 `realtime conversation requires API key auth`로 실패한다.

## 현재 목표

- `DoBuDevel/discord-agent-bridge`는 MIT license로 확인했고, `src/agents/`에 adapter를 추가하는 구조다.
- 기존 Claude/OpenCode 흐름은 유지하면서 Codex adapter를 추가하는 MVP를 구현했다.
- Discord allowlist와 tmux target escaping을 1차 반영했다.
- 다음 세부 목표는 실제 Discord에서 Codex app-server transport smoke test, 이미지/파일 양방향 첨부 smoke test, 승인 요청 왕복 smoke test, 음성 첨부 UX 결정이다.

## 다음 작업

1. 실제 Discord bot token과 허용 사용자 ID를 로컬 환경변수로 설정해 smoke test를 준비한다.
2. 새 빌드가 적용되도록 daemon을 재시작하고 `CODEX_TRANSPORT=app-server agent-discord go codex`로 Discord smoke test를 실행한다.
3. Discord에 이미지/파일을 올려 app-server transport에서 Codex가 `localImage`/로컬 경로를 처리하고, 결과 파일이 명시 마커 또는 본문 이미지 경로 감지로 Discord에 업로드되는지 확인한다.
4. 명령 실행/파일 변경/권한 승인 요청이 Discord approval UX로 올라오고 승인/거절 decision이 Codex app-server로 돌아가는지 smoke test한다.
5. 프로젝트 category 생성/재사용이 실제 Discord 서버 권한과 UI에서 기대대로 동작하는지 확인한다.
6. Discord voice message를 API key auth 기반 realtime audio로 처리할지, 아니면 로컬 도구 승인 기반 파일 처리 UX로 유지할지 결정한다.

## 열린 질문 / 블로커

- 실제 Discord bot token, channel/user allowlist 값은 문서나 커밋에 기록하지 않는다.
- 현재 기본 shell Node는 16이라 테스트 시 bundled Node 24 경로를 PATH 앞에 둬야 한다.
- Codex app-server WebSocket transport는 공식 문서상 experimental/unsupported라 현재 구현은 stdio JSON-RPC만 사용한다.
- daemon이 이미 실행 중이면 `CODEX_TRANSPORT=app-server` 환경변수가 기존 daemon에 적용되지 않는다. app-server mode 테스트 전 daemon을 중지하고 같은 환경변수로 다시 시작해야 한다.
