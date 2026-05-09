[English](./tutorial.md) | [中文](./tutorial.zh-CN.md)

# Spec-Driven Development — Beginner Tutorial

> Understanding from scratch "how to involve AI in the full software development lifecycle, not just writing code."
> For: new team member onboarding / reference adoption by other projects.

---

## Chapter 1: What Problem Does This Solve

### The Current State of AI Coding

AI tools can write code now, but software development is more than just writing code.

```
Product delivers PRD → Developer asks AI to write code → Does it run? → Does the UI match? → Are the APIs right?
                                                          ↓
                                                     No idea, just pray
```

| Problem | Consequence |
|---------|-------------|
| AI doesn't know the project's tech stack | Generated code is incompatible with existing architecture |
| AI doesn't know what the design looks like | The UI output is miles away from the Figma design |
| AI doesn't know the backend API definitions | Request parameters are guesswork, field names don't match |
| Nobody tracks "what's done, what's left" | Progress relies entirely on asking around |
| Requirements changed, nobody knows the impact | Changed A, but B and C also need changes — and that got missed |

### Core Idea: Add a Layer Between PRD and Code

**Structured "feature specs" are the shared language between humans and AI.**

```
PRD (natural language for humans)
    ↓ Parse and extract
Feature Spec (structured, readable by both humans + AI)    ← This is the core
    ↓ AI reads and executes
Code (for the compiler)
```

A feature spec **merges scattered information into a single file**:

| Traditional Approach | Feature Spec Approach |
|---------------------|----------------------|
| Requirements: see PRD page N | Structured requirements list |
| Design: Figma link + verbal confirmation | Design constraints + Figma node references |
| Acceptance criteria scattered everywhere | Explicit pass/fail conditions |
| API: see Swagger + chat messages | API references |
| Analytics: see Excel spreadsheet | Structured analytics definitions |
| i18n: see translation spreadsheet | Copy grouped by feature |
| State scenarios: guess and hope | Exhaustive state scenario matrix |

AI reads this file and gets the full context — no need for humans to explain repeatedly.

---

## Chapter 2: System Overview

### Three Phases

```
Phase 1: Generate Specs
    From PRD + Figma + API docs → auto-generate feature specs + task plans
    (30 minutes to complete what traditionally takes 10+ hours)

Phase 2: Orchestrate Execution
    Analyze task dependencies → identify parallelizable work → dispatch to AI devs → monitor progress

Phase 3: Autonomous Development
    AI in an isolated environment: read spec → write code → compile & verify → auto-merge → update progress
```

### How a Release Runs

```
1. Product delivers PRD + Figma + Swagger

2. Auto-generate spec skeleton
   → 15 feature spec files, dual-platform task plans, backend dependencies, i18n copy, analytics definitions

3. Create release branch

4. Analyze dependency graph, plan parallel batches
   → Batch 1: 6 tasks with no dependencies start simultaneously
   → Batch 2: 3 tasks, dependent on Batch 1 results
   → Blocked: waiting for backend API, auto-unblocked when ready

5. Requirements change mid-development?
   → Pinpoint impact scope in seconds via dependency index → auto-generate rework checklist

6. Real-time dashboard
   → Who's done, who's blocked, what's the blocker
```

### Core Files at a Glance

```
{version}/                           All specs for a release
├── config.yaml                      Release config (feature list, resource paths, dependency index)
├── features/                        Feature specs (one file per feature)
│   ├── F01-search.yaml                What to do + constraints
│   ├── F02-login.yaml
│   └── ...
├── tasks/                           Task plans
│   ├── ios.md                         iOS tasks + status
│   ├── android.md                     Android tasks + status
│   ├── backend.md                     Backend API dependencies
│   └── shared.md                      Cross-platform prerequisites
├── figma-index.md                   Figma design node index
├── i18n/strings.md                  i18n copy
├── CHANGELOG.md                     Change log
├── DASHBOARD.md                     Progress dashboard (aggregated from task files)
├── implementation/                  Implementation plans
│   └── F01-search/
│       ├── design.md                  Shared plan (cross-platform)
│       └── ios.md                     Platform-specific plan
└── _logs/                           Execution logs
```

---

## Chapter 3: Core Concepts

### 3.1 Feature Spec File — The Complete Definition of a Feature

Two categories of fields: **What to do** + **How to constrain**.

**What (What)** — can be auto-extracted from PRD:

```yaml
id: F06
name: Interaction Interception Phase 2
description: |
  Interception dialog upgrade: static prompt → dynamic countdown

requirements:
  - id: R01
    desc: Change interception dialog copy to dynamic countdown MM:SS

acceptance_criteria:
  - id: AC01
    type: ui
    desc: Interception dialog centered, dark gray rounded card
```

**Constraints (Constraint)** — requires manual or semi-automatic supplementation:

```yaml
# Visual constraints — what must be done, what is forbidden
ui_contract:
  required:
    - Custom centered dialog (not system Alert)
  forbidden:
    - UIAlertController
  key_tokens:
    dialog_bg: "#17171A"
    corner_radius: 20

# Exhaustive state scenarios — prevent missing edge cases
state_matrix:
  - id: S01
    name: Energy dialog - countdown active
    figma_node: "377:1342"            # Corresponding Figma design node
    trigger: Chat turns exhausted
    expected: Centered dialog, countdown decrementing
  - id: S02
    name: Limit exceeded
    trigger: Daily ad count reaches limit
    expected: Toast "Daily limit reached"

# Quantified dimensions — reject "looks close enough by eye"
pixel_baseline:
  dialog_corner_radius: 20
  button_gap: 24
```

**Why are constraints needed?** Without them, AI only knows "make a dialog" but not which component, what color, or what size. The result: build it, find it's wrong, rework. With constraints, it's right the first time.

**Real data**: In v1.3, the only feature with complete constraints (F06) had 0 rework cycles. The other 14 features without constraints collectively produced ~20 rework cycles.

### 3.2 Task File — The Single Source of Truth for Progress

```
A task entry in tasks/ios.md:

| T05 | character | Story card menu and pinning | F04 | P1 | 🟢 | - |
```

State transitions:

```
🔴 Not Started → 🟡 In Progress → 🟢 Completed
                                       ↓ Requirements changed
                                   🔵 Needs Rework → 🟡 → 🟢
```

Key rule: **The task file is the single source of truth.** AI reads and writes status here, and the progress dashboard aggregates from here automatically. No need to maintain the dashboard manually.

### 3.3 Change Log — What Happens When Requirements Change

Not just a verbal heads-up, but:

```
1. Record the change (numbered CR-001, CR-002...)

2. Auto-analyze impact scope via dependency index:
   This API changed → affects feature F06 → affects task T10 (iOS) + T10 (Android)

3. Generate rework checklist, complete and mark off each item

4. All done → change record marked ✅
```

**Value**: No changes slip through the cracks when requirements change. v1.3 went through 5 requirement changes, each fully tracked via change records.

### 3.4 Dependency Index — Reverse Lookup Tables

Three reverse lookup tables maintained in the release config:

| Lookup Direction | Purpose |
|-----------------|---------|
| API endpoint → feature list | When an API changes, instantly locate affected features |
| Figma node → feature list | When a design changes, instantly locate affected features |
| Feature → backend task list | When a feature changes, find the corresponding backend dependencies |

### 3.5 Parallel Batches — Not Sequential, but Dependency-Driven

Analyze inter-task dependencies to identify what can run simultaneously:

```
Batch 1: T01, T06, T07, T11  (no dependencies, start simultaneously)
Batch 2: T02, T08             (depend on Batch 1 results)
Batch 3: T03                  (depends on Batch 2)
Blocked: T09                  (waiting for backend API, auto-unblocked when ready)
```

### 3.6 AI Autonomous Development Loop

AI independently completes the full workflow for a task in an isolated git branch:

```
Read feature spec → Gather context (design/API/i18n)
→ Lock task (🔴→🟡) → Design solution → Write code → Compile & verify
→ Code review → Merge to release branch → Update status (🟡→🟢)
→ Next task or exit
```

No need for humans to manually trigger each step. AI decides what to do, how to do it, and updates status when done. **The human role is review and decision-making.**

### 3.7 Execution Logs — Post-Hoc Traceability

Every AI work session produces a log. Common types:

| Type | When It's Generated |
|------|-------------------|
| Feature development | A task is completed |
| Walkthrough fix | Human initiates code/UI review |
| Screenshot-driven alignment | User sends screenshot, AI compares with Figma and fixes deviations |
| Spot fix | A bug is discovered and fixed |
| Doc sync | PRD / API docs are updated |
| Requirement change | A CR is recorded |
| Workflow retrospective | Aggregate analysis of multiple log rounds, identifying improvements |

The value of logs: answering "**why did this module take 3 rounds to converge**" — was the spec incomplete? Was a gate skipped? Or was the design itself ambiguous?

---

## Chapter 4: A Real-World Example

> Walking through with real data from MooX v1.3. No hands-on needed, just observe.

### Viewing the Release Config

`moox/1.3/config.yaml` — 15 features, Figma file key, 10 Swagger files, dependency index. **The "table of contents" for the entire release.**

### Viewing a Feature Spec

`moox/1.3/features/F06-intercept-phase2.yaml` (300 lines):

- 6 requirements, with R03 annotated `[CR-003] Removed` (requirement changes are traceable)
- 6 acceptance criteria
- Visual constraints: precise down to color `#17171A`, corner radius `20px`, overlay opacity `0.8`
- 6 state scenarios, each bound to a Figma node
- 5 analytics events, 2 APIs, i18n references

**All the context AI reads when developing this feature is in this single file.**

### Viewing the Task File

`moox/1.3/tasks/ios.md` — 18 tasks, 16 completed, 1 in progress, 1 waiting on backend. Each completed task has completion time, merge commit, and implementation summary. **This is the iOS progress dashboard.**

### Viewing the Change Log

`moox/1.3/CHANGELOG.md` — 5 change records. CR-001 modified 7 features at once, CR-003 deleted a module and added a new feature. Each change has impact scope and propagation checklist.

### Viewing the Execution Logs

`moox/1.3/_logs/` — 27 log files, recording the complete AI work history for v1.3.

---

## Chapter 5: How to Use This in Your Own Project

### Minimal Start (10 Minutes)

No need to go all-in from the start. Begin with the most valuable parts.

#### Phase 1: Just Write Feature Spec Files

Create a directory and write one YAML per feature:

```yaml
id: F01
name: User Login
description: Support phone number + verification code login

requirements:
  - id: R01
    desc: Enter phone number, tap send verification code
  - id: R02
    desc: Enter verification code, tap login

acceptance_criteria:
  - id: AC01
    type: interaction
    desc: Verification code 60-second countdown, button disabled during countdown

state_matrix:
  - id: S01
    name: No input
    trigger: Open login page
    expected: Phone number input focused, login button grayed out and disabled
  - id: S02
    name: Phone number entered
    trigger: Enter 11-digit phone number
    expected: Send verification code button becomes enabled
  - id: S03
    name: Countdown active
    trigger: Tap send verification code
    expected: Button changes to "Resend in Ns", disabled
```

This single step lets AI tools read the file and get the full context. **No installation needed, no commands to learn.**

#### Phase 2: Add Task Files

Create a Markdown table to track progress:

```markdown
| ID | Task | Feature | Status | Dependency |
|----|------|---------|--------|------------|
| T01 | Login page UI | F01 | 🔴 | - |
| T02 | Verification code sending | F01 | 🔴 | T01 |
| T03 | Home page list | F02 | 🔴 | - |
```

When a task is done, change 🔴 to 🟢. Simple and straightforward.

#### Phase 3: Add Constraints for Complex UI (Optional)

Only invest in constraints for UI-heavy features; simple features don't need them:

```yaml
ui_contract:
  required:
    - Custom input field component
  forbidden:
    - Default system TextField styling
  key_tokens:
    input_height: 48
    corner_radius: 8
    brand_color: "#FF6B00"
```

### Full Integration

If you want the complete automation capabilities (auto spec generation, task orchestration, parallel development):

```
1. Set up following this repo's directory structure
2. Configure release info (Figma key, Swagger paths)
3. Use the generation tool to auto-generate spec skeleton from PRD + Figma + API
4. Manual review + supplement visual constraints for complex features
5. Start task orchestration → AI autonomous development
```

See the `.claude/commands/` directory in this repo for specific automation commands and orchestration protocols.

### Tailoring Guide — What You Can Skip

| Component | When You Can Skip It |
|-----------|---------------------|
| Visual constraints / quantified dimensions | Non-UI features, prototype phase |
| Figma integration | Projects without Figma |
| Dual-platform parallelism | Single-platform projects |
| Change record tracking | Small projects with stable requirements |
| Execution logs | When post-hoc analysis isn't needed |
| Auto-aggregated progress dashboard | When there are fewer than 10 tasks |
| Isolated git branches | Solo development |

**Only two things are essential: feature spec files + task files.** Everything else is opt-in as needed.

---

## Chapter 6: FAQ

### Q: How is this different from Jira / Linear?

Jira manages "who does what." Feature specs manage "what to do + how to constrain it + how AI executes it."

A Jira ticket has no Figma node bindings, no exhaustive state scenarios, no visual red lines. AI reading Jira only knows "make a login page" — not which component, what color, or what states.

**They're complementary, not competing.**

### Q: Do I need to know YAML?

No expertise required. YAML is just indented key-value pairs. Look at one example and you can imitate it.

Plus, most content can be auto-generated from PRD — humans only need to confirm and supplement a few fields.

### Q: Is this tied to a specific programming language?

No. Feature specs describe "what to do," not "what language to do it in."

Swift, Kotlin, React, Flutter, Go — all work. The only things to adapt are tech stack constraint fields and build commands.

### Q: I'm the only developer. Is it worth using?

With just feature specs + task files, you can set it up in 10 minutes. Its value isn't "managing a team" — it's **giving AI structured context**. When you're developing solo, AI is your partner, and your partner needs to understand your requirements.

### Q: How does this relate to .cursorrules / copilot-instructions.md?

Those are "AI coding style configs" — telling AI what syntax to use when writing code.

Feature specs are "AI work context" — telling AI what feature to build, to what standard, with what constraints.

```
.cursorrules       → "Use Swift 5, MVVM architecture, SnapKit for layout"
Feature specs      → "Build a login page, 3 states, these colors, no system Alert"
Task orchestration → "Do T01 first, then T02, T03 waits for backend API"
```

Different layers, used together.

### Q: Won't writing overly detailed specs waste time?

Depends on feature complexity. We use `ui_weight` with three tiers:

| Tier | Applicable Scope | How Much Constraint to Write |
|------|-----------------|----------------------------|
| Heavy UI | Dialogs, panels, new pages | Visual constraints + quantified dimensions + state scenarios |
| Light UI | List items, copy changes | State scenarios are enough |
| Pure logic | Analytics, API integration | No constraints needed |

**Invest in constraints where rework frequency is high; skip them where rework frequency is low.** It's not one-size-fits-all.

---

## Appendix: Further Reading

After understanding this tutorial, consult the detailed documentation in this repo as needed:

| Want to Learn About | What to Read |
|--------------------|-------------|
| Precise definitions of all terms | `_scripts/GLOSSARY.md` |
| Architecture design and data flow | `_scripts/SPEC-ARCHITECTURE.md` |
| Workflow protocols (phase definitions, log standards) | `workflows/spec-protocol.md` |
| Complete rules for visual constraints | `moox/workflows/ui-contract.md` |
| Complete protocol for auto spec generation | `.claude/commands/spec-init.md` |
| Complete protocol for task orchestration | `.claude/commands/spec-drive.md` |
| AI autonomous development execution loop | `.claude/commands/spec-next.md` |
| A real complete feature spec | `moox/1.3/features/F06-intercept-phase2.yaml` |
| External presentation materials | `_reports/spec-sharing-v6.md` |
