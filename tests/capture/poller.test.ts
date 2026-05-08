/**
 * Tests for CapturePoller class
 */

import { CapturePoller } from '../../src/capture/poller.js';
import type { IStateManager } from '../../src/types/interfaces.js';
import type { ProjectState } from '../../src/state/index.js';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

function makeProject(name: string, channelId: string): ProjectState {
  return {
    projectName: name,
    projectPath: `/path/${name}`,
    tmuxSession: `agent-${name}`,
    discordChannels: { claude: channelId },
    agents: { claude: true },
    createdAt: new Date(),
    lastActive: new Date(),
  };
}

function createMockStateManager(projects: ProjectState[] = []): IStateManager {
  return {
    reload: vi.fn(),
    getProject: vi.fn(),
    setProject: vi.fn(),
    removeProject: vi.fn(),
    listProjects: vi.fn().mockReturnValue(projects),
    getGuildId: vi.fn(),
    setGuildId: vi.fn(),
    updateLastActive: vi.fn(),
    findProjectByChannel: vi.fn(),
    getAgentTypeByChannel: vi.fn(),
  };
}

function createMockTmux() {
  return {
    capturePaneFromWindow: vi.fn().mockReturnValue('some output'),
    listSessions: vi.fn(),
    createSession: vi.fn(),
    sendKeys: vi.fn(),
    capturePane: vi.fn(),
    sessionExists: vi.fn(),
    getOrCreateSession: vi.fn(),
    createWindow: vi.fn(),
    listWindows: vi.fn(),
    sendKeysToWindow: vi.fn(),
    startAgentInWindow: vi.fn(),
    setSessionEnv: vi.fn(),
  } as any;
}

function createMockDiscord() {
  return {
    sendToChannel: vi.fn().mockResolvedValue(undefined),
    sendFilesToChannel: vi.fn().mockResolvedValue(undefined),
    connect: vi.fn(),
    disconnect: vi.fn(),
    onMessage: vi.fn(),
    registerChannelMappings: vi.fn(),
    getGuilds: vi.fn(),
    getChannelMapping: vi.fn(),
    createAgentChannels: vi.fn(),
    deleteChannel: vi.fn(),
    sendApprovalRequest: vi.fn(),
    sendQuestionWithButtons: vi.fn(),
    setTargetChannel: vi.fn(),
    sendMessage: vi.fn(),
  } as any;
}

describe('CapturePoller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('start() sets up interval timer', () => {
    const tmux = createMockTmux();
    const discord = createMockDiscord();
    const stateManager = createMockStateManager();

    const poller = new CapturePoller(tmux, discord, 30000, stateManager);
    poller.start();

    expect(stateManager.listProjects).toHaveBeenCalled();
  });

  it('stop() clears interval timer', () => {
    const tmux = createMockTmux();
    const discord = createMockDiscord();
    const stateManager = createMockStateManager();

    const poller = new CapturePoller(tmux, discord, 30000, stateManager);
    poller.start();
    poller.stop();

    const callsBefore = stateManager.listProjects.mock.calls.length;
    vi.advanceTimersByTime(30000);
    const callsAfter = stateManager.listProjects.mock.calls.length;

    expect(callsAfter).toBe(callsBefore);
  });

  it('stop() when not started does nothing', () => {
    const tmux = createMockTmux();
    const discord = createMockDiscord();
    const stateManager = createMockStateManager();

    const poller = new CapturePoller(tmux, discord, 30000, stateManager);

    expect(() => poller.stop()).not.toThrow();
  });

  it('polls all projects from stateManager', async () => {
    const project1 = makeProject('proj1', 'channel1');
    const project2 = makeProject('proj2', 'channel2');
    const stateManager = createMockStateManager([project1, project2]);
    const tmux = createMockTmux();
    const discord = createMockDiscord();

    const poller = new CapturePoller(tmux, discord, 30000, stateManager);
    await (poller as any).pollAll();

    expect(tmux.capturePaneFromWindow).toHaveBeenCalledWith('agent-proj1', 'claude');
    expect(tmux.capturePaneFromWindow).toHaveBeenCalledWith('agent-proj2', 'claude');
  });

  it('skips disabled agents', async () => {
    const project = makeProject('proj1', 'channel1');
    project.agents = { claude: false, gemini: true };
    project.discordChannels = { claude: 'channel1', gemini: 'channel2' };

    const stateManager = createMockStateManager([project]);
    const tmux = createMockTmux();
    const discord = createMockDiscord();

    const poller = new CapturePoller(tmux, discord, 30000, stateManager);
    await (poller as any).pollAll();

    expect(tmux.capturePaneFromWindow).not.toHaveBeenCalledWith('agent-proj1', 'claude');
    expect(tmux.capturePaneFromWindow).toHaveBeenCalledWith('agent-proj1', 'gemini');
  });

  it('skips agents configured for non-tmux transport', async () => {
    const project = makeProject('proj1', 'channel1');
    project.agents = { codex: true };
    project.discordChannels = { codex: 'channel1' };

    const stateManager = createMockStateManager([project]);
    const tmux = createMockTmux();
    const discord = createMockDiscord();

    const poller = new CapturePoller(tmux, discord, 30000, stateManager, new Set(['codex']));
    await (poller as any).pollAll();

    expect(tmux.capturePaneFromWindow).not.toHaveBeenCalled();
  });

  it('uses first capture as baseline without sending startup output', async () => {
    const project = makeProject('proj1', 'channel1');
    const stateManager = createMockStateManager([project]);
    const tmux = createMockTmux();
    tmux.capturePaneFromWindow.mockReturnValue('codex startup banner');
    const discord = createMockDiscord();

    const poller = new CapturePoller(tmux, discord, 30000, stateManager);

    await (poller as any).pollAll();

    expect(discord.sendToChannel).not.toHaveBeenCalled();
  });

  it('sends "completed" notification when content stabilizes after working', async () => {
    const project = makeProject('proj1', 'channel1');
    const stateManager = createMockStateManager([project]);
    const tmux = createMockTmux();
    const discord = createMockDiscord();

    const poller = new CapturePoller(tmux, discord, 30000, stateManager);

    // First poll - baseline only
    tmux.capturePaneFromWindow.mockReturnValue('startup banner');
    await (poller as any).pollAll();
    expect(discord.sendToChannel).not.toHaveBeenCalled();

    // Second poll - working
    tmux.capturePaneFromWindow.mockReturnValue('startup banner\noutput v1');
    await (poller as any).pollAll();
    expect(discord.sendToChannel).toHaveBeenCalledWith('channel1', '⚡ 작업 중...');

    discord.sendToChannel.mockClear();

    // Third poll - still working (different content)
    tmux.capturePaneFromWindow.mockReturnValue('startup banner\noutput v2');
    await (poller as any).pollAll();
    expect(discord.sendToChannel).not.toHaveBeenCalled();

    // Fourth poll - stable (same content) - should send completion
    tmux.capturePaneFromWindow.mockReturnValue('startup banner\noutput v2');
    await (poller as any).pollAll();

    expect(discord.sendToChannel).toHaveBeenCalledWith(
      'channel1',
      expect.stringContaining('💬 **완료**')
    );
    expect(discord.sendToChannel.mock.calls[0][1]).not.toContain('startup banner');
    expect(discord.sendToChannel.mock.calls[0][1]).toContain('output v2');
  });

  it('sends "session ended" when capture throws (after was working)', async () => {
    const project = makeProject('proj1', 'channel1');
    const stateManager = createMockStateManager([project]);
    const tmux = createMockTmux();
    const discord = createMockDiscord();

    const poller = new CapturePoller(tmux, discord, 30000, stateManager);

    // First poll - baseline
    tmux.capturePaneFromWindow.mockReturnValue('startup banner');
    await (poller as any).pollAll();

    // Second poll - working
    tmux.capturePaneFromWindow.mockReturnValue('startup banner\noutput v1');
    await (poller as any).pollAll();
    expect(discord.sendToChannel).toHaveBeenCalledWith('channel1', '⚡ 작업 중...');

    discord.sendToChannel.mockClear();

    // Second poll - session gone
    tmux.capturePaneFromWindow.mockImplementation(() => {
      throw new Error('Session not found');
    });
    await (poller as any).pollAll();

    expect(discord.sendToChannel).toHaveBeenCalledWith('channel1', '⏹️ 세션 종료됨');
  });

  it('does not send duplicate "working" notifications', async () => {
    const project = makeProject('proj1', 'channel1');
    const stateManager = createMockStateManager([project]);
    const tmux = createMockTmux();
    const discord = createMockDiscord();

    const poller = new CapturePoller(tmux, discord, 30000, stateManager);

    // First poll - baseline
    tmux.capturePaneFromWindow.mockReturnValue('startup banner');
    await (poller as any).pollAll();

    // Second poll - working
    tmux.capturePaneFromWindow.mockReturnValue('startup banner\noutput v1');
    await (poller as any).pollAll();
    expect(discord.sendToChannel).toHaveBeenCalledTimes(1);
    expect(discord.sendToChannel).toHaveBeenCalledWith('channel1', '⚡ 작업 중...');

    discord.sendToChannel.mockClear();

    // Third poll - still working (different content)
    tmux.capturePaneFromWindow.mockReturnValue('startup banner\noutput v2');
    await (poller as any).pollAll();

    // Should NOT send another "working" notification
    expect(discord.sendToChannel).not.toHaveBeenCalled();
  });

  it('handles no projects gracefully', async () => {
    const stateManager = createMockStateManager([]);
    const tmux = createMockTmux();
    const discord = createMockDiscord();

    const poller = new CapturePoller(tmux, discord, 30000, stateManager);

    await expect((poller as any).pollAll()).resolves.not.toThrow();
    expect(tmux.capturePaneFromWindow).not.toHaveBeenCalled();
  });

  it('skips agents with no channel ID', async () => {
    const project = makeProject('proj1', 'channel1');
    project.discordChannels = { claude: undefined };

    const stateManager = createMockStateManager([project]);
    const tmux = createMockTmux();
    const discord = createMockDiscord();

    const poller = new CapturePoller(tmux, discord, 30000, stateManager);
    await (poller as any).pollAll();

    expect(tmux.capturePaneFromWindow).not.toHaveBeenCalled();
    expect(discord.sendToChannel).not.toHaveBeenCalled();
  });

  it('sends simple completion when content matches lastReportedCapture', async () => {
    const project = makeProject('proj1', 'channel1');
    const stateManager = createMockStateManager([project]);
    const tmux = createMockTmux();
    const discord = createMockDiscord();

    const poller = new CapturePoller(tmux, discord, 30000, stateManager);

    // First poll - baseline
    tmux.capturePaneFromWindow.mockReturnValue('startup banner');
    await (poller as any).pollAll();

    // Second poll - working
    tmux.capturePaneFromWindow.mockReturnValue('startup banner\noutput v1');
    await (poller as any).pollAll();
    expect(discord.sendToChannel).toHaveBeenCalledWith('channel1', '⚡ 작업 중...');

    discord.sendToChannel.mockClear();

    // Third poll - still working (different content)
    tmux.capturePaneFromWindow.mockReturnValue('startup banner\noutput v2');
    await (poller as any).pollAll();

    // Fourth poll - stable, should send completion delta
    tmux.capturePaneFromWindow.mockReturnValue('startup banner\noutput v2');
    await (poller as any).pollAll();
    expect(discord.sendToChannel).toHaveBeenCalledWith(
      'channel1',
      expect.stringContaining('💬 **완료**')
    );

    discord.sendToChannel.mockClear();

    // Fifth poll - working again (new content)
    tmux.capturePaneFromWindow.mockReturnValue('startup banner\noutput v2\noutput v3');
    await (poller as any).pollAll();
    expect(discord.sendToChannel).toHaveBeenCalledWith('channel1', '⚡ 작업 중...');

    discord.sendToChannel.mockClear();

    // Sixth poll - stable again with no new delta
    tmux.capturePaneFromWindow.mockReturnValue('startup banner\noutput v2');
    await (poller as any).pollAll();

    // Seventh poll - still stable with no new delta
    tmux.capturePaneFromWindow.mockReturnValue('startup banner\noutput v2');
    await (poller as any).pollAll();

    // Should send simple completion (empty content or already reported)
    expect(discord.sendToChannel).toHaveBeenCalledWith('channel1', '✅ 작업 완료');
  });

  it('uploads files referenced by discord-attach markers and removes markers from content', async () => {
    const project = makeProject('proj1', 'channel1');
    const projectDir = mkdtempSync(join(tmpdir(), 'ai-bridge-poller-'));
    const resultPath = join(projectDir, 'result.txt');
    writeFileSync(resultPath, 'hello');
    project.projectPath = projectDir;
    const stateManager = createMockStateManager([project]);
    const tmux = createMockTmux();
    const discord = createMockDiscord();

    const poller = new CapturePoller(tmux, discord, 30000, stateManager);

    tmux.capturePaneFromWindow.mockReturnValue('startup banner');
    await (poller as any).pollAll();

    tmux.capturePaneFromWindow.mockReturnValue(`startup banner\n완료\n[[discord-attach:${resultPath}]]`);
    await (poller as any).pollAll();
    tmux.capturePaneFromWindow.mockReturnValue(`startup banner\n완료\n[[discord-attach:${resultPath}]]`);
    await (poller as any).pollAll();

    expect(discord.sendFilesToChannel).toHaveBeenCalledWith(
      'channel1',
      expect.stringContaining('완료'),
      [resultPath]
    );
    expect(discord.sendFilesToChannel.mock.calls[0][1]).not.toContain('discord-attach');
  });
});
