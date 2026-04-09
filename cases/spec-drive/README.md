# Spec-Driven Development

[English](./README.md) | [中文](./README.zh-CN.md)

A methodology for bridging the gap between product requirements and AI-generated code — using structured specifications as the contract between humans and machines.

Open-source implementation: **[spec-orchestrator](https://github.com/cntuzi/spec-orchestrator)**

## The Core Problem

AI coding tools have a context problem:

```
Human developer reads:  PRD + Figma + API docs + codebase + team conventions + past decisions
AI coding tool reads:   your one-line prompt
```

The result: AI writes code that compiles but doesn't match the design, uses the wrong API fields, ignores edge cases, and violates team conventions. You spend more time correcting than you saved.

The usual fix — stuffing everything into the prompt — doesn't scale. At 20 features and 3 platforms, manually assembling context for each task is the new bottleneck.

## The Insight: Spec as Machine-Readable Contract

The missing layer is a **structured specification** that sits between PRD and code:

```
PRD (natural language, for humans)
    ↓
Feature Spec (structured YAML, for humans AND AI)    ← this is the key
    ↓
Code (for the compiler)
```

A PRD says: "Users can edit their profile bio with a 3-line collapsed view that expands on tap."

A Feature Spec says:

```yaml
id: F02
name: Profile Editing
tasks:
  - id: T20
    name: Bio collapse/expand
    platforms: [ios]
    depends_on: []
    api_ready: true

requirements:
  - id: R01
    desc: Bio text displays max 3 lines when collapsed
  - id: R02
    desc: Tap "more" expands to full text
  - id: R03
    desc: Tap "collapse" returns to 3-line view

api:
  - endpoint: GET /api/user/profile
    response: { bio: string, bio_length: int }

state_matrix:
  - { state: empty_bio, trigger: no bio set, expected: "placeholder text shown" }
  - { state: short_bio, trigger: "bio < 3 lines", expected: "full text, no expand button" }
  - { state: long_bio, trigger: "bio >= 3 lines", expected: "truncated + 'more' button" }

acceptance_criteria:
  - id: AC01
    type: ui
    desc: Collapsed bio shows exactly 3 lines with ellipsis
  - id: AC02
    type: interaction
    desc: Expand/collapse animation completes in < 300ms
```

Now AI has: exact requirements, the API response shape, all edge cases, and measurable acceptance criteria. No guessing.

## Architecture: Three Layers

[Spec Orchestrator](https://github.com/cntuzi/spec-orchestrator) implements a three-layer pipeline:

```
┌─────────────────────────────────────────────────────────┐
│  Generation Layer — /spec-init                          │
│                                                          │
│  PRD + Figma + Swagger API                              │
│      ↓                                                   │
│  Feature YAML × N + Task boards + i18n + Figma index    │
│                                                          │
│  One-shot: read all materials, generate complete spec    │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│  Orchestration Layer — /spec-drive                      │
│                                                          │
│  Dependency graph → Wave analysis → Worker dispatch     │
│                                                          │
│  "T20 depends on T03" → T03 first, then T20            │
│  "T20 api_ready: false" → skip, notify team             │
│  "T20 status: 🔴" → lock to 🟡, dispatch worker        │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│  Execution Layer — Worker                               │
│                                                          │
│  Check → Collect → Code → Build → Verify → Update      │
│                                                          │
│  Runs in isolated worktree                              │
│  Reads Feature YAML for context                         │
│  Follows platform Agent conventions for code style      │
└─────────────────────────────────────────────────────────┘
```

### Why Three Layers Matter

**Generation** is a one-time cost. You run `/spec-init` once per version. It reads your PRD, Figma, and API docs, then generates the complete spec skeleton. Humans review and refine.

**Orchestration** handles complexity that humans are bad at: dependency tracking across 20+ tasks on 3 platforms, remembering which APIs are ready, avoiding duplicate work. This is the [octopus agent](../octopus-agent/)'s domain.

**Execution** is where AI writes code. But now it has complete context from the Feature YAML — requirements, API shapes, state matrix, acceptance criteria. No improvisation needed.

## The Spec-Agent-Worker Model

```
Spec  = WHAT to build     Feature YAML, task board, API contracts
Agent = HOW to build       Platform conventions, coding rules, UI patterns
Worker = Runtime instance   Combines both, executes in isolation
```

This separation means:
- **Same spec, different platforms**: iOS and Android workers read the same Feature YAML but follow different Agent conventions
- **Spec changes don't require code changes**: update the YAML, re-dispatch the worker
- **Agents evolve independently**: iOS team refines Swift patterns without touching specs

### Binding Mechanism

```
spec-orchestrator/              Platform repo (iOS)
┌──────────────────┐           ┌──────────────────┐
│ features/F02.yaml│──symlink──│ specs/F02.yaml   │
│ tasks/ios.md     │──symlink──│ specs/tasks.md   │
│ config.yaml      │           │                  │
│                  │           │ ai/ios.md  (HOW) │
│ agents/ios/      │───sync────│ CLAUDE.md  (HOW) │
│   ai/ios.md      │           │                  │
│   CLAUDE.md      │           │ src/    (code)   │
└──────────────────┘           └──────────────────┘
```

The spec repo is the source of truth for WHAT. The platform repo is the source of truth for HOW. Workers read both.

## Task Lifecycle and State Machine

```
🔴 Pending ──────→ 🟡 In Progress ──────→ 🟢 Completed
                                               │
                                          CR changes requirement
                                               │
                                          🔵 Rework ──→ 🟡 ──→ 🟢
```

Every state transition is a git commit:

```
🐙 lock: T20 进行中          (🔴 → 🟡)
🐙 feat(T20): Bio 折叠展开    (code written)
🐙 done: T20 完成, MR !11    (🟡 → 🟢)
```

`git blame tasks/ios.md` shows the complete history: who locked what, when, and the commit trail to the MR.

### Dependency-Driven Dispatch

```yaml
# config.yaml
tasks:
  - id: T03
    depends_on: []
    api_ready: true       # ← can start immediately

  - id: T07
    depends_on: [T03]     # ← blocked until T03 is 🟢
    api_ready: false       # ← blocked until backend deploys

  - id: T20
    depends_on: []
    api_ready: true        # ← can start immediately
```

The orchestrator builds a dependency DAG and dispatches in waves:
- **Wave 1**: T03, T20 (no dependencies, APIs ready) → parallel
- **Wave 2**: T07 (after T03 completes AND API deploys) → wait

No human needs to track this. The spec encodes it, the orchestrator enforces it.

## Change Management

The hardest part of multi-platform development: requirements change mid-sprint.

```
API team: "We added a new field `bio_html` to the profile endpoint"

Without spec-drive:
  → iOS dev finds out when their code breaks
  → Android dev doesn't know until next standup
  → 2 days of rework

With spec-drive:
  /spec-drive change api /api/user/profile "Added bio_html field"
  → Auto-traces: F02.yaml uses this API → T20, T21 affected
  → Creates Change Record CR-001
  → Marks T20, T21 for rework (🟢 → 🔵)
  → /spec-drive propagate CR-001
  → Workers apply targeted changes, rebuild, verify
```

The key: **specs encode the dependency graph between APIs and features**. When an API changes, impact analysis is automatic.

## What This Is NOT

- **Not a project management tool** — it doesn't replace Jira for human coordination
- **Not a code generator** — it structures context for AI that generates code
- **Not mandatory automation** — you can start with just YAML files, no tooling required

The minimum viable adoption: one Feature YAML file per feature. Even without automation, it gives AI complete context. Add orchestration incrementally.

## Lessons Learned

| Insight | Why |
|---------|-----|
| YAML > free-text for task definitions | Structured data is parseable by agents; free-text requires interpretation |
| Status in Git > status in Jira | Single source of truth; no sync lag between tracking tool and reality |
| Lock before execute | Prevents two agents from working on the same task simultaneously |
| API readiness as first-class concept | Blocked tasks fail fast instead of producing code against wrong API shapes |
| One task = one worktree = one MR | Clean isolation; no "this MR also fixes T08" surprises |
| Spec changes propagate automatically | Change tracking via dependency graph beats tribal knowledge |

## Getting Started

See the full implementation: **[github.com/cntuzi/spec-orchestrator](https://github.com/cntuzi/spec-orchestrator)**

Quick path:
1. Start with Feature YAML files — just structure your requirements
2. Add task boards with status emoji (🔴🟡🟢)
3. Add dependency tracking in config.yaml
4. Integrate with an orchestrator ([octopus agent](../octopus-agent/) or your own)
5. Enable full automation: `/spec-init` → `/spec-drive` → Workers
