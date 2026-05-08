import { PassThrough } from 'stream';
import { JsonRpcClient } from '../../src/codex-app/json-rpc-client.js';

describe('JsonRpcClient', () => {
  it('writes JSON-RPC requests as newline-delimited messages and resolves responses', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const writes: string[] = [];
    output.on('data', (chunk) => writes.push(chunk.toString('utf8')));

    const client = new JsonRpcClient({ input, output });

    const promise = client.request('initialize', { clientInfo: { name: 'test' } });

    expect(writes.join('')).toContain('"jsonrpc":"2.0"');
    expect(writes.join('')).toContain('"method":"initialize"');

    input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, result: { ok: true } })}\n`);

    await expect(promise).resolves.toEqual({ ok: true });
  });

  it('routes server notifications and server requests separately', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const client = new JsonRpcClient({ input, output });
    const notifications: any[] = [];
    const requests: any[] = [];

    client.onNotification((message) => notifications.push(message));
    client.onServerRequest((message) => requests.push(message));

    input.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'item/agentMessage/delta', params: { delta: 'hi' } })}\n`);
    input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'item/commandExecution/requestApproval', params: { command: 'ls' } })}\n`);

    await new Promise((resolve) => setImmediate(resolve));

    expect(notifications).toEqual([
      expect.objectContaining({ method: 'item/agentMessage/delta' }),
    ]);
    expect(requests).toEqual([
      expect.objectContaining({ id: 7, method: 'item/commandExecution/requestApproval' }),
    ]);
  });
});
