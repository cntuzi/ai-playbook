---
name: lark-agent-bridge
version: 0.1.0
description: "Bridge a Feishu/Lark bot to a local AI agent process. Use when the user wants a Lark bot to forward messages to Codex/Claude and reply in the same chat."
metadata:
  requires:
    bins: ["node", "lark-cli"]
---

# Lark Agent Bridge

Use this skill when the user wants to connect a Feishu/Lark bot to a local
agent session, inspect local Agent work sessions, or send progress/results back
to the originating chat.

For setup details, read [`references/setup.md`](references/setup.md). For the
local Agent management platform behavior, read
[`references/agent-management-platform-summary.md`](references/agent-management-platform-summary.md).

## Manager UI

Start the local Agent management page when the user wants to choose which bot
profile should attach to which Agent work session:

```bash
node ~/.agents/skills/lark-agent-bridge/scripts/manager.mjs --port 17654
```

The page lists configured `lark-cli` profiles, fetches each bot's display name
from `/open-apis/bot/v3/info`, and starts a detached tmux bridge for the
selected bot and Agent work session. Incoming messages are pasted into the
selected tmux pane, so that Agent session receives them as user input.

The manager also exposes the selected session's work content in the page and
through `/api/pane-content?target=<pane>&lines=160`, so the operator can inspect
what the Agent is doing. Captured content is redacted before it is returned by
the manager page/API.

Multiple bot profiles can run at the same time. Starting a profile restarts only
that profile's bridge session and leaves the others active.

Agents can send processing updates or final results back to the Lark chat with:

```bash
node ~/.agents/skills/lark-agent-bridge/scripts/feedback.mjs \
  --profile <lark-cli-profile> \
  --kind progress \
  --text "短进度说明"
```

If the bridge has received a message for that profile, the feedback command uses
the latest message as the reply target. A specific target can also be supplied
with `--message-id <om_xxx>` or `--chat-id <oc_xxx>`.

The tmux worker also starts an automatic progress monitor for each received
message. It watches the target pane for newly visible Agent output, filters and
redacts it, and replies to the originating Lark message as `处理进度`. Use the
explicit `feedback.mjs --kind result` command for final answers. The injected
prompt tells the agent not to merely say it will reply, but to run the result
command when it is ready to send the final response.

The tmux worker is:

```bash
node ~/.agents/skills/lark-agent-bridge/scripts/tmux-pane-bridge.mjs \
  --profile <lark-cli-profile> \
  --target <tmux-pane>
```

This is a local reconstruction of the project-specific bridge entrypoint:

```bash
node ~/.agents/skills/lark-agent-bridge/scripts/start-bridge.mjs --agent codex --workspace /path/to/workspace --bot <profile-or-index> --restart
```

## Prerequisites

Read `../lark-shared/SKILL.md` before setup when available. The bridge uses bot
identity and needs a configured `lark-cli` profile for the bot.

If profiles are missing, add one with:

```bash
lark-cli profile add --name <profile-name> --app-id <APP_ID> --app-secret-stdin
```

The app must have IM/event permissions enabled in the Feishu developer console. Typical scopes:

| Operation | Scope |
|---|---|
| Receive IM events | event subscription for `im.message.receive_v1` |
| Reply to messages | `im:message` |

## Start

```bash
node ~/.agents/skills/lark-agent-bridge/scripts/start-bridge.mjs \
  --agent codex \
  --workspace "$PWD" \
  --bot <profile-name> \
  --restart
```

`--bot` accepts a profile name. If it is a number, it selects that 1-based item from `lark-cli profile list`.

## Safety

Do not commit or paste app secrets, access tokens, chat IDs, message IDs,
user IDs, logs, or terminal transcripts. The manager and feedback scripts redact
common sensitive values, but operators are still responsible for reviewing
outputs before publishing or sharing them.

The default Codex invocation is:

```bash
codex exec --cd <workspace> --sandbox workspace-write --ask-for-approval never <prompt>
```

Use `--sandbox read-only` for read-only operation, or `--sandbox danger-full-access` only for trusted chats.
