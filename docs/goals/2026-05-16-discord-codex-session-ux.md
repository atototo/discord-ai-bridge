# Goal: Discord Codex Session UX

날짜: 2026-05-16

## 배경

현재 Discord bridge는 Codex app-server를 통해 로컬 Codex 세션에 메시지를 전달할 수 있다. 하지만 사용성은 아직 "Discord 메시지를 Codex에 전달하고 최종 답변을 기다리는 중계"에 가깝다.

실사용 중 다음 문제가 확인됐다.

- Codex app-server turn이 멈추거나 완료 이벤트가 누락되면 Discord 채팅에서는 원인을 알기 어렵다.
- 긴 작업과 짧은 대화가 같은 채널에 섞이면 진행 상태를 추적하기 어렵다.
- 무조건 Discord thread를 만들면 세션이 과도하게 늘고, 메인 채널에서 자연스럽게 대화하기 어렵다.
- Codex 앱처럼 프로젝트별 여러 세션을 눈으로 보고 선택하는 사용성이 Discord에는 아직 없다.

## 목표

Discord를 Codex 앱의 session list와 chat surface에 가까운 클라이언트로 만든다.

핵심 모델은 다음과 같다.

```text
Discord Category = 프로젝트
Discord Channel  = Codex 세션
Discord Thread   = 긴 작업 또는 세션 안의 실행 단위
```

예시:

```text
wedding
  #codex-wedding
  #codex-wedding-ios
  #codex-wedding-admin
  #codex-wedding-research

#codex-wedding-ios thread
  레시피 등록 구조 확인
  사진/비디오 단계 저장 방식 점검
```

## 비목표

- Phase 1에서 Codex 앱이 독립적으로 만든 모든 세션을 자동 감시하지 않는다.
- Phase 1에서 모든 긴 작업을 자동 thread로 강제 분리하지 않는다.
- Phase 1에서 Discord를 완전한 UI dashboard로 만들지 않는다.
- 실제 token, cookie, session credential, API key는 state나 문서에 저장하지 않는다.

## Phase 1: 채널 기반 세션화

Discord channel 하나를 Codex app-server thread 하나에 대응시킨다.

### 요구사항

- 사용자가 프로젝트 category 안에서 `codex-*` 채널을 만들면 bridge가 Codex session 후보로 인식한다.
- `codex-*` lazy 인식은 bridge state에 이미 등록된 프로젝트 category 안에서만 동작한다. 다른 봇이 쓰는 category/channel까지 이름만 보고 가져가면 안 된다.
- 첫 메시지가 들어올 때 해당 Discord channel ID를 기준으로 독립 Codex app-server thread를 만든다.
- 기존 메인 채널 `#codex-<project>`도 같은 방식의 기본 세션으로 유지한다.
- 같은 category 안에서 만든 `codex-*` 채널은 같은 프로젝트 경로를 공유한다.
- session key는 `projectName:discordChannelId`를 유지해 channel 단위로 분리한다.
- Discord thread 안의 메시지는 기존처럼 thread channel ID 기준의 별도 session으로 처리하되, parent channel의 프로젝트 경로를 사용한다.

### 수용 기준

- `#codex-wedding-ios` 같은 새 채널에 첫 메시지를 보내면 `wedding` 프로젝트 경로의 새 Codex session으로 라우팅된다.
- state에 `wedding` 프로젝트가 없으면 `wedding/#codex-wedding-ios`도 자동 라우팅하지 않는다.
- `#codex-wedding`과 `#codex-wedding-ios`는 서로 다른 Codex app-server thread를 사용한다.
- 새 채널 연동은 명시적 setup 명령 없이 동작하거나, 실패 시 사용자가 해야 할 일을 Discord에 알려준다.
- 기존 등록 채널과 `/new-session` 동작은 깨지지 않는다.

## Phase 2: 메인 채널 허브 UX

메인 채널은 계속 대화 가능한 기본 세션이자 프로젝트 허브로 둔다.

### 요구사항

- 메인 채널에서는 짧은 질문, 설명, 상태 확인, 후속 대화를 그대로 처리한다.
- `/sessions` 또는 텍스트 fallback으로 같은 프로젝트 category의 Codex session 목록을 보여준다.
- `/new-session`은 현재 channel의 Codex session만 초기화한다.
- `/close-session`, `/rename-session`은 후속 후보로 둔다.

### 수용 기준

- 사용자는 메인 채널에서 계속 대화할 수 있다.
- 사용자는 프로젝트 category 안에 어떤 Codex session channel이 있는지 확인할 수 있다.
- session 관리 명령이 다른 channel/session에 영향을 주지 않는다.

## Phase 3: 긴 작업 thread 분기

긴 작업은 channel 안의 Discord thread로 분리하되, 초기에는 자동보다 제안형을 우선한다.

### 분기 기준

현재 channel에서 그대로 처리한다.

- 질문, 설명, 상담
- 짧은 확인
- 직전 대화의 후속 질문
- `/status`, `/sessions`, `/new-session` 같은 관리 명령
- 사용자가 "여기서 답해줘", "thread 만들지 마"라고 명시한 경우

thread 생성을 제안한다.

- 구현, 수정, 테스트, 빌드, 리서치
- 파일 변경 가능성이 있는 요청
- 여러 단계가 예상되는 요청
- 현재 channel에 active run이 있는데 새 독립 작업을 요청한 경우
- 사용자가 "따로 작업으로 빼줘", "스레드로 진행해"라고 명시한 경우

### 수용 기준

- 애매한 요청은 바로 thread를 만들지 않고 선택지를 제시한다.
- 사용자가 thread 생성을 선택하면 해당 thread에서 진행/승인/최종 답변이 이어진다.
- 사용자는 thread 안에서 후속 대화를 할 수 있다.

## Phase 4: Run 상태와 heartbeat

timeout을 "오래 걸림" 기준이 아니라 "활동 없음" 기준으로 바꾼다.

### 요구사항

- run 상태를 `queued`, `starting`, `running`, `waiting_approval`, `stalled`, `completed`, `failed`로 관리한다.
- `lastActivityAt`을 app-server notification, server request, stderr/progress, final answer 기준으로 갱신한다.
- 일정 시간 동안 아무 activity가 없을 때만 `stalled`로 표시한다.
- hard timeout은 없거나 매우 길게 둔다.
- Discord에는 현재 상태와 마지막 활동 시간을 알 수 있게 한다.

### 수용 기준

- 긴 작업이 30분 이상 진행되어도 activity가 있으면 실패 처리하지 않는다.
- app-server가 조용히 멈추면 Discord에서 `stalled` 상태를 볼 수 있다.
- 승인 요청 대기 상태와 일반 실행 상태가 구분된다.

## Phase 5: Codex 앱 역방향 연동

Codex 앱에서 Discord session/channel로 연결하는 기능은 후속 단계로 둔다.

### 후보 기능

- Discord에서 `codex://threads/<threadId>` 또는 `/link-session <threadId>`로 기존 Codex app-server thread를 연결한다.
- Codex 앱에서 사용할 수 있는 bridge 도구를 제공한다.
  - `discord.list_channels`
  - `discord.attach_current_thread`
  - `discord.post_update`
  - `discord.create_work_thread`
  - `discord.send_file`
- 자동 미러링은 app-server/desktop API 안정성을 더 확인한 뒤 결정한다.

## 구현 순서

1. Channel discovery와 project inference 설계
2. 새 `codex-*` channel을 session channel로 라우팅하는 테스트 추가
3. `DiscordClient` channel metadata 조회 또는 channelCreate 이벤트 처리 추가
4. `AgentBridge`에서 category 기반 project 추론 추가
5. `/sessions` 또는 fallback 명령 추가
6. 긴 작업 thread 제안 UX 설계
7. Run registry와 heartbeat로 watchdog 재설계

## 열린 질문

- `codex-*` channel name 규칙을 얼마나 엄격하게 둘 것인가?
- category 이름과 projectName이 다를 때 어떤 mapping을 우선할 것인가?
- 새 channel을 자동 등록할 때 state에 영구 저장할 것인가, 아니면 channelId 기반 lazy session만 둘 것인가?
- thread 분기 제안을 Discord 버튼으로 구현할지, 텍스트 fallback부터 구현할지?
- inactive session channel archive/close 정책은 언제부터 적용할 것인가?
