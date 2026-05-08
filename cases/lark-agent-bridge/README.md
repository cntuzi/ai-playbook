# Lark Agent Bridge

[English](./README.md) | [中文](./README.zh-CN.md)

A lightweight bridge that connects **Feishu/Lark bot messages** to **local AI
agent sessions already running in tmux**.

Implementation included in this case: [`skill/`](./skill/)

## Why This Exists

The octopus agent shows a full production pipeline: chat message → dispatcher →
isolated worktree → coding worker → commit/MR/notification.

Sometimes that is too much. During active development, I often already have
multiple Codex sessions open:

```
pm          product / planning agent
ai-native   research / architecture agent
web-dev     implementation agent
qa          verification agent
```

The missing piece is not another orchestration framework. It is a small local
control plane:

```
Chat message → choose bot profile → route to the right tmux pane
             → agent works in its existing session
             → progress/result goes back to the originating chat
```

That is what `lark-agent-bridge` does.

## Core Insight: Reuse the Live Agent Session

Most chat-to-agent bridges start a fresh process per request. That is clean, but
it loses the most valuable part of an active terminal session:

- current repository state
- already-loaded context
- long-running reasoning thread
- visible progress
- human ability to inspect or interrupt

This bridge treats the tmux pane as the durable Agent runtime.

```
┌──────────────────────┐
│  Feishu/Lark Bot      │
└──────────┬───────────┘
           │ message event
┌──────────▼───────────┐
│  Bridge Worker        │
│  lark-cli + Node.js   │
└──────────┬───────────┘
           │ paste + submit
┌──────────▼───────────┐
│  tmux pane            │
│  Codex / Claude Code  │
└──────────┬───────────┘
           │ feedback command
┌──────────▼───────────┐
│  Same chat thread     │
└──────────────────────┘
```

The bridge does not try to be the agent. It only routes messages, captures
visible progress, and provides a safe feedback path.

## Agent Management Page

The included skill exposes a local manager:

```bash
node skill/scripts/manager.mjs --host 127.0.0.1 --port 17654
```

It provides:

- bot profile selection from local `lark-cli` profiles
- tmux pane selection with human-readable window names
- multiple active agents at the same time
- redacted Agent work-content preview
- start/restart/stop controls per agent
- detail modal for low-frequency operational data

The page is intentionally phrased as an **Agent management platform**, not as a
Feishu administration page. External platform terms stay in setup docs, logs,
and code paths; the operator UI focuses on Agent concepts.

## Progress and Result Feedback

Incoming messages are injected with an instruction block that tells the Agent how
to reply:

```bash
node skill/scripts/feedback.mjs \
  --profile <profile-name> \
  --message-id <message-id> \
  --kind progress \
  --text "Short progress update"

node skill/scripts/feedback.mjs \
  --profile <profile-name> \
  --message-id <message-id> \
  --kind result \
  --text "Final answer"
```

The worker also watches the target pane and can send obvious visible progress
back to the originating message. This is intentionally conservative:

- it redacts common secrets and long identifiers
- it filters prompts, IDs, commands, and terminal status lines
- it does not treat progress as final output
- final results must be sent explicitly with `--kind result`

## Failure Modes That Shaped the Design

| Failure | Root cause | Fix |
|---------|------------|-----|
| Message appeared in Codex input but did not run | Submit key was sent while the TUI was still processing bracketed paste | Paste first, wait briefly, then send submit |
| Long-running listener stopped receiving events | Event stream stayed alive but became stale through local network/proxy state | Rotate event connections periodically and restart workers |
| Starting one bot killed other bots | Early manager treated the bridge as a singleton | Restart only the selected profile |
| Operator could not see what an Agent was doing | Bridge only had logs, not pane preview | Add redacted work-content preview |
| Page leaked too much implementation detail | Raw profiles, IDs, and commands were prominent | Move details into a modal and redact IDs |

## When to Use This vs Octopus Agent

Use **Lark Agent Bridge** when:

- you already run Codex/Claude Code in tmux
- you want to route chat messages into existing sessions
- you need multiple named local agents
- you want a simple local control plane, not a full MR pipeline

Use **Octopus Agent** when:

- each task should create an isolated worktree
- the system should commit, push, and create MRs automatically
- task locking, dependency checks, and post-processing are required
- you want a production dispatcher rather than an operator-facing bridge

## Requirements

- Node.js 20 or newer
- tmux
- `lark-cli`
- Feishu/Lark bot app with message receive and reply permissions
- Codex CLI or another terminal-based Agent session

See [`skill/references/setup.md`](./skill/references/setup.md) for setup.

## Safety Rules

Never publish runtime state, logs, chat IDs, message IDs, user IDs, app IDs,
tokens, app secrets, or terminal transcripts.

The included manager and scripts redact common sensitive values, but redaction is
a last line of defense. Operators should still review outputs before sharing
them.
