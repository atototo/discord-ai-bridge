/**
 * Discord client setup and management
 */

import {
  ApplicationCommandOptionType,
  Client,
  GatewayIntentBits,
  TextChannel,
  ChannelType,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ComponentType,
  EmbedBuilder,
} from 'discord.js';
import type { AgentMessage, DiscordRecentMessage } from '../types/index.js';
import type { DiscordAttachment, DiscordMessageMeta } from '../types/index.js';
import { agentRegistry as defaultAgentRegistry, type AgentConfig, type AgentRegistry } from '../agents/index.js';
import { splitForDiscord } from '../capture/parser.js';

type MessageCallback = (
  agentType: string,
  content: string,
  projectName: string,
  channelId: string,
  meta: DiscordMessageMeta
) => void | Promise<void>;

export interface NewSessionRequest {
  channelId: string;
  projectName: string;
  agentType: string;
  withContext: boolean;
}

type NewSessionCallback = (request: NewSessionRequest) => void | Promise<void>;

interface ChannelInfo {
  projectName: string;
  agentType: string;
}

const NEW_SESSION_COMMAND = {
  name: 'new-session',
  description: '새 Codex 세션 시작. 최근 대화 참고는 with-context:true 옵션을 켭니다',
  options: [
    {
      type: ApplicationCommandOptionType.Boolean,
      name: 'with-context',
      description: '다음 첫 메시지에 최근 Discord 대화 맥락을 참고로 붙입니다',
      required: false,
    },
  ],
};

export class DiscordClient {
  private client: Client;
  private token: string;
  private allowedUserIds: Set<string>;
  private targetChannel?: TextChannel;
  private messageCallback?: MessageCallback;
  private newSessionCallback?: NewSessionCallback;
  private channelMapping: Map<string, ChannelInfo> = new Map();
  private registry: AgentRegistry;

  constructor(token: string, registry?: AgentRegistry, allowedUserIds: string[] = []) {
    this.token = token;
    this.allowedUserIds = new Set(allowedUserIds);
    this.registry = registry || defaultAgentRegistry;
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
      ],
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('clientReady', async () => {
      console.log(`Discord bot logged in as ${this.client.user?.tag}`);
      this.scanExistingChannels();
      await this.registerSlashCommands();
    });

    this.client.on('error', (error) => {
      console.error('Discord client error:', error);
    });

    this.client.on('messageCreate', async (message) => {
      // Ignore bot messages
      if (message.author.bot) return;

      // Only process text channels
      if (!message.channel.isTextBased()) return;
      if (!this.isUserMessageType(message)) return;
      if (this.isParentThreadStarterMessage(message)) return;

      const channelInfo = this.resolveChannelInfo(message.channelId, message.channel);
      if (channelInfo && this.messageCallback) {
        if (!this.isUserAllowed(message.author.id)) return;
        if (await this.becomesThreadStarterMessage(message)) return;
        if (await this.handleTextNewSessionCommand(message, channelInfo)) return;
        await this.messageCallback(
          channelInfo.agentType,
          message.content,
          channelInfo.projectName,
          message.channelId,
          {
            messageId: message.id,
            attachments: this.extractAttachments(message.attachments),
          }
        );
      }
    });

    this.client.on('interactionCreate', async (interaction: any) => {
      await this.handleInteraction(interaction);
    });
  }

  private async registerSlashCommands(): Promise<void> {
    const registrations = [...this.client.guilds.cache.values()].map(async (guild: any) => {
      if (!guild?.commands?.set) return;
      await guild.commands.set([NEW_SESSION_COMMAND]);
    });
    await Promise.all(registrations);
  }

  private async handleInteraction(interaction: any): Promise<void> {
    if (!interaction?.isChatInputCommand?.()) return;
    if (interaction.commandName !== NEW_SESSION_COMMAND.name) return;
    if (!this.isUserAllowed(interaction.user?.id)) {
      await interaction.reply?.({ content: '⚠️ 이 명령을 사용할 권한이 없습니다.', ephemeral: true });
      return;
    }

    const channelInfo = this.resolveChannelInfo(interaction.channelId, interaction.channel);
    if (!channelInfo) {
      await interaction.reply?.({ content: '⚠️ 이 채널은 bridge 프로젝트 채널로 등록되어 있지 않습니다.', ephemeral: true });
      return;
    }

    const withContext = interaction.options?.getBoolean?.('with-context') ?? false;
    if (!this.newSessionCallback) {
      await interaction.reply?.({ content: '⚠️ 새 세션 핸들러가 준비되지 않았습니다.', ephemeral: true });
      return;
    }

    await this.newSessionCallback({
      channelId: interaction.channelId,
      projectName: channelInfo.projectName,
      agentType: channelInfo.agentType,
      withContext,
    });
    await interaction.reply?.({
      content: this.newSessionMessage(withContext),
      ephemeral: false,
    });
  }

  private async handleTextNewSessionCommand(message: any, channelInfo: ChannelInfo): Promise<boolean> {
    const match = message.content.trim().match(/^!new-session(?:\s+(with-context))?$/i);
    if (!match) return false;

    if (!this.newSessionCallback) {
      await message.channel.send?.('⚠️ 새 세션 핸들러가 준비되지 않았습니다.');
      return true;
    }

    const withContext = !!match[1];
    await this.newSessionCallback({
      channelId: message.channelId,
      projectName: channelInfo.projectName,
      agentType: channelInfo.agentType,
      withContext,
    });
    await message.channel.send?.(this.newSessionMessage(withContext));
    return true;
  }

  private newSessionMessage(withContext: boolean): string {
    return withContext
      ? '✅ 새 Codex 세션으로 전환했습니다. 다음 메시지는 최근 Discord 대화 맥락을 참고합니다.'
      : '✅ 새 Codex 세션으로 전환했습니다. 다음 메시지는 이전 맥락 없이 시작합니다.';
  }

  private resolveChannelInfo(channelId: string, channel?: any): ChannelInfo | undefined {
    const direct = this.channelMapping.get(channelId);
    if (direct) return direct;

    const parentId = this.parentChannelId(channel);
    return parentId ? this.channelMapping.get(parentId) : undefined;
  }

  private parentChannelId(channel?: any): string | undefined {
    if (!channel) return undefined;
    if (typeof channel.isThread === 'function' && !channel.isThread()) return undefined;
    return channel.parentId || channel.parent?.id;
  }

  private isParentThreadStarterMessage(message: any): boolean {
    if (typeof message.channel?.isThread === 'function' && message.channel.isThread()) {
      return false;
    }
    return !!(message.hasThread || message.thread);
  }

  private isUserMessageType(message: any): boolean {
    return message.type === undefined ||
      message.type === 0 ||
      message.type === 19;
  }

  private async becomesThreadStarterMessage(message: any): Promise<boolean> {
    if (typeof message.channel?.isThread === 'function' && message.channel.isThread()) {
      return false;
    }
    if (!message.channel?.messages?.fetch) return false;

    await new Promise((resolve) => setTimeout(resolve, 750));
    try {
      const refreshed = await message.channel.messages.fetch(message.id);
      return this.isParentThreadStarterMessage(refreshed);
    } catch {
      return false;
    }
  }

  private extractAttachments(attachments: any): DiscordAttachment[] {
    if (!attachments) return [];
    return [...attachments.values()].map((attachment: any) => ({
      id: attachment.id,
      name: attachment.name || attachment.filename || attachment.id,
      url: attachment.url,
      contentType: attachment.contentType,
      size: attachment.size,
    }));
  }

  async getRecentMessages(
    channelId: string,
    beforeMessageId: string,
    limit: number
  ): Promise<DiscordRecentMessage[]> {
    if (limit <= 0) return [];
    const channel = await this.client.channels.fetch(channelId);
    if (!channel?.isTextBased()) return [];

    const messages = await (channel as TextChannel).messages.fetch({
      limit,
      before: beforeMessageId,
    });

    return [...messages.values()]
      .reverse()
      .map((message: any) => ({
        authorName: message.author?.username || message.author?.displayName || 'unknown',
        authorBot: !!message.author?.bot,
        content: this.truncateContextContent(message.content || ''),
        attachments: this.extractAttachments(message.attachments).map((attachment) => attachment.name),
      }))
      .filter((message) => this.isUsefulContextMessage(message));
  }

  private isUsefulContextMessage(message: DiscordRecentMessage): boolean {
    if (!message.content.trim() && message.attachments.length === 0) return false;
    const content = message.content.trim();
    if (content.includes('📨 받은 메시지:')) return false;
    if (content.startsWith('🔧 명령 실행 중:')) return false;
    if (content.startsWith('🖼️ 이미지 확인 중:')) return false;
    if (content.startsWith('🎨 이미지 생성 중')) return false;
    if (content.startsWith('🔍 웹 검색 중:')) return false;
    return true;
  }

  private truncateContextContent(content: string, maxLength: number = 700): string {
    return content.length > maxLength ? content.slice(0, maxLength - 1) + '…' : content;
  }

  private isUserAllowed(userId: string): boolean {
    return this.allowedUserIds.size === 0 || this.allowedUserIds.has(userId);
  }

  private scanExistingChannels(): void {
    this.client.guilds.cache.forEach((guild) => {
      guild.channels.cache.forEach((channel) => {
        if (channel.isTextBased() && channel.name) {
          const parsed = this.parseChannelName(channel.name);
          if (parsed) {
            this.channelMapping.set(channel.id, parsed);
            console.log(`Mapped channel ${channel.name} (${channel.id}) -> ${parsed.projectName}:${parsed.agentType}`);
          }
        }
      });
    });
  }

  private parseChannelName(channelName: string): ChannelInfo | null {
    // Use agent registry to parse channel names dynamically
    const result = this.registry.parseChannelName(channelName);
    if (result) {
      return {
        projectName: result.projectName,
        agentType: result.agent.config.name,
      };
    }
    return null;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Discord login timed out after 30 seconds'));
      }, 30000);

      this.client.once('clientReady', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.client.login(this.token).catch((error) => {
        clearTimeout(timeout);
        reject(new Error(`Discord login failed: ${error.message}`));
      });
    });
  }

  async setTargetChannel(channelId: string): Promise<void> {
    const channel = await this.client.channels.fetch(channelId);
    if (!channel?.isTextBased()) {
      throw new Error(`Channel ${channelId} is not a text channel`);
    }
    this.targetChannel = channel as TextChannel;
  }

  async sendMessage(message: AgentMessage): Promise<void> {
    if (!this.targetChannel) {
      console.warn('No target channel set, skipping message');
      return;
    }

    const formatted = this.formatMessage(message);
    await this.targetChannel.send(formatted);
  }

  private formatMessage(message: AgentMessage): string {
    const emoji = this.getEmojiForType(message.type);
    const header = `${emoji} **${message.type}** ${message.agentName ? `(${message.agentName})` : ''}`;

    return `${header}\n\`\`\`\n${message.content}\n\`\`\``;
  }

  private getEmojiForType(type: AgentMessage['type']): string {
    switch (type) {
      case 'tool-output':
        return '🔧';
      case 'agent-output':
        return '🤖';
      case 'error':
        return '❌';
      default:
        return '📝';
    }
  }

  /**
   * Send a tool approval request to a channel and wait for user reaction
   * @returns true if approved, false if denied
   */
  async sendApprovalRequest(
    channelId: string,
    toolName: string,
    toolInput: any,
    timeoutMs: number = 120000
  ): Promise<boolean> {
    const channel = await this.client.channels.fetch(channelId);
    if (!channel?.isTextBased()) {
      console.warn(`Channel ${channelId} is not a text channel, auto-denying`);
      return false;
    }

    const textChannel = channel as TextChannel;

    const message = await textChannel.send(this.formatApprovalRequest(toolName, toolInput, timeoutMs));

    await message.react('✅');
    await message.react('❌');

    try {
      const collected = await message.awaitReactions({
        filter: (reaction, user) =>
          ['✅', '❌'].includes(reaction.emoji.name || '') && !user.bot && this.isUserAllowed(user.id),
        max: 1,
        time: timeoutMs,
      });

      if (collected.size === 0) {
        await message.edit(message.content + '\n\n⏰ **Timed out — auto-denied**');
        return false;
      }

      const approved = collected.first()?.emoji.name === '✅';
      await message.edit(
        message.content + `\n\n${approved ? '✅ **Allowed**' : '❌ **Denied**'}`
      );
      return approved;
    } catch {
      // On error, default to deny for security
      await message.edit(message.content + '\n\n⚠️ **Error — auto-denied**').catch(() => {});
      return false;
    }
  }

  private formatApprovalRequest(toolName: string, toolInput: any, timeoutMs: number): string {
    const reason = this.approvalReason(toolInput);
    const toolLabel = this.approvalToolLabel(toolName);
    const timeoutSeconds = Math.max(1, Math.round(timeoutMs / 1000));

    return [
      `🔒 **승인 요청** · ${toolLabel}`,
      '',
      reason,
      '',
      `✅ 승인 / ❌ 거절 (${timeoutSeconds}초 후 자동 거절)`,
    ].join('\n');
  }

  private approvalReason(toolInput: any): string {
    if (!toolInput) return '이 작업을 실행하도록 허용할까요?';
    if (typeof toolInput === 'string') return toolInput;
    if (typeof toolInput.reason === 'string' && toolInput.reason.trim()) {
      return toolInput.reason.trim();
    }

    if (typeof toolInput.command === 'string' && toolInput.command.trim()) {
      return `다음 명령을 실행하도록 허용할까요?\n\`${this.truncateInline(toolInput.command.trim())}\``;
    }

    return '이 작업을 실행하도록 허용할까요?';
  }

  private approvalToolLabel(toolName: string): string {
    switch (toolName) {
      case 'commandExecution':
        return '명령 실행';
      case 'fileChange':
        return '파일 변경';
      case 'permissions':
        return '권한 변경';
      default:
        return toolName;
    }
  }

  private truncateInline(value: string, maxLength: number = 180): string {
    return value.length > maxLength ? value.slice(0, maxLength - 1) + '…' : value;
  }

  async disconnect(): Promise<void> {
    await this.client.destroy();
  }

  /**
   * Register a callback to handle incoming messages from Discord channels
   */
  onMessage(callback: MessageCallback): void {
    this.messageCallback = callback;
  }

  onNewSession(callback: NewSessionCallback): void {
    this.newSessionCallback = callback;
  }

  /**
   * Create agent channels for a project in a guild
   * @param guildId - Discord guild ID
   * @param projectName - Project name
   * @param agentConfigs - Array of agent configurations to create channels for
   * @param customChannelName - Optional custom channel name (e.g., "Claude - 내 프로젝트")
   * @returns Object mapping agent names to channel IDs
   */
  async createAgentChannels(
    guildId: string,
    projectName: string,
    agentConfigs: AgentConfig[],
    customChannelName?: string
  ): Promise<{ [agentName: string]: string }> {
    const guild = await this.client.guilds.fetch(guildId);
    if (!guild) {
      throw new Error(`Guild ${guildId} not found`);
    }

    const result: { [agentName: string]: string } = {};
    const categoryId = await this.getOrCreateProjectCategory(guild, projectName);

    for (const config of agentConfigs) {
      // Use custom channel name if provided, otherwise use default format
      const channelName = customChannelName || `${projectName}-${config.channelSuffix}`;

      const channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        topic: `${config.displayName} agent for ${projectName}`,
        parent: categoryId,
      });

      // Register in mapping
      this.channelMapping.set(channel.id, {
        projectName,
        agentType: config.name,
      });

      result[config.name] = channel.id;
      console.log(`  - ${config.displayName}: ${channel.name} (${channel.id})`);
    }

    console.log(`Created ${agentConfigs.length} channels for project ${projectName}`);
    return result;
  }

  private async getOrCreateProjectCategory(guild: any, projectName: string): Promise<string | undefined> {
    const existing = this.findProjectCategory(guild.channels.cache, projectName);
    if (existing?.id) return existing.id;

    const category = await guild.channels.create({
      name: projectName,
      type: ChannelType.GuildCategory,
    });
    return category?.id;
  }

  private findProjectCategory(cache: any, projectName: string): any {
    const matches = (channel: any) =>
      channel.type === ChannelType.GuildCategory && channel.name === projectName;
    if (typeof cache?.find === 'function') return cache.find(matches);
    if (typeof cache?.values === 'function') {
      for (const channel of cache.values()) {
        if (matches(channel)) return channel;
      }
    }
    return undefined;
  }

  /**
   * Register channel mappings from external source (e.g., state file)
   */
  registerChannelMappings(mappings: { channelId: string; projectName: string; agentType: string }[]): void {
    for (const m of mappings) {
      this.channelMapping.set(m.channelId, {
        projectName: m.projectName,
        agentType: m.agentType,
      });
      console.log(`Registered channel ${m.channelId} -> ${m.projectName}:${m.agentType}`);
    }
  }

  /**
   * Get list of guilds the bot is in
   */
  getGuilds(): { id: string; name: string }[] {
    return this.client.guilds.cache.map((guild) => ({
      id: guild.id,
      name: guild.name,
    }));
  }

  /**
   * Get the current channel mapping
   */
  getChannelMapping(): Map<string, ChannelInfo> {
    return new Map(this.channelMapping);
  }

  /**
   * Delete a Discord channel by ID
   */
  async deleteChannel(channelId: string): Promise<boolean> {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (channel?.isTextBased()) {
        await (channel as TextChannel).delete();
        this.channelMapping.delete(channelId);
        return true;
      }
      return false;
    } catch (error: any) {
      // 10003 = Unknown Channel (already deleted), just log briefly
      if (error?.code === 10003) {
        console.log(`Channel ${channelId} already deleted`);
      } else {
        console.error(`Failed to delete channel ${channelId}:`, error);
      }
      return false;
    }
  }

  /**
   * Send an AskUserQuestion as an embed with interactive buttons.
   * Returns the selected option label, or null on timeout.
   */
  async sendQuestionWithButtons(
    channelId: string,
    questions: Array<{
      question: string;
      header?: string;
      options: Array<{ label: string; description?: string }>;
      multiSelect?: boolean;
    }>,
    timeoutMs: number = 300000
  ): Promise<string | null> {
    const channel = await this.client.channels.fetch(channelId);
    if (!channel?.isTextBased()) return null;
    const textChannel = channel as TextChannel;

    const q = questions[0];
    if (!q) return null;

    const embed = new EmbedBuilder()
      .setTitle(`❓ ${q.header || 'Question'}`)
      .setDescription(q.question)
      .setColor(0x5865f2);

    if (q.options.some((o) => o.description)) {
      embed.addFields(
        q.options.map((opt) => ({
          name: opt.label,
          value: opt.description || '\u200b',
          inline: true,
        }))
      );
    }

    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    let row = new ActionRowBuilder<ButtonBuilder>();

    for (let i = 0; i < q.options.length; i++) {
      if (i > 0 && i % 5 === 0) {
        rows.push(row);
        row = new ActionRowBuilder<ButtonBuilder>();
      }
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`opt_${i}`)
          .setLabel(q.options[i].label.slice(0, 80))
          .setStyle(i === 0 ? ButtonStyle.Primary : ButtonStyle.Secondary)
      );
    }
    rows.push(row);

    const message = await textChannel.send({
      embeds: [embed],
      components: rows,
    });

    try {
      const interaction = await message.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: (i) => !i.user.bot && this.isUserAllowed(i.user.id),
        time: timeoutMs,
      });

      const optIndex = parseInt(interaction.customId.split('_')[1]);
      const selected = q.options[optIndex]?.label || '';

      await interaction.update({
        embeds: [embed.setColor(0x57f287).setFooter({ text: `✅ ${selected}` })],
        components: [],
      });

      return selected;
    } catch {
      await message
        .edit({
          embeds: [embed.setColor(0x95a5a6).setFooter({ text: '⏰ Timed out' })],
          components: [],
        })
        .catch(() => {});
      return null;
    }
  }

  /**
   * Send a message to a specific channel by ID
   */
  async sendToChannel(channelId: string, content: string): Promise<void> {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel?.isTextBased()) {
        console.warn(`Channel ${channelId} is not a text channel`);
        return;
      }
      await (channel as TextChannel).send(content);
    } catch (error) {
      console.error(`Failed to send message to channel ${channelId}:`, error);
    }
  }

  async sendFilesToChannel(channelId: string, content: string, files: string[]): Promise<void> {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel?.isTextBased()) {
        console.warn(`Channel ${channelId} is not a text channel`);
        return;
      }
      const chunks = splitForDiscord(content || '첨부 파일');
      const textChunks = chunks.slice(0, -1);
      for (const chunk of textChunks) {
        await (channel as TextChannel).send(chunk);
      }
      await (channel as TextChannel).send({ content: chunks[chunks.length - 1], files });
    } catch (error) {
      console.error(`Failed to send files to channel ${channelId}:`, error);
    }
  }
}
