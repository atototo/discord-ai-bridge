# Codex 앱 channel/plugin 가능성 조사

날짜: 2026-05-07

## 질문

Slack/Discord plugin 또는 connector 구조를 참고해서 Codex 앱에도 Discord/Slack 같은 외부 메시지를 실행 중인 Codex thread로 push할 수 있는지 확인한다.

## 확인 내용

- 로컬 Codex plugin cache에서 Slack channel 구현체는 확인되지 않았다.
- Codex 앱 `/Applications/Codex.app`은 `codex://` URL scheme을 등록한다.
- `Info.plist`에는 folder document type과 `codex` URL scheme은 있지만, 외부 메시지를 thread에 append하거나 실행 중인 session을 깨우는 공개 URL action은 확인되지 않았다.
- Codex app bundle에는 CLI resource(`/Applications/Codex.app/Contents/Resources/codex`)가 포함되어 있다.

## 판단

Slack/Discord connector는 대부분 "Codex가 외부 서비스를 도구로 읽고/쓰기" 위한 outbound/tool 경로일 수 있다. 우리가 원하는 것은 "외부 Slack/Discord 이벤트가 Codex 앱 thread로 들어오는" inbound/channel runtime이다.

따라서 Slack plugin을 참고할 때는 다음을 구분해야 한다.

- connector/tool: agent가 필요할 때 Slack/Discord를 읽고 쓰는 기능
- channel/runtime: Slack/Discord 이벤트가 실행 중인 agent session으로 push되는 기능

현재 확인된 로컬 정보만으로는 Codex 앱에 Claude Code Channels와 같은 public inbound channel API가 있다고 볼 수 없다.

## 다음 조사 후보

- Codex 앱의 `codex://threads/<id>` deep link가 단순 열기인지, 메시지 draft/push action을 받는지 확인한다.
- Codex plugin manifest schema에 inbound event/channel capability가 있는지 확인한다.
- Slack connector/plugin이 설치 가능하면 manifest와 tool surface를 확인해 connector인지 channel인지 판별한다.
- public API가 없으면 Codex 앱 직접 연동은 보류하고 Codex CLI bridge를 1차 구현 대상으로 둔다.
