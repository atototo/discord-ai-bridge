/**
 * TypeScript type definitions
 */

export * from './interfaces.js';

export interface DiscordConfig {
  token: string;
  channelId?: string;
  guildId?: string;
  allowedUserIds?: string[];
}

export interface TmuxSession {
  name: string;
  attached: boolean;
  windows: number;
  created: Date;
}

export interface AgentMessage {
  type: 'tool-output' | 'agent-output' | 'error';
  content: string;
  timestamp: Date;
  sessionName?: string;
  agentName?: string;
}

export interface DiscordAttachment {
  id: string;
  name: string;
  url: string;
  contentType?: string | null;
  size?: number;
  localPath?: string;
}

export interface DiscordMessageMeta {
  messageId: string;
  attachments: DiscordAttachment[];
}

export interface BridgeConfig {
  discord: DiscordConfig;
  tmux: {
    sessionPrefix: string;
  };
  hookServerPort?: number;
  capturePollIntervalMs?: number;
  codexTransport?: 'tmux' | 'app-server';
}

export interface ProjectAgents {
  [agentType: string]: boolean;
}

export interface ProjectState {
  projectName: string;
  projectPath: string;
  tmuxSession: string;
  discordChannels: {
    [agentType: string]: string | undefined;
  };
  agents: ProjectAgents;
  createdAt: Date;
  lastActive: Date;
}

export type AgentType = string;
