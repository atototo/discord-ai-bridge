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

export interface DiscordRecentMessage {
  authorName: string;
  authorBot: boolean;
  content: string;
  attachments: string[];
}

export interface BridgeConfig {
  discord: DiscordConfig;
  tmux: {
    sessionPrefix: string;
  };
  hookServerPort?: number;
  capturePollIntervalMs?: number;
  discordContextMessages?: number;
  codexTransport?: 'tmux' | 'app-server';
  codexYolo?: boolean;
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
  yolo?: boolean;
  sandbox?: boolean;
  createdAt: Date;
  lastActive: Date;
}

export type AgentType = string;
