import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { EventEmitter } from 'events';
import type { Readable, Writable } from 'stream';

export interface JsonRpcStreams {
  input: Readable;
  output: Writable;
}

export type JsonRpcMessage = {
  jsonrpc?: '2.0';
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

export class JsonRpcClient {
  private nextId = 1;
  private pending = new Map<number | string, PendingRequest>();
  private buffer = '';
  private emitter = new EventEmitter();

  constructor(private streams: JsonRpcStreams) {
    this.streams.input.on('data', (chunk) => this.handleData(chunk));
    this.streams.input.on('error', (error) => this.rejectAll(error));
  }

  request(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++;
    const message = { jsonrpc: '2.0' as const, id, method, params };

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.streams.output.write(`${JSON.stringify(message)}\n`, (error) => {
        if (error) {
          this.pending.delete(id);
          reject(error);
        }
      });
    });
  }

  respond(id: number | string, result: unknown): void {
    this.streams.output.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
  }

  onNotification(handler: (message: JsonRpcMessage) => void | Promise<void>): void {
    this.emitter.on('notification', handler);
  }

  onServerRequest(handler: (message: JsonRpcMessage) => void | Promise<void>): void {
    this.emitter.on('server-request', handler);
  }

  private handleData(chunk: Buffer | string): void {
    this.buffer += chunk.toString();

    let newlineIndex = this.buffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (line) this.handleLine(line);
      newlineIndex = this.buffer.indexOf('\n');
    }
  }

  private handleLine(line: string): void {
    let message: JsonRpcMessage;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }

    if (message.id !== undefined && message.method) {
      this.emitter.emit('server-request', message);
      return;
    }

    if (message.method) {
      this.emitter.emit('notification', message);
      return;
    }

    if (message.id !== undefined) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(message.error);
      else pending.resolve(message.result);
    }
  }

  private rejectAll(reason: unknown): void {
    for (const pending of this.pending.values()) {
      pending.reject(reason);
    }
    this.pending.clear();
  }
}

export class CodexAppServerProcessClient extends JsonRpcClient {
  private process?: ChildProcessWithoutNullStreams;

  constructor(command = 'codex', args = ['app-server', '--listen', 'stdio://']) {
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    });
    super({ input: child.stdout, output: child.stdin });
    this.process = child;
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString().trim();
      if (text) console.error(`[codex app-server] ${text}`);
    });
  }

  async start(): Promise<void> {
    await this.request('initialize', {
      clientInfo: {
        name: 'discord-ai-bridge',
        title: 'Discord AI Bridge',
        version: '0.1.0',
      },
      capabilities: {
        experimentalApi: true,
      },
    });
  }

  stop(): void {
    this.process?.kill();
    this.process = undefined;
  }
}
