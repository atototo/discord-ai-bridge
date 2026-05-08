# 작업 로그

## [2026-05-07] setup | llm-wiki 초기화

- init_wiki.sh로 기본 wiki 구조를 생성했다.
- 루트 AGENTS.md / CLAUDE.md 진입점을 확인했다.
- 다음 작업: AGENTS.md, current-state.md, index.md를 프로젝트에 맞게 채운다.

## [2026-05-07] planning | discord-ai-bridge 방향 정리

- 프로젝트 이름을 `discord-ai-bridge`로 두고 GitHub `atototo/discord-ai-bridge`로 올릴 예정이다.
- 참고/기반 repo는 `DoBuDevel/discord-agent-bridge`다.
- 기존 Claude/OpenCode adapter를 제거하지 않고 Codex adapter를 추가하는 방향으로 결정했다.
- Discord MCP는 메인 브리지가 아니라 Codex 내부 보조 도구로 본다.
- 원본 repo가 MIT license이고 `BaseAgentAdapter` 확장 구조를 제공하는 것을 확인했다.

## [2026-05-07] setup | upstream clone 및 git 정리

- `DoBuDevel/discord-agent-bridge`를 `_upstream/discord-agent-bridge`에 clone했다.
- root working tree에 원본 소스 파일을 복사하고 `_upstream/`은 `.gitignore`에 추가했다.
- `package.json`, `package-lock.json`의 package name을 `discord-ai-bridge`로 바꾸고 설명/keywords에 Codex 방향을 반영했다.
- root git remote `origin`을 `https://github.com/atototo/discord-ai-bridge.git`로 설정했다.
- branch명을 `main`으로 변경하려 했으나 권한 요청이 승인되지 않아 현재 branch는 `master`로 유지했다.

## [2026-05-07] setup | git author config 설정

- root repo local git config를 `user.name=atototo`, `user.email=atoto0311@gmail.com`로 설정했다.
- `.idea/`가 untracked로 보여 초기 커밋에 섞이지 않도록 `.gitignore`에 추가했다.

## [2026-05-07] setup | branch main 설정

- root repo 초기 branch명을 `master`에서 `main`으로 변경했다.

## [2026-05-07] verification | baseline 보안/테스트 확인

- `npm ci --ignore-scripts`는 기본 Node 16에서 optional native dependency가 누락되어 Vitest 실행이 실패했다.
- bundled Node 24.14.0을 PATH 앞에 둔 뒤 `npm ci --ignore-scripts`를 다시 실행했고 optional dependency가 설치됐다.
- `npm run typecheck` 통과.
- `npm test` 통과: 12 test files, 129 tests.
- `npm audit --json` 결과 8 vulnerabilities(3 moderate, 5 high)를 확인했다.
- 코드 검토상 user allowlist 부재, approval actor 제한 부재, 일부 tmux target escaping 누락을 Codex adapter 구현 전 보안 보강 후보로 기록했다.

## [2026-05-07] research | Codex 앱 channel/plugin 가능성

- Slack plugin/connector를 참고할 수 있는지 논의했다.
- 로컬 Codex plugin cache에서 Slack channel 구현체는 확인되지 않았다.
- Codex 앱은 `codex://` URL scheme을 등록하지만, 외부 메시지를 실행 중인 thread로 push하는 공개 action은 확인되지 않았다.
- connector/tool과 channel/runtime을 구분해야 한다는 결론을 기록했다.

## [2026-05-07] research | 공식 Codex Slack integration 확인

- OpenAI 공식 문서 `https://developers.openai.com/codex/integrations/slack`를 확인했다.
- Slack에서 `@Codex` mention으로 Codex task를 만들고 결과를 thread에 reply하는 inbound channel 형태다.
- 단, 실행 대상은 local Codex 앱/CLI 세션이 아니라 Codex cloud task다.
- `discord-ai-bridge`는 local tmux bridge와 cloud task bridge를 별도 mode로 나눌 수 있다는 설계 후보를 기록했다.

## [2026-05-07] implementation | local-first Codex MVP 1차 패치

- `src/agents/codex.ts`를 추가하고 default agent registry에 Codex adapter를 등록했다.
- `DISCORD_ALLOWED_USER_IDS`와 stored `allowedUserIds` 설정을 추가했다.
- Discord mapped channel messages와 approval reactions를 allowlist로 제한했다. allowlist가 비어 있으면 기존 호환성을 위해 allow-all로 동작한다.
- `src/tmux/manager.ts`의 session/window target 명령을 shell-escaped target으로 바꿨다.
- README/한국어 문서에 local Codex mode와 allowlist 설정을 반영했다.
- 검증: bundled Node 24.14.0 기준 `npm run typecheck`, `npm test`(12 files, 137 tests), `npm run build` 통과.

## [2026-05-07] fix | poller가 tmux 전체 화면을 보내는 문제 완화

- Discord smoke test에서 `Codex - 받은 메시지`는 표시되어 Discord -> Codex 입력 경로는 동작함을 확인했다.
- Codex 응답이 올라올 때 startup banner, update notice, 이전 shell command까지 함께 전송되는 문제가 있었다.
- 원인은 `CapturePoller`가 작업 완료 시 현재 tmux capture 전체를 보내는 구조였기 때문이다.
- 첫 capture는 baseline/lastReported로만 저장하고 전송하지 않도록 바꿨다.
- 완료 시에는 `lastReportedCapture` 이후의 delta만 Discord로 보내도록 바꿨다.
- 검증: bundled Node 24.14.0 기준 `npm run typecheck`, `npm test`(12 files, 137 tests), `npm run build` 통과.

## [2026-05-07] fix | Codex 전용 output formatter 추가

- 사용자는 Discord에는 "에이전트 문구와 에이전트 결과만" 올라오면 된다고 정리했다.
- `src/capture/formatters/index.ts`를 추가해 `agentType === "codex"`일 때 Codex 터미널 chrome을 필터링한다.
- 필터 대상: startup/update box, `Tip:`, `Learn more:`, URL-only line, prompt echo(`› ...`), `Explored` block, status prompt line.
- poller completion delta를 Discord에 보내기 전에 `formatAgentOutput(agentType, rawContent)`를 거치도록 연결했다.
- 검증: bundled Node 24.14.0 기준 `npm run typecheck`, `npm test`(13 files, 140 tests), `npm run build` 통과.

## [2026-05-07] fix | poll interval 단축 및 Codex formatter 보강

- Discord 응답이 느린 원인은 `CapturePoller` 기본 interval이 30초였기 때문이다.
- 기본 interval을 3초로 낮추고 `CAPTURE_POLL_INTERVAL_MS` 환경변수/저장 config로 조정 가능하게 했다.
- Codex startup `Tip:` 본문이 줄바꿈되어 일부 남는 문제와 `superpowers:... 스킬 지침` 내부 준비 문구가 Discord 결과에 섞이는 문제를 formatter에서 제거했다.
- README/한국어 문서의 polling 설명과 환경변수 표를 3초 기준으로 갱신했다.
- 검증: bundled Node 24 기준 `npm run typecheck`, `npm test`(13 files, 143 tests), `npm run build` 통과.

## [2026-05-07] implementation | Discord 파일/이미지 양방향 첨부 MVP

- Discord 메시지 첨부 메타데이터를 bridge callback으로 전달하도록 `DiscordClient`를 확장했다.
- 첨부 파일은 프로젝트 내부 `.agent-discord/attachments/<message-id>/`에 다운로드하고, Codex 입력에 로컬 파일 경로와 처리 지침을 붙인다.
- Codex가 결과 파일을 Discord로 보내야 할 때 최종 응답에 `[[discord-attach:/absolute/path]]` 마커를 넣으면 bridge가 파일을 업로드하고 마커를 제거한다.
- outbound 파일 전송은 프로젝트 디렉토리 내부에 존재하는 파일만 허용한다.
- `.agent-discord/`는 git에 포함되지 않도록 `.gitignore`에 추가했다.
- 검증: bundled Node 실행 기준 `tsc --noEmit`, `vitest run`(14 files, 149 tests), `tsup build` 통과.

## [2026-05-07] research | Codex app-server bridge 가능성

- 공식 Codex App Server 문서를 확인했다. app-server는 rich client용 JSON-RPC 2.0 프로토콜이며 authentication, conversation history, approvals, streamed agent events를 지원한다.
- 로컬 `codex app-server generate-ts/json-schema`로 현재 설치된 Codex v0.128.0 프로토콜 타입을 생성해 확인했다.
- Discord bridge에 필요한 `thread/start`, `thread/resume`, `turn/start`, `turn/steer`, `turn/interrupt`, `item/agentMessage/delta`, `item/completed`, `turn/completed` 흐름이 존재한다.
- 승인 UX에 필요한 `item/commandExecution/requestApproval`, `item/fileChange/requestApproval`, `item/permissions/requestApproval` server request가 존재하고, client가 승인/거절 decision payload를 응답하는 구조다.
- 결론: 승인체계까지 고려하면 app-server adapter가 tmux capture보다 적합하다. 단 WebSocket transport는 공식 문서상 experimental/unsupported라 초기 구현은 stdio JSONL 기반이 안전하다.

## [2026-05-07] implementation | Codex app-server transport 1차 구현

- `src/codex-app/`에 newline JSON-RPC client와 Codex app-server session manager를 추가했다.
- `CODEX_TRANSPORT=app-server`이면 Codex 메시지는 tmux send/capture 대신 `codex app-server --listen stdio://`의 `thread/start` 및 `turn/start`로 전달된다.
- `item/agentMessage/delta`를 turn별로 누적하고 `turn/completed` 시 Discord로 전송한다.
- `item/commandExecution/requestApproval` server request는 Discord approval reaction UX로 라우팅하고 승인/거절 decision을 JSON-RPC response로 돌려준다.
- Discord image attachment는 app-server `localImage` user input으로 전달한다.
- Codex app-server mode에서는 attach할 tmux UI가 없으므로 `agent-discord go codex`가 tmux attach를 건너뛰도록 CLI를 조정했다.
- 검증: bundled Node 기준 `tsc --noEmit`, `vitest run`(16 files, 157 tests), `tsup build` 통과. 실제 `codex app-server --listen stdio://` initialize smoke에서 newline JSON-RPC 응답을 확인했다.

## [2026-05-07] fix | Codex app-server 응답 체감 지연 완화

- Discord smoke test에서 app-server 응답은 정상적으로 도착했지만, bridge가 `turn/completed`까지 agent delta 전송을 미루어 체감 응답이 늦었다.
- `CodexAppServerSessionManager`가 `item/agentMessage/delta`를 turn별로 누적하되 1.5초 간격으로 새 delta를 Discord에 `진행 중` 메시지로 flush하도록 바꿨다.
- `turn/completed`에서는 아직 전송하지 않은 잔여 텍스트만 `완료`로 보내고, 이미 모두 flush된 경우 `✅ 완료`만 보낸다.
- 검증: bundled Node 기준 `tsc --noEmit`, `vitest run`(16 files, 158 tests), `tsup build` 통과.

## [2026-05-07] fix | Codex app-server 도구 진행 상태 표시

- 사용자가 tool 사용 상태도 Discord에 표시하면 대기 체감이 줄어들 것 같다고 제안했다.
- `item/started` notification을 처리해 웹 검색, 명령 실행, 파일 변경, MCP/동적 도구, 이미지 확인/생성 시작을 Discord에 짧은 상태 메시지로 보낸다.
- 같은 item id는 중복 전송하지 않는다.
- 검증: bundled Node 기준 `tsc --noEmit`, `vitest run`(16 files, 159 tests), `tsup build` 통과.

## [2026-05-07] fix | Codex app-server 최종 답변 전송 정책 정리

- Discord에서 짧은 최종 답변이 `진행 중` 여러 조각과 `완료` 잔여 조각으로 나뉘어 보이는 문제가 있었다.
- app-server는 `item/completed`의 `agentMessage.text`와 `turn/completed` 이벤트로 최종 답변 경계를 알 수 있으므로, assistant 본문 중간 flush를 기본 동작에서 제거했다.
- 이제 도구 진행 상태만 중간에 보내고, assistant 답변은 `agentMessage` 완료 텍스트를 우선 사용해 `turn/completed` 시 한 번에 전송한다.
- 검증: bundled Node 기준 `tsc --noEmit`, `vitest run`(16 files, 160 tests), `tsup build` 통과.

## [2026-05-07] fix | Discord 최종 답변 코드블럭 제거

- Discord는 일반 메시지에서 Markdown 목록, bold, masked links를 렌더링하므로 AI 최종 답변을 코드블럭으로 감싸면 가독성이 나빠진다.
- `src/discord/format.ts`에 최종 답변 formatter를 추가하고 app-server/tmux poller 최종 답변 모두 코드블럭 없이 전송하도록 바꿨다.
- assistant가 코드블럭을 의도적으로 포함한 경우에는 본문에 포함된 fence를 그대로 보존한다.
- 검증: bundled Node 기준 `tsc --noEmit`, `vitest run`(17 files, 162 tests), `tsup build` 통과.

## [2026-05-07] implementation | Codex app-server 파일 업로드와 승인 UX 완성

- app-server 최종 답변에도 `[[discord-attach:/absolute/path]]` 마커 파싱을 연결해 프로젝트 내부 파일을 Discord 첨부로 업로드하고 마커는 제거하도록 했다.
- app-server outbound 파일 업로드도 기존 tmux poller와 같은 안전 규칙을 사용해 프로젝트 디렉토리 내부에 존재하는 파일만 전송한다.
- `item/fileChange/requestApproval`, `item/permissions/requestApproval` server request를 Discord approval reaction UX로 라우팅하고 승인/거절 decision을 JSON-RPC response로 돌려주도록 했다.
- README에 app-server 파일/이미지 양방향 동작, 승인 범위, 프로젝트 경로와 Discord 채널 매핑 관계를 정리했다.
- 검증: bundled Node 실행 기준 `tsc --noEmit`, `vitest run`(17 files, 165 tests), `tsup build` 통과.

## [2026-05-07] implementation | Discord 프로젝트 category 묶음 추가

- Discord 채널 생성 시 프로젝트명과 같은 category를 만들거나 기존 category를 재사용하도록 했다.
- 새 agent 채널은 해당 project category 아래에 생성된다.
- 기존 state 모델은 유지한다. Discord 메시지 라우팅은 여전히 channel ID -> projectName/agentType 매핑 기준이며, channel은 저장된 projectPath의 Codex thread로 이어진다.
- 검증: bundled Node 실행 기준 `tsc --noEmit`, `vitest run`(17 files, 167 tests), `tsup build` 통과.

## [2026-05-07] research | Codex app-server realtime audio probe

- 잘못 추가했던 OpenAI transcription 우회 코드는 제거하고, Codex app-server 자체 realtime audio protocol을 probe했다.
- `codex app-server generate-ts --experimental` 기준 `thread/realtime/start`, `thread/realtime/appendAudio`, `thread/realtime/appendText`, `thread/realtime/stop`, `thread/realtime/listVoices`가 존재함을 확인했다.
- 기본 app-server에서는 `realtime_conversation` feature가 꺼져 있어 realtime thread start가 실패한다.
- app-server를 `--enable realtime_conversation`로 시작하면 `thread/realtime/listVoices`는 성공하지만, `thread/realtime/start`는 `realtime conversation requires API key auth`로 실패했다.
- 결론: 현재 ChatGPT/Codex 앱 로그인 기반 app-server 세션만으로는 Discord 음성 메시지를 Codex realtime audio에 직접 연결할 수 없다. API key auth를 쓰지 않으려면 현 단계에서는 음성 `.ogg`를 파일 첨부로 전달하고 Codex가 로컬 도구 승인으로 처리하는 경로가 현실적이다.
- 검증: bundled Node 실행 기준 `tsc --noEmit`, `vitest run`(17 files, 167 tests), `tsup build` 통과.

## [2026-05-07] fix | 최종 답변 이미지 경로 자동 Discord 첨부

- Codex가 이미지 파일 경로를 자연어 답변에만 적고 `[[discord-attach:...]]` 마커를 넣지 않으면 Discord에는 경로 텍스트만 보이고 실제 이미지 첨부가 올라가지 않는 문제가 있었다.
- `extractDiscordAttachments()`가 최종 답변 본문에서 프로젝트 내부에 존재하는 이미지 경로(`png`, `jpg`, `gif`, `webp`, `heic`, `avif` 등)를 자동 감지해 Discord 파일 업로드 목록에 추가하도록 했다.
- 기존 명시 마커 방식은 유지하고, 자동 감지는 프로젝트 내부 파일만 허용하며 중복 업로드를 막는다.
- 검증: bundled Node 실행 기준 `tsc --noEmit`, `vitest run`(17 files, 169 tests), `tsup build` 통과.

## [2026-05-07] fix | Codex generated_images 직접 생성 이미지 업로드 허용

- Codex 이미지 생성 도구가 만든 파일은 프로젝트 내부가 아니라 `~/.codex/generated_images/` 아래에 저장되므로, 기존 프로젝트 내부 파일 제한에 걸려 Discord 첨부로 올라가지 않았다.
- outbound 업로드 허용 루트에 Codex generated images 디렉터리를 추가했다.
- 보안 범위는 프로젝트 루트와 generated images 루트로 제한하고, 테스트에서는 `CODEX_GENERATED_IMAGES_DIR`로 generated images 루트를 대체할 수 있게 했다.
- 검증: bundled Node 실행 기준 `tsc --noEmit`, `vitest run`(17 files, 170 tests), `tsup build` 통과.

## [2026-05-08] fix | Discord outbound 파일 전송 지침 상시 주입

- Discord에서 이미지 생성 요청을 받은 Codex가 로컬 경로 링크나 Markdown image로 답하면 Discord에는 이미지가 직접 보이지 않고 사용자가 다시 파일 첨부를 요청해야 했다.
- app-server `turn/start` 입력 text에 Discord bridge 지침을 항상 붙여, 이미지나 파일을 보여줘야 할 때 `[[discord-attach:/absolute/path]]` 마커를 사용하도록 안내한다.
- bridge 쪽 자동 감지 로직은 그대로 유지하므로, Codex가 마커를 빠뜨려도 프로젝트 내부 이미지 또는 generated images 경로는 첨부로 업로드될 수 있다.
- 검증: bundled Node 실행 기준 `tsc --noEmit`, `vitest run`(17 files, 170 tests), `tsup build` 통과.

## [2026-05-08] fix | Discord 승인 요청 카드 간소화

- 기존 Discord approval 카드는 Codex app-server request payload 전체 JSON을 보여줘 사용자가 핵심 승인 문구를 읽기 어려웠다.
- `reason` 필드가 있으면 이를 승인 질문 본문으로 우선 표시하고, tool label은 `명령 실행`, `파일 변경`, `권한 변경`처럼 한국어로 보여주도록 바꿨다.
- 기본 안내 문구도 `✅ 승인 / ❌ 거절` 중심으로 바꿨고, 전체 JSON payload는 기본 카드에서 숨긴다.
- 실제 smoke test에서 `/Users/winter.e/Desktop/codex-approval-test.txt` 생성 승인 후 파일 내용이 `hello`임을 확인했다.
- 검증: bundled Node 실행 기준 `tsc --noEmit`, `vitest run`(17 files, 171 tests), `tsup build` 통과.

## [2026-05-08] docs/tooling | source install과 daemon 편의 명령 정리

- 이 repo는 npm publish 전에 `atototo/discord-ai-bridge` source install + `npm link`로 운영하는 방향으로 README를 정리했다.
- `agent-discord-codex` bin을 추가했다. 현재 디렉터리에서 daemon을 내리고 `CODEX_TRANSPORT=app-server agent-discord go codex --no-attach`를 실행하는 편의 명령이다.
- `agent-discord-down` bin을 추가했다. 전역 bridge daemon stop 별칭이다.
- README/README.ko를 커스텀 fork 상태, app-server 기본 흐름, 파일/이미지 업로드, 승인 UX, npm link 사용법에 맞게 갱신했다.
- secret scanner 오탐을 줄이기 위해 문서의 실제 토큰처럼 보이는 예시를 `YOUR_DISCORD_BOT_TOKEN` placeholder로 바꿨다.
- 검증: bundled Node 실행 기준 `tsc --noEmit`, `vitest run`(17 files, 171 tests), `tsup build` 통과.

## [2026-05-08] feature | 새 Codex thread에 Discord 최근 대화 맥락 주입

- daemon 재시작 후 Codex app-server thread가 새로 만들어지면 이전 Codex 대화 맥락을 잃는 문제가 있었다.
- app-server 첫 turn에 한해 같은 Discord 채널의 최근 메시지를 가져와 `[Discord 최근 대화 맥락]` 섹션으로 입력 앞에 붙인다.
- Discord history fetch는 현재 메시지 이전 메시지만 대상으로 하고, bridge의 수신 확인/진행 상태 같은 noise 메시지는 제외한다.
- 기본 최근 메시지 수는 12개이며 `DISCORD_CONTEXT_MESSAGES=0`으로 비활성화할 수 있다.
- 검증: bundled Node 실행 기준 `tsc --noEmit`, `vitest run`(17 files, 174 tests), `tsup build` 통과.

## [2026-05-08] docs | 문서 attribution과 source install 설명 보강

- 사용자가 `npm link`, `agent-discord-down`, `agent-discord-codex`를 로컬 터미널에서 실행해 편의 명령이 동작함을 확인했다.
- 실제 Discord smoke test에서 daemon 재시작 후 새 Codex app-server thread가 같은 채널의 최근 대화 맥락을 참고해 답하는 것을 확인했다.
- 루트 README와 한국어 README에 이어 `docs/README.ko.md`도 `DoBuDevel/discord-agent-bridge` 기반 커스텀 repo라는 설명, source install + `npm link`, `agent-discord-codex`/`agent-discord-down`, Discord 최근 대화 맥락 설명에 맞춰 정리했다.
- 변경은 문서 보강만 포함한다.

## [2026-05-08] feature | Discord slash command로 Codex 새 세션 시작

- Codex app-server transport에서 현재 Discord 채널/프로젝트 매핑은 유지한 채 Codex thread만 새로 시작하는 `/new-session` slash command를 추가했다.
- 기본 `/new-session`은 다음 첫 메시지에 이전 Discord 맥락을 붙이지 않는 완전 새 세션으로 동작한다.
- `/new-session`의 `with-context` 옵션을 true로 주면 새 thread를 만들되 다음 첫 메시지에 최근 Discord 채널 대화 맥락을 참고로 붙인다.
- slash command가 아직 보이지 않는 환경을 위해 `!new-session`, `!new-session with-context` 텍스트 fallback도 추가했다.
- README/README.ko/docs 한국어 README에 command 설명, Discord UI 설명, `applications.commands` scope 필요성을 정리했다.
- 검증: `npm run typecheck`, `npm test -- --run`(17 files, 179 tests), `npm run build` 통과.
- Discord slash command 첫 추천 목록에서도 `with-context:true` 사용 가능성을 알 수 있도록 `/new-session` command description 자체에 힌트를 추가했다.
- README/README.ko/docs 한국어 README에 `agent-discord-codex`는 연결하려는 로컬 프로젝트 경로마다 한 번씩 실행하며, Discord에서 수동 채널 생성만으로는 bridge 프로젝트 경로가 등록되지 않는다는 설명을 추가했다.

## [2026-05-08] feature | Discord thread별 Codex app-server 세션 분리

- Discord thread에서 보낸 메시지는 parent channel mapping으로 프로젝트를 찾고, 응답 대상은 thread channel ID로 유지하도록 라우팅을 바꿨다.
- Codex app-server session key를 `projectName:discordChannelOrThreadId`로 분리해 같은 프로젝트의 parent 채널과 각 Discord thread가 서로 다른 Codex app-server thread를 갖도록 했다.
- thread 안의 일반 메시지, `!new-session`, `/new-session`은 parent channel mapping을 사용하지만, 실제 reset/응답은 thread session에만 적용된다.
- README/README.ko/docs 한국어 README에 Discord thread는 같은 프로젝트 경로를 공유하는 독립 Codex 세션이라는 설명을 추가했다.
- 검증: `npm run typecheck`, `npm test -- --run`(17 files, 185 tests), `npm run build` 통과.

## [2026-05-08] fix | Discord thread starter 중복 처리와 command progress 노이즈 완화

- Discord에서 thread를 생성할 때 parent channel에 생기는 starter/mirror message를 bridge 입력으로 처리해 parent channel과 thread 양쪽에 응답이 나가던 문제를 막았다.
- parent channel message에 `hasThread` 또는 `thread`가 있으면 bridge input으로 무시하고, 실제 thread channel 안의 메시지만 처리한다.
- app-server `commandExecution` started 이벤트 중 `sed`, `cat`, `ls`, `pwd`, `rg --files`, `rg -n`, `find`, `wc`, `nl`, `printenv`, `env` 같은 read-only 탐색성 명령은 Discord progress로 표시하지 않도록 했다.
- 빌드/테스트/설치처럼 의미 있는 명령과 approval request는 계속 Discord에 표시한다.
- 검증: `npm run typecheck`, `npm test -- --run`(17 files, 188 tests), `npm run build` 통과.

## [2026-05-08] fix | Discord thread starter 지연 감지 보강

- Discord가 parent channel `messageCreate` 이벤트를 먼저 보내고, 짧은 시간 뒤 같은 메시지에 thread metadata를 붙이는 경우 parent channel과 thread 양쪽에서 `Codex - 받은 메시지`가 중복 표시될 수 있었다.
- parent channel의 사용자 메시지는 750ms 뒤 한 번 재조회해 `hasThread` 또는 `thread`가 생겼으면 thread starter로 보고 bridge 입력에서 제외하도록 했다.
- 실제 thread channel 안의 메시지는 기존처럼 parent channel mapping으로 프로젝트를 찾고, 응답/진행상태/승인요청은 thread 안으로만 보낸다.
- 검증: `npm run typecheck`, `npm test -- --run`(17 files, 189 tests), `npm run build` 통과.

## [2026-05-08] fix | Discord thread 생성 시스템 메시지 무시와 긴 첨부 메시지 분할

- Discord에서 thread를 만들 때 parent channel에 올라오는 `ThreadCreated` 시스템 메시지가 일반 사용자 입력처럼 처리되어 `Codex - 받은 메시지`가 parent channel에 뜨는 문제가 있었다.
- bridge 입력은 일반 메시지(`Default`)와 답글(`Reply`) type만 받도록 제한해 thread 생성 안내 같은 시스템 message type을 무시한다.
- Discord 파일 첨부 전송 시 본문이 길면 `Invalid message: empty, too long...`가 날 수 있어, 파일 첨부 메시지도 1900자 단위로 분할하고 마지막 chunk에 파일을 붙이도록 했다.
- 기존 `splitForDiscord()`가 긴 단일 라인을 truncate하던 동작도 전체 내용을 보존해 나누도록 수정했다.
- 검증: `npm run typecheck`, `npm test -- --run`(17 files, 191 tests), `npm run build` 통과.

## [2026-05-08] fix | Discord app-server progress를 typing indicator로 대체

- app-server `item/started` 이벤트가 command/web/tool 진행 상태를 Discord 메시지로 계속 쌓아 채팅이 길어지는 문제가 있었다.
- 진행 상태 메시지는 보내지 않고 Discord `sendTyping()`만 호출하도록 바꿨다.
- 승인 요청은 사용자 결정이 필요한 이벤트라 기존처럼 별도 승인 카드로 계속 표시한다.
- 검증: `npm run typecheck`, `npm test -- --run`(17 files, 192 tests), `npm run build` 통과.

## [2026-05-08] fix | Codex app-server setup에서 tmux 의존 제거

- 다른 사용자 환경에서 `agent-discord-codex` 실행 시 app-server 모드인데도 `setupProject()`가 tmux 세션을 먼저 만들려고 해 `/bin/sh: tmux: command not found`로 실패했다.
- Codex app-server transport에서는 새 프로젝트 setup 시 tmux 세션/env/window를 만들지 않고 Discord 채널과 state만 등록하도록 수정했다.
- 기존 프로젝트 resume 경로도 app-server Codex일 때 `TmuxManager`를 생성하거나 tmux 세션을 보장하지 않도록 수정했다.
- state의 `tmuxSession`에는 기존 schema 호환을 위해 `app-server:<projectName>` placeholder를 저장한다.
- 검증: `npm run typecheck`, `npm test -- --run`(17 files, 192 tests), `npm run build` 통과.

## [2026-05-08] fix | Codex turn 동안 Discord typing indicator 유지

- 기존 typing indicator는 app-server `item/started` 이벤트가 올 때 한 번만 호출되어, 이미지 생성처럼 item 이벤트가 늦거나 적은 작업에서는 사용자가 거의 볼 수 없었다.
- `turn/start` 성공 직후 바로 Discord typing indicator를 보내고, turn completion 전까지 8초마다 갱신하도록 바꿨다.
- `turn/completed`, `resetThread`, `stop` 시 typing interval을 정리해 오래 남는 timer를 막는다.
- 검증: `npm run typecheck`, `npm test -- --run`(17 files, 193 tests), `npm run build` 통과.
