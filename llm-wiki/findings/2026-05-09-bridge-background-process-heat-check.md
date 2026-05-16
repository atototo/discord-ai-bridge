# 2026-05-09 bridge background process heat check

## 요약

발열 원인 확인 중 `discord-ai-bridge` daemon은 실행 중이지만 CPU 사용률은 거의 0%로 확인됐다.

## 확인된 프로세스

- `node /Users/winter.e/Documents/ai-bridge/dist/src/daemon-entry.js`
- `caffeinate -ims node /Users/winter.e/Documents/ai-bridge/dist/src/daemon-entry.js`
- `node .../codex app-server --listen stdio://`
- `codex app-server --listen stdio://`

## 관찰

- bridge daemon, `caffeinate`, bridge가 띄운 Codex app-server child는 `ps` 기준 CPU 0.0-0.1% 수준이었다.
- 따라서 즉시 관찰된 CPU 발열의 직접 원인은 bridge daemon으로 보기 어렵다.
- 다만 daemon manager가 macOS에서 `caffeinate -ims`로 실행되므로, bridge가 켜져 있는 동안 Mac이 자동 sleep에 들어가지 않게 만들 수 있다.
- 같은 시점의 CPU 상위 프로세스는 `EndpointProtectorClient`, Codex desktop app/app-server/renderer, `WindowServer`, Chrome renderer 쪽이었다.

## 운영 메모

- bridge daemon을 끄려면 `agent-discord-down` 또는 `agent-discord daemon stop`을 사용한다.
- 프로젝트 세션까지 정리하려면 `agent-discord stop` 계열 명령은 Discord 채널/state에도 영향을 줄 수 있으므로 목적에 맞게 구분한다.
