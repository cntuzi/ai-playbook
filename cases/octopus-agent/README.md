# Octopus Agent (章鱼哥)

[English](./README.md) | [中文](./README.zh-CN.md)

An autonomous development agent that bridges **structured specs** and **AI coding agents** — turning task descriptions into merge requests with zero human intervention in between.

Built on [OpenClaw](https://github.com/nicepkg/openclaw) gateway + [Spec Orchestrator](https://github.com/cntuzi/spec-orchestrator) methodology.

## Why This Exists

AI can write code. But "write code" is only one step in a much longer chain:

```
Understand requirements → Find the right files → Read API contracts
→ Write code → Build → Test → Commit → Push → Create MR → Notify → Clean up
```

If a human has to trigger each step, you've just replaced typing with prompting — same bottleneck, different keyboard.

The octopus agent removes the human from the middle of this chain. The human stays at the **edges**: defining what to build (via specs) and reviewing the result (via MR).

## Core Insight: Three-Layer Separation

The system is built on [Spec Orchestrator](https://github.com/cntuzi/spec-orchestrator)'s three-layer model:

```
┌─────────────────────────────────────────────┐
│  Spec Layer — WHAT to build                 │
│  Feature YAML + Task Board + API Contracts  │
│  (spec-orchestrator)                        │
└──────────────────┬──────────────────────────┘
                   │ reads
┌──────────────────▼──────────────────────────┐
│  Agent Layer — HOW to build                 │
│  Platform conventions + coding rules        │
│  (agents/ios/ai/*.md, CLAUDE.md)            │
└──────────────────┬──────────────────────────┘
                   │ executes
┌──────────────────▼──────────────────────────┐
│  Worker Layer — Runtime execution           │
│  Codex/Claude Code in isolated worktree     │
│  (one instance per task, fully autonomous)  │
└─────────────────────────────────────────────┘
```

**Spec** defines requirements, dependencies, acceptance criteria — shared between humans and AI, platform-agnostic.

**Agent** defines platform conventions — Swift/UIKit patterns for iOS, Kotlin/Compose for Android. Lives in the platform repo.

**Worker** is a runtime instance that combines both: reads Spec for context, follows Agent conventions for execution. Each worker runs in an isolated git worktree.

### Where does the octopus fit?

The octopus is the **orchestration layer** that connects these three layers at runtime:

```
                    ┌─────────────┐
                    │   Human     │
                    │ "执行 T20"   │
                    └──────┬──────┘
                           │ Feishu message
                    ┌──────▼──────┐
                    │   Octopus   │  ← Orchestrator
                    │  (OpenClaw) │
                    └──┬───┬───┬──┘
                       │   │   │
              ┌────────┘   │   └────────┐
              │            │            │
        ┌─────▼─────┐ ┌───▼───┐ ┌─────▼─────┐
        │ Read Spec  │ │ Lock  │ │ Dispatch  │
        │ Check deps │ │ Task  │ │ Worker    │
        └───────────┘ └───────┘ └───────────┘
                                      │
                               ┌──────▼──────┐
                               │   Worker    │
                               │ (Codex in   │
                               │  worktree)  │
                               └──────┬──────┘
                                      │
                               ┌──────▼──────┐
                               │  Automated  │
                               │ commit/push │
                               │  MR/notify  │
                               └─────────────┘
```

The octopus **does not write code**. It reads specs, checks dependencies, locks tasks, dispatches workers, and handles the post-processing pipeline. This separation is critical.

## Architecture: Why OpenClaw

The octopus could have been a simple script. Why use OpenClaw as the gateway?

### Problem: Chat-to-Pipeline Bridge

Developers communicate via chat (Feishu/Slack/Discord). AI coding tools run in terminals. Someone has to bridge the gap — receive a chat message, understand intent, launch the right tool, and report back.

### Solution: OpenClaw as Message Router

```
┌─────────────────────────────────────────────────────┐
│                    Feishu (Lark)                     │
│              WebSocket (persistent)                  │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│              OpenClaw Gateway                        │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │ Session Management                           │    │
│  │ • per-channel-peer isolation                 │    │
│  │ • conversation history per user              │    │
│  │ • model + tools + workspace binding          │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │ Message Queue                                │    │
│  │ • collect mode: batch rapid messages         │    │
│  │ • per-session FIFO: preserve order           │    │
│  │ • cross-session parallel: maxConcurrent=4    │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │ Agent Runtime                                │    │
│  │ • LLM-powered intent classification          │    │
│  │ • Tool execution (bash, message, file I/O)   │    │
│  │ • Skill system (spec-drive, coding-agent)    │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

OpenClaw gives you:
1. **Persistent connection** — WebSocket to Feishu, always listening
2. **Session isolation** — each user gets independent conversation state
3. **LLM-as-router** — the agent understands natural language intent, no rigid command parsing
4. **Tool orchestration** — bash, file I/O, message sending, all coordinated by the LLM
5. **Skill system** — modular capabilities (spec-drive, coding-agent) loaded as needed

## The Dispatcher Pattern

The most important design decision: **the octopus is a dispatcher, not an executor.**

### The Anti-Pattern (What We Tried First)

```
User: "执行 T20"
Agent turn:
  1. Read spec YAML (5s)
  2. Read PRD section (3s)
  3. Read API docs (3s)
  4. Read Figma references (2s)
  5. Analyze implementation approach (10s)
  6. Create worktree (3s)
  7. Write Codex prompt (2s)
  8. Start Codex (2s)
  9. Send confirmation (1s)
Total: ~30 seconds blocking the message queue
```

During these 30 seconds, no other message can be processed in this session. Send two tasks? The second waits half a minute.

### The Pattern (What Works)

```
User: "执行 T20"
Agent turn:
  1. Send confirmation (1s)
  2. Write prompt file with spec paths (2s)
  3. Call start-codex.sh in background (1s)
  4. Send "dispatched" reply (1s)
Total: ~5 seconds, then the session is free

Meanwhile, in the background:
  start-codex.sh → worktree → tmux → Codex reads specs itself
```

The key insight: **move all heavy work into the worker prompt**. The dispatcher doesn't read specs — it tells the worker where the specs are. The worker (Codex) reads them in its own context, with its own time budget.

## Concurrency Model

### Cross-User: Session Isolation

```jsonc
{ "session": { "dmScope": "per-channel-peer" } }
```

```
User A → session:octopus:feishu:direct:A ──┐
User B → session:octopus:feishu:direct:B ──┼── parallel (up to 4)
Group X → session:octopus:feishu:group:X ──┘
```

Each session has its own conversation history, delivery context, and processing queue. No cross-talk.

### Same-User: Fast Turn + Queue

Same user sends two tasks → same session → sequential turns. But with fast dispatch (~5s per turn), the second task starts almost immediately.

With `collect` mode + 3s debounce, rapid-fire messages get batched into one turn — the agent sees both tasks and dispatches both in parallel.

### Notification Target Pinning

The hardest concurrency bug: **who gets the notification?**

```
Problem:
  User A sends task → agent dispatches → monitor starts
  User B sends task → becomes "most recent" session
  User A's monitor queries "current target" → gets User B
  User A's completion notification → sent to User B ✗

Solution:
  Dispatch writes .feishu-target to worktree (immutable after creation)
  Monitor reads .feishu-target at startup → locks target forever
  No runtime queries → no race conditions
```

This is a general pattern: **pin context at dispatch time, never resolve it dynamically in concurrent workers.**

## The Execution Pipeline

### How Spec Orchestrator Connects to Octopus

```
spec-orchestrator/                    Octopus Agent
├── features/F02.yaml   ──────────>  reads task ID → finds feature
├── tasks/ios.md        ──────────>  checks status (🔴=ready, 🟡=locked)
├── config.yaml         ──────────>  checks dependencies + API readiness
└── workflows/          ──────────>  follows spec-protocol phases
        │
        │  dispatches to
        ▼
Platform Repo (worktree)
├── ai/ios.md           ──────────>  Worker reads platform conventions
├── specs/ → symlink    ──────────>  Worker reads feature YAML
└── src/                ──────────>  Worker writes code here
```

The spec-orchestrator provides:
- **Feature YAML** — requirements, API contracts, state matrix, i18n, analytics
- **Task board** — status tracking with emoji markers (🔴🟡🟢)
- **Dependency graph** — which tasks block which, API readiness flags
- **Execution protocol** — the 7-step worker loop (Check → Collect → Code → Build → ...)

The octopus reads this structure and dispatches workers that follow it.

### Post-Processing: The Automated Tail

Once Codex finishes writing code, the pipeline continues without human intervention:

```
Codex completes
  → monitor-codex.sh detects "done" state
  → post-codex.sh runs:
      1. git commit with 🐙 prefix
      2. git push to feature branch
      3. Create MR via GitLab API
      4. Send Feishu notification with MR link
      5. Cleanup: kill tmux, remove worktree
  → Task status updates: 🟡 → 🟢
```

The 🐙 prefix on commits serves a practical purpose: `git log --oneline | grep 🐙` instantly shows all AI-generated commits.

## Lessons Learned

### What we got right

| Decision | Why it matters |
|----------|---------------|
| Dispatcher pattern | Keeps the message queue responsive; second task doesn't wait 60s |
| Spec as contract | AI reads structured YAML, not vague chat messages — deterministic behavior |
| Worktree per task | Complete isolation; parallel tasks can't corrupt each other |
| Thread-based progress | All updates for one task in one Feishu thread — easy to track |

### What we got wrong (and fixed)

| Mistake | Root cause | Fix |
|---------|-----------|-----|
| All users shared one session | Default `dmScope: "main"` | Changed to `per-channel-peer` |
| Notifications sent to wrong user | Dynamic target resolution in concurrent mode | Pin target in `.feishu-target` at dispatch time |
| `flock` broke scripts on macOS | Linux assumption; `set -e` made it fatal | Replaced with `mkdir`-based locks |
| Agent spent 60s reading specs | Dispatcher doing executor's job | Moved all spec reading into worker prompt |

### Design principles (applicable beyond this project)

1. **Separate orchestration from execution** — the thing that routes work should not do work
2. **Pin context at dispatch time** — in concurrent systems, don't resolve state dynamically in workers
3. **Make the contract explicit** — structured specs > natural language requirements
4. **Isolation by default** — separate sessions, separate worktrees, separate notification targets

## Requirements

- macOS
- [OpenClaw](https://github.com/nicepkg/openclaw) gateway
- [Spec Orchestrator](https://github.com/cntuzi/spec-orchestrator) (for spec structure)
- Codex CLI or Claude Code CLI
- tmux, Git, Python 3
- Feishu (Lark) bot + GitLab instance
