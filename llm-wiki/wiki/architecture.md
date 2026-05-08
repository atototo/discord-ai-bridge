# 아키텍처 메모

## 목표

Discord에서 로컬 Codex를 거의 그대로 양방향으로 사용하는 브리지를 만든다.

## 메인 경로

```text
Discord channel
  -> Discord bot receives message
  -> session router maps channel/project
  -> tmux send-keys injects message into Codex
  -> local Codex CLI works in project
  -> tmux capture-pane reads output changes
  -> Discord bot posts changed output back
```

## Discord MCP의 위치

Discord MCP만으로는 상시 브리지 역할을 하기 어렵다. MCP는 Codex 내부에서 Discord 메시지 검색, 스레드 요약, 메시지 전송 같은 보조 도구로 붙일 수 있다.

메인 입출력 경로는 Discord bot -> tmux -> Codex CLI -> tmux -> Discord bot 구조로 둔다.

## MVP 기능

- Discord bot
- 허용 channel/user 제한
- 프로젝트별 tmux session 관리
- Discord 메시지를 Codex stdin으로 전달
- tmux 출력 변경분을 Discord로 전송
- `/status`, `/attach`, `/stop`, `/restart` 같은 관리 명령
- 긴 출력, diff, 승인 요청 흐름의 기본 UX

