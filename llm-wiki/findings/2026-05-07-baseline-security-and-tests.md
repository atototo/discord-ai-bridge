# baseline 보안/테스트 확인

날짜: 2026-05-07

## 실행 결과

- `npm ci --ignore-scripts`: 기본 Node 16에서는 optional native dependency가 빠져 Vitest가 실패했다.
- bundled Node 24.14.0을 PATH 앞에 둔 뒤 `npm ci --ignore-scripts`를 다시 실행했다.
- `PATH=/Users/winter.e/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run typecheck`: 통과.
- `PATH=/Users/winter.e/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm test`: 12 files, 129 tests 통과.
- `npm audit --json`: 8 vulnerabilities, 3 moderate / 5 high.

## audit 요약

- production 경로: `discord.js@14.25.1` -> `undici@6.21.3` 관련 취약점.
- dev/build/test 경로: `vitest`/`vite`, `tsup`/`rollup`, `postcss`, `picomatch`.
- transitive 경로: `@sapphire/shapeshift` -> `lodash@4.17.23`.

## 코드 보안 메모

- `src/discord/client.ts`는 channel mapping에 걸린 채널의 모든 non-bot 메시지를 tmux로 전달한다. user allowlist가 아직 없다.
- `src/discord/client.ts` approval reaction filter도 non-bot이면 누구나 승인할 수 있다. approval actor allowlist가 필요하다.
- `src/tmux/manager.ts`의 `sessionName`, `windowName` 기반 tmux target 일부가 shell escape 없이 command string에 들어간다. 프로젝트명/agent type이 외부 입력에서 오면 command injection 위험이 생긴다.
- Discord token은 `~/.discord-agent-bridge/config.json`에 저장되고 mode `0600`으로 chmod된다. 평문 저장이므로 문서에는 OS keychain이 아니라 local protected file임을 명확히 써야 한다.

