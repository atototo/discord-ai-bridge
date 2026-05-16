/**
 * Main entry point for discord-agent-bridge
 */

import { DiscordClient } from './discord/client.js';
import { TmuxManager } from './tmux/manager.js';
import { stateManager as defaultStateManager } from './state/index.js';
import { config as defaultConfig } from './config/index.js';
import { agentRegistry as defaultAgentRegistry, AgentRegistry } from './agents/index.js';
import { CapturePoller } from './capture/index.js';
import { buildAttachmentPrompt, downloadAttachments } from './attachments/index.js';
import { CodexAppServerProcessClient, CodexAppServerSessionManager } from './codex-app/index.js';
import { createServer } from 'http';
import { parse } from 'url';
import type { ProjectAgents } from './types/index.js';
import type { IStateManager } from './types/interfaces.js';
import type { BridgeConfig } from './types/index.js';
import type { CodexAppServerSessionManager as CodexAppServerSessionManagerType } from './codex-app/index.js';

export interface AgentBridgeDeps {
  discord?: DiscordClient;
  tmux?: TmuxManager;
  stateManager?: IStateManager;
  registry?: AgentRegistry;
  config?: BridgeConfig;
  codexAppServer?: CodexAppServerSessionManagerType;
}

export class AgentBridge {
  private discord: DiscordClient;
  private tmux: TmuxManager;
  private poller: CapturePoller;
  private httpServer?: ReturnType<typeof createServer>;
  private stateManager: IStateManager;
  private registry: AgentRegistry;
  private bridgeConfig: BridgeConfig;
  private codexAppServer?: CodexAppServerSessionManagerType;
  private nextCodexSessionWithContext = new Map<string, boolean>();

  constructor(deps?: AgentBridgeDeps) {
    this.bridgeConfig = deps?.config || defaultConfig;
    this.discord = deps?.discord || new DiscordClient(
      this.bridgeConfig.discord.token,
      undefined,
      this.bridgeConfig.discord.allowedUserIds
    );
    this.tmux = deps?.tmux || new TmuxManager('agent-');
    this.stateManager = deps?.stateManager || defaultStateManager;
    this.registry = deps?.registry || defaultAgentRegistry;
    if (this.bridgeConfig.codexTransport === 'app-server') {
      this.codexAppServer = deps?.codexAppServer ||
        new CodexAppServerSessionManager(new CodexAppServerProcessClient());
    }
    this.poller = new CapturePoller(
      this.tmux,
      this.discord,
      this.bridgeConfig.capturePollIntervalMs || 3000,
      this.stateManager,
      this.bridgeConfig.codexTransport === 'app-server' ? new Set(['codex']) : new Set()
    );
  }

  /**
   * Sanitize Discord message input before passing to tmux
   */
  public sanitizeInput(content: string): string | null {
    // Reject empty/whitespace-only messages
    if (!content || content.trim().length === 0) {
      return null;
    }

    // Limit message length to prevent abuse
    if (content.length > 10000) {
      return null;
    }

    // Strip null bytes
    const sanitized = content.replace(/\0/g, '');

    return sanitized;
  }

  /**
   * Connect to Discord only (for init command)
   */
  async connect(): Promise<void> {
    await this.discord.connect();
  }

  async start(): Promise<void> {
    console.log('🚀 Starting Discord Agent Bridge...');

    // Connect to Discord
    await this.discord.connect();
    console.log('✅ Discord connected');

    // Load channel mappings from saved state
    const projects = this.stateManager.listProjects();
    const mappings: { channelId: string; projectName: string; agentType: string }[] = [];
    for (const project of projects) {
      for (const [agentType, channelId] of Object.entries(project.discordChannels)) {
        if (channelId) {
          mappings.push({ channelId, projectName: project.projectName, agentType });
        }
      }
    }
    if (mappings.length > 0) {
      this.discord.registerChannelMappings(mappings);
    }

    this.discord.onNewSession(async (request) => {
      await this.handleNewSessionRequest(request);
    });

    // Set up message routing (Discord → Agent via tmux)
    this.discord.onMessage(async (agentType, content, projectName, channelId, meta) => {
      console.log(`📨 [${projectName}/${agentType}] ${content.substring(0, 50)}...`);

      const project = this.stateManager.getProject(projectName);
      if (!project) {
        console.warn(`Project ${projectName} not found in state`);
        await this.discord.sendToChannel(channelId, `⚠️ Project "${projectName}" not found in state`);
        return;
      }

      const downloadedAttachments = meta.attachments.length > 0
        ? await downloadAttachments(project.projectPath, meta.messageId, meta.attachments)
        : [];
      const attachmentPrompt = buildAttachmentPrompt(downloadedAttachments);
      const combinedContent = `${content}${attachmentPrompt}`;

      // Sanitize input
      const sanitized = this.sanitizeInput(combinedContent);
      if (!sanitized) {
        await this.discord.sendToChannel(channelId, `⚠️ Invalid message: empty, too long (>10000 chars), or contains invalid characters`);
        return;
      }

      // Get agent adapter
      const adapter = this.registry.get(agentType);
      const agentDisplayName = adapter?.config.displayName || agentType;

      // Send confirmation to Discord
      const preview = sanitized.length > 100 ? sanitized.substring(0, 100) + '...' : sanitized;
      await this.discord.sendToChannel(channelId, `**${agentDisplayName}** - 📨 받은 메시지: \`${preview}\``);

      if (agentType === 'codex' && this.bridgeConfig.codexTransport === 'app-server') {
        if (!this.codexAppServer) {
          await this.discord.sendToChannel(channelId, '⚠️ Codex app-server transport is not initialized');
          return;
        }
        const sessionKey = this.codexSessionKey(projectName, channelId);
        const recentMessages = await this.shouldLoadRecentDiscordContext(sessionKey)
          ? await this.loadRecentDiscordContext(channelId, meta.messageId)
          : [];
        const targetChannelId = await this.maybeRouteLongCodexWorkToThread(
          sanitized,
          channelId,
          !!meta.isThread
        );
        const targetSessionKey = this.codexSessionKey(projectName, targetChannelId);
        await this.codexAppServer.sendMessage({
          projectName,
          sessionKey: targetSessionKey,
          projectPath: project.projectPath,
          channelId: targetChannelId,
          content,
          attachments: downloadedAttachments,
          yolo: project.yolo || this.bridgeConfig.codexYolo,
          recentMessages,
          discord: this.discord,
        });
      } else {
        // Send to tmux
        this.tmux.sendKeysToWindow(project.tmuxSession, agentType, sanitized);
      }
      this.stateManager.updateLastActive(projectName);
    });

    // Start HTTP server (minimal - just reload endpoint)
    this.startServer();

    // Start capture poller (Agent → Discord via tmux capture)
    this.poller.start();

    console.log('✅ Discord Agent Bridge is running');
    console.log(`📡 Server listening on port ${this.bridgeConfig.hookServerPort || 18470}`);
    console.log(`🤖 Registered agents: ${this.registry.getAll().map(a => a.config.displayName).join(', ')}`);
  }

  private async handleNewSessionRequest(request: {
    channelId: string;
    projectName: string;
    agentType: string;
    withContext: boolean;
  }): Promise<void> {
    if (request.agentType !== 'codex' || this.bridgeConfig.codexTransport !== 'app-server') {
      await this.discord.sendToChannel(
        request.channelId,
        '⚠️ 새 세션 전환은 Codex app-server 채널에서만 지원됩니다.'
      );
      return;
    }

    if (!this.codexAppServer) {
      await this.discord.sendToChannel(request.channelId, '⚠️ Codex app-server transport is not initialized');
      return;
    }

    const sessionKey = this.codexSessionKey(request.projectName, request.channelId);
    this.codexAppServer.resetThread(sessionKey);
    this.nextCodexSessionWithContext.set(sessionKey, request.withContext);
  }

  private shouldLoadRecentDiscordContext(sessionKey: string): boolean {
    if (!this.nextCodexSessionWithContext.has(sessionKey)) return true;
    const shouldLoad = this.nextCodexSessionWithContext.get(sessionKey) ?? false;
    this.nextCodexSessionWithContext.delete(sessionKey);
    return shouldLoad;
  }

  private codexSessionKey(projectName: string, channelId: string): string {
    return `${projectName}:${channelId}`;
  }

  private async maybeRouteLongCodexWorkToThread(
    content: string,
    channelId: string,
    isThread: boolean
  ): Promise<string> {
    if (isThread || !this.looksLikeLongCodexWork(content)) return channelId;

    const selected = await this.discord.sendQuestionWithButtons?.(
      channelId,
      [{
        header: '긴 작업 분리',
        question: '이 요청은 오래 걸릴 수 있습니다. 현재 채널에서 계속할까요, 아니면 작업 thread를 만들어서 진행할까요?',
        options: [
          { label: '작업 thread 만들기', description: '진행/승인/최종 답변을 새 thread에 모읍니다.' },
          { label: '현재 채널에서 계속', description: '새 thread 없이 현재 채널 세션에서 진행합니다.' },
        ],
      }],
      120000
    );

    if (selected !== '작업 thread 만들기') return channelId;

    const threadId = await this.discord.createWorkThread?.(
      channelId,
      this.workThreadName(content)
    );
    if (!threadId) {
      await this.discord.sendToChannel(channelId, '⚠️ 작업 thread를 만들지 못해 현재 채널에서 계속 진행합니다.');
      return channelId;
    }

    await this.discord.sendToChannel(threadId, '🧵 이 thread에서 Codex 작업을 진행합니다.');
    return threadId;
  }

  private looksLikeLongCodexWork(content: string): boolean {
    const normalized = content.trim();
    if (normalized.startsWith('!')) return false;
    return /(구현|수정|고쳐|테스트|빌드|리서치|조사|전체|구조|개선 계획|진행해|작업해|확인해봐|점검)/i.test(normalized);
  }

  private workThreadName(content: string): string {
    const firstLine = content
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[`*_~>#]/g, '');
    return firstLine.length > 40 ? firstLine.slice(0, 39) + '…' : firstLine || 'Codex 작업';
  }

  private async loadRecentDiscordContext(channelId: string, beforeMessageId: string) {
    const limit = this.bridgeConfig.discordContextMessages ?? 12;
    if (limit <= 0) return [];
    try {
      return await this.discord.getRecentMessages(channelId, beforeMessageId, limit);
    } catch (error) {
      console.warn('Failed to load Discord context:', error);
      return [];
    }
  }

  private startServer(): void {
    const port = this.bridgeConfig.hookServerPort || 18470;

    this.httpServer = createServer(async (req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(405);
        res.end('Method not allowed');
        return;
      }

      const { pathname } = parse(req.url || '');

      // Consume body
      req.on('data', () => {});
      req.on('end', () => {
        try {
          // Route: /reload (re-read state and update channel mappings)
          if (pathname === '/reload') {
            this.reloadChannelMappings();
            res.writeHead(200);
            res.end('OK');
            return;
          }

          res.writeHead(404);
          res.end('Not found');
        } catch (error) {
          console.error('Request processing error:', error);
          res.writeHead(500);
          res.end('Internal error');
        }
      });
    });

    this.httpServer.on('error', (err) => {
      console.error('HTTP server error:', err);
    });

    this.httpServer.listen(port, '127.0.0.1');
  }

  private reloadChannelMappings(): void {
    this.stateManager.reload();
    const projects = this.stateManager.listProjects();
    const mappings: { channelId: string; projectName: string; agentType: string }[] = [];
    for (const project of projects) {
      for (const [agentType, channelId] of Object.entries(project.discordChannels)) {
        if (channelId) {
          mappings.push({ channelId, projectName: project.projectName, agentType });
        }
      }
    }
    if (mappings.length > 0) {
      this.discord.registerChannelMappings(mappings);
    }
    console.log(`🔄 Reloaded channel mappings (${mappings.length} channels)`);
  }

  async setupProject(
    projectName: string,
    projectPath: string,
    agents: ProjectAgents,
    channelDisplayName?: string,
    overridePort?: number,
    yolo = false,
    sandbox = false
  ): Promise<{ channelName: string; channelId: string; agentName: string; tmuxSession: string }> {
    const guildId = this.stateManager.getGuildId();
    if (!guildId) {
      throw new Error('Server ID not configured. Run: agent-discord config --server <id>');
    }

    // Collect enabled agents (should be only one)
    const enabledAgents = this.registry.getAll().filter(a => agents[a.config.name]);
    const adapter = enabledAgents[0];

    if (!adapter) {
      throw new Error('No agent specified');
    }

    const usesCodexAppServer = adapter.config.name === 'codex' && this.bridgeConfig.codexTransport === 'app-server';
    const tmuxSession = usesCodexAppServer
      ? `app-server:${projectName}`
      : this.tmux.getOrCreateSession(projectName);

    // Create Discord channel with custom name or default
    const channelName = channelDisplayName || `${projectName}-${adapter.config.channelSuffix}`;
    const channels = await this.discord.createAgentChannels(
      guildId,
      projectName,
      [adapter.config],
      channelName
    );

    const channelId = channels[adapter.config.name];

    const port = overridePort || this.bridgeConfig.hookServerPort || 18470;
    if (!usesCodexAppServer) {
      // Set environment variables on the tmux session
      this.tmux.setSessionEnv(tmuxSession, 'AGENT_DISCORD_PROJECT', projectName);
      this.tmux.setSessionEnv(tmuxSession, 'AGENT_DISCORD_PORT', String(port));
      if (yolo) {
        this.tmux.setSessionEnv(tmuxSession, 'AGENT_DISCORD_YOLO', '1');
      }
      if (sandbox) {
        this.tmux.setSessionEnv(tmuxSession, 'AGENT_DISCORD_SANDBOX', '1');
      }
    }

    // Start agent in tmux window
    const discordChannels: { [key: string]: string | undefined } = {
      [adapter.config.name]: channelId,
    };

    if (!usesCodexAppServer) {
      this.tmux.startAgentInWindow(
        tmuxSession,
        adapter.config.name,
        adapter.getStartCommand(projectPath, yolo, sandbox)
      );
    }

    // Save state
    const projectState = {
      projectName,
      projectPath,
      tmuxSession,
      discordChannels,
      agents,
      yolo,
      sandbox,
      createdAt: new Date(),
      lastActive: new Date(),
    };
    this.stateManager.setProject(projectState);

    return {
      channelName,
      channelId,
      agentName: adapter.config.displayName,
      tmuxSession,
    };
  }

  async stop(): Promise<void> {
    this.poller.stop();
    this.codexAppServer?.stop();
    this.httpServer?.close();
    await this.discord.disconnect();
  }
}

export async function main() {
  const bridge = new AgentBridge();

  process.on('SIGINT', async () => {
    console.log('\n👋 Shutting down...');
    try {
      await bridge.stop();
    } catch (error) {
      console.error('Error during shutdown:', error);
    }
    process.exit(0);
  });

  await bridge.start();
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
