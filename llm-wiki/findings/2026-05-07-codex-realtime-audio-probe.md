# Codex app-server realtime audio probe

날짜: 2026-05-07

## 배경

Discord voice message는 `.ogg`/Opus 첨부로 bridge에 정상 다운로드된다. 사용자는 OpenAI API transcription 우회가 아니라 Codex app-server 자체의 realtime audio protocol을 활용하길 원했다.

## 확인 결과

- `codex app-server generate-ts --experimental` 기준 realtime 관련 client methods가 존재한다.
  - `thread/realtime/start`
  - `thread/realtime/appendAudio`
  - `thread/realtime/appendText`
  - `thread/realtime/stop`
  - `thread/realtime/listVoices`
- `thread/realtime/start`는 기본 app-server에서 `realtime_conversation` feature가 꺼져 있으면 `thread ... does not support realtime conversation`으로 실패한다.
- app-server를 `--enable realtime_conversation`로 시작하면 method는 열린다.
- `thread/realtime/listVoices`는 성공한다.
- `thread/realtime/start`는 현재 사용자의 Codex app-server ChatGPT auth 세션에서 `realtime conversation requires API key auth`로 실패한다.
- 따라서 현재 bridge의 app-server stdio transport에서는 Codex 앱 로그인만으로 realtime audio를 사용할 수 없다.

## 재현 명령

```bash
/Users/winter.e/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node \
  node_modules/.bin/tsx \
  scripts/probe-codex-realtime-audio.ts \
  /Users/winter.e/Documents/Claude/Projects/cocifee/.agent-discord/attachments/1501950513632247930/voice-message.ogg \
  /Users/winter.e/Documents/Claude/Projects/cocifee
```

## 결론

Discord 음성 메시지를 Codex realtime audio로 직접 연결하려면 최소한 `realtime_conversation` feature enable과 API key auth 기반 app-server 세션이 필요하다. 사용자가 OpenAI API key 사용을 원하지 않는다면 현재 가능한 경로는 기존처럼 오디오 파일 첨부를 Codex에 전달해 Codex가 로컬 도구(`ffmpeg` 등) 사용 승인을 받아 처리하는 방식이다.
