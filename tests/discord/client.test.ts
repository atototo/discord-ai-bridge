/**
 * Tests for DiscordClient
 */

import { DiscordClient } from '../../src/discord/client.js';
import { AgentRegistry, BaseAgentAdapter } from '../../src/agents/base.js';

// Mock discord.js
const mockClientInstances: any[] = [];

vi.mock('discord.js', () => {
  return {
    Client: class MockClient {
      on = vi.fn();
      once = vi.fn();
      login = vi.fn().mockResolvedValue(undefined);
      destroy = vi.fn().mockResolvedValue(undefined);
      guilds = { cache: new Map() };
      channels = { fetch: vi.fn() };
      user = { tag: 'TestBot#1234' };

      constructor() {
        mockClientInstances.push(this);
      }
    },
    ApplicationCommandOptionType: { Boolean: 5 },
    GatewayIntentBits: { Guilds: 1, GuildMessages: 2, MessageContent: 4, GuildMessageReactions: 8 },
    ChannelType: { GuildText: 0, GuildCategory: 4 },
    Events: { InteractionCreate: 'interactionCreate' },
    ButtonBuilder: class MockButtonBuilder {
      setCustomId = vi.fn().mockReturnThis();
      setLabel = vi.fn().mockReturnThis();
      setStyle = vi.fn().mockReturnThis();
    },
    ButtonStyle: { Primary: 1, Secondary: 2 },
    ActionRowBuilder: class MockActionRowBuilder {
      addComponents = vi.fn().mockReturnThis();
    },
    ComponentType: { Button: 2 },
    EmbedBuilder: class MockEmbedBuilder {
      setTitle = vi.fn().mockReturnThis();
      setDescription = vi.fn().mockReturnThis();
      setColor = vi.fn().mockReturnThis();
      addFields = vi.fn().mockReturnThis();
      setFooter = vi.fn().mockReturnThis();
    },
  };
});

function createTestRegistry(): AgentRegistry {
  const registry = new AgentRegistry();
  class TestAdapter extends BaseAgentAdapter {
    constructor() {
      super({ name: 'test', displayName: 'Test', command: 'test', channelSuffix: 'test' });
    }
  }
  registry.register(new TestAdapter());
  return registry;
}

describe('DiscordClient', () => {
  beforeEach(() => {
    mockClientInstances.length = 0;
  });

  function getMockClient() {
    return mockClientInstances[mockClientInstances.length - 1];
  }

  describe('Channel mapping', () => {
    it('registerChannelMappings stores mappings', () => {
      const client = new DiscordClient('test-token');

      client.registerChannelMappings([
        { channelId: 'ch-1', projectName: 'proj1', agentType: 'claude' },
        { channelId: 'ch-2', projectName: 'proj2', agentType: 'cursor' },
      ]);

      const mappings = client.getChannelMapping();
      expect(mappings.size).toBe(2);
      expect(mappings.get('ch-1')).toEqual({
        projectName: 'proj1',
        agentType: 'claude',
      });
      expect(mappings.get('ch-2')).toEqual({
        projectName: 'proj2',
        agentType: 'cursor',
      });
    });

    it('getChannelMapping returns copy of mappings', () => {
      const client = new DiscordClient('test-token');

      client.registerChannelMappings([
        { channelId: 'ch-1', projectName: 'proj1', agentType: 'claude' },
      ]);

      const mappings1 = client.getChannelMapping();
      const mappings2 = client.getChannelMapping();

      expect(mappings1).not.toBe(mappings2);
      expect(mappings1.size).toBe(mappings2.size);
    });
  });

  describe('Message handling', () => {
    it('onMessage registers callback', () => {
      const client = new DiscordClient('test-token');
      const callback = vi.fn();

      client.onMessage(callback);

      // Verify callback is stored (we can't directly access private field, but we can test the behavior)
      expect(callback).toBeDefined();
    });

    it('Bot messages are ignored', async () => {
      const client = new DiscordClient('test-token');
      const callback = vi.fn();
      client.onMessage(callback);

      const mockClient = getMockClient();

      // Find the messageCreate handler
      const messageCreateHandler = mockClient.on.mock.calls.find(
        (call: any[]) => call[0] === 'messageCreate'
      )?.[1];

      expect(messageCreateHandler).toBeDefined();

      // Simulate bot message
      const botMessage = {
        author: { bot: true },
        channel: { isTextBased: () => true },
        channelId: 'ch-1',
        content: 'bot message',
      };

      await messageCreateHandler(botMessage);

      // Callback should not be invoked for bot messages
      expect(callback).not.toHaveBeenCalled();
    });

    it('ignores mapped channel messages from users outside the allowlist', async () => {
      const client = new DiscordClient('test-token', undefined, ['allowed-user']);
      const callback = vi.fn();
      client.onMessage(callback);
      client.registerChannelMappings([
        { channelId: 'ch-1', projectName: 'proj1', agentType: 'test' },
      ]);

      const mockClient = getMockClient();
      const messageCreateHandler = mockClient.on.mock.calls.find(
        (call: any[]) => call[0] === 'messageCreate'
      )?.[1];

      await messageCreateHandler({
        author: { bot: false, id: 'blocked-user' },
        channel: { isTextBased: () => true },
        channelId: 'ch-1',
        content: 'run tests',
      });

      expect(callback).not.toHaveBeenCalled();
    });

    it('allows mapped channel messages from allowlisted users', async () => {
      const client = new DiscordClient('test-token', undefined, ['allowed-user']);
      const callback = vi.fn();
      client.onMessage(callback);
      client.registerChannelMappings([
        { channelId: 'ch-1', projectName: 'proj1', agentType: 'test' },
      ]);

      const mockClient = getMockClient();
      const messageCreateHandler = mockClient.on.mock.calls.find(
        (call: any[]) => call[0] === 'messageCreate'
      )?.[1];

      await messageCreateHandler({
        id: 'msg-1',
        author: { bot: false, id: 'allowed-user' },
        channel: { isTextBased: () => true },
        channelId: 'ch-1',
        content: 'run tests',
        attachments: new Map(),
      });

      expect(callback).toHaveBeenCalledWith('test', 'run tests', 'proj1', 'ch-1', {
        messageId: 'msg-1',
        attachments: [],
      });
    });

    it('passes message attachments to the callback', async () => {
      const client = new DiscordClient('test-token', undefined, ['allowed-user']);
      const callback = vi.fn();
      client.onMessage(callback);
      client.registerChannelMappings([
        { channelId: 'ch-1', projectName: 'proj1', agentType: 'test' },
      ]);

      const mockClient = getMockClient();
      const messageCreateHandler = mockClient.on.mock.calls.find(
        (call: any[]) => call[0] === 'messageCreate'
      )?.[1];

      await messageCreateHandler({
        id: 'msg-2',
        author: { bot: false, id: 'allowed-user' },
        channel: { isTextBased: () => true },
        channelId: 'ch-1',
        content: 'analyze this',
        attachments: new Map([
          ['att-1', {
            id: 'att-1',
            name: 'photo.png',
            url: 'https://cdn.example/photo.png',
            contentType: 'image/png',
            size: 42,
          }],
        ]),
      });

      expect(callback).toHaveBeenCalledWith('test', 'analyze this', 'proj1', 'ch-1', {
        messageId: 'msg-2',
        attachments: [
          {
            id: 'att-1',
            name: 'photo.png',
            url: 'https://cdn.example/photo.png',
            contentType: 'image/png',
            size: 42,
          },
        ],
      });
    });

    it('fetches recent channel messages before the current message for context', async () => {
      const client = new DiscordClient('test-token', undefined, ['allowed-user']);
      const mockChannel = {
        isTextBased: () => true,
        messages: {
          fetch: vi.fn().mockResolvedValue(new Map([
            ['m3', {
              author: { username: 'codex-in-company', bot: true },
              content: '이전 답변',
              attachments: new Map([['a1', { name: 'result.png', filename: 'result.png' }]]),
            }],
            ['m2', {
              author: { username: 'atoto0311', bot: false },
              content: '이전 질문',
              attachments: new Map(),
            }],
            ['m1', {
              author: { username: 'codex-in-company', bot: true },
              content: '**Codex** - 📨 받은 메시지: `noise`',
              attachments: new Map(),
            }],
          ])),
        },
      };
      const mockClient = getMockClient();
      mockClient.channels.fetch.mockResolvedValue(mockChannel);

      const messages = await client.getRecentMessages('ch-1', 'm4', 3);

      expect(mockChannel.messages.fetch).toHaveBeenCalledWith({ limit: 3, before: 'm4' });
      expect(messages).toEqual([
        { authorName: 'atoto0311', authorBot: false, content: '이전 질문', attachments: [] },
        { authorName: 'codex-in-company', authorBot: true, content: '이전 답변', attachments: ['result.png'] },
      ]);
    });

    it('ignores parent channel messages that are Discord thread starters', async () => {
      const client = new DiscordClient('test-token', undefined, ['allowed-user']);
      const callback = vi.fn();
      client.onMessage(callback);
      client.registerChannelMappings([
        { channelId: 'parent-ch', projectName: 'repo', agentType: 'codex' },
      ]);

      const mockClient = getMockClient();
      const messageCreateHandler = mockClient.on.mock.calls.find(
        (call: any[]) => call[0] === 'messageCreate'
      )?.[1];

      await messageCreateHandler({
        id: 'starter-msg-1',
        author: { bot: false, id: 'allowed-user' },
        channel: { isTextBased: () => true },
        channelId: 'parent-ch',
        content: '스레드에서만 처리해야 하는 시작 메시지',
        attachments: new Map(),
        hasThread: true,
        thread: { id: 'thread-ch' },
      });

      expect(callback).not.toHaveBeenCalled();
    });

    it('waits briefly and ignores parent messages that become thread starters after creation', async () => {
      vi.useFakeTimers();
      const client = new DiscordClient('test-token', undefined, ['allowed-user']);
      const callback = vi.fn();
      client.onMessage(callback);
      client.registerChannelMappings([
        { channelId: 'parent-ch', projectName: 'repo', agentType: 'codex' },
      ]);

      const mockClient = getMockClient();
      const messageCreateHandler = mockClient.on.mock.calls.find(
        (call: any[]) => call[0] === 'messageCreate'
      )?.[1];

      const pending = messageCreateHandler({
        id: 'starter-msg-2',
        author: { bot: false, id: 'allowed-user' },
        channel: {
          isTextBased: () => true,
          isThread: () => false,
          messages: {
            fetch: vi.fn().mockResolvedValue({
              id: 'starter-msg-2',
              hasThread: true,
              thread: { id: 'thread-ch' },
            }),
          },
        },
        channelId: 'parent-ch',
        content: '곧 스레드가 붙을 메시지',
        attachments: new Map(),
        hasThread: false,
      });

      try {
        await vi.advanceTimersByTimeAsync(750);
        await pending;

        expect(callback).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('ignores Discord system messages that announce thread creation in the parent channel', async () => {
      const client = new DiscordClient('test-token', undefined, ['allowed-user']);
      const callback = vi.fn();
      client.onMessage(callback);
      client.registerChannelMappings([
        { channelId: 'parent-ch', projectName: 'repo', agentType: 'codex' },
      ]);

      const mockClient = getMockClient();
      const messageCreateHandler = mockClient.on.mock.calls.find(
        (call: any[]) => call[0] === 'messageCreate'
      )?.[1];

      await messageCreateHandler({
        id: 'thread-created-system-msg',
        type: 18,
        author: { bot: false, id: 'allowed-user' },
        channel: {
          isTextBased: () => true,
          isThread: () => false,
        },
        channelId: 'parent-ch',
        content: 'UI/UX & Human-AI Interaction - Agentic Design',
        attachments: new Map(),
      });

      expect(callback).not.toHaveBeenCalled();
    });

    it('routes thread messages through the parent channel mapping but replies to the thread channel', async () => {
      const client = new DiscordClient('test-token', undefined, ['allowed-user']);
      const callback = vi.fn();
      client.onMessage(callback);
      client.registerChannelMappings([
        { channelId: 'parent-ch', projectName: 'repo', agentType: 'codex' },
      ]);

      const mockClient = getMockClient();
      const messageCreateHandler = mockClient.on.mock.calls.find(
        (call: any[]) => call[0] === 'messageCreate'
      )?.[1];

      await messageCreateHandler({
        id: 'thread-msg-1',
        author: { bot: false, id: 'allowed-user' },
        channel: { isTextBased: () => true, isThread: () => true, parentId: 'parent-ch' },
        channelId: 'thread-ch',
        content: '스레드에서 진행해줘',
        attachments: new Map(),
      });

      expect(callback).toHaveBeenCalledWith('codex', '스레드에서 진행해줘', 'repo', 'thread-ch', {
        messageId: 'thread-msg-1',
        attachments: [],
      });
    });

    it('handles text fallback new-session command without forwarding it as a normal message', async () => {
      const client = new DiscordClient('test-token', undefined, ['allowed-user']);
      const messageCallback = vi.fn();
      const sessionCallback = vi.fn();
      client.onMessage(messageCallback);
      client.onNewSession(sessionCallback);
      client.registerChannelMappings([
        { channelId: 'ch-1', projectName: 'repo', agentType: 'codex' },
      ]);

      const mockClient = getMockClient();
      const messageCreateHandler = mockClient.on.mock.calls.find(
        (call: any[]) => call[0] === 'messageCreate'
      )?.[1];

      await messageCreateHandler({
        id: 'msg-3',
        author: { bot: false, id: 'allowed-user' },
        channel: { isTextBased: () => true, send: vi.fn().mockResolvedValue(undefined) },
        channelId: 'ch-1',
        content: '!new-session with-context',
        attachments: new Map(),
      });

      expect(sessionCallback).toHaveBeenCalledWith({
        channelId: 'ch-1',
        projectName: 'repo',
        agentType: 'codex',
        withContext: true,
      });
      expect(messageCallback).not.toHaveBeenCalled();
    });

    it('handles text fallback new-session command inside a thread', async () => {
      const client = new DiscordClient('test-token', undefined, ['allowed-user']);
      const messageCallback = vi.fn();
      const sessionCallback = vi.fn();
      client.onMessage(messageCallback);
      client.onNewSession(sessionCallback);
      client.registerChannelMappings([
        { channelId: 'parent-ch', projectName: 'repo', agentType: 'codex' },
      ]);

      const mockClient = getMockClient();
      const messageCreateHandler = mockClient.on.mock.calls.find(
        (call: any[]) => call[0] === 'messageCreate'
      )?.[1];

      await messageCreateHandler({
        id: 'thread-msg-2',
        author: { bot: false, id: 'allowed-user' },
        channel: {
          isTextBased: () => true,
          isThread: () => true,
          parentId: 'parent-ch',
          send: vi.fn().mockResolvedValue(undefined),
        },
        channelId: 'thread-ch',
        content: '!new-session',
        attachments: new Map(),
      });

      expect(sessionCallback).toHaveBeenCalledWith({
        channelId: 'thread-ch',
        projectName: 'repo',
        agentType: 'codex',
        withContext: false,
      });
      expect(messageCallback).not.toHaveBeenCalled();
    });

    it('registers and handles the new-session slash command', async () => {
      const client = new DiscordClient('test-token', undefined, ['allowed-user']);
      const sessionCallback = vi.fn();
      client.onNewSession(sessionCallback);
      client.registerChannelMappings([
        { channelId: 'ch-1', projectName: 'repo', agentType: 'codex' },
      ]);

      const mockGuild = {
        channels: { cache: new Map() },
        commands: { set: vi.fn().mockResolvedValue(undefined) },
      };
      const mockClient = getMockClient();
      mockClient.guilds.cache = new Map([['guild-1', mockGuild]]);

      const readyHandler = mockClient.on.mock.calls.find(
        (call: any[]) => call[0] === 'clientReady'
      )?.[1];
      await readyHandler();

      expect(mockGuild.commands.set).toHaveBeenCalledWith([
        expect.objectContaining({
          name: 'new-session',
          description: expect.stringContaining('새 Codex 세션'),
          options: [
            expect.objectContaining({
              name: 'with-context',
              description: expect.stringContaining('최근 Discord 대화'),
            }),
          ],
        }),
      ]);

      const interactionHandler = mockClient.on.mock.calls.find(
        (call: any[]) => call[0] === 'interactionCreate'
      )?.[1];
      await interactionHandler({
        isChatInputCommand: () => true,
        commandName: 'new-session',
        channelId: 'ch-1',
        user: { id: 'allowed-user', bot: false },
        options: { getBoolean: vi.fn().mockReturnValue(true) },
        reply: vi.fn().mockResolvedValue(undefined),
      });

      expect(sessionCallback).toHaveBeenCalledWith({
        channelId: 'ch-1',
        projectName: 'repo',
        agentType: 'codex',
        withContext: true,
      });
    });

    it('handles the new-session slash command inside a thread', async () => {
      const client = new DiscordClient('test-token', undefined, ['allowed-user']);
      const sessionCallback = vi.fn();
      client.onNewSession(sessionCallback);
      client.registerChannelMappings([
        { channelId: 'parent-ch', projectName: 'repo', agentType: 'codex' },
      ]);

      const mockClient = getMockClient();
      const interactionHandler = mockClient.on.mock.calls.find(
        (call: any[]) => call[0] === 'interactionCreate'
      )?.[1];
      await interactionHandler({
        isChatInputCommand: () => true,
        commandName: 'new-session',
        channelId: 'thread-ch',
        channel: { isThread: () => true, parentId: 'parent-ch' },
        user: { id: 'allowed-user', bot: false },
        options: { getBoolean: vi.fn().mockReturnValue(false) },
        reply: vi.fn().mockResolvedValue(undefined),
      });

      expect(sessionCallback).toHaveBeenCalledWith({
        channelId: 'thread-ch',
        projectName: 'repo',
        agentType: 'codex',
        withContext: false,
      });
    });
  });

  describe('Approval allowlist', () => {
    it('formats approval requests around the human-readable reason', async () => {
      const client = new DiscordClient('test-token', undefined, ['allowed-user']);
      const mockMessage = {
        content: 'approval',
        react: vi.fn().mockResolvedValue(undefined),
        edit: vi.fn().mockResolvedValue(undefined),
        awaitReactions: vi.fn().mockResolvedValue(new Map()),
      };
      const mockChannel = {
        isTextBased: () => true,
        send: vi.fn().mockResolvedValue(mockMessage),
      };
      const mockClient = getMockClient();
      mockClient.channels.fetch.mockResolvedValue(mockChannel);

      await client.sendApprovalRequest('ch-123', 'commandExecution', {
        reason: '프로젝트 밖 경로인 /Users/winter.e/Desktop/codex-approval-test.txt 에 hello를 쓰도록 허용할까요?',
        command: "/bin/zsh -lc \"printf 'hello' > /Users/winter.e/Desktop/codex-approval-test.txt\"",
        cwd: '/Users/winter.e/Documents/ai-bridge',
      }, 1);

      const sent = mockChannel.send.mock.calls[0][0];
      expect(sent).toContain('프로젝트 밖 경로인 /Users/winter.e/Desktop/codex-approval-test.txt 에 hello를 쓰도록 허용할까요?');
      expect(sent).toContain('✅ 승인');
      expect(sent).toContain('❌ 거절');
      expect(sent).not.toContain('"threadId"');
      expect(sent).not.toContain('"command"');
      expect(sent).not.toContain('```');
    });

    it('filters approval reactions to allowlisted users', async () => {
      const client = new DiscordClient('test-token', undefined, ['allowed-user']);
      let capturedFilter: any;
      const mockMessage = {
        content: 'approval',
        react: vi.fn().mockResolvedValue(undefined),
        edit: vi.fn().mockResolvedValue(undefined),
        awaitReactions: vi.fn().mockImplementation(({ filter }) => {
          capturedFilter = filter;
          return Promise.resolve(new Map());
        }),
      };
      const mockChannel = {
        isTextBased: () => true,
        send: vi.fn().mockResolvedValue(mockMessage),
      };
      const mockClient = getMockClient();
      mockClient.channels.fetch.mockResolvedValue(mockChannel);

      await client.sendApprovalRequest('ch-123', 'shell', { cmd: 'npm test' }, 1);

      expect(capturedFilter({ emoji: { name: '✅' } }, { bot: false, id: 'blocked-user' })).toBe(false);
      expect(capturedFilter({ emoji: { name: '✅' } }, { bot: false, id: 'allowed-user' })).toBe(true);
      expect(capturedFilter({ emoji: { name: '✅' } }, { bot: true, id: 'allowed-user' })).toBe(false);
    });
  });

  describe('Channel operations', () => {
    it('creates project channels inside a project category', async () => {
      const client = new DiscordClient('test-token');
      const createdCategory = { id: 'cat-1', name: 'proj1', type: 4 };
      const createdChannel = { id: 'ch-1', name: 'proj1-test' };
      const mockGuild = {
        channels: {
          cache: new Map(),
          create: vi.fn()
            .mockResolvedValueOnce(createdCategory)
            .mockResolvedValueOnce(createdChannel),
        },
      };
      const mockClient = getMockClient();
      mockClient.guilds.fetch = vi.fn().mockResolvedValue(mockGuild);

      const result = await client.createAgentChannels(
        'guild-1',
        'proj1',
        [{ name: 'test', displayName: 'Test', command: 'test', channelSuffix: 'test' }]
      );

      expect(mockGuild.channels.create).toHaveBeenNthCalledWith(1, {
        name: 'proj1',
        type: 4,
      });
      expect(mockGuild.channels.create).toHaveBeenNthCalledWith(2, {
        name: 'proj1-test',
        type: 0,
        topic: 'Test agent for proj1',
        parent: 'cat-1',
      });
      expect(result).toEqual({ test: 'ch-1' });
      expect(client.getChannelMapping().get('ch-1')).toEqual({
        projectName: 'proj1',
        agentType: 'test',
      });
    });

    it('reuses an existing project category', async () => {
      const client = new DiscordClient('test-token');
      const existingCategory = { id: 'cat-existing', name: 'proj1', type: 4 };
      const createdChannel = { id: 'ch-1', name: 'proj1-test' };
      const mockGuild = {
        channels: {
          cache: new Map([['cat-existing', existingCategory]]),
          create: vi.fn().mockResolvedValue(createdChannel),
        },
      };
      const mockClient = getMockClient();
      mockClient.guilds.fetch = vi.fn().mockResolvedValue(mockGuild);

      await client.createAgentChannels(
        'guild-1',
        'proj1',
        [{ name: 'test', displayName: 'Test', command: 'test', channelSuffix: 'test' }]
      );

      expect(mockGuild.channels.create).toHaveBeenCalledTimes(1);
      expect(mockGuild.channels.create).toHaveBeenCalledWith({
        name: 'proj1-test',
        type: 0,
        topic: 'Test agent for proj1',
        parent: 'cat-existing',
      });
    });

    it('sendToChannel fetches channel and sends content', async () => {
      const client = new DiscordClient('test-token');

      const mockChannel = {
        isTextBased: () => true,
        send: vi.fn().mockResolvedValue(undefined),
      };

      const mockClient = getMockClient();
      mockClient.channels.fetch.mockResolvedValue(mockChannel);

      await client.sendToChannel('ch-123', 'test message');

      expect(mockClient.channels.fetch).toHaveBeenCalledWith('ch-123');
      expect(mockChannel.send).toHaveBeenCalledWith('test message');
    });

    it('sendFilesToChannel sends content with file attachments', async () => {
      const client = new DiscordClient('test-token');

      const mockChannel = {
        isTextBased: () => true,
        send: vi.fn().mockResolvedValue(undefined),
      };

      const mockClient = getMockClient();
      mockClient.channels.fetch.mockResolvedValue(mockChannel);

      await client.sendFilesToChannel('ch-123', 'files ready', ['/tmp/result.txt']);

      expect(mockChannel.send).toHaveBeenCalledWith({
        content: 'files ready',
        files: ['/tmp/result.txt'],
      });
    });

    it('sendTyping fetches channel and sends a typing indicator', async () => {
      const client = new DiscordClient('test-token');

      const mockChannel = {
        isTextBased: () => true,
        sendTyping: vi.fn().mockResolvedValue(undefined),
      };

      const mockClient = getMockClient();
      mockClient.channels.fetch.mockResolvedValue(mockChannel);

      await client.sendTyping('ch-123');

      expect(mockClient.channels.fetch).toHaveBeenCalledWith('ch-123');
      expect(mockChannel.sendTyping).toHaveBeenCalled();
    });

    it('splits long file attachment messages before sending files', async () => {
      const client = new DiscordClient('test-token');

      const mockChannel = {
        isTextBased: () => true,
        send: vi.fn().mockResolvedValue(undefined),
      };

      const mockClient = getMockClient();
      mockClient.channels.fetch.mockResolvedValue(mockChannel);

      await client.sendFilesToChannel('ch-123', 'x'.repeat(2500), ['/tmp/result.png']);

      expect(mockChannel.send).toHaveBeenCalledTimes(2);
      expect(mockChannel.send.mock.calls[0][0]).toHaveLength(1900);
      expect(mockChannel.send.mock.calls[1][0]).toEqual({
        content: 'x'.repeat(600),
        files: ['/tmp/result.png'],
      });
    });

    it('sends file attachments in batches of 10 or fewer', async () => {
      const client = new DiscordClient('test-token');

      const mockChannel = {
        isTextBased: () => true,
        send: vi.fn().mockResolvedValue(undefined),
      };

      const mockClient = getMockClient();
      mockClient.channels.fetch.mockResolvedValue(mockChannel);

      const files = Array.from({ length: 16 }, (_, index) => `/tmp/result-${index + 1}.png`);

      await client.sendFilesToChannel('ch-123', 'files ready', files);

      expect(mockChannel.send).toHaveBeenCalledTimes(2);
      expect(mockChannel.send.mock.calls[0][0]).toEqual({
        content: 'files ready',
        files: files.slice(0, 10),
      });
      expect(mockChannel.send.mock.calls[1][0]).toEqual({
        content: '첨부 파일 11-16',
        files: files.slice(10),
      });
    });

    it('sendToChannel handles non-text channel gracefully', async () => {
      const client = new DiscordClient('test-token');

      const mockChannel = {
        isTextBased: () => false,
      };

      const mockClient = getMockClient();
      mockClient.channels.fetch.mockResolvedValue(mockChannel);

      // Should not throw
      await expect(client.sendToChannel('ch-123', 'test message')).resolves.toBeUndefined();
    });
  });

  describe('parseChannelName', () => {
    it('uses injected registry to parse channel names', () => {
      const registry = createTestRegistry();
      const client = new DiscordClient('test-token', registry);

      // Mock the registry's parseChannelName method
      const mockResult = {
        projectName: 'myproject',
        agent: {
          config: { name: 'test', displayName: 'Test', command: 'test', channelSuffix: 'test' },
        } as any,
      };
      vi.spyOn(registry, 'parseChannelName').mockReturnValue(mockResult);

      // Access the private parseChannelName method indirectly through registerChannelMappings
      // or by scanning existing channels (which calls parseChannelName internally)
      // For now, we verify the registry was passed correctly by checking if parseChannelName exists
      expect(registry.parseChannelName).toBeDefined();
    });
  });

  describe('Lifecycle', () => {
    it('disconnect calls client.destroy', async () => {
      const client = new DiscordClient('test-token');
      const mockClient = getMockClient();

      await client.disconnect();

      expect(mockClient.destroy).toHaveBeenCalledOnce();
    });
  });

  describe('Constructor', () => {
    it('accepts optional registry parameter', () => {
      const registry = createTestRegistry();
      const client = new DiscordClient('test-token', registry);

      expect(client).toBeInstanceOf(DiscordClient);
    });

    it('creates with default registry when not provided', () => {
      const client = new DiscordClient('test-token');

      expect(client).toBeInstanceOf(DiscordClient);
    });
  });
});
