# Discord AI Bridge

[English](README.md) | [한국어](README.ko.md)

Custom local bridge for using Codex from Discord, based on `DoBuDevel/discord-agent-bridge` and maintained as `atototo/discord-ai-bridge`.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/Tests-179%20passing-brightgreen.svg)](./tests)

## Overview

Discord AI Bridge connects local AI coding assistants to Discord. This fork is tuned for local Codex app-server usage: Discord messages become Codex turns, Codex replies are posted back to the project channel, generated images/files are uploaded as Discord attachments, and Codex approval requests can be approved or denied with Discord reactions.

The original tmux transport is still available for Claude/OpenCode compatibility. For Codex, use `CODEX_TRANSPORT=app-server`, which starts `codex app-server --listen stdio://` and uses structured JSON-RPC events instead of scraping terminal output. Each local project gets its own Discord category/channel mapping, while one daemon manages the Discord bot connection.

## Features

- **Multi-Agent Support**: Works with Codex, Claude Code, and OpenCode
- **Local-First Codex Mode**: Runs Codex on your local machine, not as a cloud task
- **Codex app-server Transport**: Structured Codex transport using JSON-RPC over stdio instead of tmux capture
- **Discord Approval UX**: Command/file/permission approvals are routed to Discord reactions with human-readable approval text
- **Images and Files Both Ways**: Discord image inputs become Codex `localImage` inputs; Codex output files are uploaded back to Discord
- **Generated Image Uploads**: Images under `~/.codex/generated_images/` are allowed for outbound Discord upload
- **Discord User Allowlist**: Restricts who can send messages or approve requests
- **Auto-Discovery**: Automatically detects installed AI agents on your system
- **Real-Time Streaming**: Captures tmux output and streams to Discord every 3 seconds
- **Project Isolation**: Each project gets a dedicated Discord channel
- **Single Daemon**: One Discord bot connection manages all projects
- **Session Management**: Persistent tmux sessions survive disconnections
- **Discord New Session Command**: `/new-session` resets the current channel's Codex app-server thread, with an optional context carry-over
- **YOLO Mode**: Optional `--yolo` flag runs Claude Code with `--dangerously-skip-permissions`
- **Sandbox Mode**: Optional `--sandbox` flag runs Claude Code in isolated Docker container
- **Rich CLI**: Intuitive commands for setup, control, and monitoring
- **Type-Safe**: Written in TypeScript with dependency injection pattern
- **Well-Tested**: 171 unit tests with Vitest

## Supported Platforms

| Platform | Supported | Notes |
|----------|-----------|-------|
| **macOS** | Yes | Developed and tested |
| **Linux** | Expected | Should work (tmux-based), not yet tested |
| **Windows (WSL)** | Expected | Should work with tmux installed in WSL, not yet tested |
| **Windows (native)** | No | tmux is not available natively |

## Prerequisites

- **Node.js**: Version 18 or higher
- **tmux**: Version 3.0 or higher
- **Discord Bot**: Create a bot following the [Discord Bot Setup Guide](docs/DISCORD_SETUP.md)
  - Required permissions: Send Messages, Manage Channels, Read Message History, Embed Links, Add Reactions
  - Required intents: Guilds, GuildMessages, MessageContent, GuildMessageReactions
  - Recommended OAuth scopes: `bot` and `applications.commands` for slash commands
- **AI Agent**: At least one of:
  - [Codex CLI](https://developers.openai.com/codex)
  - [Claude Code](https://code.claude.com/docs/en/overview)
  - [OpenCode](https://github.com/OpenCodeAI/opencode)

## Installation

### From source

This repo is currently intended to be used from source. Publishing to npm is not required for local use.

```bash
git clone https://github.com/atototo/discord-ai-bridge.git
cd discord-ai-bridge
npm install
npm run build
npm link
```

After `npm link`, these commands are available globally:

```bash
agent-discord          # full CLI
agent-discord-codex    # restart daemon in Codex app-server mode and start current project
agent-discord-down     # stop the global bridge daemon
```

## Quick Start

### 1. Setup Discord Bot

```bash
# One-time setup with your Discord bot token
agent-discord setup YOUR_DISCORD_BOT_TOKEN
```

The `setup` command saves your token and auto-detects the Discord server ID. You can verify or change settings later:

```bash
agent-discord config --show              # View current configuration
agent-discord config --server SERVER_ID  # Change server ID manually
```

Because this bridge forwards Discord messages into a local tmux shell, set a Discord user allowlist before starting it:

```bash
export DISCORD_ALLOWED_USER_IDS=123456789012345678,234567890123456789
```

> **Note**: `setup` is required for initial configuration — it auto-detects the server ID by connecting to Discord. The `config` command only updates individual values without auto-detection.

### 2. Start Working

```bash
cd ~/projects/my-app

# Recommended local Codex flow
agent-discord-codex
```

`agent-discord-codex` runs from the current project directory. It stops the existing daemon, restarts the bridge with `CODEX_TRANSPORT=app-server`, creates or resumes the project channel, and starts local Codex app-server mode without a tmux attach.

Run this once from each local project path you want to connect. For example, running it in `~/projects/cocifee` creates or resumes that project's Discord category/channel, and running it later in `~/projects/wedding` creates or resumes a separate `wedding` category/channel. Manually creating Discord channels with the `+` button does not register a project path with the bridge.

```bash
agent-discord-codex             # Codex app-server mode for this directory
agent-discord-down              # Stop the bridge daemon
agent-discord daemon status     # Check daemon status and log path
agent-discord go claude         # tmux mode for Claude Code
agent-discord go --sandbox      # Sandbox mode (Docker isolation, Claude Code only)
```

Your AI agent is now running in tmux, with output streaming to Discord every 3 seconds.

The long-form equivalent is:

```bash
agent-discord daemon stop
CODEX_TRANSPORT=app-server agent-discord go codex
```

In this mode Codex is started by the bridge as `codex app-server --listen stdio://`. Discord messages become Codex `turn/start` requests, assistant answers are posted back to Discord when the turn completes, and command/file-change/permission approval requests are routed to Discord reactions. There is no tmux Codex UI to attach to in this mode.

When a daemon restart creates a fresh Codex app-server thread, the bridge fetches recent messages from the same Discord channel and prepends them as lightweight context to the first turn. This preserves enough conversational continuity without trying to persist Codex's internal thread state. Set `DISCORD_CONTEXT_MESSAGES=0` to disable it or another number to tune how many prior messages are included.

### New Codex Sessions From Discord

Use the slash command in a mapped Codex channel:

```text
/new-session
```

This keeps the Discord channel and project mapping unchanged, but resets the in-memory Codex app-server thread for that project. The next message starts a fresh Codex chat without previous context.

If you want a fresh Codex thread that still receives recent Discord channel context on the first message, enable the optional slash command argument:

```text
/new-session with-context: true
```

The command is registered with a visible Discord description that mentions `with-context:true`, plus a separate option description after selecting the command. If slash commands are not visible yet, reinvite the bot with the `applications.commands` scope or restart the daemon so it can register guild commands. A text fallback is also available:

```text
!new-session
!new-session with-context
```

If the daemon is already running with a different transport, restart it with the same environment first:

```bash
agent-discord daemon stop
CODEX_TRANSPORT=app-server agent-discord go codex --no-attach
```

### Files and Images

Discord attachments are downloaded into the project under `.agent-discord/attachments/<message-id>/`.
In Codex app-server mode, image attachments are sent as `localImage` inputs; other files are sent as local paths in the text input so Codex can inspect them from the workspace.

When Codex creates a file that should be sent back to Discord, it should include this marker in its final answer:

```text
[[discord-attach:/absolute/path]]
```

The bridge uploads the file and removes the marker from the Discord message. This works in both tmux and Codex app-server transports. For safety, outbound upload is restricted to files inside the project directory plus Codex-generated images under `~/.codex/generated_images/`. In app-server mode the bridge also injects a short instruction so Codex knows to use Discord file attachments instead of local Markdown links.

### Approval Requests

Codex app-server command/file/permission approval requests are posted to Discord. The bot shows the human-readable `reason` first, for example:

```text
🔒 승인 요청 · 명령 실행

프로젝트 밖 경로인 /Users/winter.e/Desktop/codex-approval-test.txt 에 hello를 쓰도록 허용할까요?

✅ 승인 / ❌ 거절 (120초 후 자동 거절)
```

React with ✅ or ❌. If nobody responds before timeout, the bridge denies the request.

### Advanced: Step-by-Step Setup

For more control over project configuration, use `init` to set up the project separately:

```bash
cd ~/projects/my-app

# Initialize with a specific agent and custom channel description
agent-discord init codex "My awesome application"

# Then start step-by-step:
agent-discord daemon start    # Start global daemon
agent-discord start          # Start this project
agent-discord attach         # Attach to tmux session
```

## CLI Reference

### Global Commands

#### `setup <token>`

One-time setup: saves bot token, connects to Discord to auto-detect your server, and shows installed agents.

```bash
agent-discord setup YOUR_BOT_TOKEN
```

The setup process will:
1. Save your bot token to `~/.discord-agent-bridge/config.json`
2. Connect to Discord and detect which server(s) your bot is in
3. If the bot is in multiple servers, prompt you to select one
4. Save the server ID automatically

#### `daemon <action>`

Control the global daemon process.

```bash
agent-discord daemon start    # Start daemon
agent-discord daemon stop     # Stop daemon
agent-discord daemon status   # Check daemon status
```

#### `list`

List all registered projects.

```bash
agent-discord list
```

#### `agents`

List available AI agents detected on your system.

```bash
agent-discord agents
```

#### `config [options]`

View or update global configuration.

```bash
agent-discord config --show              # Show current configuration
agent-discord config --token NEW_TOKEN   # Update bot token
agent-discord config --server SERVER_ID  # Set Discord server ID manually
agent-discord config --port 18470        # Set hook server port
```

### Project Commands

Run these commands from your project directory.

Each initialized project stores its own `projectName`, `projectPath`, tmux session name, and Discord channel IDs in the bridge state file. A Discord channel is therefore bound to the project path that created it; sending a message in that channel continues the Codex thread for that stored project path, regardless of the shell directory you are currently in. To use a different path, initialize or `go` from that path so it gets its own project entry and channel.

When creating channels, the bridge creates or reuses a Discord category named after the project and places that project's agent channels under it.

#### `init <agent> <description>`

Initialize current directory as a project.

```bash
agent-discord init claude "Full-stack web application"
agent-discord init opencode "Data pipeline project"
```

#### `start [options]`

Start the bridge server for registered projects.

```bash
agent-discord start                        # Start all projects
agent-discord start -p my-app             # Start a specific project
agent-discord start -p my-app --attach    # Start and attach to tmux
```

#### `stop [project]`

Stop a project: kills tmux session, deletes Discord channel, and removes project state. Defaults to current directory name if project is not specified.

```bash
agent-discord stop                # Stop current directory's project
agent-discord stop my-app         # Stop a specific project
agent-discord stop --keep-channel # Keep Discord channel (only kill tmux)
```

#### `status`

Show project status.

```bash
agent-discord status
```

#### `attach [project]`

Attach to a project's tmux session. Defaults to current directory name if project is not specified.

```bash
agent-discord attach              # Attach to current directory's project
agent-discord attach my-app       # Attach to a specific project
```

Press `Ctrl-b d` to detach from tmux without stopping the agent.

#### `go [agent] [options]`

Quick start: start daemon, setup project if needed, and attach to tmux. Works without `init` — auto-detects installed agents and creates the Discord channel automatically.

```bash
agent-discord go              # Auto-detect agent, setup & attach
agent-discord go claude       # Use a specific agent
agent-discord go --yolo       # YOLO mode (skip permissions, Claude Code only)
agent-discord go --sandbox    # Sandbox mode (Docker isolation, Claude Code only)
agent-discord go --no-attach  # Start without attaching to tmux
```

## How It Works

### Architecture

```
┌─────────────────┐
│  AI Agent CLI   │  (Claude, OpenCode)
│  Running in     │
│  tmux session   │
└────────┬────────┘
         │
         │ tmux capture-pane (every 3s)
         │
    ┌────▼─────────────┐
    │  CapturePoller   │  Detects state changes
    └────┬─────────────┘
         │
         │ Discord.js
         │
    ┌────▼──────────────┐
    │  Discord Channel  │  #project-name
    └───────────────────┘
```

### Components

- **Daemon Manager**: Single global process managing Discord connection
- **Capture Poller**: Polls tmux panes every 3s, detects changes, sends to Discord
- **Codex App Server Session Manager**: Bridges Codex JSON-RPC thread/turn/event traffic when `CODEX_TRANSPORT=app-server`
- **Agent Registry**: Factory pattern for multi-agent support (Codex, Claude, OpenCode)
- **State Manager**: Tracks project state, sessions, and channels
- **Dependency Injection**: Interfaces for storage, execution, environment (testable, mockable)

### Polling Model

The bridge uses a **polling-based** architecture instead of hooks:

1. Every 3 seconds (configurable), the poller runs `tmux capture-pane`
2. Compares captured content with previous snapshot
3. If changes detected, sends new content to Discord
4. Handles multi-line output, ANSI codes, and rate limiting

This approach is simpler and more reliable than hook-based systems, with minimal performance impact.

### Project Lifecycle

1. **Go / Init**: Registers project in `~/.discord-agent-bridge/state.json` and creates a Discord channel
2. **Start**: Launches AI agent in a named tmux session, or starts Codex app-server when that transport is selected
3. **Polling/Event**: tmux transport captures tmux output; Codex app-server transport streams JSON-RPC events
4. **Stop**: Terminates tmux session, deletes channel, and cleans up state
5. **Attach**: User can join tmux session to interact directly

## Supported Agents

| Agent | Binary | Auto-Detect | YOLO Support | Sandbox Support | Notes |
|-------|--------|-------------|--------------|-----------------|-------|
| **Codex** | `codex` | Yes | No | No | Local OpenAI Codex CLI |
| **Claude Code** | `claude` | Yes | Yes | Yes | Official Anthropic CLI |
| **OpenCode** | `opencode` | Yes | No | No | Open-source alternative |

### Agent Detection

The CLI automatically detects installed agents using `command -v <binary>`. Run `agent-discord agents` to see available agents on your system.

### Adding Custom Agents

To add a new agent, extend the `BaseAgentAdapter` class in `src/agents/`:

```typescript
export class MyAgentAdapter extends BaseAgentAdapter {
  constructor() {
    super({
      name: 'myagent',
      displayName: 'My Agent',
      command: 'myagent-cli',
      channelSuffix: 'myagent',
    });
  }

  getStartCommand(projectPath: string, yolo = false, sandbox = false): string {
    return `cd "${projectPath}" && ${this.config.command}`;
  }
}
```

Register your adapter in `src/agents/index.ts`.

## Configuration

### Global Config

Stored in `~/.discord-agent-bridge/config.json`:

```json
{
  "token": "YOUR_BOT_TOKEN",
  "serverId": "YOUR_SERVER_ID",
  "hookServerPort": 18470
}
```

| Key | Required | Description | Default |
|-----|----------|-------------|---------|
| `token` | **Yes** | Discord bot token. Set via `agent-discord setup <token>` or `config --token` | - |
| `serverId` | **Yes** | Discord server (guild) ID. Auto-detected by `setup`, or set via `config --server` | - |
| `hookServerPort` | No | Port for the hook server | `18470` |
| `allowedUserIds` | Strongly recommended | Discord user IDs allowed to send messages and approve requests | allow all users |

```bash
agent-discord config --show               # View current config
agent-discord config --token NEW_TOKEN     # Update bot token
agent-discord config --server SERVER_ID    # Set server ID manually
agent-discord config --port 18470          # Set hook server port
```

### Project State

Project state is stored in `~/.discord-agent-bridge/state.json` and managed automatically.

### Environment Variables

Config values can be overridden with environment variables:

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `DISCORD_BOT_TOKEN` | **Yes** (if not in config.json) | Discord bot token | - |
| `DISCORD_GUILD_ID` | **Yes** (if not in config.json) | Discord server ID | - |
| `DISCORD_ALLOWED_USER_IDS` | Strongly recommended | Comma-separated Discord user IDs allowed to control local agents | allow all users |
| `DISCORD_CHANNEL_ID` | No | Override default channel | Auto-created per project |
| `TMUX_SESSION_PREFIX` | No | Prefix for tmux session names | `agent-` |
| `HOOK_SERVER_PORT` | No | Port for the hook server | `18470` |
| `CAPTURE_POLL_INTERVAL_MS` | No | tmux capture polling interval | `3000` |
| `CODEX_TRANSPORT` | No | Codex transport: `tmux` or `app-server` | `tmux` |
| `DISCORD_CONTEXT_MESSAGES` | No | Recent channel messages to include when a new Codex app-server thread starts | `12` |

```bash
DISCORD_BOT_TOKEN=token agent-discord daemon start
DISCORD_GUILD_ID=server_id agent-discord go
DISCORD_ALLOWED_USER_IDS=user_id_1,user_id_2 agent-discord go codex
CODEX_TRANSPORT=app-server agent-discord go codex
```

## Development

### Building

```bash
npm install
npm run build          # Compile TypeScript
npm run build:watch    # Watch mode
```

### Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

Test suite includes 162 tests covering:
- Agent adapters
- State management
- Discord client
- Capture polling
- CLI commands
- Storage and execution mocks

### Project Structure

```
discord-ai-bridge/
├── bin/                  # CLI entry point (agent-discord)
├── src/
│   ├── agents/           # Agent adapters (Codex, Claude, OpenCode)
│   ├── codex-app/        # Codex app-server JSON-RPC transport
│   ├── capture/          # tmux capture, polling, state detection
│   ├── config/           # Configuration management
│   ├── discord/          # Discord client and message handlers
│   ├── infra/            # Infrastructure (storage, shell, environment)
│   ├── state/            # Project state management
│   ├── tmux/             # tmux session management
│   └── types/            # TypeScript interfaces
├── tests/                # Vitest test suite
├── package.json
└── tsconfig.json
```

### Dependency Injection

The codebase uses constructor injection with interfaces for testability:

```typescript
// Interfaces
interface IStorage { readFile, writeFile, exists, unlink, mkdirp, chmod }
interface ICommandExecutor { exec, execVoid }
interface IEnvironment { get, homedir, platform }

// Usage
class DaemonManager {
  constructor(
    private storage: IStorage = new FileStorage(),
    private executor: ICommandExecutor = new ShellCommandExecutor()
  ) {}
}

// Testing
const mockStorage = new MockStorage();
const daemon = new DaemonManager(mockStorage);
```

### Code Quality

- TypeScript strict mode enabled
- ESM modules with `.js` extensions in imports
- Vitest with 162 passing tests
- No unused locals/parameters (enforced by `tsconfig.json`)

## Troubleshooting

### Bot not connecting

1. Verify token: `agent-discord config --show`
2. Check bot permissions in Discord Developer Portal
3. Ensure MessageContent intent is enabled
4. Restart daemon: `agent-discord daemon stop && agent-discord daemon start`

### Agent not detected

1. Run `agent-discord agents` to see available agents
2. Verify agent binary is in PATH: `which codex`
3. Install missing agent and retry

### tmux session issues

1. Check session exists: `tmux ls`
2. Kill stale session: `tmux kill-session -t <session-name>`
3. Restart project: `agent-discord stop && agent-discord start`

### No messages in Discord

1. Check daemon status: `agent-discord daemon status`
2. Check daemon logs
3. Check Discord channel permissions (bot needs Send Messages)

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Guidelines

- Add tests for new features
- Maintain TypeScript strict mode compliance
- Follow existing code style
- Update documentation as needed

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [Discord.js](https://discord.js.org/)
- Powered by local [Codex](https://developers.openai.com/codex), [Claude Code](https://code.claude.com/docs/en/overview), and [OpenCode](https://github.com/OpenCodeAI/opencode)
- Inspired by [OpenClaw](https://github.com/nicepkg/openclaw)'s messenger-based command system. The motivation was to remotely control and monitor long-running AI agent tasks from anywhere via Discord.

## Support

- Issues: [GitHub Issues](https://github.com/atototo/discord-ai-bridge/issues)
- Discord Bot Setup: [Setup Guide](docs/DISCORD_SETUP.md)
