# Spec-Driven Development

[English](./README.md) | [中文](./README.zh-CN.md)

A methodology for managing multi-platform app development with structured specs. AI agents parse specs, lock tasks, execute code changes, and update status — turning PRDs into merge requests.

## The Problem

Building a multi-platform app (iOS + Android + Backend) with AI coding agents creates coordination chaos:
- Which tasks are ready? Which are blocked by backend APIs?
- Who's working on what? Is T07 done or still in progress?
- Where's the PRD? The Figma? The API docs?
- Did the AI agent follow the spec, or hallucinate a different implementation?

## The Solution: Specs as Source of Truth

```
specs/
├── moox/
│   ├── 1.4/                          # Version directory
│   │   ├── features/
│   │   │   ├── F01-chat.yaml         # Feature definition
│   │   │   ├── F02-profile.yaml
│   │   │   └── ...
│   │   ├── tasks/
│   │   │   ├── ios.md                # iOS task board (🔴🟡🟢)
│   │   │   ├── android.md
│   │   │   └── backend.md
│   │   ├── prd/                      # Product requirements
│   │   ├── design/                   # Figma index
│   │   └── CHANGELOG.md
│   └── api/                          # API documentation
├── workflows/
│   └── spec-protocol.md              # The workflow protocol
└── AI-CONTEXT.md                     # Project quick reference
```

### Task States

```
🔴 Not started
🟡 In progress (locked by an agent)
🟢 Completed (MR merged)
```

### Feature YAML

```yaml
id: F02
name: Profile Editing
status: in-progress
tasks:
  - id: T20
    name: Bio 3-line collapse/expand
    platforms: [ios]
    depends_on: []
    api_ready: true
    priority: high
```

## Workflow Protocol

```
1. Parse    → Read feature YAML + task definition
2. Check    → Verify API readiness + dependency completion
3. Lock     → Update task status 🔴→🟡, commit lock
4. Collect  → Gather PRD + API docs + design context
5. Execute  → Dispatch to Codex/Claude Code
6. Verify   → Check build result
7. Update   → Push + MR + update status 🟡→🟢
```

### What the Agent Does vs. What Codex Does

| Step | Who | Action |
|------|-----|--------|
| Parse, Check, Lock | Octopus agent | Read YAML, verify deps, commit status change |
| Collect, Execute | Codex (in worktree) | Read specs, write code, build |
| Verify, Update | post-codex.sh | Push, create MR, update status |

The spec protocol gives AI agents **structured context** instead of vague instructions. "Implement T20" becomes a fully traceable pipeline.

## Integration with Octopus Agent

The [Octopus Agent](../octopus-agent/) uses spec-drive as a skill:

```
User: "执行 T20"
  → Octopus parses task ID from specs
  → Checks if backend APIs are ready
  → Locks task (🔴→🟡) with git commit
  → Writes Codex prompt with spec references
  → Dispatches via start-codex.sh
  → On completion: push + MR + update (🟡→🟢)
```

## Key Principles

### 1. Specs are Git-tracked

Every status change is a git commit. You can `git blame` to see when a task was locked, by whom, and trace the full history.

```
🐙 lock: T20 进行中
🐙 feat(T20): 个人中心简介3行折叠展开收起
🐙 done: T20 完成，MR !11
```

### 2. Tasks Have Explicit Dependencies

```yaml
- id: T07
  depends_on: [T03]      # Can't start until T03 is done
  api_ready: false        # Backend API not deployed yet
```

The agent checks these before starting. No wasted effort on blocked tasks.

### 3. One Task, One Worktree, One MR

Each task produces exactly one merge request from one isolated worktree. No mixed changes, no "this MR also fixes T08."

### 4. AI Reads the Same Specs as Humans

The specs directory is symlinked into every worktree. Codex reads the same PRD, API docs, and design references that a human developer would.

## Lessons Learned

- **YAML > free-text** for task definitions — structured data is parseable by agents
- **Status in git > status in Jira** — single source of truth, no sync issues
- **Lock before execute** — prevents two agents from working on the same task
- **API readiness checks save time** — blocked tasks fail fast instead of producing broken code

## Getting Started

1. Create a `specs/` directory in your project
2. Define features as YAML files with task lists
3. Use status markers (🔴🟡🟢) in task boards
4. Point your AI agent at the specs directory
5. Implement the parse → check → lock → execute → update protocol
