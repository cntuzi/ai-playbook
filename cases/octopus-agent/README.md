# Octopus Agent (章鱼哥)

[English](./README.md) | [中文](./README.zh-CN.md)

An autonomous iOS development agent that receives tasks via Feishu (Lark), dispatches coding work to AI agents, creates merge requests, and reports progress — all automatically.

## What it does

```
Developer sends task in Feishu
    → Octopus acknowledges in 3 seconds
    → Creates git worktree + tmux session
    → Dispatches to Codex (coding) or Claude Code (review/docs)
    → Monitors progress, sends thread updates
    → On completion: commit → push → create MR → notify → cleanup
```

The developer's only job is to **send the task** and **review the MR**.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Feishu (Lark)                     │
│              WebSocket + REST API                    │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│              OpenClaw Gateway                        │
│  - WebSocket message receiving                      │
│  - Per-user session isolation (dmScope)             │
│  - Message queue (collect mode, 3s debounce)        │
│  - Route: feishu/octopus → octopus agent            │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│           Octopus Agent Session                      │
│  - Model: Claude Sonnet 4                           │
│  - Role: Router (dispatch in <15s, don't execute)   │
│  - Tools: bash, message, read, exec                 │
└────────┬─────────────────────────┬──────────────────┘
         │                         │
    Code tasks                Non-code tasks
         │                         │
┌────────▼────────┐     ┌─────────▼─────────┐
│  start-codex.sh │     │   Claude Code CLI  │
│  (one command)  │     │   (tmux session)   │
└────────┬────────┘     └───────────────────┘
         │
         ├── wt.sh (git worktree)
         ├── tmux session: moox-t{nn}
         │     ├── pane 0: Codex CLI
         │     └── pane 1: monitor-codex.sh
         │
         └── On completion:
              └── post-codex.sh
                   ├── git commit (🐙 prefix)
                   ├── git push
                   ├── GitLab MR via API
                   ├── Feishu notification
                   └── Cleanup worktree + tmux
```

## Key Design Decisions

### 1. Agent as Router, Not Executor

The octopus agent **does not read code, analyze specs, or write code**. It classifies the task (code vs non-code) and dispatches to the right tool. The heavy lifting happens inside Codex/Claude Code prompts.

**Why:** Each agent turn blocks the message queue. A 60-second turn means the next message waits 60 seconds. By keeping turns under 15 seconds, we maintain responsiveness.

### 2. Per-User Session Isolation

```jsonc
{
  "session": {
    "dmScope": "per-channel-peer"  // each user gets their own session
  }
}
```

Without this, all DMs share one session — Alice's context leaks to Bob, and replies go to the wrong person. With `per-channel-peer`, each user+channel combination gets an isolated session with its own conversation history and delivery context.

### 3. Notification Target Pinning

Each task writes a `.feishu-target` file in its worktree at dispatch time. All subsequent notifications (progress, completion, MR link) read from this file — never from the session store.

**Why:** In concurrent scenarios, querying the session store for the "current" delivery target returns whichever user was most recently active. Pinning the target at dispatch time prevents cross-talk.

### 4. One Worktree Per Task

Every coding task gets its own git worktree, tmux session, and Codex instance. Tasks are fully isolated — no shared state, no merge conflicts during execution.

```
octopus (dispatcher)
  ├── moox-t01   → Codex in worktree A
  ├── moox-t03   → Codex in worktree B
  ├── claude-review → Claude Code
  └── claude-docs   → Claude Code
```

### 5. File Locking on macOS

Shared resources (Codex config, git operations in main repo) use `mkdir`-based locks instead of `flock` (not available on macOS). The lock is a directory — `mkdir` is atomic on all Unix systems.

## Configuration

### OpenClaw Agent Definition

```jsonc
// openclaw.json → agents.list[]
{
  "id": "octopus",
  "name": "octopus",
  "workspace": "~/.openclaw/workspace-octopus",
  "model": "anthropic/claude-sonnet-4-20250514",
  "identity": {
    "name": "章鱼哥",
    "emoji": "🐙"
  }
}
```

### Channel Binding

```jsonc
// Route all Feishu messages from the octopus app to the octopus agent
{
  "type": "route",
  "agentId": "octopus",
  "match": {
    "channel": "feishu",
    "accountId": "octopus"
  }
}
```

### Concurrency Settings

```jsonc
{
  "session": {
    "dmScope": "per-channel-peer"
  },
  "messages": {
    "queue": {
      "mode": "collect",
      "debounceMs": 3000
    }
  }
}
```

## Workspace Structure

```
workspace-octopus/
├── IDENTITY.md        # Name, role, emoji
├── SOUL.md            # Core values and personality
├── USER.md            # Owner profile and preferences
├── AGENTS.md          # Startup sequence, memory management
├── TOOLS.md           # Execution rules, dispatch flow, red lines
├── MEMORY.md          # Learnings and evolution log
├── scripts/
│   ├── start-codex.sh     # One-command task launcher
│   ├── monitor-codex.sh   # Progress tracker + Feishu notifier
│   ├── post-codex.sh      # Commit + push + MR + cleanup
│   ├── feishu-notify.sh   # Feishu message sender (thread support)
│   └── feishu.conf        # Shared Feishu API config
└── memory/
    └── *.md               # Daily logs and project knowledge
```

## Role Separation

| Role | Responsibility | Environment |
|------|---------------|-------------|
| Octopus | Dispatch, classify, notify, monitor | OpenClaw agent session |
| Codex CLI | Write code (features, bugfixes, refactors) | Worktree + tmux |
| Claude Code CLI | Non-code tasks (review, docs, git, analysis) | tmux |

**Classification rule:** If it touches source files → Codex. Everything else → Claude Code.

## Task Lifecycle

### 1. Dispatch (< 15 seconds)

```
Receive message → Extract sender_id
→ Send confirmation "🐙 Starting T{nn}..."
→ Write prompt file to /tmp/
→ Call start-codex.sh (background)
→ Thread reply "🔧 Dispatched to Codex"
→ Turn ends
```

### 2. Execution (automatic)

`start-codex.sh` handles everything:
1. Create worktree via `wt.sh`
2. Write `.feishu-target` (pin notification target)
3. Add worktree to Codex trust config (with file lock)
4. Create tmux session with Codex + monitor

### 3. Monitoring (automatic)

`monitor-codex.sh` runs in tmux pane 1:
- Locks Feishu target from `.feishu-target` at startup
- Checks Codex state every 10 seconds
- Sends progress snapshots every 5 minutes
- Detects completion (BUILD SUCCEEDED/FAILED)

### 4. Post-processing (automatic)

`post-codex.sh` runs on completion:
1. `git add + commit` with 🐙 prefix
2. `git push` to feature branch
3. Create MR via GitLab API
4. Send Feishu notification with MR link
5. Cleanup tmux session + worktree (with file lock)

## Lessons Learned

### What worked

- **Thread-based progress tracking** — all updates in one Feishu thread per task, easy to follow
- **Worktree isolation** — no merge conflicts, parallel tasks just work
- **Agent as router** — keeping dispatch fast is critical for responsiveness
- **🐙 commit prefix** — instantly identifies AI-generated commits in git log

### What didn't work

- **Agent doing spec analysis before dispatch** — made each turn 30-60 seconds, blocked the queue
- **Shared session for all users** — replies went to the wrong person in concurrent scenarios
- **`flock` on macOS** — doesn't exist, broke scripts silently with `set -e`
- **Dynamic Feishu target lookup** — race condition in concurrent mode, last active user "wins"

### What we'd do differently

- Pin the notification target from day one (not as a late fix)
- Start with `per-channel-peer` session isolation (not `main`)
- Keep all heavy work in the downstream agent prompts, never in the dispatcher

## Requirements

- macOS (uses Keychain for secrets)
- [OpenClaw](https://github.com/nicepkg/openclaw) gateway
- Codex CLI or Claude Code CLI
- tmux
- Python 3 (JSON processing in scripts)
- Feishu (Lark) bot application
- GitLab instance (for MR creation)
