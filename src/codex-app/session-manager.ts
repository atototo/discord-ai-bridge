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
  yolo?: boolean;
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
    sendStatusMessage?(channelId: string, content: string): Promise<string | null>;
    updateMessage?(channelId: string, messageId: string, content: string): Promise<void>;
  };
}

type ThreadState = {
  threadId: string;
  projectPath: string;
  channelId: string;
  discord: CodexAppServerSendMessageParams['discord'];
  activeTurns: Map<string, TurnState>;
  typingTimers: Map<string, ReturnType<typeof setInterval>>;
  timeoutTimers: Map<string, ReturnType<typeof setTimeout>>;
  statusTimers: Map<string, ReturnType<typeof setInterval>>;
  notifiedItems: Set<string>;
};

type TurnState = {
  text: string;
  finalText?: string;
  statusMessageId?: string;
  statusMessagePromise?: Promise<string | null>;
  status?: RunStatus;
  statusDetail?: string;
  lastActivityAt: number;
};

type RunStatus = 'starting' | 'running' | 'waiting_approval' | 'stalled' | 'completed' | 'failed';

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
  turnTimeoutMs?: number;
}

export class CodexAppServerSessionManager {
  private started = false;
  private threads = new Map<string, ThreadState>();
  private threadProjectNames = new Map<string, string>();
  private turnTimeoutMs: number;

  constructor(private client: CodexAppServerClientLike, options: CodexAppServerSessionManagerOptions = {}) {
    this.turnTimeoutMs = options.turnTimeoutMs ?? 30 * 60 * 1000;
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

    const turnResponse = await this.client.request('turn/start', {
      threadId: thread.threadId,
      cwd: params.projectPath,
      input: this.buildUserInput(
        params.content,
        params.attachments,
        existingThread ? [] : params.recentMessages || []
      ),
    });
    const turnId = turnResponse?.turn?.id;
    if (turnId) {
      thread.activeTurns.set(turnId, { text: '', status: 'starting', lastActivityAt: Date.now() });
      await this.updateTurnStatus(thread, turnId, 'starting', '요청을 Codex app-server에 전달했습니다.');
      await this.startTyping(thread, turnId);
      this.startTurnTimeout(thread, turnId);
    }
  }

  resetThread(projectName: string): void {
    const existing = this.threads.get(projectName);
    if (!existing) return;
    this.clearTypingTimers(existing);
    this.threads.delete(projectName);
    this.threadProjectNames.delete(existing.threadId);
  }

  stop(): void {
    for (const thread of this.threads.values()) {
      this.clearTypingTimers(thread);
    }
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
      approvalPolicy: params.yolo ? 'never' : 'on-request',
      approvalsReviewer: 'user',
      ...(params.yolo ? { sandbox: 'danger-full-access' } : {}),
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
      typingTimers: new Map<string, ReturnType<typeof setInterval>>(),
      timeoutTimers: new Map<string, ReturnType<typeof setTimeout>>(),
      statusTimers: new Map<string, ReturnType<typeof setInterval>>(),
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
      const turn = thread.activeTurns.get(params.turnId) || { text: '', lastActivityAt: Date.now() };
      turn.text += params.delta || '';
      turn.lastActivityAt = Date.now();
      thread.activeTurns.set(params.turnId, turn);
      return;
    }

    if (message.method === 'item/completed') {
      const params = message.params || {};
      const thread = this.getThreadById(params.threadId);
      const item = params.item;
      if (!thread || !params.turnId || item?.type !== 'agentMessage') return;
      const turn = thread.activeTurns.get(params.turnId) || { text: '', lastActivityAt: Date.now() };
      turn.finalText = item.text || '';
      turn.lastActivityAt = Date.now();
      thread.activeTurns.set(params.turnId, turn);
      return;
    }

    if (message.method === 'item/started') {
      const params = message.params || {};
      const thread = this.getThreadById(params.threadId);
      if (!thread || !params.item) return;
      await this.sendItemProgress(thread, params.item, params.turnId);
      return;
    }

    if (message.method === 'turn/completed') {
      const params = message.params || {};
      const turnId = params.turn?.id;
      const thread = this.getThreadById(params.threadId);
      if (!thread || !turnId) return;
      const turn = thread.activeTurns.get(turnId);
      const content = (turn?.finalText || turn?.text || '').trim();
      this.stopTyping(thread, turnId);
      this.stopTurnTimeout(thread, turnId);
      if (!content) {
        await thread.discord.sendToChannel(thread.channelId, '✅ 완료');
        await this.updateTurnStatus(thread, turnId, 'completed', '최종 답변 전송 완료');
        this.stopStatusHeartbeat(thread, turnId);
        thread.activeTurns.delete(turnId);
        return;
      }
      await this.sendFinalAnswer(thread, content);
      await this.updateTurnStatus(thread, turnId, 'completed', '최종 답변 전송 완료');
      this.stopStatusHeartbeat(thread, turnId);
      thread.activeTurns.delete(turnId);
    }
  }

  private async handleServerRequest(message: any): Promise<void> {
    if (message.id === undefined) return;
    const params = message.params || {};
    const thread = this.getThreadById(params.threadId);

    const approvalToolName = this.approvalToolName(message.method);
    if (approvalToolName) {
      const turnId = params.turnId || this.firstActiveTurnId(thread);
      if (thread && turnId) {
        await this.updateTurnStatus(thread, turnId, 'waiting_approval', this.approvalStatusDetail(approvalToolName, params));
      }
      const approved = thread?.discord.sendApprovalRequest
        ? await thread.discord.sendApprovalRequest(thread.channelId, approvalToolName, params)
        : false;
      if (thread && turnId) {
        await this.updateTurnStatus(thread, turnId, 'running', approved ? '승인 완료. 작업을 계속 진행합니다.' : '승인 거절. Codex에 거절 결과를 전달했습니다.');
      }
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

  private async sendItemProgress(thread: ThreadState, item: any, turnId?: string): Promise<void> {
    if (!item?.id || thread.notifiedItems.has(item.id)) return;
    thread.notifiedItems.add(item.id);
    if (turnId) {
      await this.updateTurnStatus(thread, turnId, 'running', this.itemProgressDetail(item));
    }
    if (turnId && thread.typingTimers.has(turnId)) return;
    await thread.discord.sendTyping?.(thread.channelId);
  }

  private async updateTurnStatus(
    thread: ThreadState,
    turnId: string,
    status: RunStatus,
    detail: string,
    options: { touch?: boolean } = {}
  ): Promise<void> {
    const turn = thread.activeTurns.get(turnId);
    if (!turn) return;

    turn.status = status;
    turn.statusDetail = detail;
    if (options.touch !== false) {
      turn.lastActivityAt = Date.now();
    }
    const content = this.formatRunStatus(status, detail, turn.lastActivityAt);

    if (!turn.statusMessageId) {
      if (!turn.statusMessagePromise) {
        turn.statusMessagePromise = thread.discord.sendStatusMessage?.(thread.channelId, content)
          ?? Promise.resolve(null);
        thread.activeTurns.set(turnId, turn);
      }

      const messageId = await turn.statusMessagePromise;
      const latest = thread.activeTurns.get(turnId);
      if (!latest) return;
      latest.statusMessagePromise = undefined;
      if (messageId) {
        latest.statusMessageId = messageId;
        this.startStatusHeartbeat(thread, turnId);
        await thread.discord.updateMessage?.(
          thread.channelId,
          messageId,
          this.formatRunStatus(
            latest.status || status,
            latest.statusDetail || detail,
            latest.lastActivityAt
          )
        );
      }
      thread.activeTurns.set(turnId, latest);
      return;
    }

    await thread.discord.updateMessage?.(thread.channelId, turn.statusMessageId, content);
    thread.activeTurns.set(turnId, turn);
  }

  private async refreshTurnStatus(thread: ThreadState, turnId: string): Promise<void> {
    const turn = thread.activeTurns.get(turnId);
    if (!turn?.statusMessageId || !turn.status || !turn.statusDetail) return;
    if (turn.status === 'completed' || turn.status === 'failed') return;
    await thread.discord.updateMessage?.(
      thread.channelId,
      turn.statusMessageId,
      this.formatRunStatus(turn.status, turn.statusDetail, turn.lastActivityAt)
    );
  }

  private formatRunStatus(status: RunStatus, detail: string, lastActivityAt: number): string {
    const icon = this.statusIcon(status);
    return [
      `${icon} **${this.statusTitle(status)}**`,
      `상태: ${status}`,
      `마지막 활동: ${this.relativeActivity(lastActivityAt)}`,
      `현재 단계: ${detail}`,
    ].join('\n');
  }

  private relativeActivity(lastActivityAt: number): string {
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - lastActivityAt) / 1000));
    if (elapsedSeconds < 10) return '방금';
    if (elapsedSeconds < 60) return `${elapsedSeconds}초 전`;
    const elapsedMinutes = Math.floor(elapsedSeconds / 60);
    if (elapsedMinutes < 60) return `${elapsedMinutes}분 전`;
    const elapsedHours = Math.floor(elapsedMinutes / 60);
    return `${elapsedHours}시간 전`;
  }

  private statusTitle(status: RunStatus): string {
    switch (status) {
      case 'completed':
        return 'Codex 작업 완료';
      case 'stalled':
        return 'Codex 작업 정체 가능';
      case 'failed':
        return 'Codex 작업 실패';
      case 'waiting_approval':
        return 'Codex 승인 대기';
      default:
        return 'Codex 작업 진행 중';
    }
  }

  private statusIcon(status: RunStatus): string {
    switch (status) {
      case 'completed':
        return '✅';
      case 'stalled':
      case 'failed':
        return '⚠️';
      case 'waiting_approval':
        return '🟠';
      default:
        return '🟡';
    }
  }

  private itemProgressDetail(item: any): string {
    switch (item.type) {
      case 'agentMessage':
        return '답변 작성 중';
      case 'commandExecution':
        return `명령 실행 중: \`${this.truncateInline(item.command || 'command')}\``;
      case 'webSearch':
        return `웹 검색 중: \`${this.truncateInline(item.query || item.action || 'search')}\``;
      case 'fileChange':
        return '파일 변경 준비 중';
      default:
        return `${item.type || '도구'} 처리 중`;
    }
  }

  private approvalStatusDetail(toolName: string, params: any): string {
    if (toolName === 'commandExecution' && params?.command) {
      return `명령 실행 승인 대기: \`${this.truncateInline(params.command)}\``;
    }
    if (toolName === 'fileChange') return '파일 변경 승인 대기';
    if (toolName === 'permissions') return '권한 변경 승인 대기';
    return '사용자 승인 대기';
  }

  private truncateInline(value: string, maxLength: number = 140): string {
    const normalized = String(value).replace(/\s+/g, ' ').trim();
    return normalized.length > maxLength ? normalized.slice(0, maxLength - 1) + '…' : normalized;
  }

  private firstActiveTurnId(thread?: ThreadState): string | undefined {
    return thread ? thread.activeTurns.keys().next().value : undefined;
  }

  private async startTyping(thread: ThreadState, turnId: string): Promise<void> {
    this.stopTyping(thread, turnId);
    await thread.discord.sendTyping?.(thread.channelId);
    const timer = setInterval(() => {
      thread.discord.sendTyping?.(thread.channelId).catch(() => {});
    }, 8000);
    thread.typingTimers.set(turnId, timer);
  }

  private stopTyping(thread: ThreadState, turnId: string): void {
    const timer = thread.typingTimers.get(turnId);
    if (!timer) return;
    clearInterval(timer);
    thread.typingTimers.delete(turnId);
  }

  private startStatusHeartbeat(thread: ThreadState, turnId: string): void {
    if (thread.statusTimers.has(turnId)) return;
    const timer = setInterval(() => {
      this.refreshTurnStatus(thread, turnId).catch(() => {});
    }, 60000);
    thread.statusTimers.set(turnId, timer);
  }

  private stopStatusHeartbeat(thread: ThreadState, turnId: string): void {
    const timer = thread.statusTimers.get(turnId);
    if (!timer) return;
    clearInterval(timer);
    thread.statusTimers.delete(turnId);
  }

  private startTurnTimeout(thread: ThreadState, turnId: string): void {
    this.stopTurnTimeout(thread, turnId);
    const timer = setTimeout(() => {
      this.updateTurnStatus(
        thread,
        turnId,
        'stalled',
        '제한 시간 동안 완료 이벤트가 도착하지 않았습니다.',
        { touch: false }
      ).catch(() => {});
      thread.activeTurns.delete(turnId);
      this.stopTyping(thread, turnId);
      this.stopStatusHeartbeat(thread, turnId);
      thread.timeoutTimers.delete(turnId);
      thread.discord.sendToChannel(
        thread.channelId,
        '⚠️ Codex 응답이 제한 시간 안에 완료되지 않아 중단 표시했습니다. `/new-session` 또는 `!new-session`으로 새 세션을 시작한 뒤 다시 요청해 주세요.'
      ).catch(() => {});
    }, this.turnTimeoutMs);
    thread.timeoutTimers.set(turnId, timer);
  }

  private stopTurnTimeout(thread: ThreadState, turnId: string): void {
    const timer = thread.timeoutTimers.get(turnId);
    if (!timer) return;
    clearTimeout(timer);
    thread.timeoutTimers.delete(turnId);
  }

  private clearTypingTimers(thread: ThreadState): void {
    for (const timer of thread.typingTimers.values()) {
      clearInterval(timer);
    }
    thread.typingTimers.clear();
    for (const timer of thread.timeoutTimers.values()) {
      clearTimeout(timer);
    }
    thread.timeoutTimers.clear();
    for (const timer of thread.statusTimers.values()) {
      clearInterval(timer);
    }
    thread.statusTimers.clear();
  }
}
