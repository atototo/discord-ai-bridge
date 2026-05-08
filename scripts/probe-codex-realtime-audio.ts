import { readFile } from 'fs/promises';
import { basename, resolve } from 'path';
import { CodexAppServerProcessClient } from '../src/codex-app/json-rpc-client.js';

type Notification = {
  method?: string;
  params?: any;
};

const audioPath = process.argv[2]
  ? resolve(process.argv[2])
  : '/Users/winter.e/Documents/Claude/Projects/cocifee/.agent-discord/attachments/1501950513632247930/voice-message.ogg';
const cwd = process.argv[3]
  ? resolve(process.argv[3])
  : '/Users/winter.e/Documents/Claude/Projects/cocifee';

const interestingMethods = new Set([
  'thread/realtime/started',
  'thread/realtime/transcript/delta',
  'thread/realtime/transcript/done',
  'thread/realtime/itemAdded',
  'thread/realtime/outputAudio/delta',
  'thread/realtime/sdp',
  'thread/realtime/error',
  'thread/realtime/closed',
  'error',
]);

function log(label: string, value: unknown): void {
  console.log(`\n== ${label} ==`);
  console.log(JSON.stringify(value, null, 2));
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const client = new CodexAppServerProcessClient('codex', [
    'app-server',
    '--listen',
    'stdio://',
    '--enable',
    'realtime_conversation',
  ]);
  const notifications: Notification[] = [];

  client.onNotification((message) => {
    if (interestingMethods.has(message.method || '')) {
      notifications.push(message);
      log(`notification ${message.method}`, message.params);
    }
  });

  client.onServerRequest((message) => {
    log(`server request ${message.method}`, message.params);
    client.respond(message.id!, { decision: 'decline' });
  });

  try {
    await client.start();
    console.log('initialized');

    const voices = await client.request('thread/realtime/listVoices', {});
    log('thread/realtime/listVoices response', voices);

    const models = await client.request('model/list', { cwd });
    log('model/list response', models);

    const features = await client.request('experimentalFeature/list', {});
    log('experimentalFeature/list response', features);

    const threadResponse = await client.request('thread/start', {
      cwd,
      approvalPolicy: 'on-request',
      approvalsReviewer: 'user',
      sessionStartSource: 'startup',
    });
    log('thread/start response', threadResponse);
    const threadId = (threadResponse as any)?.thread?.id;
    if (!threadId) throw new Error('thread/start did not return thread.id');

    const startResponse = await client.request('thread/realtime/start', {
      threadId,
      outputModality: 'text',
      transport: { type: 'websocket' },
      prompt: 'Transcribe the user audio and treat it as the next coding instruction. Reply only with the transcript if possible.',
    });
    log('thread/realtime/start response', startResponse);

    await sleep(1500);

    const bytes = await readFile(audioPath);
    const appendResponse = await client.request('thread/realtime/appendAudio', {
      threadId,
      audio: {
        data: bytes.toString('base64'),
        sampleRate: 48000,
        numChannels: 1,
        samplesPerChannel: null,
        itemId: `discord-${basename(audioPath)}`,
      },
    });
    log('thread/realtime/appendAudio raw ogg response', appendResponse);

    await sleep(8000);

    const stopResponse = await client.request('thread/realtime/stop', { threadId });
    log('thread/realtime/stop response', stopResponse);
    await sleep(1000);

    log('captured realtime notifications', notifications);
  } finally {
    client.stop();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
