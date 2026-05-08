import { splitForDiscord } from '../capture/parser.js';
import { formatDiscordFinalAnswer } from '../discord/format.js';
import { extractDiscordAttachments } from '../attachments/index.js';
import type { DiscordAttachment, DiscordRecentMessage } from '../types/index.js';

export interface CodexAppServerClientLike {
  start(): Promise<void>;
  request(method: string, params?: unknown): Promise<any>;
  respond(id: number | string, result: unknown): void;
  onNotification(handler: (message: any) => void | Promise<void>): void;
  onServerRequest(handler: (message: any) => void | Promise<void>): void;
  stop(): void;
}

export interface CodexAppServerSendMessageParams {
  projectName: string;
  sessionKey?: string;
  projectPath: string;
  channelId: string;
  content: string;
  attachments: DiscordAttachment[];
  recentMessages?: DiscordRecentMessage[];
  discord: {
    sendToChannel(channelId: string, content: string): Promise<void>;
    sendFilesToChannel?(
      channelId: string,
      content: string,
      files: string[]
    ): Promise<void>;
    sendApprovalRequest?(
      channelId: string,
      toolName: string,
      toolInput: any,
      timeoutMs?: number
    ): Promise<boolean>;
    sendTyping?(channelId: string): Promise<void>;
  };
}

type ThreadState = {
  threadId: string;
  projectPath: string;
  channelId: string;
  discord: CodexAppServerSendMessageParams['discord'];
  activeTurns: Map<string, TurnState>;
  notifiedItems: Set<string>;
};

type TurnState = {
  text: string;
  finalText?: string;
};

const DISCORD_OUTPUT_INSTRUCTIONS = [
  '',
  '[Discord bridge 지침]',
  '- Discord에 이미지나 파일을 보여줘야 하면 로컬 경로 링크나 Markdown image만 쓰지 말고 [[discord-attach:/absolute/path]]를 별도 줄로 포함하세요.',
  '- 프로젝트 내부 파일과 Codex generated_images 아래 이미지는 bridge가 Discord 파일 첨부로 업로드합니다.',
].join('\n');

export interface CodexAppServerSessionManagerOptions {
  /**
   * Deprecated. Assistant text is sent on completion so Discord receives one coherent answer.
   */
  streamFlushMs?: number;
}

export class CodexAppServerSessionManager {
  private started = false;
  private threads = new Map<string, ThreadState>();
  private threadProjectNames = new Map<string, string>();

  constructor(private client: CodexAppServerClientLike, _options: CodexAppServerSessionManagerOptions = {}) {
    this.client.onNotification((message) => this.handleNotification(message));
    this.client.onServerRequest((message) => this.handleServerRequest(message));
  }

  async sendMessage(params: CodexAppServerSendMessageParams): Promise<void> {
    await this.ensureStarted();
    const key = this.threadKey(params);
    const existingThread = this.threads.get(key);
    const thread = await this.ensureThread(params);
    thread.channelId = params.channelId;
    thread.discord = params.discord;

    await this.client.request('turn/start', {
      threadId: thread.threadId,
      cwd: params.projectPath,
      input: this.buildUserInput(
        params.content,
        params.attachments,
        existingThread ? [] : params.recentMessages || []
      ),
    });
  }

  resetThread(projectName: string): void {
    const existing = this.threads.get(projectName);
    if (!existing) return;
    this.threads.delete(projectName);
    this.threadProjectNames.delete(existing.threadId);
  }

  stop(): void {
    this.client.stop();
  }

  private async ensureStarted(): Promise<void> {
    if (this.started) return;
    await this.client.start();
    this.started = true;
  }

  private async ensureThread(params: CodexAppServerSendMessageParams): Promise<ThreadState> {
    const key = this.threadKey(params);
    const existing = this.threads.get(key);
    if (existing) return existing;

    const response = await this.client.request('thread/start', {
      cwd: params.projectPath,
      approvalPolicy: 'on-request',
      approvalsReviewer: 'user',
      sessionStartSource: 'startup',
    });
    const threadId = response?.thread?.id;
    if (!threadId) {
      throw new Error('Codex app-server did not return a thread id');
    }

    const thread = {
      threadId,
      projectPath: params.projectPath,
      channelId: params.channelId,
      discord: params.discord,
      activeTurns: new Map<string, TurnState>(),
      notifiedItems: new Set<string>(),
    };
    this.threads.set(key, thread);
    this.threadProjectNames.set(threadId, key);
    return thread;
  }

  private threadKey(params: CodexAppServerSendMessageParams): string {
    return params.sessionKey || params.projectName;
  }

  private buildUserInput(
    content: string,
    attachments: DiscordAttachment[],
    recentMessages: DiscordRecentMessage[] = []
  ): any[] {
    const context = this.buildRecentContext(recentMessages);
    const input: any[] = [{ type: 'text', text: `${context}${content}${DISCORD_OUTPUT_INSTRUCTIONS}`, text_elements: [] }];
    for (const attachment of attachments) {
      if (!attachment.localPath) continue;
      if ((attachment.contentType || '').startsWith('image/')) {
        input.push({ type: 'localImage', path: attachment.localPath });
      } else {
        input[0].text += `\n첨부 파일: ${attachment.name}: ${attachment.localPath}`;
      }
    }
    return input;
  }

  private buildRecentContext(messages: DiscordRecentMessage[]): string {
    const useful = messages
      .filter((message) => message.content.trim() || message.attachments.length > 0)
      .slice(-20);
    if (useful.length === 0) return '';

    const lines = useful.map((message) => {
      const speaker = message.authorBot ? `bot:${message.authorName}` : `user:${message.authorName}`;
      const attachmentText = message.attachments.length > 0
        ? ` (첨부: ${message.attachments.join(', ')})`
        : '';
      return `- ${speaker}: ${message.content}${attachmentText}`.trim();
    });

    return [
      '[Discord 최근 대화 맥락]',
      ...lines,
      '',
      '위 맥락은 daemon 재시작 후 이어받기용 참고 정보입니다. 현재 사용자 요청은 아래 메시지입니다.',
      '',
    ].join('\n');
  }

  private async handleNotification(message: any): Promise<void> {
    if (message.method === 'item/agentMessage/delta') {
      const params = message.params || {};
      const thread = this.getThreadById(params.threadId);
      if (!thread || !params.turnId) return;
      const turn = thread.activeTurns.get(params.turnId) || { text: '' };
      turn.text += params.delta || '';
      thread.activeTurns.set(params.turnId, turn);
      return;
    }

    if (message.method === 'item/completed') {
      const params = message.params || {};
      const thread = this.getThreadById(params.threadId);
      const item = params.item;
      if (!thread || !params.turnId || item?.type !== 'agentMessage') return;
      const turn = thread.activeTurns.get(params.turnId) || { text: '' };
      turn.finalText = item.text || '';
      thread.activeTurns.set(params.turnId, turn);
      return;
    }

    if (message.method === 'item/started') {
      const params = message.params || {};
      const thread = this.getThreadById(params.threadId);
      if (!thread || !params.item) return;
      await this.sendItemProgress(thread, params.item);
      return;
    }

    if (message.method === 'turn/completed') {
      const params = message.params || {};
      const turnId = params.turn?.id;
      const thread = this.getThreadById(params.threadId);
      if (!thread || !turnId) return;
      const turn = thread.activeTurns.get(turnId);
      const content = (turn?.finalText || turn?.text || '').trim();
      thread.activeTurns.delete(turnId);
      if (!content) {
        await thread.discord.sendToChannel(thread.channelId, '✅ 완료');
        return;
      }
      await this.sendFinalAnswer(thread, content);
    }
  }

  private async handleServerRequest(message: any): Promise<void> {
    if (message.id === undefined) return;
    const params = message.params || {};
    const thread = this.getThreadById(params.threadId);

    const approvalToolName = this.approvalToolName(message.method);
    if (approvalToolName) {
      const approved = thread?.discord.sendApprovalRequest
        ? await thread.discord.sendApprovalRequest(thread.channelId, approvalToolName, params)
        : false;
      this.client.respond(message.id, { decision: approved ? 'accept' : 'decline' });
      return;
    }

    this.client.respond(message.id, null);
  }

  private getThreadById(threadId: string | undefined): ThreadState | undefined {
    if (!threadId) return undefined;
    const projectName = this.threadProjectNames.get(threadId);
    return projectName ? this.threads.get(projectName) : undefined;
  }

  private approvalToolName(method: string): string | null {
    switch (method) {
      case 'item/commandExecution/requestApproval':
        return 'commandExecution';
      case 'item/fileChange/requestApproval':
        return 'fileChange';
      case 'item/permissions/requestApproval':
        return 'permissions';
      default:
        return null;
    }
  }

  private async sendFinalAnswer(thread: ThreadState, content: string): Promise<void> {
    const { content: cleaned, files, rejected } = extractDiscordAttachments(content, thread.projectPath);
    const rejectionNote = rejected.length > 0
      ? `\n\n⚠️ 전송하지 않은 파일: ${rejected.map((file) => `\`${file}\``).join(', ')}`
      : '';
    const message = `${formatDiscordFinalAnswer(cleaned)}${rejectionNote}`.trim();

    if (files.length > 0 && thread.discord.sendFilesToChannel) {
      await thread.discord.sendFilesToChannel(thread.channelId, message || '✅ 완료', files);
      return;
    }

    for (const chunk of splitForDiscord(message || '✅ 완료')) {
      await thread.discord.sendToChannel(thread.channelId, chunk);
    }
  }

  private async sendItemProgress(thread: ThreadState, item: any): Promise<void> {
    if (!item?.id || thread.notifiedItems.has(item.id)) return;
    thread.notifiedItems.add(item.id);
    await thread.discord.sendTyping?.(thread.channelId);
  }
}
