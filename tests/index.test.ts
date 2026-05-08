/**
 * Tests for AgentBridge main class
 */

import { AgentBridge } from '../src/index.js';
import type { IStateManager } from '../src/types/interfaces.js';
import type { BridgeConfig, ProjectState } from '../src/types/index.js';

// Mock helpers
function createMockConfig(): BridgeConfig {
  return {
    discord: { token: 'test-token' },
    tmux: { sessionPrefix: 'agent-' },
    hookServerPort: 19999,
  };
}

function createMockStateManager(): IStateManager {
  return {
    reload: vi.fn(),
    getProject: vi.fn(),
    setProject: vi.fn(),
    removeProject: vi.fn(),
    listProjects: vi.fn().mockReturnValue([]),
    getGuildId: vi.fn().mockReturnValue('guild-123'),
    setGuildId: vi.fn(),
    updateLastActive: vi.fn(),
    findProjectByChannel: vi.fn(),
    getAgentTypeByChannel: vi.fn(),
  };
}

function createMockDiscord() {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    onMessage: vi.fn(),
    registerChannelMappings: vi.fn(),
    sendToChannel: vi.fn().mockResolvedValue(undefined),
    getGuilds: vi.fn().mockReturnValue([]),
    getChannelMapping: vi.fn().mockReturnValue(new Map()),
    createAgentChannels: vi.fn().mockResolvedValue({ claude: 'ch-123' }),
    deleteChannel: vi.fn(),
    sendApprovalRequest: vi.fn(),
    sendQuestionWithButtons: vi.fn(),
    setTargetChannel: vi.fn(),
    sendMessage: vi.fn(),
    getRecentMessages: vi.fn().mockResolvedValue([]),
    onNewSession: vi.fn(),
  } as any;
}

function createMockTmux() {
  return {
    getOrCreateSession: vi.fn().mockReturnValue('agent-test'),
    createWindow: vi.fn(),
    sendKeysToWindow: vi.fn(),
    capturePaneFromWindow: vi.fn(),
    startAgentInWindow: vi.fn(),
    setSessionEnv: vi.fn(),
    listSessions: vi.fn().mockReturnValue([]),
    createSession: vi.fn(),
    sendKeys: vi.fn(),
    capturePane: vi.fn(),
    sessionExists: vi.fn(),
    listWindows: vi.fn(),
  } as any;
}

function createMockRegistry() {
  const mockAdapter = {
    config: { name: 'claude', displayName: 'Claude Code', command: 'claude', channelSuffix: 'claude' },
    getStartCommand: vi.fn().mockReturnValue('cd "/test" && claude'),
    matchesChannel: vi.fn(),
    isInstalled: vi.fn().mockReturnValue(true),
  };
  return {
    get: vi.fn().mockReturnValue(mockAdapter),
    getAll: vi.fn().mockReturnValue([mockAdapter]),
    register: vi.fn(),
    getByChannelSuffix: vi.fn(),
    parseChannelName: vi.fn(),
    _mockAdapter: mockAdapter,
  } as any;
}

describe('AgentBridge', () => {
  describe('sanitizeInput', () => {
    it('returns null for empty string', () => {
      const bridge = new AgentBridge({
        discord: createMockDiscord(),
        tmux: createMockTmux(),
        stateManager: createMockStateManager(),
        registry: createMockRegistry(),
        config: createMockConfig(),
      });

      expect(bridge.sanitizeInput('')).toBeNull();
    });

    it('returns null for whitespace-only string', () => {
      const bridge = new AgentBridge({
        discord: createMockDiscord(),
        tmux: createMockTmux(),
        stateManager: createMockStateManager(),
        registry: createMockRegistry(),
        config: createMockConfig(),
      });

      expect(bridge.sanitizeInput('   \t\n  ')).toBeNull();
    });

    it('returns null for string > 10000 chars', () => {
      const bridge = new AgentBridge({
        discord: createMockDiscord(),
        tmux: createMockTmux(),
        stateManager: createMockStateManager(),
        registry: createMockRegistry(),
        config: createMockConfig(),
      });

      const longString = 'a'.repeat(10001);
      expect(bridge.sanitizeInput(longString)).toBeNull();
    });

    it('strips null bytes', () => {
      const bridge = new AgentBridge({
        discord: createMockDiscord(),
        tmux: createMockTmux(),
        stateManager: createMockStateManager(),
        registry: createMockRegistry(),
        config: createMockConfig(),
      });

      const input = 'hello\0world\0test';
      expect(bridge.sanitizeInput(input)).toBe('helloworldtest');
    });

    it('returns valid content unchanged', () => {
      const bridge = new AgentBridge({
        discord: createMockDiscord(),
        tmux: createMockTmux(),
        stateManager: createMockStateManager(),
        registry: createMockRegistry(),
        config: createMockConfig(),
      });

      const validContent = 'This is valid content with unicode 한글 emojis 🚀';
      expect(bridge.sanitizeInput(validContent)).toBe(validContent);
    });
  });

  describe('constructor', () => {
    it('creates with all dependencies injected', () => {
      const mockDiscord = createMockDiscord();
      const mockTmux = createMockTmux();
      const mockStateManager = createMockStateManager();
      const mockRegistry = createMockRegistry();
      const mockConfig = createMockConfig();

      const bridge = new AgentBridge({
        discord: mockDiscord,
        tmux: mockTmux,
        stateManager: mockStateManager,
        registry: mockRegistry,
        config: mockConfig,
      });

      expect(bridge).toBeInstanceOf(AgentBridge);
    });

    it('creates with mocked dependencies', () => {
      // Just verify the class is constructable with mocked deps
      const bridge = new AgentBridge({
        discord: createMockDiscord(),
        tmux: createMockTmux(),
        stateManager: createMockStateManager(),
        registry: createMockRegistry(),
        config: createMockConfig(),
      });

      expect(bridge).toBeInstanceOf(AgentBridge);
      expect(typeof bridge.sanitizeInput).toBe('function');
    });
  });

  describe('start', () => {
    let bridge: AgentBridge;
    let mockDiscord: any;
    let mockStateManager: any;

    beforeEach(() => {
      mockDiscord = createMockDiscord();
      mockStateManager = createMockStateManager();
      bridge = new AgentBridge({
        discord: mockDiscord,
        tmux: createMockTmux(),
        stateManager: mockStateManager,
        registry: createMockRegistry(),
        config: createMockConfig(),
      });
    });

    afterEach(async () => {
      await bridge.stop();
    });

    it('connects discord and registers channel mappings from state', async () => {
      const projects: ProjectState[] = [
        {
          projectName: 'test-project',
          projectPath: '/test',
          tmuxSession: 'agent-test',
          discordChannels: { claude: 'ch-123', cursor: 'ch-456' },
          agents: { claude: true },
          createdAt: new Date(),
          lastActive: new Date(),
        },
      ];
      mockStateManager.listProjects.mockReturnValue(projects);

      await bridge.start();

      expect(mockDiscord.connect).toHaveBeenCalledOnce();
      expect(mockDiscord.registerChannelMappings).toHaveBeenCalledWith([
        { channelId: 'ch-123', projectName: 'test-project', agentType: 'claude' },
        { channelId: 'ch-456', projectName: 'test-project', agentType: 'cursor' },
      ]);
    });

    it('sets up message callback via discord.onMessage', async () => {
      await bridge.start();

      expect(mockDiscord.onMessage).toHaveBeenCalledOnce();
      expect(mockDiscord.onMessage).toHaveBeenCalledWith(expect.any(Function));
    });

    it('routes Codex messages through app-server transport when configured', async () => {
      const mockTmux = createMockTmux();
      const appServer = {
        sendMessage: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn(),
      };
      const codexAdapter = {
        config: { name: 'codex', displayName: 'Codex', command: 'codex', channelSuffix: 'codex' },
        getStartCommand: vi.fn().mockReturnValue('cd "/test" && codex'),
        matchesChannel: vi.fn(),
        isInstalled: vi.fn().mockReturnValue(true),
      };
      const registry = {
        get: vi.fn().mockReturnValue(codexAdapter),
        getAll: vi.fn().mockReturnValue([codexAdapter]),
        register: vi.fn(),
        getByChannelSuffix: vi.fn(),
        parseChannelName: vi.fn(),
      } as any;
      const project: ProjectState = {
        projectName: 'repo',
        projectPath: '/repo',
        tmuxSession: 'agent-repo',
        discordChannels: { codex: 'channel-1' },
        agents: { codex: true },
        createdAt: new Date(),
        lastActive: new Date(),
      };
      mockStateManager.getProject.mockReturnValue(project);
      bridge = new AgentBridge({
        discord: mockDiscord,
        tmux: mockTmux,
        stateManager: mockStateManager,
        registry,
        config: { ...createMockConfig(), codexTransport: 'app-server' },
        codexAppServer: appServer as any,
      });

      await bridge.start();
      const callback = mockDiscord.onMessage.mock.calls[0][0];
      await callback('codex', '안녕?', 'repo', 'channel-1', { messageId: 'm1', attachments: [] });

      expect(appServer.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
        projectName: 'repo',
        projectPath: '/repo',
        channelId: 'channel-1',
        content: '안녕?',
        discord: mockDiscord,
      }));
      expect(mockTmux.sendKeysToWindow).not.toHaveBeenCalled();
    });

    it('passes recent Discord channel context to new Codex app-server threads', async () => {
      const mockTmux = createMockTmux();
      const appServer = {
        sendMessage: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn(),
      };
      const codexAdapter = {
        config: { name: 'codex', displayName: 'Codex', command: 'codex', channelSuffix: 'codex' },
        getStartCommand: vi.fn().mockReturnValue('cd "/test" && codex'),
        matchesChannel: vi.fn(),
        isInstalled: vi.fn().mockReturnValue(true),
      };
      const registry = {
        get: vi.fn().mockReturnValue(codexAdapter),
        getAll: vi.fn().mockReturnValue([codexAdapter]),
        register: vi.fn(),
        getByChannelSuffix: vi.fn(),
        parseChannelName: vi.fn(),
      } as any;
      const project: ProjectState = {
        projectName: 'repo',
        projectPath: '/repo',
        tmuxSession: 'agent-repo',
        discordChannels: { codex: 'channel-1' },
        agents: { codex: true },
        createdAt: new Date(),
        lastActive: new Date(),
      };
      mockDiscord.getRecentMessages.mockResolvedValue([
        { authorName: 'atoto0311', authorBot: false, content: '이전 질문', attachments: [] },
        { authorName: 'codex-in-company', authorBot: true, content: '이전 답변', attachments: ['result.png'] },
      ]);
      mockStateManager.getProject.mockReturnValue(project);
      bridge = new AgentBridge({
        discord: mockDiscord,
        tmux: mockTmux,
        stateManager: mockStateManager,
        registry,
        config: { ...createMockConfig(), codexTransport: 'app-server', discordContextMessages: 2 },
        codexAppServer: appServer as any,
      });

      await bridge.start();
      const callback = mockDiscord.onMessage.mock.calls[0][0];
      await callback('codex', '계속해줘', 'repo', 'channel-1', { messageId: 'm2', attachments: [] });

      expect(mockDiscord.getRecentMessages).toHaveBeenCalledWith('channel-1', 'm2', 2);
      expect(appServer.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
        recentMessages: [
          { authorName: 'atoto0311', authorBot: false, content: '이전 질문', attachments: [] },
          { authorName: 'codex-in-company', authorBot: true, content: '이전 답변', attachments: ['result.png'] },
        ],
      }));
    });

    it('resets a Codex app-server session from Discord new-session command without context by default', async () => {
      const mockTmux = createMockTmux();
      const appServer = {
        sendMessage: vi.fn().mockResolvedValue(undefined),
        resetThread: vi.fn(),
        stop: vi.fn(),
      };
      const codexAdapter = {
        config: { name: 'codex', displayName: 'Codex', command: 'codex', channelSuffix: 'codex' },
        getStartCommand: vi.fn().mockReturnValue('cd "/test" && codex'),
        matchesChannel: vi.fn(),
        isInstalled: vi.fn().mockReturnValue(true),
      };
      const registry = {
        get: vi.fn().mockReturnValue(codexAdapter),
        getAll: vi.fn().mockReturnValue([codexAdapter]),
        register: vi.fn(),
        getByChannelSuffix: vi.fn(),
        parseChannelName: vi.fn(),
      } as any;
      const project: ProjectState = {
        projectName: 'repo',
        projectPath: '/repo',
        tmuxSession: 'agent-repo',
        discordChannels: { codex: 'channel-1' },
        agents: { codex: true },
        createdAt: new Date(),
        lastActive: new Date(),
      };
      mockStateManager.getProject.mockReturnValue(project);
      bridge = new AgentBridge({
        discord: mockDiscord,
        tmux: mockTmux,
        stateManager: mockStateManager,
        registry,
        config: { ...createMockConfig(), codexTransport: 'app-server', discordContextMessages: 2 },
        codexAppServer: appServer as any,
      });

      await bridge.start();
      const sessionCallback = mockDiscord.onNewSession.mock.calls[0][0];
      await sessionCallback({
        channelId: 'channel-1',
        projectName: 'repo',
        agentType: 'codex',
        withContext: false,
      });

      const messageCallback = mockDiscord.onMessage.mock.calls[0][0];
      await messageCallback('codex', '새로 시작하자', 'repo', 'channel-1', { messageId: 'm3', attachments: [] });

      expect(appServer.resetThread).toHaveBeenCalledWith('repo:channel-1');
      expect(mockDiscord.getRecentMessages).not.toHaveBeenCalled();
      expect(appServer.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
        recentMessages: [],
      }));
    });

    it('resets a Codex app-server session and includes recent context when requested', async () => {
      const mockTmux = createMockTmux();
      const appServer = {
        sendMessage: vi.fn().mockResolvedValue(undefined),
        resetThread: vi.fn(),
        stop: vi.fn(),
      };
      const codexAdapter = {
        config: { name: 'codex', displayName: 'Codex', command: 'codex', channelSuffix: 'codex' },
        getStartCommand: vi.fn().mockReturnValue('cd "/test" && codex'),
        matchesChannel: vi.fn(),
        isInstalled: vi.fn().mockReturnValue(true),
      };
      const registry = {
        get: vi.fn().mockReturnValue(codexAdapter),
        getAll: vi.fn().mockReturnValue([codexAdapter]),
        register: vi.fn(),
        getByChannelSuffix: vi.fn(),
        parseChannelName: vi.fn(),
      } as any;
      const project: ProjectState = {
        projectName: 'repo',
        projectPath: '/repo',
        tmuxSession: 'agent-repo',
        discordChannels: { codex: 'channel-1' },
        agents: { codex: true },
        createdAt: new Date(),
        lastActive: new Date(),
      };
      mockStateManager.getProject.mockReturnValue(project);
      mockDiscord.getRecentMessages.mockResolvedValue([
        { authorName: 'atoto0311', authorBot: false, content: '직전 얘기', attachments: [] },
      ]);
      bridge = new AgentBridge({
        discord: mockDiscord,
        tmux: mockTmux,
        stateManager: mockStateManager,
        registry,
        config: { ...createMockConfig(), codexTransport: 'app-server', discordContextMessages: 2 },
        codexAppServer: appServer as any,
      });

      await bridge.start();
      const sessionCallback = mockDiscord.onNewSession.mock.calls[0][0];
      await sessionCallback({
        channelId: 'channel-1',
        projectName: 'repo',
        agentType: 'codex',
        withContext: true,
      });

      const messageCallback = mockDiscord.onMessage.mock.calls[0][0];
      await messageCallback('codex', '맥락 이어서 새로 시작', 'repo', 'channel-1', { messageId: 'm4', attachments: [] });

      expect(appServer.resetThread).toHaveBeenCalledWith('repo:channel-1');
      expect(mockDiscord.getRecentMessages).toHaveBeenCalledWith('channel-1', 'm4', 2);
      expect(appServer.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
        recentMessages: [
          { authorName: 'atoto0311', authorBot: false, content: '직전 얘기', attachments: [] },
        ],
      }));
    });

    it('uses the Discord channel or thread id to isolate Codex app-server sessions', async () => {
      const mockTmux = createMockTmux();
      const appServer = {
        sendMessage: vi.fn().mockResolvedValue(undefined),
        resetThread: vi.fn(),
        stop: vi.fn(),
      };
      const codexAdapter = {
        config: { name: 'codex', displayName: 'Codex', command: 'codex', channelSuffix: 'codex' },
        getStartCommand: vi.fn().mockReturnValue('cd "/test" && codex'),
        matchesChannel: vi.fn(),
        isInstalled: vi.fn().mockReturnValue(true),
      };
      const registry = {
        get: vi.fn().mockReturnValue(codexAdapter),
        getAll: vi.fn().mockReturnValue([codexAdapter]),
        register: vi.fn(),
        getByChannelSuffix: vi.fn(),
        parseChannelName: vi.fn(),
      } as any;
      const project: ProjectState = {
        projectName: 'repo',
        projectPath: '/repo',
        tmuxSession: 'agent-repo',
        discordChannels: { codex: 'main-channel' },
        agents: { codex: true },
        createdAt: new Date(),
        lastActive: new Date(),
      };
      mockStateManager.getProject.mockReturnValue(project);
      bridge = new AgentBridge({
        discord: mockDiscord,
        tmux: mockTmux,
        stateManager: mockStateManager,
        registry,
        config: { ...createMockConfig(), codexTransport: 'app-server' },
        codexAppServer: appServer as any,
      });

      await bridge.start();
      const callback = mockDiscord.onMessage.mock.calls[0][0];
      await callback('codex', '메인 채널', 'repo', 'main-channel', { messageId: 'm-main', attachments: [] });
      await callback('codex', '스레드 작업', 'repo', 'thread-channel', { messageId: 'm-thread', attachments: [] });

      expect(appServer.sendMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({
        projectName: 'repo',
        sessionKey: 'repo:main-channel',
        channelId: 'main-channel',
      }));
      expect(appServer.sendMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({
        projectName: 'repo',
        sessionKey: 'repo:thread-channel',
        channelId: 'thread-channel',
      }));
    });

    it('resets only the Codex app-server session for the requesting thread', async () => {
      const mockTmux = createMockTmux();
      const appServer = {
        sendMessage: vi.fn().mockResolvedValue(undefined),
        resetThread: vi.fn(),
        stop: vi.fn(),
      };
      const codexAdapter = {
        config: { name: 'codex', displayName: 'Codex', command: 'codex', channelSuffix: 'codex' },
        getStartCommand: vi.fn().mockReturnValue('cd "/test" && codex'),
        matchesChannel: vi.fn(),
        isInstalled: vi.fn().mockReturnValue(true),
      };
      const registry = {
        get: vi.fn().mockReturnValue(codexAdapter),
        getAll: vi.fn().mockReturnValue([codexAdapter]),
        register: vi.fn(),
        getByChannelSuffix: vi.fn(),
        parseChannelName: vi.fn(),
      } as any;
      mockStateManager.getProject.mockReturnValue({
        projectName: 'repo',
        projectPath: '/repo',
        tmuxSession: 'agent-repo',
        discordChannels: { codex: 'main-channel' },
        agents: { codex: true },
        createdAt: new Date(),
        lastActive: new Date(),
      });
      bridge = new AgentBridge({
        discord: mockDiscord,
        tmux: mockTmux,
        stateManager: mockStateManager,
        registry,
        config: { ...createMockConfig(), codexTransport: 'app-server' },
        codexAppServer: appServer as any,
      });

      await bridge.start();
      const sessionCallback = mockDiscord.onNewSession.mock.calls[0][0];
      await sessionCallback({
        channelId: 'thread-channel',
        projectName: 'repo',
        agentType: 'codex',
        withContext: false,
      });

      expect(appServer.resetThread).toHaveBeenCalledWith('repo:thread-channel');
    });
  });

  describe('setupProject', () => {
    let bridge: AgentBridge;
    let mockDiscord: any;
    let mockTmux: any;
    let mockStateManager: any;
    let mockRegistry: any;

    beforeEach(() => {
      mockDiscord = createMockDiscord();
      mockTmux = createMockTmux();
      mockStateManager = createMockStateManager();
      mockRegistry = createMockRegistry();
      bridge = new AgentBridge({
        discord: mockDiscord,
        tmux: mockTmux,
        stateManager: mockStateManager,
        registry: mockRegistry,
        config: createMockConfig(),
      });
    });

    it('creates tmux session, discord channel, saves state', async () => {
      const result = await bridge.setupProject(
        'test-project',
        '/test/path',
        { claude: true }
      );

      expect(mockTmux.getOrCreateSession).toHaveBeenCalledWith('test-project');
      expect(mockDiscord.createAgentChannels).toHaveBeenCalledWith(
        'guild-123',
        'test-project',
        [mockRegistry._mockAdapter.config],
        'test-project-claude'
      );
      expect(mockStateManager.setProject).toHaveBeenCalledWith(
        expect.objectContaining({
          projectName: 'test-project',
          projectPath: '/test/path',
          tmuxSession: 'agent-test',
        })
      );
      expect(result).toEqual({
        channelName: 'test-project-claude',
        channelId: 'ch-123',
        agentName: 'Claude Code',
        tmuxSession: 'agent-test',
      });
    });

    it('throws when no guild ID configured', async () => {
      mockStateManager.getGuildId.mockReturnValue(undefined);

      await expect(
        bridge.setupProject('test-project', '/test/path', { claude: true })
      ).rejects.toThrow('Server ID not configured');
    });

    it('throws when no agent specified', async () => {
      mockRegistry.getAll.mockReturnValue([]);

      await expect(
        bridge.setupProject('test-project', '/test/path', {})
      ).rejects.toThrow('No agent specified');
    });

    it('does not start a tmux Codex window when app-server transport is configured', async () => {
      const codexAdapter = {
        config: { name: 'codex', displayName: 'Codex', command: 'codex', channelSuffix: 'codex' },
        getStartCommand: vi.fn().mockReturnValue('cd "/test/path" && codex'),
        matchesChannel: vi.fn(),
        isInstalled: vi.fn().mockReturnValue(true),
      };
      mockRegistry.getAll.mockReturnValue([codexAdapter]);
      mockDiscord.createAgentChannels.mockResolvedValue({ codex: 'ch-codex' });
      bridge = new AgentBridge({
        discord: mockDiscord,
        tmux: mockTmux,
        stateManager: mockStateManager,
        registry: mockRegistry,
        config: { ...createMockConfig(), codexTransport: 'app-server' },
        codexAppServer: { sendMessage: vi.fn(), stop: vi.fn() } as any,
      });

      await bridge.setupProject('test-project', '/test/path', { codex: true });

      expect(mockTmux.startAgentInWindow).not.toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('stops poller and disconnects discord', async () => {
      const mockDiscord = createMockDiscord();
      const bridge = new AgentBridge({
        discord: mockDiscord,
        tmux: createMockTmux(),
        stateManager: createMockStateManager(),
        registry: createMockRegistry(),
        config: createMockConfig(),
      });

      // Start first to create HTTP server
      await bridge.start();

      // Now stop
      await bridge.stop();

      expect(mockDiscord.disconnect).toHaveBeenCalledOnce();
    });
  });
});
