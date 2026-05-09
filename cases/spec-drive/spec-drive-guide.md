# Spec-Drive: Specification-Driven Dual-Platform Development Guide

[English](./spec-drive-guide.md) | [中文](./spec-drive-guide.zh-CN.md)

> From PRD to code, fully automated: spec generation → orchestration → dual-platform parallel development.

---

## 1. System Overview

### 1.1 What Problem Does It Solve

Traditional workflow: manually analyze PRD → manually write specs → manually break down tasks → manually create branches → manually develop → manually verify → manually merge

Spec-Drive: **Two commands, from PRD to code, fully automated**

```
/spec-init 1.3              → PRD + Figma + API → complete spec skeleton
/spec-drive setup            → create version branch
/spec-drive next             → auto-loop until completion
```

### 1.1.1 Overall Workflow

```
PRD + Figma + API docs       ← user provides materials
        │
   /spec-init                ← auto-generate spec skeleton
        │
   config + features + tasks + i18n + CHANGELOG
        │
   /spec-drive setup         ← create version branch
        │
   /spec-drive next          ← auto-loop execution
        │
   Worker sessions × 2       ← iOS + Android in parallel
        │
   /spec-drive done          ← version complete
```

### 1.2 Three-Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    specs (Generation + Orchestration Layer)  │
│  /spec-init:  PRD + materials → complete spec skeleton      │
│               (one-time)                                    │
│  /spec-drive: task analysis + dependency graph + worktree   │
│               creation + status monitoring                  │
│  /spec-next:  status view + task location                   │
└───────────────┬──────────────────────┬──────────────────────┘
                │                      │
     ┌──────────▼──────────┐ ┌────────▼────────────┐
     │  pixel_muse_ios     │ │  pixel_muse_android  │
     │  (Execution Layer)  │ │  (Execution Layer)   │
     │                     │ │                      │
     │  feat/v1.2 ← integ  │ │  feat/v1.2 ← integ  │
     │    ↑                │ │    ↑                 │
     │  wt/T06-xxx ← dev   │ │  wt/T06-xxx ← dev   │
     └─────────────────────┘ └──────────────────────┘
```

### 1.3 Key Concepts

| Concept | Description |
|---------|-------------|
| **Version Integration Branch** | `feat/v1.2` — merge target for all tasks; no direct development on it |
| **Task Worktree** | Each task gets an isolated working directory, created from the version branch |
| **Worker Session** | An independent Claude Code instance running in a worktree, autonomously completing the full development lifecycle |
| **Task Loop** | After finishing one task, the Worker automatically picks the next one until all are done or blocked |
| **Execution Wave** | Parallel execution batches planned based on the dependency graph |

### 1.4 Authoritative Files

| File | Description |
|------|-------------|
| `specs/.claude/commands/spec-init.md` | Generation command — **the sole generation protocol** |
| `specs/.claude/commands/spec-drive.md` | Orchestration command — **the sole orchestration protocol** |
| `{platform}/.claude/commands/spec-next.md` | Execution command — **the sole execution protocol (10 steps)** |
| `moox/{version}/WORKFLOW.md` | Execution summary (references spec-next) |
| `moox/{version}/tasks/{platform}.md` | Task status — **the single source of truth** |
| `moox/{version}/DASHBOARD.md` | Progress dashboard — aggregated by `/spec-drive status` |

---

## 2. Repository Structure

```
{workspace}/
├── specs/                          # Spec repo (orchestration hub)
│   ├── .claude/
│   │   ├── config.yaml             # Platform paths + version config
│   │   └── commands/
│   │       ├── spec-drive.md       # Orchestration command
│   │       └── spec-next.md        # Status view
│   ├── moox/
│   │   └── 1.2/                    # Current version
│   │       ├── config.yaml         # Figma key, path mappings
│   │       ├── WORKFLOW.md         # Execution workflow summary
│   │       ├── DASHBOARD.md        # Progress dashboard (aggregated)
│   │       ├── features/           # F01-F10 Feature YAML
│   │       ├── tasks/
│   │       │   ├── shared.md       # S1-S3 shared prerequisites
│   │       │   ├── backend.md      # B01-B07 backend API
│   │       │   ├── ios.md          # T01-T10 iOS tasks (single source of truth)
│   │       │   └── android.md      # T01-T10 Android tasks (single source of truth)
│   │       ├── prd/                # PRD documents
│   │       ├── i18n/               # Internationalization strings
│   │       └── figma-index.md      # Figma page index
│   ├── _scripts/                   # Toolchain docs
│   └── _templates/                 # Template files
│
├── pixel_muse_ios/                 # iOS project
│   ├── specs -> ../specs/moox      # Symlink
│   ├── .claude/
│   │   ├── config.yaml             # platform: ios, version: 1.2
│   │   └── commands/
│   │       └── spec-next.md        # Task execution (with loop)
│   └── scripts/build.sh            # Build script
│
├── pixel_muse_android/             # Android project
│   ├── specs -> ../specs/moox      # Symlink
│   ├── .claude/
│   │   ├── config.yaml             # platform: android, version: 1.2
│   │   └── commands/
│   │       └── spec-next.md        # Task execution (with loop)
│   └── scripts/build.sh            # Build script
│
├── wt/                             # Worktree storage
│   ├── pixel_muse_ios/
│   │   └── 0304/
│   │       └── T06-self-settings/  # Task worktree
│   └── pixel_muse_android/
│       └── 0304/
│           └── T06-self-settings/
│
└── api-doc/                        # API docs (Swagger)
```

---

## 3. Quick Start

### 3.1 Prerequisites

- Must run inside a **tmux session** (Workers depend on tmux windows)
- Both platform repos cloned and accessible
- Specs symlinks created
- PRD documents placed in `moox/{version}/prd/`

### 3.2 Generate Spec (First Time for New Version)

```
/spec-init 1.3
```

This will:
1. Read PRD → extract feature list + analytics events + dependencies
2. Query Figma → build page index + map to Features
3. Parse Swagger → match APIs + generate backend tasks
4. Generate all config + features + tasks + i18n + CHANGELOG
5. Cross-validate + output completeness report

### 3.3 Initial Setup

```
/spec-drive setup
```

This will:
1. Check spec-init output completeness
2. Create `feat/v1.3` branch in iOS repo (based on master)
3. Create `feat/v1.3` branch in Android repo (based on master)
4. Verify specs symlinks and api-doc accessibility

### 3.3 Check Status

```
/spec-drive status
```

Aggregates in real-time from `tasks/ios.md` + `tasks/android.md` + `tasks/backend.md`, automatically syncing DASHBOARD.md.

### 3.4 Start Execution

```
/spec-drive next           # Auto-analyze, launch both platforms in parallel
/spec-drive next ios       # Launch iOS only
/spec-drive T06            # Execute specific task (auto-detects which platform)
/spec-drive T06 android    # Execute T06 on Android only
```

### 3.5 Final Verification

```
/spec-drive verify         # Build both platforms on feat/v1.2
/spec-drive done           # Completion summary
```

---

## 4. Command Reference

### 4.0 /spec-init (specs repo)

| Argument | Description |
|----------|-------------|
| No args | Reads config.yaml version.current, interactive guidance |
| `{version}` | Specify version number, full generation |
| `{version} refresh` | Incremental update (existing version directory, fill in missing parts) |
| `{version} validate` | Validate only, no generation |

**Input materials**: PRD (required) + Figma file_key (optional) + Swagger JSON (optional)

**Generated output**: config.yaml + features/*.yaml + tasks/*.md + i18n/strings.md + CHANGELOG.md + figma-index.md

**Relationship with spec-drive**: spec-init runs before spec-drive setup. spec-drive setup checks spec-init output completeness.

### 4.1 /spec-drive (specs repo)

| Subcommand | Arguments | Description |
|------------|-----------|-------------|
| `setup` | - | Create version integration branch `feat/v1.2` |
| `status` | - | Cross-platform status overview + aggregate DASHBOARD + version branch status |
| `next` | `[platform]` | Smart analysis → create worktree → launch Worker |
| `T{nn}` | `[platform]` | Execute specific task |
| `F{nn}` | `[platform]` | Execute tasks for a specific feature |
| `reset` | `T{nn} [platform]` | Reset a stuck 🟡 task back to 🔴 |
| `change` | `<type> <scope> "<desc>"` | Record change + impact analysis → generate CR |
| `change status` | - | Change propagation status dashboard |
| `propagate` | `CR-{nnn} [platform]` | Drive CR change rework: create worktree → apply changes → update checklist |
| `verify` | - | Build verification on version branch |
| `done` | - | Version completion summary |

**Multi-platform smart analysis**: When no platform is specified, auto-detects which platform needs execution:
- iOS 🟢 + Android 🔴 → execute Android only
- iOS 🔴 + Android 🔴 → both platforms in parallel
- iOS 🟢 + Android 🟢 → report already complete

### 4.2 /spec-next (iOS / Android repo)

| Argument | Description |
|----------|-------------|
| No args | Auto-find next available task and execute |
| `T{nn}` | Execute specific task |
| `F{nn}` | Execute tasks for a specific feature |
| `status` | Output status overview (no execution) |

**Task availability conditions** (all must be met):
1. Status is 🔴 (pending)
2. All dependencies are 🟢 (completed)
3. No active worktree
4. Backend API is ready (or no backend dependency)

### 4.3 /spec-next (specs repo)

Status view only, no development execution. Prompts the user to use `/spec-drive` for development orchestration.

**CR change notice**: In the status overview, automatically detects the impact of 🟡/🔴 CRs on completed (🟢) tasks, outputting attention alerts. Appends pending CR changes with ⚠️ in task details.

---

## 5. Execution Flow Details

### 5.1 Orchestrator Flow (spec-drive)

```
/spec-drive next
       │
       ▼
  ┌─ Phase 0: Pre-checks ──────────────────────────┐
  │                                                  │
  │  ✓ tmux environment check                        │
  │  ✓ Version branch existence check                │
  │  ✓ Repository dirty state check                  │
  └──────────────────────────────────────────────────┘
       │
       ▼
  ┌─ Phase 1: Global Analysis ──────────────────────┐
  │                                                  │
  │  Read: tasks/ios.md + android.md + backend.md    │
  │  Build dependency graph → categorize tasks       │
  │  → plan Waves                                    │
  │                                                  │
  │  Task categories:                                │
  │  🚀 Ready to execute  ⏳ Waiting on deps         │
  │  🚫 Waiting on backend                           │
  │  ✅ Completed  🔄 In progress  ❌ Blocked        │
  └──────────────────────────────────────────────────┘
       │
       ▼
  ┌─ Phase 2: Display Execution Plan ───────────────┐
  │                                                  │
  │  Dependency graph + execution wave table         │
  │  + launch list for this run                      │
  │  Confirm before proceeding                       │
  └──────────────────────────────────────────────────┘
       │
       ▼
  ┌─ Phase 3: Infrastructure Setup ─────────────────┐
  │                                                  │
  │  For each (task, platform):                      │
  │  1. wt.sh new → create worktree + tmux window   │
  │  2. Lock → 🔴→🟡 + git commit                   │
  │  3. tmux send-keys → launch Claude Code          │
  └──────────────────────────────────────────────────┘
       │
       ▼
  ┌─ Phase 4: Return Control ───────────────────────┐
  │                                                  │
  │  Output: launch status table + expected timeline │
  │  + monitoring instructions                       │
  │  Worker sessions begin autonomous execution      │
  └──────────────────────────────────────────────────┘
```

### 5.2 Worker Flow (spec-next + Loop)

```
┌─────────────────────────────────────────────────────────────┐
│                     Worker Session Loop                      │
│                                                             │
│  ┌─── LOOP ──────────────────────────────────────────────┐  │
│  │                                                       │  │
│  │  Step 1-4: Config → Status → Locate task → Show       │  │
│  │           context                                     │  │
│  │       ↓                                               │  │
│  │  Step 5: Lock (idempotent: skip if already 🟡)        │  │
│  │       ↓                                               │  │
│  │  Step 6: Analyze + Design                             │  │
│  │    ├─ Analyze project state + impact scope            │  │
│  │    ├─ Design implementation plan                      │  │
│  │    └─ Write to implementation/F{nn}/                  │  │
│  │       (design + platform refinement)                  │  │
│  │       ↓                                               │  │
│  │  Step 7: Execute                                      │  │
│  │    ├─ API Contract Verify (skip if no API)            │  │
│  │    ├─ Collect (Figma + API + i18n + existing code)    │  │
│  │    ├─ Execute (implement per plan)                    │  │
│  │    └─ Verify (./scripts/build.sh)                     │  │
│  │       ↓                                               │  │
│  │  Step 8: Review (Code Review loop, max 3 rounds)      │  │
│  │       ↓                                               │  │
│  │  Step 9: Merge → feat/v{version} + clean up worktree  │  │
│  │       ↓                                               │  │
│  │  Step 10: Update (🟡→🟢 + git pull --rebase + commit) │  │
│  │       ↓                                               │  │
│  │  Step 11: Loop                                        │  │
│  │    ├─ All complete → ✅ EXIT                           │  │
│  │    ├─ All blocked → ⏸ EXIT                            │  │
│  │    ├─ 2 consecutive failures → ❌ EXIT                 │  │
│  │    └─ Available task found → new worktree             │  │
│  │       → GOTO Step 5                                   │  │
│  │                                                       │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 Single Task 11-Step Flow

| Step | Name | Operation | Location |
|------|------|-----------|----------|
| 1 | Config | Read .claude/config.yaml + specs config | Platform repo |
| 2 | Collect Status | Read task list + backend API + worktree | specs |
| 3 | Resolve | Locate target task | specs |
| 4 | Context | Display task context (Figma/API/i18n) | specs |
| 5 | Lock | Idempotent check → 🔴→🟡 + git pull --rebase + commit | specs |
| 6 | Analyze + Design | Analyze current state → design.md + {platform}.md → write to F{nn}/ | specs + worktree |
| 7 | Execute | API Verify → Collect → Code (per plan) → Build | worktree |
| 8 | Review | Code Review diff, fix loop | worktree |
| 9 | Merge | merge → feat/v{version} + cleanup wt | Main repo |
| 10 | Update | 🟡→🟢 + git pull --rebase + commit (no DASHBOARD writes) | specs |
| 11 | Loop | Check exit conditions → find next → new worktree | Main repo |

### 5.4 Step 6: Analyze + Design In-Depth

Three-layer plan hierarchy: **Version Overview** → **Feature Plan** (aggregated by Feature) → **Platform Refinement**.

```
Version kickoff
  │
  ├─ overview.md                         # Version-level design overview
  │    ├─ Feature landscape, cross-feature
  │    │   architecture decisions
  │    ├─ Shared dependencies, execution order
  │    └─ Risk overview
  │
  ├─ {platform}/tech-plan.md             # Platform-level technical plan
  │    ├─ Infrastructure changes, shared components
  │    ├─ Platform-specific constraints
  │    └─ Tech debt, testing strategy
  │
  ▼
Feature determined
  │
  ▼
Shared plan: F{nn}-{name}/design.md
  ├─ Impact analysis (modules, dependencies)
  ├─ Data flow design (API, state management)
  ├─ Key decisions (business logic level)
  └─ Risks + CR change highlights
  │
  │  Generated by spec-drive during task analysis,
  │  or by the first Worker
  │  Once generated, shared by both platforms —
  │  no duplicate analysis
  │
  ▼
Worker executes Step 6
  │
  ├─ Read overview.md (if missing → generate from
  │   project + template)
  ├─ Read {platform}/tech-plan.md (if missing →
  │   generate from project + template)
  ├─ Read F{nn}-{name}/design.md (if missing →
  │   generate from YAML + template)
  ├─ Scan existing code in worktree
  ├─ Generate platform refinement:
  │   F{nn}-{name}/{platform}.md
  │    ├─ Existing code analysis (reusable components,
  │    │   files to modify)
  │    ├─ File change manifest
  │    ├─ Platform technology choices
  │    └─ 🔵 Rework: "what to change, what NOT to change"
  │
  └─ git add + commit (to specs repo)
```

**Document structure** (aggregated by feature):

```
moox/{version}/
├── tasks/                                  # Spec definitions
│   ├── ios.md
│   ├── android.md
│   ├── backend.md
│   └── shared.md
├── features/                               # Feature YAML
├── implementation/                         # Implementation plans
│                                           # (separated from specs)
│   ├── overview.md                         # Version-level design overview
│   ├── ios/
│   │   └── tech-plan.md                    # iOS technical plan
│   ├── android/
│   │   └── tech-plan.md                    # Android technical plan
│   ├── F01-message-longpress-menu/         # Aggregated by feature
│   │   ├── design.md                       # Shared plan
│   │   │                                   # (platform-agnostic)
│   │   ├── ios.md                          # iOS refinement
│   │   └── android.md                      # Android refinement
│   ├── F06-self-settings/
│   │   ├── design.md
│   │   ├── ios.md
│   │   └── android.md
│   └── ...
```

**Version Overview** (`_templates/implementation-overview.template.md`):
- Feature landscape, cross-feature architecture decisions, shared dependencies, execution order, risk overview
- Generated at version kickoff, referenced by all Workers

**Platform Refinement** (`_templates/implementation-platform-tech.template.md`):
- Infrastructure changes, shared components, platform constraints, tech debt, testing strategy
- Cross-task platform-level technical plans that do not belong to any single Feature

**Shared Plan** (`_templates/implementation.template.md`):
- Impact analysis, data flow, API calls, key decisions, business rules, risks
- Can be generated once the Feature is determined, independent of any specific platform
- Referenced by Workers on both platforms, written only once

**Platform Refinement** (`_templates/implementation-platform.template.md`):
- Existing code analysis, file change manifest, platform technology choices, implementation steps
- Generated by the Worker in Step 6 based on shared plan + platform tech plan + project state
- 🔵 Rework tasks must fill in the CR section, clearly defining the modification boundary

**Feature YAML vs design.md division of responsibility**:
- YAML = What + Constraint (what to do, UI contracts, data contracts, state matrix)
- design.md = How + Why (how to do it, rationale, data flow, module interactions)
- YAML is the requirements spec; design.md is the implementation design — no overlap, complementary

**Generation timing**:
- overview.md + tech-plan.md: Generated during the first execution of the version, by the first Worker
- design.md: Generated by the first Worker working on that Feature in Step 6; subsequent Workers reuse it
- {platform}.md: Each Worker generates its own platform refinement in Step 6

**Requirements**:
- Write the plan before writing code; no "figure it out as you go"
- Key decisions must include rationale; "gut feeling" is not accepted
- When reviewing a feature, one directory shows the full picture (shared + both platforms)
- Shared plans are written once; the second Worker reuses directly
- Platform refinements can differ (platform differences justify different implementations)

---

## 6. Task Status Lifecycle

```
🔴 Pending
    │
    │  Step 5: Lock (idempotent: skip if already 🟡)
    ▼
🟡 In Progress
    │
    ├── Build passes + Review passes ──→ 🟢 Completed
    │                                    │
    │                                    ├── Step 8: merge → feat/v{version}
    │                                    │
    │                                    └── CR change required → 🔵 Needs Rework
    │                                                             │
    │                                                             │ propagate → Lock
    │                                                             ▼
    │                                                           🟡 In Progress → 🟢 Completed
    │
    └── Build fails / Review fails
         │
         └── 🟡 In Progress — Blocked: {reason}
              │
              ├── Worker skips this task, tries next
              └── Recovery: /spec-drive reset T{nn} → 🔴 → re-execute
```

### Status Markers

| Symbol | Meaning | Appears In |
|--------|---------|------------|
| 🔴 | Pending | tasks/{platform}.md overview table + details |
| 🟡 | In Progress | Same as above, changed after Lock |
| 🔵 | Needs Rework | Same as above; completed but CR changed requirements, code needs targeted update |
| 🟢 | Completed | Same as above, changed after verification passes |
| ⚫ | Not Applicable | DASHBOARD.md (e.g., client-only with no backend) |

### Single Source of Truth for Status

- `tasks/{platform}.md` is the **single source of truth** for task status
- `DASHBOARD.md` is aggregated from task files by `/spec-drive status`; Workers do not modify it directly
- This eliminates race conditions caused by dual-platform Workers writing to DASHBOARD concurrently

---

## 7. Branch and Worktree Strategy

### 7.1 Branch Model

```
master (or main)
  │
  └── feat/v1.2  ← version integration branch (all tasks merge here)
       │
       ├── feat/pixel_muse_ios/0304/T06-self-settings     ← task branch
       ├── feat/pixel_muse_ios/0304/T07-character-settings
       ├── feat/pixel_muse_android/0304/T06-self-settings
       └── feat/pixel_muse_android/0304/T07-character-settings
```

### 7.2 Worktree Directory Structure

```
wt/
└── pixel_muse_ios/
    └── 0304/                        # Date (MMDD)
        ├── T06-self-settings/       # Task worktree
        │   ├── (iOS project files)
        │   ├── specs -> ../specs/moox  # Auto symlink
        │   └── api-doc -> ...          # Auto symlink
        └── T07-character-settings/
```

### 7.3 Worktree Lifecycle

```
Create: wt.sh new T06-self-settings feat/v1.2
  → wt/pixel_muse_ios/0304/T06-self-settings/
  → branch: feat/pixel_muse_ios/0304/T06-self-settings
  → tmux window: T06-self-settings (3-pane layout)
  → auto-run setup-links.sh

Use: Worker session develops in this directory

Merge: git -C {REPO_ROOT} merge {task_branch} --no-ff

Cleanup: wt.sh -f rm T06-self-settings
  → delete worktree directory
  → delete task branch
  → close tmux window
```

---

## 8. Smart Analysis

### 8.1 Dependency Graph Construction

Parsed from the "Dependencies" column in the tasks/{platform}.md overview table:

```
T01 (no deps)
 ├── T02 (depends on T01) ──→ requires B01 (backend API)
 ├── T03 (depends on T01) ──→ requires B02
 ├── T04 (depends on T01) ──→ requires B03
 └── T05 (depends on T01)

T06 (no deps) ──→ requires B04
T07 (no deps) ──→ requires B05

T08 (no deps)
 └── T09 (depends on T08) ──→ requires B06
      └── T10 (depends on T09) ──→ requires B07
```

### 8.2 Execution Wave Planning

```
Wave 1: T06, T07        ← no deps, backend ready, can parallelize
Wave 2: T08             ← no deps, no backend requirement
Wave 3: T09             ← depends on T08
Wave 4: T10             ← depends on T09
Blocked: T02, T03, T04  ← waiting on B01-B03 backend APIs
```

### 8.3 Cross-Platform Alignment

The same task can have different statuses on each platform:

| Task | iOS | Android | Decision |
|------|-----|---------|----------|
| T06 | 🔴 | 🔴 | Launch both in parallel |
| T01 | 🟢 | 🟢 | Skip |
| T02 | 🟢 | 🔴 | Launch Android only |

---

## 9. API Contract Verify

For every task with backend APIs, the system automatically verifies consistency between specs and the actual API documentation before development begins.
Pure client-side tasks (API table shows "None") skip this step.

### 9.1 API Source Classification

| Path Prefix | Source | Verification Method |
|-------------|--------|---------------------|
| `/chatbot/*` | Swagger | `{api_doc_path}/chatbot_swagger.json` |
| `/post/*` | Swagger | `{api_doc_path}/post_swagger.json` |
| `/chat/*` | Messaging middleware | `tasks/backend.md` parameter tables + signaling definitions |

**api_doc_path**: Retrieved from `.claude/config.yaml` under `api_doc.path` (iOS: `../api-doc`, Android: `docs/api-doc`)

### 9.2 What Gets Verified

- Do request parameter names match the documentation
- Do response fields exist
- Are enum values defined
- Does the API documentation exist

### 9.3 Handling Inconsistencies

```
⚠️ specs says self_setting, Swagger says self_desc → develop using Swagger as source of truth
❌ Missing API docs: /chat/rewrite_message → non-blocking, flagged in technical notes
```

---

## 10. Configuration Files

### 10.1 specs/.claude/config.yaml

```yaml
project:
  name: moox
version:
  current: "1.2"
platforms:
  ios:
    repo: ../pixel_muse_ios
    build_cmd: ./scripts/build.sh
  android:
    repo: ../pixel_muse_android
    build_cmd: ./scripts/build.sh
wt_script: ~/.claude/skills/wt/scripts/wt.sh
branch:
  version_prefix: "feat/v"
```

### 10.2 Platform .claude/config.yaml

```yaml
project:
  name: moox
  platform: ios          # or android
version:
  current: "1.2"
specs:
  path: specs            # symlink → ../specs/moox
api_doc:
  path: ../api-doc       # iOS: ../api-doc, Android: docs/api-doc
paths:
  version_config: "{specs}/{version}/config.yaml"
  prd: "{specs}/{version}/prd/"
  features: "{specs}/{version}/features/"
  tasks:
    self: "{specs}/{version}/tasks/{platform}.md"
    backend: "{specs}/{version}/tasks/backend.md"
```

---

## 11. Troubleshooting

### 11.1 Build Failure

```
Scenario: ./scripts/build.sh returns failure
Handling:
  1. Worker automatically analyzes error logs
  2. Fixes build errors
  3. Retries build (up to 3 times)
  4. Still failing after 3 attempts → mark 🟡 Blocked → preserve worktree → move to next task
Recovery:
  1. tmux select-window -t "T{nn}-xxx"
  2. Manually fix the build issue
  3. ./scripts/build.sh to verify it passes
  4. Or /spec-drive reset T{nn} to reset and re-execute
```

### 11.2 Merge Conflict

```
Scenario: git merge produces conflicts (two tasks modified the same file)
Handling:
  1. Worker outputs the list of conflicting files
  2. Does NOT auto-clean the worktree
  3. Waits for manual resolution
Recovery:
  1. tmux select-window -t "T{nn}-xxx"
  2. cd to the worktree path
  3. git status  # view conflicting files
  4. Manually resolve conflicts → git add → git commit
  5. cd {REPO_ROOT} && bash ~/.claude/skills/wt/scripts/wt.sh -f rm T{nn}-xxx
```

### 11.3 Task Stuck at 🟡

```
Scenario: Worker crashed, worktree already cleaned, task stuck at 🟡
Diagnosis:
  1. git -C {repo} worktree list | grep T{nn}
     - Has worktree → enter worktree and continue development
     - No worktree → needs reset
Recovery:
  # Method A: Reset via specs orchestrator
  /spec-drive reset T{nn}         # reset back to 🔴
  /spec-drive T{nn}               # re-execute

  # Method B: Manual reset
  # Edit moox/{version}/tasks/{platform}.md:
  #   Overview table 🟡→🔴 + stats row + detail status line
  # git add + commit: "chore: reset T{nn} to pending"
```

### 11.4 Worker Session Interrupted

```
Scenario: Claude Code session unexpectedly exits
Handling:
  1. Worktree and code still exist
  2. Task status is 🟡 (already Locked)
Recovery:
  1. tmux select-window -t "T{nn}-xxx"  # or tmux list-windows to find it
  2. cd {worktree_path}
  3. claude                             # start new session
  4. /spec-next T{nn}                   # continue (Lock is idempotent:
                                        #   already 🟡 → auto-skip)
```

### 11.5 Specs Concurrent Commit Conflict

```
Scenario: Two Workers commit to the specs repo simultaneously
Handling:
  - Workers run git pull --rebase before every specs commit
  - ios.md and android.md are separate files, so they won't conflict
  - Workers no longer write to DASHBOARD.md, eliminating the main conflict source
  - Extreme rebase conflict → Worker reports, waits for manual resolution
Recovery:
  1. cd specs/
  2. git status                          # view conflicts
  3. Manually resolve → git rebase --continue
  4. Or git rebase --abort + manual commit
```

---

## 12. Git Push Strategy

All operations across the entire system default to **local only** — nothing is auto-pushed. This means:
- Progress is not automatically synced to the remote
- A crash will lose any un-pushed work

### Recommended Push Timing

| When | Action | Notes |
|------|--------|-------|
| End of each workday | `git -C {repo} push` | Save the day's progress |
| After `/spec-drive done` | Push feat/v1.2 on both platforms | Archive after version completion |
| Key milestones | Push specs + both platforms | e.g., after a batch of tasks completes |

### Specific Commands

```bash
# Push specs repo
cd specs && git push

# Push both platform version branches
git -C ../pixel_muse_ios push -u origin feat/v1.2
git -C ../pixel_muse_android push -u origin feat/v1.2
```

---

## 13. Shared Prerequisites (S-Tasks)

S1-S3 (PRD confirmation / design review / API definition) are **manual prerequisites**, not automated tasks.

- All T-tasks check whether S1-S3 are 🟢 before executing
- S-tasks can only be manually updated by humans
- The system will not automatically execute or recover S-tasks
- If an S-task is 🔴, all T-tasks will be blocked

---

## 14. Typical Usage Scenarios

### Scenario A: Full Version Development from Scratch

```bash
# 1. Open specs repo in tmux
tmux new -s moox
cd specs

# 1.5. Generate spec (first time for new version)
/spec-init 1.3               # PRD + Figma + API → complete spec

# 2. Initialize
/spec-drive setup            # Create feat/v1.3 branches
                             # (auto-checks spec-init output)

# 3. View the big picture
/spec-drive status           # View all task statuses + aggregate DASHBOARD

# 4. Start fully automated development
/spec-drive next             # Auto-analyze + launch both platforms in parallel

# 5. Wait... Worker sessions auto-loop through tasks
# iOS:     T06 → T07 → T08 → T09 → T10 → ⏸ (waiting on backend)
# Android: T06 → T07 → T08 → T09 → T10 → ⏸ (waiting on backend)

# 6. Check progress
/spec-drive status

# 7. After backend APIs are ready, continue
/spec-drive next             # Auto-finds T02/T03/T04

# 8. Final verification
/spec-drive verify
/spec-drive done
```

### Scenario B: Execute a Single Task

```bash
/spec-drive T06 ios          # Execute T06 on iOS only
```

### Scenario C: Catch Up a Lagging Platform

```bash
/spec-drive status           # Discover Android is behind
/spec-drive next android     # Launch Android Worker only
```

### Scenario D: Recover a Stuck Task

```bash
/spec-drive status           # Find T06 🟡 but no worktree
/spec-drive reset T06        # Reset to 🔴
/spec-drive T06 android      # Re-execute
```

### Scenario E: CR Change Rework

```bash
# Method 1: next auto-detects + auto-propagates (recommended)
/spec-drive next                     # Auto-detects CR rework tasks,
                                     # launches alongside new tasks

# Method 2: manually specify propagation
/spec-drive propagate CR-003         # Fully automatic: create worktree
                                     # → apply changes → build → review → merge
/spec-drive propagate CR-004 ios     # Propagate to iOS only

# Discovery + monitoring
/spec-next                           # Status overview → CR change attention section
/spec-next T06                       # Task details → ⚠️ CR-003 pending
/spec-drive change status            # All CR propagation status dashboard
```

### Scenario F: Execute Directly in Platform Project

```bash
# In the iOS project
cd pixel_muse_ios

# Method 1: manually in main repo
/spec-next T06               # Develop on current branch (no worktree)

# Method 2: create worktree first
/wt T06-self-settings        # Create worktree
/spec-next T06               # Develop in worktree (auto-merge)
```

---

## 15. Change Management

### 15.1 The Problem

The specs system is a static specification tree: PRD → Feature YAML → Task → Code. It is complete at creation, but when PRD / API / Figma / i18n changes occur, downstream files do not automatically detect them.

### 15.2 The Solution

A unified CHANGELOG + dependency index + `/spec-drive change` command to achieve: record changes → analyze impact → track propagation.

```
CHANGELOG.md (unified change log, each change gets a CR number)
     │
     ▼ query
config.yaml dependency_index (reverse dependency graph)
     │
     ▼ drive
/spec-drive change (auto-analyze impact → generate CR → propagation checklist)
     │
     ▼ record
Feature YAML revisions (change history)
```

### 15.3 Core Files

| File | Purpose |
|------|---------|
| `moox/{version}/CHANGELOG.md` | Unified change log, CR numbers globally incremented |
| `moox/{version}/config.yaml` → `dependency_index` | Reverse dependency graph: API→Feature, Figma→Feature, Feature→Backend |

### 15.4 CR Lifecycle

```
Change occurs (API/PRD/Figma/i18n)
  │
  ▼
/spec-drive change api /post/get_story_detail "add creator_id"
  │
  ├── Read dependency_index → find impact scope
  ├── Generate CR-{nnn} entry (with impact list + checklist)
  └── Append to CHANGELOG.md
  │
  ▼
Propagate changes to each file (manual or automatic)
  │
  ├── Check off checklist [x] as each item completes
  └── Add revisions record to Feature YAML
  │
  ▼
/spec-drive change status → view propagation dashboard
  │
  ├── 🔴 Pending propagation: all checklist items unchecked
  ├── 🟡 Partially propagated: some items checked
  └── ✅ Fully propagated: all items checked
```

### 15.5 Command Usage

```bash
# Record an API change, auto-analyze impact
/spec-drive change api /post/get_story_detail "add creator_id"
# → Impact: F08, F09, F10 → 6 Tasks + B06, B07

# Record a Figma change
/spec-drive change figma 152:75 "add edit button style to main profile page"

# Record a PRD change
/spec-drive change prd F06 "self-settings character limit increased 200→500"

# View all CR propagation status
/spec-drive change status
```

### 15.6 CR Change Propagation (propagate)

When a task affected by a CR is already marked 🟢 completed, but the CR has unpropagated code changes, rework is needed.

**Two trigger methods**:

1. **Automatic**: `/spec-drive next` automatically detects 🔁 CR rework tasks while planning execution waves, launching them in parallel with new tasks
2. **Manual**: `/spec-drive propagate CR-{nnn}` to propagate a specific CR

Both methods are **fully automatic** with no intermediate confirmation needed. Quality is validated through build + code review.

**Manual commands**:

```bash
# Auto-propagate CR-003 to all affected platforms
/spec-drive propagate CR-003

# Propagate to iOS only
/spec-drive propagate CR-003 ios

# Propagate to Android only
/spec-drive propagate CR-003 android
```

**Flow**:

```
/spec-drive propagate CR-003 (or auto-triggered by next)
       │
       ▼
  Read CHANGELOG.md → CR-003 entry
       │
       ├── Status ✅ → "already fully propagated, no action needed", exit
       │
       ▼
  Parse checklist → filter code-related [ ] items
       │
       ├── No code items → "remaining items require manual confirmation", exit
       │
       ▼
  Read Feature YAML → change points annotated with [CR-003]
       │
       ▼
  Execute directly (no confirmation needed):
    Create worktree (CR003-T06-self-settings)
    Launch Claude Code session (apply CR changes only)
       │
       ▼
  Worker: apply changes → build verification → code review
       │
       ▼
  Merge → update CHANGELOG checklist
       │
       ├── All done → CR status → ✅
       └── Partially done → CR status remains 🟡
```

**Note**: `propagate` only handles code change items. Non-code items like backend confirmation (B{nn}), Figma confirmation, etc. must be manually completed and checked off.

### 15.7 dependency_index Structure

Three sets of reverse mappings maintained in `config.yaml`:

- **api_to_features**: API endpoint → which Features use it
- **figma_to_features**: Figma node → which Features reference it
- **feature_to_backend**: Feature → dependent Backend tasks

This index must be updated when new APIs or Figma pages are added.

---

## 16. Change Management Onboarding Guide

> You discovered a change (PRD updated, API changed, Figma refreshed) — what do you do?

### End-to-End Overview

```
Discover change → Record CR → Propagate specs → Propagate code → Verified
    (you)         (1 command)    (automatic)      (automatic)     (automatic)
```

You only need to do the first step; the system handles the rest automatically.

---

### Step 1: Record the Change

After discovering a change, run one command in the specs repo:

```bash
# PRD changed (most common)
/spec-drive change prd F06 "self-settings character limit 2000→800"

# API changed
/spec-drive change api /post/get_story_detail "add creator_id field"

# Figma changed
/spec-drive change figma 152:75 "add edit button to main profile page"

# i18n changed
/spec-drive change i18n F06 "add appellation description copy"
```

The system will automatically:
- Assign a CR number (e.g., CR-006)
- Analyze impact scope via dependency_index (which Features → which Tasks → which backend)
- Generate a checklist (one item per file/module that needs updating)
- Write to CHANGELOG.md
- git commit

**Example output**:
```
━━━ CR-006 Impact Analysis ━━━
Type: PRD
Change: self-settings character limit 2000→800
Impact scope:
  Features: F06
  iOS Tasks: T06
  Android Tasks: T06
  Backend: B04
Generated checklist: 5 items
```

---

### Step 2: Propagate to Spec Files

After the CR is recorded, changes need to be propagated to Feature YAML and Task files.

**If the task hasn't started yet (🔴)**: Simply update the Feature YAML + Task files; development will naturally use the new specs.

**If the task is already completed (🟢)**: This is the scenario that needs propagation. No need to worry manually — the next step handles it automatically.

Generally, after `/spec-drive change` runs, you will be guided to update the relevant Feature YAML and Task files. Check off `[x]` in the CHANGELOG as each item is updated.

---

### Step 3: Propagate to Code (Fully Automatic)

After spec files are updated, how does the code catch up?

**Method A: Automatic (recommended)**

```bash
/spec-drive next
```

`next` automatically scans the CHANGELOG while planning execution waves:
- Discovers 🟡/🔴 CRs affecting completed 🟢 tasks
- Automatically creates CR rework worktrees (e.g., `CR003-T06-self-settings`)
- Launches Worker to apply CR changes only → build → review → merge
- Runs in parallel with new tasks, no extra action needed from you

**Method B: Manual specification**

```bash
/spec-drive propagate CR-003           # Propagate to both platforms
/spec-drive propagate CR-003 ios       # Propagate to iOS only
```

---

### Step 4: Verification

**Automatic verification** — after the Worker completes, it will:
1. Build verification
2. Code Review (automatic)
3. Merge to version branch
4. Update CHANGELOG checklist `[x]`

**Manual verification** — some items cannot be handled automatically:
- `B04 backend API confirmation` → confirm with backend team that the API was adjusted accordingly
- `Figma confirmation` → confirm with design team that the design file was updated

These require you to manually confirm and then check off `[x]` in CHANGELOG.md.

---

### Step 5: Check Completion Status

```bash
/spec-drive change status
```

Outputs the propagation dashboard for all CRs:

```
| CR     | Date       | Description               | Progress | Status |
|--------|-----------|---------------------------|----------|--------|
| CR-001 | 2026-03-02 | IM say → HTTP POST         | 4/4      | ✅     |
| CR-003 | 2026-03-05 | F06 field rule adjustments  | 4/6      | 🟡     |
| CR-004 | 2026-03-05 | F07 char limit reduced 800  | 4/5      | 🟡     |
```

When all items are `[x]` → status automatically becomes ✅, and the CR is fully closed.

---

### Quick Reference: One Diagram

```
You discover a PRD change
  │
  ▼
/spec-drive change prd F06 "xxx"     ← you do this step
  │
  ├─→ Auto-generate CR-006 + checklist
  │
  ▼
Update Feature YAML + Task files       ← you do this step (or AI assists)
  │                                       check off CHANGELOG [x] per item
  ▼
/spec-drive next                        ← you do this step (or run periodically)
  │
  ├─→ Auto-detect CR rework → worktree → Worker
  ├─→ build + review (automatic)
  ├─→ merge + update checklist (automatic)
  │
  ▼
/spec-drive change status               ← check anytime
  │
  └─→ All ✅ = change fully landed
```

### What You Need to Do Manually (3 Things Total)

| # | Action | When |
|---|--------|------|
| 1 | `/spec-drive change ...` to record the change | When you discover a change |
| 2 | Update specs in Feature YAML + Task files | Immediately after recording |
| 3 | Check off non-code checklist items (backend confirmation / Figma confirmation) | After confirmation, anytime |

Code propagation, build, review, merge, checklist updates — all automatic.

---

## 17. Data Flow

```
PRD (prd/README.md)
  ↓
CHANGELOG.md (CR records changes + impact analysis)
  ↓
Feature YAML (features/F{nn}-*.yaml)
  ├── figma.pages → Figma MCP → design screenshots
  ├── api → Swagger/backend.md → API Contract Verify
  ├── i18n_keys → strings.md → Localizable.xcstrings / strings.xml
  └── analytics → analytics event code
  ↓
tasks/{platform}.md (task plan + status tracking — single source of truth)
  ↓
/spec-drive (orchestration) → Worker Session (execution)
  ↓
Code implementation (worktree) → build verification → Code Review
  ↓
merge → feat/v{version} → final verification → master
```

---

## 18. Spec Generation Layer (spec-init)

### 18.1 Role

spec-init is the **generation layer**, executed before spec-drive (orchestration layer). It is responsible for generating the complete spec skeleton from PRD + materials in one pass.

```
Generation layer: /spec-init   → config + features + tasks + i18n + CHANGELOG
Orchestration layer: /spec-drive  → analysis + worktree + Worker dispatch
Execution layer: /spec-next   → single task 11-step flow
```

### 18.2 Input Material Requirements

| Material | Required | Format | Location |
|----------|----------|--------|----------|
| **PRD** | ✅ Required | PDF or Markdown | `moox/{version}/prd/` |
| **Figma** | Optional | file_key or URL | Interactive input |
| **Swagger** | Optional | JSON | `api-doc/*.json` |
| **Technical Design** | Optional | Markdown | `api-doc/tec_docs/` |
| **i18n Seed** | Optional | Existing translation files | `moox/{version}/i18n/` |

### 18.3 Generated Output Manifest

| Output | Path | Source |
|--------|------|--------|
| Version config | `config.yaml` | PRD metadata + Figma + API |
| Feature YAML x N | `features/F{nn}-*.yaml` | PRD feature descriptions |
| iOS task plan | `tasks/ios.md` | Feature → Task mapping |
| Android task plan | `tasks/android.md` | Mirror of iOS |
| Backend API tasks | `tasks/backend.md` | Swagger + PRD dependencies |
| Shared prerequisites | `tasks/shared.md` | Fixed template + API patterns |
| i18n strings | `i18n/strings.md` | Chinese copy extracted from PRD |
| Figma index | `figma-index.md` | Figma MCP queries |
| Change log | `CHANGELOG.md` | Empty template |
| Implementation plan directory | `implementation/` | Empty skeleton |

### 18.4 Field Completion Guide

Some fields in the Feature YAML generated by spec-init are marked with TODO and need manual completion:

| Field | When to Complete | How to Complete | Impact if Missing |
|-------|-----------------|-----------------|-------------------|
| `ui_contract` | Before setup | Fill in based on Figma, one by one | Worker cannot perform visual acceptance |
| `delivery_contract.stack_baseline` | Before setup | Analyze existing iOS/Android code | Worker may choose wrong tech stack |
| `delivery_contract.data_contract` | Before setup | Confirm field source priorities | Data display logic may be incorrect |
| `state_matrix.figma_node` | Before development | Manually map Figma node IDs | Cannot do Figma baseline comparison |
| `api[].verified` | Before development | Verify each field against Swagger/docs | API Contract Verify is skipped |
| `pixel_baseline` | Before acceptance | Measure key dimensions from Figma | Cannot do pixel-level comparison |

**Priority recommendations**:
1. **Must complete before setup**: ui_contract, delivery_contract (affects development plan quality)
2. **Can complete during development**: state_matrix.figma_node, api verified (Workers flag missing items)
3. **Can complete at acceptance**: pixel_baseline, verification_evidence (does not affect development)

### 18.5 Three Modes

```bash
/spec-init 1.3               # Full generation (when version directory does not exist)
/spec-init 1.3 refresh       # Incremental update (after PRD changes, add missing features
                              # without overwriting existing ones)
/spec-init 1.3 validate      # Validate only, output pass/fail/warning report
```

---

## 19. Version Upgrade

New version development workflow (using v1.3 as an example):

1. Prepare PRD: place in `moox/1.3/prd/` directory
2. `/spec-init 1.3` → auto-generate complete spec skeleton
3. Complete the flagged fields (ui_contract, delivery_contract, etc.)
4. `/spec-drive setup` → create `feat/v1.3` branches
5. `/spec-drive next` → start execution
