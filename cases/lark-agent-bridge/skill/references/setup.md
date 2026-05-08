# Setup

This bridge expects a local `lark-cli` installation, `tmux`, and Node.js.

## 1. Configure a bot profile

Create one `lark-cli` profile per bot:

```bash
lark-cli profile add --name <profile-name> --app-id <APP_ID> --app-secret-stdin
lark-cli --profile <profile-name> doctor
```

Never store app secrets in this repository. Pass secrets through stdin or your
local credential store.

## 2. Enable bot capabilities

In the Feishu/Lark developer console, enable the bot and event subscription for
incoming messages. The bridge expects:

| Capability | Typical requirement |
|---|---|
| Receive messages | Event subscription for `im.message.receive_v1` |
| Reply to messages | Bot permission for sending/replying to IM messages |
| Bot identity | `lark-cli` profile configured with bot credentials |

Exact permission names can vary by tenant and app type. If the bridge receives
events but cannot reply, re-check IM send/reply permissions.

## 3. Start the Agent manager

```bash
node ~/.agents/skills/lark-agent-bridge/scripts/manager.mjs --host 127.0.0.1 --port 17654
```

Open:

```text
http://127.0.0.1:17654/
```

Choose a bot profile, choose a tmux pane that contains an Agent session, and
start the bridge.

## 4. Optional headless bridge

For a one-shot command that starts a Codex process per message:

```bash
node ~/.agents/skills/lark-agent-bridge/scripts/start-bridge.mjs \
  --agent codex \
  --workspace "$PWD" \
  --bot <profile-name> \
  --restart
```

For the tmux-pane bridge used by the manager:

```bash
node ~/.agents/skills/lark-agent-bridge/scripts/tmux-pane-bridge.mjs \
  --profile <profile-name> \
  --target <tmux-pane-id>
```

## Runtime state

Runtime files are stored outside the repository under:

```text
~/.agents/run/lark-agent-bridge/
```

Do not publish logs, state files, chat IDs, message IDs, user IDs, or terminal
transcripts.
