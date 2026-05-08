#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const agentDiscord = resolve(here, 'agent-discord.js');

const result = spawnSync(process.execPath, [agentDiscord, 'daemon', 'stop', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 1);
