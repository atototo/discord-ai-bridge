import { CodexAppServerSessionManager, type CodexAppServerClientLike } from '../../src/codex-app/session-manager.js';
import type { DiscordAttachment } from '../../src/types/index.js';
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

class FakeClient implements CodexAppServerClientLike {
  requests: Array<{ method: string; params: any }> = [];
  responses: Array<{ id: number | string; result: any }> = [];
  notificationHandlers: Array<(message: any) => void | Promise<void>> = [];
  requestHandlers: Array<(message: any) => void | Promise<void>> = [];

  async start() {}

  async request(method: string, params: any): Promise<any> {
    this.requests.push({ method, params });
    if (method === 'initialize') return { userAgent: 'codex-test' };
    if (method === 'thread/start') return { thread: { id: 'thread-1' } };
    if (method === 'turn/start') return { turn: { id: 'turn-1' } };
    return {};
  }

  respond(id: number | string, result: any): void {
    this.responses.push({ id, result });
  }

  onNotification(handler: (message: any) => void | Promise<void>): void {
    this.notificationHandlers.push(handler);
  }

  onServerRequest(handler: (message: any) => void | Promise<void>): void {
    this.requestHandlers.push(handler);
  }

  emitNotification(message: any): Promise<void> {
    return Promise.all(this.notificationHandlers.map((handler) => handler(message))).then(() => undefined);
  }

  emitServerRequest(message: any): Promise<void> {
    return Promise.all(this.requestHandlers.map((handler) => handler(message))).then(() => undefined);
  }

  stop() {}
}

function createDiscord() {
  return {
    sendToChannel: vi.fn().mockResolvedValue(undefined),
    sendFilesToChannel: vi.fn().mockResolvedValue(undefined),
    sendApprovalRequest: vi.fn().mockResolvedValue(true),
    sendTyping: vi.fn().mockResolvedValue(undefined),
  } as any;
}

function createDiscordWithStatus() {
  return {
    ...createDiscord(),
    sendStatusMessage: vi.fn().mockResolvedValue('status-1'),
    updateMessage: vi.fn().mockResolvedValue(undefined),
  } as any;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

describe('CodexAppServerSessionManager', () => {
  it('starts one app-server thread per project and sends turns with local image inputs', async () => {
    const client = new FakeClient();
    const manager = new CodexAppServerSessionManager(client);
    const image: DiscordAttachment = {
      id: '1',
      name: 'screen.png',
      url: 'https://cdn.test/screen.png',
      contentType: 'image/png',
      localPath: '/repo/.agent-discord/attachments/msg/screen.png',
    };

    await manager.sendMessage({
      projectName: 'repo',
      projectPath: '/repo',
      channelId: 'channel-1',
      content: '이 사진 분석해줘',
      attachments: [image],
      discord: createDiscord(),
    });

    await manager.sendMessage({
      projectName: 'repo',
      projectPath: '/repo',
      channelId: 'channel-1',
      content: '이어서 답해줘',
      attachments: [],
      discord: createDiscord(),
    });

    expect(client.requests.filter((request) => request.method === 'thread/start')).toHaveLength(1);
    const turn = client.requests.find((request) => request.method === 'turn/start');
    expect(turn?.params.threadId).toBe('thread-1');
    expect(turn?.params.input).toEqual([
      {
        type: 'text',
        text: expect.stringContaining('이 사진 분석해줘'),
        text_elements: [],
      },
      { type: 'localImage', path: '/repo/.agent-discord/attachments/msg/screen.png' },
    ]);
    expect(turn?.params.input[0].text).toContain('Discord에 이미지나 파일을 보여줘야 하면');
  });

  it('starts app-server threads in yolo mode without approvals or sandboxing', async () => {
    const client = new FakeClient();
    const manager = new CodexAppServerSessionManager(client);

    await manager.sendMessage({
      projectName: 'repo',
      projectPath: '/repo',
      channelId: 'channel-1',
      content: '진행해',
      attachments: [],
      yolo: true,
      discord: createDiscord(),
    });

    const threadStart = client.requests.find((request) => request.method === 'thread/start');
    expect(threadStart?.params).toEqual(expect.objectContaining({
      cwd: '/repo',
      approvalPolicy: 'never',
      sandbox: 'danger-full-access',
    }));
  });

  it('includes recent Discord channel context only when starting a new app-server thread', async () => {
    const client = new FakeClient();
    const manager = new CodexAppServerSessionManager(client);

    await manager.sendMessage({
      projectName: 'repo',
      projectPath: '/repo',
      channelId: 'channel-1',
      content: '계속해줘',
      attachments: [],
      recentMessages: [
        { authorName: 'atoto0311', authorBot: false, content: '이전 질문', attachments: [] },
        { authorName: 'codex-in-company', authorBot: true, content: '이전 답변', attachments: ['result.png'] },
      ],
      discord: createDiscord(),
    });

    await manager.sendMessage({
      projectName: 'repo',
      projectPath: '/repo',
      channelId: 'channel-1',
      content: '다음',
      attachments: [],
      recentMessages: [
        { authorName: 'atoto0311', authorBot: false, content: '다시 넣으면 안 됨', attachments: [] },
      ],
      discord: createDiscord(),
    });

    const turns = client.requests.filter((request) => request.method === 'turn/start');
    expect(turns[0].params.input[0].text).toContain('[Discord 최근 대화 맥락]');
    expect(turns[0].params.input[0].text).toContain('이전 질문');
    expect(turns[0].params.input[0].text).toContain('첨부: result.png');
    expect(turns[1].params.input[0].text).not.toContain('[Discord 최근 대화 맥락]');
  });

  it('keeps Discord typing visible while an app-server turn is active', async () => {
    vi.useFakeTimers();
    const client = new FakeClient();
    const discord = createDiscord();
    const manager = new CodexAppServerSessionManager(client);

    try {
      await manager.sendMessage({
        projectName: 'repo',
        projectPath: '/repo',
        channelId: 'channel-1',
        content: '이미지 만들어줘',
        attachments: [],
        discord,
      });

      expect(discord.sendTyping).toHaveBeenCalledTimes(1);
      expect(discord.sendTyping).toHaveBeenCalledWith('channel-1');

      await vi.advanceTimersByTimeAsync(8000);
      await vi.advanceTimersByTimeAsync(8000);
      expect(discord.sendTyping).toHaveBeenCalledTimes(3);

      await client.emitNotification({
        method: 'turn/completed',
        params: { threadId: 'thread-1', turn: { id: 'turn-1' } },
      });

      await vi.advanceTimersByTimeAsync(8000);
      expect(discord.sendTyping).toHaveBeenCalledTimes(3);
    } finally {
      manager.stop();
      vi.useRealTimers();
    }
  });

  it('creates and updates a single Discord run status message during a turn', async () => {
    const client = new FakeClient();
    const discord = createDiscordWithStatus();
    const manager = new CodexAppServerSessionManager(client);

    await manager.sendMessage({
      projectName: 'repo',
      projectPath: '/repo',
      channelId: 'channel-1',
      content: '긴 작업 진행해',
      attachments: [],
      discord,
    });

    expect(discord.sendStatusMessage).toHaveBeenCalledWith(
      'channel-1',
      expect.stringContaining('Codex 작업 진행 중')
    );
    expect(discord.sendStatusMessage.mock.calls[0][1]).toContain('상태: starting');

    await client.emitNotification({
      method: 'item/started',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        item: { type: 'commandExecution', id: 'cmd-1', command: 'npm test', cwd: '/repo' },
      },
    });

    expect(discord.updateMessage).toHaveBeenCalledWith(
      'channel-1',
      'status-1',
      expect.stringContaining('명령 실행 중')
    );

    await client.emitNotification({
      method: 'item/completed',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        item: { type: 'agentMessage', id: 'msg-1', text: '완료 답변' },
      },
    });
    await client.emitNotification({
      method: 'turn/completed',
      params: { threadId: 'thread-1', turn: { id: 'turn-1' } },
    });

    expect(discord.updateMessage).toHaveBeenLastCalledWith(
      'channel-1',
      'status-1',
      expect.stringContaining('상태: completed')
    );
    expect(discord.updateMessage).toHaveBeenLastCalledWith(
      'channel-1',
      'status-1',
      expect.stringContaining('최종 답변 전송 완료')
    );
    expect(discord.sendToChannel).toHaveBeenCalledWith(
      'channel-1',
      expect.stringContaining('완료 답변')
    );
  });

  it('labels started agentMessage items as answer writing progress', async () => {
    const client = new FakeClient();
    const discord = createDiscordWithStatus();
    const manager = new CodexAppServerSessionManager(client);

    await manager.sendMessage({
      projectName: 'repo',
      projectPath: '/repo',
      channelId: 'channel-1',
      content: '계획 알려줘',
      attachments: [],
      discord,
    });

    await client.emitNotification({
      method: 'item/started',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        item: { type: 'agentMessage', id: 'msg-1' },
      },
    });

    expect(discord.updateMessage).toHaveBeenCalledWith(
      'channel-1',
      'status-1',
      expect.stringContaining('답변 작성 중')
    );
    expect(discord.updateMessage).not.toHaveBeenCalledWith(
      'channel-1',
      'status-1',
      expect.stringContaining('agentMessage 처리 중')
    );
  });

  it('does not create duplicate status messages when progress arrives while the first status send is pending', async () => {
    const client = new FakeClient();
    const statusSend = deferred<string | null>();
    const discord = {
      ...createDiscord(),
      sendStatusMessage: vi.fn().mockReturnValue(statusSend.promise),
      updateMessage: vi.fn().mockResolvedValue(undefined),
    } as any;
    const manager = new CodexAppServerSessionManager(client);

    const pendingSend = manager.sendMessage({
      projectName: 'repo',
      projectPath: '/repo',
      channelId: 'channel-1',
      content: '긴 작업 진행해',
      attachments: [],
      discord,
    });

    await vi.waitFor(() => {
      expect(discord.sendStatusMessage).toHaveBeenCalledTimes(1);
    });

    const pendingProgress = client.emitNotification({
      method: 'item/started',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        item: { type: 'agentMessage', id: 'msg-1' },
      },
    });

    expect(discord.sendStatusMessage).toHaveBeenCalledTimes(1);

    statusSend.resolve('status-1');
    await pendingProgress;
    await pendingSend;

    expect(discord.sendStatusMessage).toHaveBeenCalledTimes(1);
    expect(discord.updateMessage).toHaveBeenCalledWith(
      'channel-1',
      'status-1',
      expect.stringContaining('답변 작성 중')
    );
  });

  it('refreshes the run status message with elapsed time while a turn is active', async () => {
    vi.useFakeTimers();
    const client = new FakeClient();
    const discord = createDiscordWithStatus();
    const manager = new CodexAppServerSessionManager(client);

    try {
      await manager.sendMessage({
        projectName: 'repo',
        projectPath: '/repo',
        channelId: 'channel-1',
        content: '긴 작업 진행해',
        attachments: [],
        discord,
      });

      await vi.advanceTimersByTimeAsync(60000);

      expect(discord.updateMessage).toHaveBeenCalledWith(
        'channel-1',
        'status-1',
        expect.stringContaining('마지막 활동: 1분 전')
      );

      await client.emitNotification({
        method: 'item/started',
        params: {
          threadId: 'thread-1',
          turnId: 'turn-1',
          item: { type: 'commandExecution', id: 'cmd-1', command: 'npm test', cwd: '/repo' },
        },
      });

      expect(discord.updateMessage).toHaveBeenLastCalledWith(
        'channel-1',
        'status-1',
        expect.stringContaining('마지막 활동: 방금')
      );

      await client.emitNotification({
        method: 'turn/completed',
        params: { threadId: 'thread-1', turn: { id: 'turn-1' } },
      });
      discord.updateMessage.mockClear();
      await vi.advanceTimersByTimeAsync(60000);

      expect(discord.updateMessage).not.toHaveBeenCalled();
    } finally {
      manager.stop();
      vi.useRealTimers();
    }
  });

  it('marks a Discord run status message as waiting for approval', async () => {
    const client = new FakeClient();
    const discord = createDiscordWithStatus();
    const manager = new CodexAppServerSessionManager(client);

    await manager.sendMessage({
      projectName: 'repo',
      projectPath: '/repo',
      channelId: 'channel-1',
      content: '테스트 실행해줘',
      attachments: [],
      discord,
    });

    await client.emitServerRequest({
      id: 99,
      method: 'item/commandExecution/requestApproval',
      params: { threadId: 'thread-1', turnId: 'turn-1', command: 'npm test', cwd: '/repo' },
    });

    expect(discord.updateMessage).toHaveBeenCalledWith(
      'channel-1',
      'status-1',
      expect.stringContaining('상태: waiting_approval')
    );
    expect(discord.updateMessage).toHaveBeenCalledWith(
      'channel-1',
      'status-1',
      expect.stringContaining('승인 완료')
    );
  });

  it('marks a Discord run status message as stalled after the timeout', async () => {
    vi.useFakeTimers();
    const client = new FakeClient();
    const discord = createDiscordWithStatus();
    const manager = new CodexAppServerSessionManager(client, { turnTimeoutMs: 1000 });

    try {
      await manager.sendMessage({
        projectName: 'repo',
        projectPath: '/repo',
        channelId: 'channel-1',
        content: '오래 걸리는 작업',
        attachments: [],
        discord,
      });

      await vi.advanceTimersByTimeAsync(1000);

      expect(discord.updateMessage).toHaveBeenCalledWith(
        'channel-1',
        'status-1',
        expect.stringContaining('상태: stalled')
      );
    } finally {
      manager.stop();
      vi.useRealTimers();
    }
  });

  it('stops typing and reports a stalled app-server turn after the timeout', async () => {
    vi.useFakeTimers();
    const client = new FakeClient();
    const discord = createDiscord();
    const manager = new CodexAppServerSessionManager(client, { turnTimeoutMs: 1000 });

    try {
      await manager.sendMessage({
        projectName: 'repo',
        projectPath: '/repo',
        channelId: 'channel-1',
        content: '오래 걸리는 작업',
        attachments: [],
        discord,
      });

      await vi.advanceTimersByTimeAsync(1000);

      expect(discord.sendToChannel).toHaveBeenCalledWith(
        'channel-1',
        expect.stringContaining('Codex 응답이 제한 시간')
      );

      await vi.advanceTimersByTimeAsync(8000);
      expect(discord.sendTyping).toHaveBeenCalledTimes(1);
    } finally {
      manager.stop();
      vi.useRealTimers();
    }
  });

  it('starts a new thread for a project after resetThread', async () => {
    const client = new FakeClient();
    const manager = new CodexAppServerSessionManager(client);

    await manager.sendMessage({
      projectName: 'repo',
      projectPath: '/repo',
      channelId: 'channel-1',
      content: '첫 메시지',
      attachments: [],
      discord: createDiscord(),
    });

    manager.resetThread('repo');

    await manager.sendMessage({
      projectName: 'repo',
      projectPath: '/repo',
      channelId: 'channel-1',
      content: '새 세션 메시지',
      attachments: [],
      recentMessages: [
        { authorName: 'atoto0311', authorBot: false, content: '참고할 이전 대화', attachments: [] },
      ],
      discord: createDiscord(),
    });

    expect(client.requests.filter((request) => request.method === 'thread/start')).toHaveLength(2);
    const turns = client.requests.filter((request) => request.method === 'turn/start');
    expect(turns[1].params.input[0].text).toContain('[Discord 최근 대화 맥락]');
    expect(turns[1].params.input[0].text).toContain('참고할 이전 대화');
  });

  it('keeps separate app-server threads for separate session keys in the same project', async () => {
    const client = new FakeClient();
    const manager = new CodexAppServerSessionManager(client);

    await manager.sendMessage({
      projectName: 'repo',
      sessionKey: 'repo:main-channel',
      projectPath: '/repo',
      channelId: 'main-channel',
      content: '메인 채널 메시지',
      attachments: [],
      discord: createDiscord(),
    });

    await manager.sendMessage({
      projectName: 'repo',
      sessionKey: 'repo:thread-channel',
      projectPath: '/repo',
      channelId: 'thread-channel',
      content: '스레드 메시지',
      attachments: [],
      discord: createDiscord(),
    });

    expect(client.requests.filter((request) => request.method === 'thread/start')).toHaveLength(2);
  });

  it('streams agent deltas to Discord only when the turn completes', async () => {
    const client = new FakeClient();
    const discord = createDiscord();
    const manager = new CodexAppServerSessionManager(client);

    await manager.sendMessage({
      projectName: 'repo',
      projectPath: '/repo',
      channelId: 'channel-1',
      content: '안녕?',
      attachments: [],
      discord,
    });

    await client.emitNotification({
      method: 'item/agentMessage/delta',
      params: { threadId: 'thread-1', turnId: 'turn-1', delta: '안녕' },
    });
    expect(discord.sendToChannel).not.toHaveBeenCalledWith('channel-1', expect.stringContaining('안녕'));

    await client.emitNotification({
      method: 'turn/completed',
      params: { threadId: 'thread-1', turn: { id: 'turn-1' } },
    });

    expect(discord.sendToChannel).toHaveBeenCalledWith(
      'channel-1',
      expect.stringContaining('안녕')
    );
  });

  it('does not split assistant text before the turn completes', async () => {
    vi.useFakeTimers();
    const client = new FakeClient();
    const discord = createDiscord();
    const manager = new CodexAppServerSessionManager(client, { streamFlushMs: 1000 });

    await manager.sendMessage({
      projectName: 'repo',
      projectPath: '/repo',
      channelId: 'channel-1',
      content: '길게 답해줘',
      attachments: [],
      discord,
    });

    await client.emitNotification({
      method: 'item/agentMessage/delta',
      params: { threadId: 'thread-1', turnId: 'turn-1', delta: '먼저 보이는 답변' },
    });
    await vi.advanceTimersByTimeAsync(1000);

    expect(discord.sendToChannel).not.toHaveBeenCalledWith(
      'channel-1',
      expect.stringContaining('먼저 보이는 답변')
    );

    discord.sendToChannel.mockClear();
    await client.emitNotification({
      method: 'turn/completed',
      params: { threadId: 'thread-1', turn: { id: 'turn-1' } },
    });

    expect(discord.sendToChannel).toHaveBeenCalledWith(
      'channel-1',
      expect.stringContaining('먼저 보이는 답변')
    );
    vi.useRealTimers();
  });

  it('uses completed agentMessage item text as the final Discord answer', async () => {
    const client = new FakeClient();
    const discord = createDiscord();
    const manager = new CodexAppServerSessionManager(client);

    await manager.sendMessage({
      projectName: 'repo',
      projectPath: '/repo',
      channelId: 'channel-1',
      content: '내일 날씨 알려줘',
      attachments: [],
      discord,
    });

    await client.emitNotification({
      method: 'item/agentMessage/delta',
      params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'msg-1', delta: '부분 답변' },
    });
    await client.emitNotification({
      method: 'item/completed',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        item: { type: 'agentMessage', id: 'msg-1', text: '최종 답변 전체', phase: null, memoryCitation: null },
      },
    });
    await client.emitNotification({
      method: 'turn/completed',
      params: { threadId: 'thread-1', turn: { id: 'turn-1' } },
    });

    expect(discord.sendToChannel).toHaveBeenCalledTimes(1);
    expect(discord.sendToChannel).toHaveBeenCalledWith(
      'channel-1',
      expect.stringContaining('최종 답변 전체')
    );
    expect(discord.sendToChannel.mock.calls[0][1]).not.toContain('부분 답변');
  });

  it('uses Discord typing indicators instead of progress messages for app-server item events', async () => {
    const client = new FakeClient();
    const discord = createDiscord();
    const manager = new CodexAppServerSessionManager(client);

    await manager.sendMessage({
      projectName: 'repo',
      projectPath: '/repo',
      channelId: 'channel-1',
      content: '오늘 날씨 찾아줘',
      attachments: [],
      discord,
    });

    await client.emitNotification({
      method: 'item/started',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        item: { type: 'webSearch', id: 'web-1', query: 'Seoul weather today', action: null },
      },
    });
    await client.emitNotification({
      method: 'item/started',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        item: { type: 'commandExecution', id: 'cmd-1', command: 'npm test', cwd: '/repo' },
      },
    });

    expect(discord.sendToChannel).not.toHaveBeenCalled();
    expect(discord.sendTyping).toHaveBeenCalledTimes(1);
    expect(discord.sendTyping).toHaveBeenCalledWith('channel-1');
  });

  it('uses typing indicators for noisy read-only command progress notifications', async () => {
    const client = new FakeClient();
    const discord = createDiscord();
    const manager = new CodexAppServerSessionManager(client);

    await manager.sendMessage({
      projectName: 'repo',
      projectPath: '/repo',
      channelId: 'channel-1',
      content: '코드 구조 확인해줘',
      attachments: [],
      discord,
    });

    for (const [id, command] of [
      ['sed-1', "/bin/zsh -lc \"sed -n '1,220p' src/index.ts\""],
      ['ls-1', '/bin/zsh -lc ls'],
      ['rg-1', "/bin/zsh -lc 'rg --files'"],
      ['env-1', "/bin/zsh -lc 'printenv SUPABASE_URL'"],
    ]) {
      await client.emitNotification({
        method: 'item/started',
        params: {
          threadId: 'thread-1',
          turnId: 'turn-1',
          item: { type: 'commandExecution', id, command, cwd: '/repo' },
        },
      });
    }

    expect(discord.sendToChannel).not.toHaveBeenCalled();
    expect(discord.sendTyping).toHaveBeenCalledTimes(1);
  });

  it('uses typing indicators for meaningful command progress notifications', async () => {
    const client = new FakeClient();
    const discord = createDiscord();
    const manager = new CodexAppServerSessionManager(client);

    await manager.sendMessage({
      projectName: 'repo',
      projectPath: '/repo',
      channelId: 'channel-1',
      content: '빌드해줘',
      attachments: [],
      discord,
    });

    await client.emitNotification({
      method: 'item/started',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        item: { type: 'commandExecution', id: 'build-1', command: 'npm run build', cwd: '/repo' },
      },
    });

    expect(discord.sendToChannel).not.toHaveBeenCalled();
    expect(discord.sendTyping).toHaveBeenCalledWith('channel-1');
  });

  it('converts app-server approval requests into Discord approvals', async () => {
    const client = new FakeClient();
    const discord = createDiscord();
    const manager = new CodexAppServerSessionManager(client);

    await manager.sendMessage({
      projectName: 'repo',
      projectPath: '/repo',
      channelId: 'channel-1',
      content: '테스트 실행해줘',
      attachments: [],
      discord,
    });

    await client.emitServerRequest({
      id: 99,
      method: 'item/commandExecution/requestApproval',
      params: { threadId: 'thread-1', command: 'npm test', cwd: '/repo' },
    });

    expect(discord.sendApprovalRequest).toHaveBeenCalledWith(
      'channel-1',
      'commandExecution',
      expect.objectContaining({ command: 'npm test', cwd: '/repo' })
    );
    expect(client.responses).toEqual([
      { id: 99, result: { decision: 'accept' } },
    ]);
  });

  it('uploads files referenced by final answer markers', async () => {
    const client = new FakeClient();
    const discord = createDiscord();
    const manager = new CodexAppServerSessionManager(client);
    const projectDir = mkdtempSync(join(tmpdir(), 'ai-bridge-codex-app-'));
    const resultPath = join(projectDir, 'result.png');
    writeFileSync(resultPath, 'png');

    await manager.sendMessage({
      projectName: 'repo',
      projectPath: projectDir,
      channelId: 'channel-1',
      content: '이미지 만들어줘',
      attachments: [],
      discord,
    });

    await client.emitNotification({
      method: 'item/completed',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        item: { type: 'agentMessage', text: `완료\n[[discord-attach:${resultPath}]]` },
      },
    });
    await client.emitNotification({
      method: 'turn/completed',
      params: { threadId: 'thread-1', turn: { id: 'turn-1' } },
    });

    expect(discord.sendFilesToChannel).toHaveBeenCalledWith(
      'channel-1',
      expect.stringContaining('완료'),
      [resultPath]
    );
    expect(discord.sendFilesToChannel.mock.calls[0][1]).not.toContain('discord-attach');
  });

  it('uploads project image paths mentioned in final answers without explicit markers', async () => {
    const client = new FakeClient();
    const discord = createDiscord();
    const manager = new CodexAppServerSessionManager(client);
    const projectDir = mkdtempSync(join(tmpdir(), 'ai-bridge-codex-app-'));
    const resultPath = join(projectDir, 'Resources', 'Assets.xcassets', 'AppIcon.appiconset', 'AppIcon-1024.png');
    mkdirSync(join(projectDir, 'Resources', 'Assets.xcassets', 'AppIcon.appiconset'), { recursive: true });
    writeFileSync(resultPath, 'png');

    await manager.sendMessage({
      projectName: 'repo',
      projectPath: projectDir,
      channelId: 'channel-1',
      content: '이미지 보여줘',
      attachments: [],
      discord,
    });

    await client.emitNotification({
      method: 'item/completed',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        item: { type: 'agentMessage', text: `파일 위치:\n\`Resources/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png\`` },
      },
    });
    await client.emitNotification({
      method: 'turn/completed',
      params: { threadId: 'thread-1', turn: { id: 'turn-1' } },
    });

    expect(discord.sendFilesToChannel).toHaveBeenCalledWith(
      'channel-1',
      expect.stringContaining('파일 위치'),
      [resultPath]
    );
  });

  it.each([
    ['item/fileChange/requestApproval', 'fileChange'],
    ['item/permissions/requestApproval', 'permissions'],
  ])('converts %s into Discord approvals', async (method, toolName) => {
    const client = new FakeClient();
    const discord = createDiscord();
    const manager = new CodexAppServerSessionManager(client);

    await manager.sendMessage({
      projectName: 'repo',
      projectPath: '/repo',
      channelId: 'channel-1',
      content: '수정해줘',
      attachments: [],
      discord,
    });

    await client.emitServerRequest({
      id: 100,
      method,
      params: { threadId: 'thread-1', cwd: '/repo', reason: 'needs access' },
    });

    expect(discord.sendApprovalRequest).toHaveBeenCalledWith(
      'channel-1',
      toolName,
      expect.objectContaining({ cwd: '/repo', reason: 'needs access' })
    );
    expect(client.responses).toEqual([
      { id: 100, result: { decision: 'accept' } },
    ]);
  });
});
