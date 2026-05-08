import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/daemon-entry.ts',
    'bin/agent-discord.ts',
    'bin/agent-discord-codex.ts',
    'bin/agent-discord-down.ts',
  ],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  shims: true,
});
