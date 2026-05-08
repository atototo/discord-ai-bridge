# 0002. Codex app-server transport 추가

날짜: 2026-05-07

## 상태

Accepted

## 맥락

tmux 기반 Codex bridge는 로컬 터미널을 거의 그대로 Discord로 중계하는 데 빠르게 유효하다. 하지만 화면 캡처 기반이라 다음 문제가 있다.

- Codex startup chrome, 진행 상태, 이전 scrollback, 최종 답변을 구분하기 어렵다.
- 긴 출력은 tmux scrollback 한계와 Discord chunking을 별도로 관리해야 한다.
- 명령 실행, 파일 변경, 권한 요청 같은 승인 UX가 구조화되어 있지 않다.

Codex CLI v0.128.0의 `codex app-server`는 stdio JSON-RPC transport와 `thread/start`, `turn/start`, streamed agent events, approval server request를 제공한다.

## 결정

Codex 전용 structured transport로 `codex app-server --listen stdio://`를 지원한다.

- 기본값은 기존 호환성을 위해 `CODEX_TRANSPORT=tmux`다.
- `CODEX_TRANSPORT=app-server`일 때 Codex는 tmux send/capture가 아니라 app-server JSON-RPC를 사용한다.
- WebSocket transport는 공식 문서상 experimental/unsupported라 초기 구현에서 사용하지 않는다.
- Claude/OpenCode는 기존 tmux transport를 유지한다.

## 결과

- Discord 메시지는 Codex `turn/start` 입력으로 전달된다.
- assistant delta는 turn 단위로 누적 후 `turn/completed`에서 Discord로 전송된다.
- command execution approval request는 Discord approval reaction UX로 라우팅한다.
- image attachment는 `localImage` user input으로 전달할 수 있다.
- app-server mode에는 attach할 Codex tmux UI가 없으므로 CLI가 attach를 건너뛴다.

## 후속 작업

- 실제 Discord smoke test로 `thread/start`/`turn/start`/approval 왕복 확인
- `item/fileChange/requestApproval`, `item/permissions/requestApproval`, `item/tool/requestUserInput` 처리 추가
- threadId를 state에 저장해 daemon 재시작 후 resume하는 경로 검토
