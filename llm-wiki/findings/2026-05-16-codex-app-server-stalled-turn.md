# 2026-05-16 Codex app-server stalled turn

## 발견

- Discord cocifee 채널에서 메시지는 bridge daemon에 수신됐지만, Codex app-server `turn/completed` 이벤트가 돌아오지 않아 답변이 전송되지 않았다.
- bridge는 `turn/start` 성공 후 typing indicator를 8초마다 유지하지만, 완료 이벤트가 없을 때 이를 중단하거나 사용자에게 오류를 알리는 watchdog이 없었다.
- 그 결과 화면에는 "입력하고 있어요" 상태만 장시간 유지되고, 사용자는 실제 실패/정체 여부를 알 수 없었다.

## 근거

- `/Users/winter.e/.discord-agent-bridge/daemon.log`에 `📨 [cocifee/codex] ios 앱에서...`, `📨 [cocifee/codex] 뭐야...` 수신 로그가 남아 있었다.
- 같은 로그 뒤에는 해당 cocifee turn의 완료/답변 전송 로그가 없고, daemon 재시작 전까지 기존 app-server 세션이 열린 상태로 유지됐다.
- `src/codex-app/session-manager.ts`는 기존에 `turn/completed`에서만 typing timer를 정리했다.

## 영향

- Codex app-server가 내부적으로 멈추거나 완료 이벤트를 누락하면 Discord 사용자는 응답 없음 상태를 오래 기다리게 된다.
- 2026-05-16에 `turnTimeoutMs` watchdog을 추가해 기본 30분 후 typing을 멈추고 `/new-session` 안내를 보내도록 수정했다.
- daemon은 cocifee 프로젝트 경로에서 재시작해 걸린 app-server 세션을 끊고 새 코드가 적용된 상태로 다시 연결했다.

## 다음 작업

- app-server protocol에서 turn 취소/cancel method가 안정적으로 확인되면 timeout 시 실제 turn cancellation도 추가한다.
- 필요하면 timeout 값을 환경변수로 노출한다.
