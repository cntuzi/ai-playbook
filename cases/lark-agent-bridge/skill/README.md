# Lark Agent Bridge Skill

Unofficial bridge for Feishu/Lark bot messages and local AI agent sessions
running in tmux. Incoming messages are routed into an Agent pane; progress
updates and final results can be sent back to the same chat.

This repository is both:

- a Codex skill (`SKILL.md`)
- a set of local Node.js scripts for running the bridge

## Features

- Local Agent management page for choosing bot profiles and tmux panes.
- Multiple bot profiles can be active at the same time.
- Incoming messages are pasted into the selected Agent work session.
- Agent work content preview is redacted before the manager returns it.
- Progress feedback can be sent automatically from visible Agent output.
- Final results can be sent explicitly with `feedback.mjs`.
- Event listeners are rotated periodically and restarted if they exit.

## Requirements

- Node.js 20 or newer
- tmux
- `lark-cli`
- A Feishu/Lark bot app with message receive events and IM reply permissions
- One configured `lark-cli` profile per bot

## Quick Start

Configure a bot profile:

```bash
lark-cli profile add --name <profile-name> --app-id <APP_ID> --app-secret-stdin
lark-cli --profile <profile-name> doctor
```

Start the manager:

```bash
node scripts/manager.mjs --host 127.0.0.1 --port 17654
```

Open:

```text
http://127.0.0.1:17654/
```

Choose a bot profile, choose a tmux pane that contains your Agent session, then
start the bridge.

## Sending Feedback

Agents can send progress or final results back to the latest message received by
that profile:

```bash
node scripts/feedback.mjs \
  --profile <profile-name> \
  --kind progress \
  --text "Short progress update"

node scripts/feedback.mjs \
  --profile <profile-name> \
  --kind result \
  --text "Final result"
```

To target a specific message:

```bash
node scripts/feedback.mjs \
  --profile <profile-name> \
  --message-id <message-id> \
  --kind result \
  --text "Final result"
```

## Repository Layout

```text
.
├── SKILL.md
├── agents/openai.yaml
├── references/
│   ├── agent-management-platform-summary.md
│   └── setup.md
└── scripts/
    ├── feedback.mjs
    ├── manager.mjs
    ├── start-bridge.mjs
    └── tmux-pane-bridge.mjs
```

## Runtime State

Runtime state and logs are written outside the repository:

```text
~/.agents/run/lark-agent-bridge/
```

Do not publish runtime state, logs, chat IDs, message IDs, user IDs, app IDs,
tokens, app secrets, or terminal transcripts.

Keep the manager bound to localhost unless you have added your own
authentication and network controls.

## Development

Syntax-check scripts:

```bash
npm run check
```

Or without npm:

```bash
node --check scripts/manager.mjs
node --check scripts/tmux-pane-bridge.mjs
node --check scripts/feedback.mjs
node --check scripts/start-bridge.mjs
```

## License

MIT. See `LICENSE`.
