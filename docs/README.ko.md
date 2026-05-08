# Discord AI Bridge

[English](../README.md) | [한국어](README.ko.md)

`DoBuDevel/discord-agent-bridge`를 기반으로 가져와 `atototo/discord-ai-bridge`로 커스텀한 로컬 Codex Discord 브리지입니다.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/Tests-179%20passing-brightgreen.svg)](../tests)

## 개요

Discord AI Bridge는 AI 코딩 어시스턴트(Codex, Claude Code, OpenCode)를 Discord에 연결하여 원격 모니터링과 협업을 가능하게 합니다. 이 커스텀 버전은 특히 로컬 Codex app-server 모드에 맞춰져 있습니다. Discord 메시지는 Codex turn으로 들어가고, Codex 답변은 프로젝트 채널로 돌아오며, 생성 이미지/파일은 Discord 첨부로 업로드되고, 승인 요청은 Discord reaction으로 처리됩니다.

원본의 tmux transport는 Claude/OpenCode 호환을 위해 유지합니다. Codex는 `CODEX_TRANSPORT=app-server`를 권장하며, 이때 bridge가 `codex app-server --listen stdio://`를 실행하고 터미널 화면 캡처 대신 JSON-RPC 이벤트를 사용합니다. 각 로컬 프로젝트는 Discord category/channel에 묶이고, 하나의 전역 daemon이 Discord 봇 연결을 관리합니다.

## 주요 기능

- **멀티 에이전트 지원**: Codex, Claude Code, OpenCode 지원
- **로컬 우선 Codex 모드**: cloud task가 아니라 내 로컬 PC의 Codex를 실행
- **Codex app-server transport**: tmux 화면 캡처 대신 JSON-RPC 이벤트와 승인 요청을 사용하는 Codex 전용 모드
- **Discord 사용자 allowlist**: 메시지 입력과 승인 요청을 허용된 사용자로 제한
- **자동 감지**: 시스템에 설치된 AI 에이전트를 자동으로 감지
- **실시간 스트리밍**: 3초마다 tmux 출력을 캡처하여 Discord로 전송
- **프로젝트 격리**: 각 프로젝트마다 전용 Discord 채널 생성
- **단일 데몬**: 하나의 Discord 봇 연결로 모든 프로젝트 관리
- **세션 관리**: tmux 세션은 연결 해제 후에도 유지
- **Discord 새 세션 명령**: `/new-session`으로 현재 채널의 Codex app-server thread만 새로 시작
- **YOLO 모드**: `--yolo` 플래그로 Claude Code를 권한 확인 없이 실행
- **Sandbox 모드**: `--sandbox` 플래그로 Claude Code를 Docker 컨테이너에서 격리 실행
- **풍부한 CLI**: 설정, 제어, 모니터링을 위한 직관적인 명령어
- **타입 안전**: 의존성 주입 패턴으로 작성된 TypeScript
- **충분한 테스트**: Vitest 기반 단위 테스트

## 지원 플랫폼

| 플랫폼 | 지원 | 비고 |
|--------|------|------|
| **macOS** | Yes | 개발 및 테스트 완료 |
| **Linux** | Expected | tmux 기반이라 동작 예상, 미검증 |
| **Windows (WSL)** | Expected | WSL에 tmux 설치 시 동작 예상, 미검증 |
| **Windows (네이티브)** | No | tmux를 네이티브로 사용할 수 없음 |

## 사전 요구 사항

- **Node.js**: 버전 18 이상
- **tmux**: 버전 3.0 이상
- **Discord 봇**: [Discord 봇 설정 가이드](DISCORD_SETUP.ko.md)를 따라 봇 생성
  - 필요 권한: Send Messages, Manage Channels, Read Message History, Embed Links, Add Reactions
  - 필요 인텐트: Guilds, GuildMessages, MessageContent, GuildMessageReactions
  - 권장 OAuth scope: slash command 등록을 위한 `bot`, `applications.commands`
- **AI 에이전트**: 다음 중 하나 이상:
  - [Codex CLI](https://developers.openai.com/codex)
  - [Claude Code](https://code.claude.com/docs/en/overview)
  - [OpenCode](https://github.com/OpenCodeAI/opencode)

## 설치

### 소스에서 설치

현재는 npm publish 없이 소스에서 설치해 쓰는 것을 기본으로 합니다.

```bash
git clone https://github.com/atototo/discord-ai-bridge.git
cd discord-ai-bridge
npm install
npm run build
npm link
```

`npm link` 후 전역 명령으로 사용할 수 있습니다.

```bash
agent-discord          # 전체 CLI
agent-discord-codex    # 현재 디렉터리에서 Codex app-server daemon 재시작 + 프로젝트 시작
agent-discord-down     # 전역 bridge daemon 종료
```

## 빠른 시작

### 1. Discord 봇 설정

```bash
# Discord 봇 토큰으로 최초 1회 설정
agent-discord setup YOUR_DISCORD_BOT_TOKEN
```

로컬 shell 접근을 Discord로 열기 때문에, 시작 전에 허용 사용자 ID를 지정하는 것을 권장합니다.

```bash
export DISCORD_ALLOWED_USER_IDS=123456789012345678,234567890123456789
```

`setup` 명령어는 토큰을 저장하고 Discord 서버 ID를 자동 감지합니다. 설정을 확인하거나 변경하려면:

```bash
agent-discord config --show              # 현재 설정 조회
agent-discord config --server SERVER_ID  # 서버 ID 수동 변경
```

> **참고**: 최초 설정은 반드시 `setup`을 사용하세요 — Discord에 연결하여 서버 ID를 자동 감지합니다. `config` 명령어는 자동 감지 없이 개별 값만 변경합니다.

### 2. 작업 시작

```bash
cd ~/projects/my-app

# 권장: 현재 프로젝트를 Codex app-server 모드로 시작
agent-discord-codex
```

`agent-discord-codex`는 현재 프로젝트 디렉터리에서 실행합니다. 기존 daemon을 내리고, `CODEX_TRANSPORT=app-server`로 bridge를 다시 띄운 뒤, 프로젝트 채널을 만들거나 재사용하고, attach 없이 로컬 Codex app-server 모드로 연결합니다.

연결하고 싶은 로컬 프로젝트 경로마다 한 번씩 이 명령을 실행하면 됩니다. 예를 들어 `~/projects/cocifee`에서 실행하면 `cocifee` 프로젝트의 Discord category/channel을 만들거나 재사용하고, 나중에 `~/projects/wedding`에서 실행하면 별도의 `wedding` category/channel을 만들거나 재사용합니다. Discord에서 `+` 버튼으로 채널만 수동 생성하는 것은 bridge에 프로젝트 경로를 등록하지 않습니다.

```bash
agent-discord-codex             # 현재 디렉터리에서 Codex app-server 시작
agent-discord-down              # bridge daemon 종료
agent-discord daemon status     # daemon 상태와 로그 위치 확인
agent-discord go claude         # Claude Code tmux 모드
```

긴 명령으로 쓰면 아래와 같습니다.

```bash
agent-discord daemon stop
CODEX_TRANSPORT=app-server agent-discord go codex --no-attach
```

이 모드에서는 bridge가 `codex app-server --listen stdio://`를 로컬 프로세스로 실행합니다. Discord 메시지는 Codex `turn/start` 요청으로 들어가고, assistant 답변은 turn 완료 시 Discord로 전송되며, 명령/파일/권한 승인 요청은 Discord 승인 reaction으로 라우팅됩니다. 이 모드에는 attach할 Codex tmux UI가 없습니다.

daemon 재시작으로 Codex app-server thread가 새로 만들어질 때는 같은 Discord 채널의 최근 메시지 몇 개를 가져와 첫 turn 앞에 가벼운 맥락으로 붙입니다. Codex 내부 thread를 억지로 복원하지는 않지만, 채널의 직전 대화 흐름을 참고할 수 있습니다. `DISCORD_CONTEXT_MESSAGES=0`이면 끌 수 있고, 숫자를 바꾸면 포함할 최근 메시지 수를 조정할 수 있습니다.

### Discord에서 새 Codex 세션 시작

Codex로 매핑된 Discord 채널에서 slash command를 사용할 수 있습니다.

```text
/new-session
```

Discord 채널과 프로젝트 매핑은 그대로 유지하고, 해당 프로젝트의 Codex app-server thread만 새로 만듭니다. 다음 메시지는 이전 맥락 없이 완전 새 Codex 채팅으로 시작합니다.

새 Codex thread를 만들되 첫 메시지에 최근 Discord 채널 대화 몇 개를 참고로 붙이고 싶으면 옵션을 켭니다.

```text
/new-session with-context: true
```

Discord slash UI의 첫 추천 목록에도 보이도록 `/new-session` 설명 자체에 `with-context:true` 힌트를 넣고, 명령 선택 후에는 `with-context` 옵션 설명도 따로 보이게 등록합니다. 명령이 보이지 않으면 봇을 `applications.commands` scope로 다시 초대했는지 확인하고 daemon을 재시작하세요. 텍스트 fallback도 지원합니다.

```text
!new-session
!new-session with-context
```

이미 daemon이 떠 있다면 같은 환경변수로 다시 띄워야 합니다.

```bash
agent-discord daemon stop
CODEX_TRANSPORT=app-server agent-discord go codex
```

### 파일과 이미지

Discord 첨부 파일은 프로젝트 내부 `.agent-discord/attachments/<message-id>/`에 다운로드됩니다.
bridge는 해당 로컬 경로를 Codex 입력에 함께 붙이므로, Codex가 이미지나 파일을 열어보고 요청을 처리할 수 있습니다.

Codex가 만든 파일을 Discord로 돌려보내야 하면 최종 응답에 아래 마커를 넣으면 됩니다.

```text
[[discord-attach:/absolute/path/inside/project]]
```

bridge는 이 파일을 Discord 첨부로 업로드하고, 메시지에서는 마커를 제거합니다. 안전을 위해 outbound 파일 마커는 프로젝트 디렉토리 안의 파일만 허용합니다.

### 고급: 단계별 설정

프로젝트 구성을 세밀하게 제어하려면 `init`으로 프로젝트를 별도로 설정할 수 있습니다:

```bash
cd ~/projects/my-app

# 특정 에이전트와 커스텀 채널 설명으로 초기화
agent-discord init claude "나의 풀스택 애플리케이션"

# 단계별로 시작:
agent-discord daemon start    # 글로벌 데몬 시작
agent-discord start          # 이 프로젝트 시작
agent-discord attach         # tmux 세션에 연결
```

## CLI 레퍼런스

### 글로벌 명령어

#### `setup <token>`

최초 설정: 봇 토큰 저장, Discord에 연결하여 서버 자동 감지, 설치된 에이전트 표시.

```bash
agent-discord setup YOUR_BOT_TOKEN
```

설정 과정:
1. `~/.discord-agent-bridge/config.json`에 봇 토큰 저장
2. Discord에 연결하여 봇이 속한 서버 감지
3. 봇이 여러 서버에 있으면 선택 프롬프트 표시
4. 서버 ID 자동 저장

#### `daemon <action>`

글로벌 데몬 프로세스를 제어합니다.

```bash
agent-discord daemon start    # 데몬 시작
agent-discord daemon stop     # 데몬 중지
agent-discord daemon status   # 데몬 상태 확인
```

#### `list`

등록된 모든 프로젝트를 나열합니다.

```bash
agent-discord list
```

#### `agents`

시스템에서 감지된 AI 에이전트를 나열합니다.

```bash
agent-discord agents
```

#### `config [options]`

글로벌 설정을 조회하거나 수정합니다.

```bash
agent-discord config --show              # 현재 설정 조회
agent-discord config --token NEW_TOKEN   # 봇 토큰 변경
agent-discord config --server SERVER_ID  # Discord 서버 ID 수동 설정
agent-discord config --port 18470        # 훅 서버 포트 설정
```

### 프로젝트 명령어

프로젝트 디렉토리에서 실행하세요.

#### `init <agent> <description>`

현재 디렉토리를 프로젝트로 초기화합니다.

```bash
agent-discord init claude "풀스택 웹 애플리케이션"
agent-discord init opencode "데이터 파이프라인 프로젝트"
```

#### `start [options]`

등록된 프로젝트의 브릿지 서버를 시작합니다.

```bash
agent-discord start                        # 모든 프로젝트 시작
agent-discord start -p my-app             # 특정 프로젝트 시작
agent-discord start -p my-app --attach    # 시작 후 tmux에 연결
```

#### `stop [project]`

프로젝트를 중지합니다: tmux 세션 종료, Discord 채널 삭제, 프로젝트 상태 제거. 프로젝트를 지정하지 않으면 현재 디렉토리 이름을 사용합니다.

```bash
agent-discord stop                # 현재 디렉토리의 프로젝트 중지
agent-discord stop my-app         # 특정 프로젝트 중지
agent-discord stop --keep-channel # Discord 채널 유지 (tmux만 종료)
```

#### `status`

프로젝트 상태를 표시합니다.

```bash
agent-discord status
```

#### `attach [project]`

프로젝트의 tmux 세션에 연결합니다. 프로젝트를 지정하지 않으면 현재 디렉토리 이름을 사용합니다.

```bash
agent-discord attach              # 현재 디렉토리의 프로젝트에 연결
agent-discord attach my-app       # 특정 프로젝트에 연결
```

tmux에서 에이전트를 중지하지 않고 분리하려면 `Ctrl-b d`를 누르세요.

#### `go [agent] [options]`

빠른 시작: 데몬 시작, 필요시 프로젝트 설정, tmux에 연결. `init` 없이도 동작합니다 — 설치된 에이전트를 자동 감지하고 Discord 채널을 자동으로 생성합니다.

```bash
agent-discord go              # 에이전트 자동 감지, 설정 & 연결
agent-discord go claude       # 특정 에이전트 사용
agent-discord go --yolo       # YOLO 모드 (권한 확인 건너뛰기, Claude Code 전용)
agent-discord go --sandbox    # Sandbox 모드 (Docker 격리, Claude Code 전용)
agent-discord go --no-attach  # tmux에 연결하지 않고 시작
```

## 동작 원리

### 아키텍처

```
┌─────────────────┐
│  AI Agent CLI   │  (Claude, OpenCode)
│  Running in     │
│  tmux session   │
└────────┬────────┘
         │
         │ tmux capture-pane (매 3초)
         │
    ┌────▼─────────────┐
    │  CapturePoller   │  상태 변화 감지
    └────┬─────────────┘
         │
         │ Discord.js
         │
    ┌────▼──────────────┐
    │  Discord Channel  │  #project-name
    └───────────────────┘
```

### 컴포넌트

- **Daemon Manager**: Discord 연결을 관리하는 단일 글로벌 프로세스
- **Capture Poller**: 3초마다 tmux 패널을 폴링하고, 변경 사항을 감지하여 Discord로 전송
- **Codex App Server Session Manager**: `CODEX_TRANSPORT=app-server`일 때 Codex JSON-RPC thread/turn/event를 Discord로 중계
- **Agent Registry**: 멀티 에이전트를 위한 팩토리 패턴 (Codex, Claude, OpenCode)
- **State Manager**: 프로젝트 상태, 세션, 채널 추적
- **Dependency Injection**: 스토리지, 실행, 환경을 위한 인터페이스 (테스트 가능, 목킹 가능)

### 폴링 모델

이 브릿지는 훅 대신 **폴링 기반** 아키텍처를 사용합니다:

1. 3초마다 (설정 가능) 폴러가 `tmux capture-pane`을 실행
2. 캡처된 내용을 이전 스냅샷과 비교
3. 변경이 감지되면 새 내용을 Discord로 전송
4. 멀티라인 출력, ANSI 코드, 레이트 리밋 처리

이 접근 방식은 훅 기반 시스템보다 더 간단하고 안정적이며, 성능 영향은 최소화됩니다.

### 프로젝트 라이프사이클

1. **Go / Init**: `~/.discord-agent-bridge/state.json`에 프로젝트를 등록하고 Discord 채널 생성
2. **Start**: 기본 transport에서는 이름이 지정된 tmux 세션에서 AI 에이전트 실행, Codex app-server transport에서는 daemon이 Codex app-server 프로세스 실행
3. **Polling/Event**: tmux transport는 tmux 출력을 캡처하고, Codex app-server transport는 JSON-RPC 이벤트를 Discord로 스트리밍
4. **Stop**: tmux 세션을 종료하고, 채널을 삭제하고, 상태를 정리
5. **Attach**: 사용자가 tmux 세션에 직접 참여 가능

## 지원 에이전트

| 에이전트 | 바이너리 | 자동 감지 | YOLO 지원 | Sandbox 지원 | 비고 |
|----------|----------|-----------|-----------|-------------|------|
| **Codex** | `codex` | Yes | No | No | 로컬 OpenAI Codex CLI, 선택적으로 app-server transport 지원 |
| **Claude Code** | `claude` | Yes | Yes | Yes | 공식 Anthropic CLI |
| **OpenCode** | `opencode` | Yes | No | No | 오픈소스 대안 |

### 에이전트 감지

CLI는 `command -v <binary>`를 사용하여 설치된 에이전트를 자동으로 감지합니다. `agent-discord agents`를 실행하여 시스템에서 사용 가능한 에이전트를 확인하세요.

### 커스텀 에이전트 추가

새 에이전트를 추가하려면 `src/agents/`에서 `BaseAgentAdapter` 클래스를 확장하세요:

```typescript
export class MyAgentAdapter extends BaseAgentAdapter {
  constructor() {
    super({
      name: 'myagent',
      displayName: 'My Agent',
      command: 'myagent-cli',
      channelSuffix: 'myagent',
    });
  }

  getStartCommand(projectPath: string, yolo = false, sandbox = false): string {
    return `cd "${projectPath}" && ${this.config.command}`;
  }
}
```

`src/agents/index.ts`에 어댑터를 등록하세요.

## 설정

### 글로벌 설정

`~/.discord-agent-bridge/config.json`에 저장됩니다:

```json
{
  "token": "YOUR_BOT_TOKEN",
  "serverId": "YOUR_SERVER_ID",
  "hookServerPort": 18470
}
```

| 키 | 필수 | 설명 | 기본값 |
|----|------|------|--------|
| `token` | **필수** | Discord 봇 토큰. `agent-discord setup <token>` 또는 `config --token`으로 설정 | - |
| `serverId` | **필수** | Discord 서버(길드) ID. `setup`에서 자동 감지되거나 `config --server`로 수동 설정 | - |
| `hookServerPort` | 선택 | 훅 서버 포트 | `18470` |

```bash
agent-discord config --show               # 현재 설정 조회
agent-discord config --token NEW_TOKEN     # 봇 토큰 변경
agent-discord config --server SERVER_ID    # 서버 ID 수동 설정
agent-discord config --port 18470          # 훅 서버 포트 설정
```

### 프로젝트 상태

프로젝트 상태는 `~/.discord-agent-bridge/state.json`에 저장되며 자동으로 관리됩니다.

### 환경 변수

설정 값을 환경 변수로 덮어쓸 수 있습니다:

| 변수 | 필수 | 설명 | 기본값 |
|------|------|------|--------|
| `DISCORD_BOT_TOKEN` | **필수** (config.json에 없는 경우) | Discord 봇 토큰 | - |
| `DISCORD_GUILD_ID` | **필수** (config.json에 없는 경우) | Discord 서버 ID | - |
| `DISCORD_CHANNEL_ID` | 선택 | 기본 채널 덮어쓰기 | 프로젝트별 자동 생성 |
| `TMUX_SESSION_PREFIX` | 선택 | tmux 세션 이름 접두사 | `agent-` |
| `HOOK_SERVER_PORT` | 선택 | 훅 서버 포트 | `18470` |
| `CAPTURE_POLL_INTERVAL_MS` | 선택 | tmux 캡처 폴링 주기 | `3000` |

```bash
DISCORD_BOT_TOKEN=token agent-discord daemon start
DISCORD_GUILD_ID=server_id agent-discord go
CODEX_TRANSPORT=app-server agent-discord go codex
```

## 개발

### 빌드

```bash
npm install
npm run build          # TypeScript 컴파일
npm run build:watch    # 감시 모드
```

### 테스트

```bash
npm test              # 모든 테스트 실행
npm run test:watch    # 감시 모드
npm run test:coverage # 커버리지 리포트
```

테스트 스위트에 162개의 테스트가 포함되어 있습니다:
- 에이전트 어댑터
- 상태 관리
- Discord 클라이언트
- 캡처 폴링
- CLI 명령어
- 스토리지 및 실행 모킹

### 프로젝트 구조

```
discord-ai-bridge/
├── bin/                  # CLI 진입점 (agent-discord)
├── src/
│   ├── agents/           # 에이전트 어댑터 (Codex, Claude, OpenCode)
│   ├── codex-app/        # Codex app-server JSON-RPC transport
│   ├── capture/          # tmux 캡처, 폴링, 상태 감지
│   ├── config/           # 설정 관리
│   ├── discord/          # Discord 클라이언트 및 메시지 핸들러
│   ├── infra/            # 인프라 (스토리지, 셸, 환경)
│   ├── state/            # 프로젝트 상태 관리
│   ├── tmux/             # tmux 세션 관리
│   └── types/            # TypeScript 인터페이스
├── tests/                # Vitest 테스트 스위트
├── package.json
└── tsconfig.json
```

### 의존성 주입

코드베이스는 테스트 가능성을 위해 생성자 주입 패턴을 사용합니다:

```typescript
// 인터페이스
interface IStorage { readFile, writeFile, exists, unlink, mkdirp, chmod }
interface ICommandExecutor { exec, execVoid }
interface IEnvironment { get, homedir, platform }

// 사용
class DaemonManager {
  constructor(
    private storage: IStorage = new FileStorage(),
    private executor: ICommandExecutor = new ShellCommandExecutor()
  ) {}
}

// 테스트
const mockStorage = new MockStorage();
const daemon = new DaemonManager(mockStorage);
```

### 코드 품질

- TypeScript strict 모드 활성화
- ESM 모듈 (import 시 `.js` 확장자 사용)
- Vitest로 162개의 테스트 통과
- 미사용 로컬 변수/파라미터 금지 (`tsconfig.json`에서 강제)

## 문제 해결

### 봇이 연결되지 않음

1. 토큰 확인: `agent-discord config --show`
2. Discord 개발자 포털에서 봇 권한 확인
3. MessageContent 인텐트가 활성화되어 있는지 확인
4. 데몬 재시작: `agent-discord daemon stop && agent-discord daemon start`

### 에이전트가 감지되지 않음

1. `agent-discord agents`로 사용 가능한 에이전트 확인
2. 에이전트 바이너리가 PATH에 있는지 확인: `which claude`
3. 누락된 에이전트를 설치하고 재시도

### tmux 세션 문제

1. 세션 존재 확인: `tmux ls`
2. 오래된 세션 종료: `tmux kill-session -t <session-name>`
3. 프로젝트 재시작: `agent-discord stop && agent-discord start`

### Discord에 메시지가 표시되지 않음

1. 데몬 상태 확인: `agent-discord daemon status`
2. 데몬 로그 확인
3. Discord 채널 권한 확인 (봇에 Send Messages 권한 필요)

## 기여

기여를 환영합니다! 다음 절차를 따라주세요:

1. 리포지토리 포크
2. 피처 브랜치 생성 (`git checkout -b feature/amazing-feature`)
3. 변경사항 커밋 (`git commit -m 'Add amazing feature'`)
4. 브랜치에 푸시 (`git push origin feature/amazing-feature`)
5. Pull Request 생성

### 가이드라인

- 새 기능에 대한 테스트 추가
- TypeScript strict 모드 준수 유지
- 기존 코드 스타일 따르기
- 필요에 따라 문서 업데이트

## 라이선스

MIT 라이선스 - 자세한 내용은 [LICENSE](../LICENSE) 파일을 참조하세요.

## 감사의 말

- [Discord.js](https://discord.js.org/)로 제작
- [Claude Code](https://code.claude.com/docs/en/overview)와 [OpenCode](https://github.com/OpenCodeAI/opencode)로 구동

## 지원

- 이슈: [GitHub Issues](https://github.com/atototo/discord-ai-bridge/issues)
- Discord 봇 설정: [설정 가이드](DISCORD_SETUP.ko.md)
