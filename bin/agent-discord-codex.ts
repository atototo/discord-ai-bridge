#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const agentDiscord = resolve(here, 'agent-discord.js');
const env = { ...process.env, CODEX_TRANSPORT: 'app-server' };

function run(args: string[]): number {
  const result = spawnSync(process.execPath, [agentDiscord, ...args], {
    stdio: 'inherit',
    env,
  });
  return result.status ?? 1;
}

run(['daemon', 'stop']);
process.exit(run(['go', 'codex', '--no-attach', ...process.argv.slice(2)]));
