[English](./architecture.md) | [中文](./architecture.zh-CN.md)

# Spec System Architecture

> A fully automated pipeline from PRD to code: Generate → Orchestrate → Execute.

---

## 1. Overview

```
PRD + Figma + API Docs            ← User-provided materials
        │
   /spec-init                     ← Generation layer: one-shot spec skeleton
        │
   moox/{version}/                ← Specification layer: Feature YAML + Task Plan + i18n + ...
        │
   /spec-drive setup              ← Orchestration layer: create version branch
   /spec-drive next               ← Orchestration layer: analyze deps → dispatch Worker
        │
   Worker × 2 (iOS + Android)    ← Execution layer: autonomous 11-step dev loop
        │
   /spec-drive done               ← Version complete
```

---

## 2. Three-Layer Architecture

### 2.1 Generation Layer — `/spec-init`

**Responsibility**: Generate a complete spec skeleton from PRD + materials in one shot.

```
Input                           Processing                     Output
─────────────                   ────────────────              ──────────────
PRD (PDF/MD)           →  Step 3: PRD parsing          →  features/F{nn}-*.yaml
Figma (file_key)       →  Step 4: Figma indexing       →  figma-index.md
Swagger (JSON)         →  Step 5: API parsing          →  tasks/backend.md
i18n seeds             →  Step 6: Full generation      →  config.yaml
                          Step 7: Cross-validation         tasks/{ios,android}.md
                                                           i18n/strings.md
                                                           CHANGELOG.md
```

**Three Modes**:

| Mode | Command | Purpose |
|------|---------|---------|
| generate | `/spec-init 1.3` | Full generation (when version directory doesn't exist) |
| refresh | `/spec-init 1.3 refresh` | Incremental addition (add new features after PRD changes) |
| validate | `/spec-init 1.3 validate` | Validation only, no file modifications |

### 2.2 Orchestration Layer — `/spec-drive`

**Responsibility**: Task analysis + dependency graph + worktree creation + Worker dispatch + status monitoring.

```
┌──────────────────────────────────────────────────────────────────┐
│                     specs repo (Orchestration Hub)                │
│                                                                  │
│  /spec-init:   PRD + materials → spec skeleton (one-shot)        │
│  /spec-drive:  analyze + dispatch + monitor + change management  │
│  /spec-next:   status view + task location                       │
│                                                                  │
│  ┌──────────────────────────────────────┐                        │
│  │         Orchestrator Core Flow        │                        │
│  │                                      │                        │
│  │  Phase 0: Pre-checks (tmux/branch/repo)                      │
│  │  Phase 1: Global analysis (dep graph/wave planning)           │
│  │  Phase 2: Display plan + confirmation │                        │
│  │  Phase 3: Infrastructure (worktree/tmux)                      │
│  │  Phase 4: Return control              │                        │
│  └──────────────────────────────────────┘                        │
└────────────────┬───────────────────────┬─────────────────────────┘
                 │                       │
      ┌──────────▼──────────┐  ┌────────▼──────────────┐
      │  pixel_muse_ios     │  │  pixel_muse_android    │
      │                     │  │                        │
      │  feat/v1.3 ← integ  │  │  feat/v1.3 ← integ    │
      │    ↑                │  │    ↑                   │
      │  wt/T06-xxx ← dev   │  │  wt/T06-xxx ← dev     │
      └─────────────────────┘  └────────────────────────┘
```

**Full Subcommand Reference**:

| Subcommand | Frequency | Responsibility |
|------------|-----------|----------------|
| `setup` | Once per version | Check spec completeness → create version branch |
| `next [platform]` | Multiple times | Smart analysis → worktree → Worker dispatch |
| `T{nn} [platform]` | On demand | Execute a specific task |
| `status` | Anytime | Aggregate cross-platform progress → DASHBOARD |
| `reset T{nn}` | Failure recovery | 🟡→🔴 Reset stuck tasks |
| `change <type> <scope> "<desc>"` | On demand | CR logging + impact analysis |
| `change status` | Anytime | CR propagation dashboard |
| `propagate CR-{nnn}` | On demand | CR code rework |
| `verify` | End of version | Version branch build verification |
| `done` | Once per version | Final summary |

### 2.3 Execution Layer — `/spec-next` (Worker)

**Responsibility**: Autonomously complete the full development workflow within a worktree.

```
┌──────────────────────────────────────────────────────────────┐
│                    Worker Session Loop                         │
│                                                              │
│  LOOP:                                                       │
│    Step 1   Config     Read configuration                    │
│    Step 2   Status     Collect task status                   │
│    Step 3   Resolve    Locate target task                    │
│    Step 4   Context    Display context (Figma/API/i18n)      │
│    Step 5   Lock       🔴→🟡 + git commit                    │
│    Step 6   Analyze    design.md + {platform}.md              │
│    Step 7   Execute    API Verify → Collect → Code → Build   │
│    Step 8   Review     Code Review (up to 3 rounds)          │
│    Step 9   Merge      merge → feat/v{version} + cleanup     │
│    Step 10  Update     🟡→🟢 + git commit                    │
│    Step 11  Loop       Next task or EXIT                     │
│                                                              │
│  Exit conditions:                                            │
│    ✅ All complete │ ⏸ All blocked │ ❌ 2 consecutive failures │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. Specification Layer — Directory Structure

```
moox/{version}/
│
├── config.yaml ──────────────────── Version configuration
│   ├── version, codename
│   ├── figma.file_key
│   ├── paths (all file locations)
│   ├── api.swagger_files
│   ├── features[] (quick index)
│   └── dependency_index
│       ├── api_to_features         /chat/rewrite_message → [F02]
│       ├── figma_to_features       "119:370" → [F02]
│       └── feature_to_backend      F02 → [B01]
│
├── prd/
│   ├── README.md ────────────────── Structured PRD index
│   └── *.pdf ────────────────────── Original PRD documents
│
├── features/
│   ├── F01-xxx.yaml ─────────────── What + Constraint
│   ├── F02-xxx.yaml                  id, name, module, epic
│   ├── ...                           description, requirements
│   └── F{nn}-xxx.yaml               acceptance_criteria
│                                     ui_contract ← Figma-driven
│                                     delivery_contract ← Tech stack constraints
│                                     state_matrix ← State scenarios
│                                     figma.pages[] ← Design assets
│                                     api[] ← API definitions
│                                     analytics[] ← Event tracking
│                                     i18n_keys[] ← Internationalization
│                                     platform_tasks ← T/B mapping
│                                     dependencies ← Inter-feature deps
│
├── tasks/
│   ├── shared.md ────────────────── S1-S3 prerequisites + API patterns + error codes
│   ├── backend.md ───────────────── B01-B{nn} backend API details
│   ├── ios.md ───────────────────── T01-T{nn} single source of truth (iOS)
│   └── android.md ───────────────── T01-T{nn} single source of truth (Android)
│
├── i18n/
│   └── strings.md ───────────────── key | zh | ja | en
│
├── figma-index.md ───────────────── Section → Page → Node ID
│
├── CHANGELOG.md ─────────────────── CR change log + checklist
│
├── DASHBOARD.md ─────────────────── Progress dashboard (aggregated)
│
└── implementation/ ──────────────── How + Why
    ├── overview.md                   Version-level design overview
    ├── ios/tech-plan.md              iOS technical plan
    ├── android/tech-plan.md          Android technical plan
    └── F{nn}-{name}/
        ├── design.md                 Shared design doc (cross-platform)
        ├── ios.md                    iOS platform specifics
        └── android.md               Android platform specifics
```

---

## 4. Data Flow

### 4.1 Generation-Time Data Flow (spec-init)

```
PRD ──┬── Epic/Feature extraction ──→ features/F{nn}.yaml
      ├── Analytics extraction ─────→ features/F{nn}.yaml → analytics[]
      ├── Dependency extraction ────→ tasks/backend.md (B{nn})
      └── Chinese copy extraction ─→ i18n/strings.md

Figma ─── Section/Page query ──────→ figma-index.md
      └── Page→Feature mapping ────→ features/F{nn}.yaml → figma.pages[]

Swagger ── Endpoint extraction ────→ features/F{nn}.yaml → api[]
       └── Param/Response extraction → tasks/backend.md (details)

All above ─── Reverse indexing ────→ config.yaml → dependency_index
           └── Task distribution ──→ tasks/{ios,android}.md
```

### 4.2 Execution-Time Data Flow (spec-drive + spec-next)

```
config.yaml ───────────────→ spec-drive: version config
tasks/{platform}.md ───────→ spec-drive: dep graph + wave planning
                           → spec-next:  task location + status R/W

features/F{nn}.yaml ───────→ Worker Step 4: context collection
                           → Worker Step 6: design input
                           → Worker Step 7: API Verify baseline

figma-index.md ────────────→ Worker Step 7: Figma screenshot download
i18n/strings.md ───────────→ Worker Step 7: i18n file writing
tasks/backend.md ──────────→ Worker Step 7: API Contract Verify

implementation/*.md ───────→ Worker Step 6: read/generate design docs
                           → Worker Step 7: implement per design
```

### 4.3 Change-Time Data Flow (spec-drive change + propagate)

```
Change occurs
  │
  ▼
/spec-drive change api /path "desc"
  │
  ├── config.yaml dependency_index ──→ Impact scope (Features → Tasks)
  ├── CHANGELOG.md ──→ New CR-{nnn} + checklist
  └── features/F{nn}.yaml ──→ revisions[] record
  │
  ▼
Manual spec file updates (YAML + Task)
  │
  ▼
/spec-drive propagate CR-{nnn}
  │
  ├── Create worktree (CR{nnn}-T{nn}-xxx)
  ├── Worker: apply CR changes only → build → review
  ├── merge → feat/v{version}
  └── CHANGELOG checklist [x] → all done → ✅
```

---

## 5. Feature YAML vs implementation/ Separation of Concerns

```
Feature YAML = What + Constraint         implementation/ = How + Why
(what to build, UI contract, data        (how to build, rationale,
 contract, state matrix)                  module interactions)

┌─────────────────────────┐              ┌──────────────────────────┐
│ F06-self-settings.yaml  │              │ F06-self-settings/       │
│                         │              │                          │
│ description: Self...    │  ──generate→ │ design.md                │
│ requirements: R01-R04   │              │   Impact analysis, data  │
│ acceptance_criteria     │              │   flow design, API call  │
│ ui_contract             │              │   strategy, key decisions│
│ delivery_contract       │  ──refine──→ │                          │
│ state_matrix            │              │ ios.md                   │
│ api[]                   │              │   Existing code analysis │
│ i18n_keys[]             │              │   File change manifest   │
│ analytics[]             │              │   Platform tech choices  │
└─────────────────────────┘              │                          │
                                         │ android.md               │
 Generated by spec-init                  │   (same, Android perspective) │
 + manual supplements                    └──────────────────────────┘
                                          Generated by Worker Step 6
```

**Generation Timing**:

| Document | When Generated | Generated By |
|----------|---------------|--------------|
| Feature YAML | `/spec-init` | spec-init + manual supplements |
| overview.md | First version execution | First Worker |
| {platform}/tech-plan.md | First version execution | First Worker |
| F{nn}/design.md | First task of a feature | Worker (shared cross-platform) |
| F{nn}/{platform}.md | Each Worker | Worker (platform-specific) |

---

## 6. Status Lifecycle

```
🔴 Not Started
    │
    │  Worker Step 5: Lock
    ▼
🟡 In Progress
    │
    ├── build + review passed ──→ 🟢 Completed
    │                              │
    │                              └── CR change → 🔵 Rework Needed
    │                                                │
    │                                                │ propagate
    │                                                ▼
    │                                              🟡 → 🟢
    │
    └── Failed/Blocked
         │
         └── 🟡 Blocked (worktree preserved)
              │
              └── /spec-drive reset → 🔴 → Re-execute
```

| Symbol | Meaning | Location |
|--------|---------|----------|
| 🔴 | Not Started | tasks/{platform}.md |
| 🟡 | In Progress | tasks/{platform}.md (after Lock) |
| 🔵 | Rework Needed | tasks/{platform}.md (after CR change) |
| 🟢 | Completed | tasks/{platform}.md (after verification) |
| ⚫ | Not Applicable | DASHBOARD.md (no backend dependency) |

**Single Source of Truth**: `tasks/{platform}.md` — read/written by Workers, DASHBOARD is aggregated by status command.

---

## 7. Branch and Worktree Strategy

```
master (or main)
  │
  └── feat/v1.3  ← Version integration branch (merge target for all tasks)
       │
       ├── feat/pixel_muse_ios/0306/T06-self-settings      ← Task branch
       ├── feat/pixel_muse_ios/0306/T07-character-settings
       ├── feat/pixel_muse_android/0306/T06-self-settings
       └── feat/pixel_muse_android/0306/T07-character-settings
```

**Worktree Lifecycle**:

```
Create → wt.sh new T06-xxx feat/v1.3
      → wt/{project}/{MMDD}/T06-xxx/ + tmux window + symlinks

Use    → Worker develops in worktree (Step 6-8)

Merge  → git merge --no-ff → feat/v{version}

Cleanup → wt.sh -f rm T06-xxx → delete worktree + branch + tmux window
```

---

## 8. Smart Analysis — Execution Waves

Build a dependency graph from the dependency column in tasks/{platform}.md to plan parallel execution batches:

```
Example (v1.2):

T01 ─┬→ T02 ──→ (waiting for B01)
     ├→ T03 ──→ (waiting for B02)
     ├→ T04 ──→ (waiting for B03)
     └→ T05

T06 (independent) ──→ (waiting for B04)
T07 (independent) ──→ (waiting for B05)

T08 → T09 ──→ (waiting for B06)
       └→ T10 ──→ (waiting for B07)

T11 (independent)
T12 (independent)

Wave 1: T01, T06, T07, T08, T11, T12    ← No dependencies, parallelizable
Wave 2: T05, T09                          ← Depends on Wave 1
Wave 3: T10                               ← Depends on T09
Blocked: T02, T03, T04                    ← Waiting for backend B01-B03
```

---

## 9. Change Management

```
CHANGELOG.md              dependency_index            Feature YAML
(change records)          (impact analysis)            (change tracking)
     │                        │                           │
     │  /spec-drive change    │                           │
     │  ────────────────→     │                           │
     │  Auto-generate CR-{nnn}│ api_to_features          │ revisions[]
     │  + checklist           │ figma_to_features        │ [CR-{nnn}] annotation
     │                        │ feature_to_backend       │
     ▼                        ▼                           ▼
  CR-003                   F06 → T06 iOS               F06.yaml
  🔴 Pending propagation   F06 → T06 Android            + [CR-003] line
  checklist: 6 items       F06 → B04                   + revisions record
     │
     │  /spec-drive propagate CR-003
     │  ────────────────────────→
     │
     ▼
  Worker: worktree → apply changes only → build → review → merge
  CHANGELOG: [ ] → [x]
  All [x] → CR-003 ✅
```

---

## 10. Authoritative File Index

| File | Role | Written By | Read By |
|------|------|------------|---------|
| `.claude/commands/spec-init.md` | Generation protocol | - | spec-init |
| `.claude/commands/spec-drive.md` | Orchestration protocol | - | spec-drive |
| `{platform}/.claude/commands/spec-next.md` | Execution protocol | - | Worker |
| `moox/{version}/config.yaml` | Version configuration | spec-init | All |
| `moox/{version}/features/*.yaml` | Requirements spec | spec-init + manual | Worker |
| `moox/{version}/tasks/{platform}.md` | **Single source of truth** | Worker + spec-drive | All |
| `moox/{version}/tasks/backend.md` | Backend API | spec-init + manual | Worker |
| `moox/{version}/implementation/*.md` | Implementation design | Worker | Worker |
| `moox/{version}/CHANGELOG.md` | Change tracking | spec-drive change | propagate |
| `moox/{version}/DASHBOARD.md` | Progress dashboard | spec-drive status | Manual review |
| `moox/{version}/figma-index.md` | Figma index | spec-init | Worker |
| `moox/{version}/i18n/strings.md` | Internationalization | spec-init | Worker |
| `_scripts/SPEC-DRIVE-GUIDE.md` | Operations guide | - | Manual reference |
| `_scripts/SPEC-ARCHITECTURE.md` | Architecture doc | - | Manual reference |
| `_templates/*.yaml|md` | File templates | - | spec-init |

---

## 11. Typical Workflows

### Full Version Development

```bash
# 1. Prepare materials
#    Place PRD in moox/1.3/prd/

# 2. Generate spec
/spec-init 1.3                    # PRD + Figma + API → complete spec

# 3. Fill in manual fields (optional, non-blocking)
#    ui_contract, delivery_contract, state_matrix.figma_node

# 4. Initialize
/spec-drive setup                 # Check spec completeness → create version branch

# 5. Execute
/spec-drive next                  # Auto-analyze → launch both platforms in parallel
#    iOS:     T01 → T05 → T06 → T07 → ... → ⏸ (waiting for backend)
#    Android: T01 → T05 → T06 → T07 → ... → ⏸ (waiting for backend)

# 6. Monitor
/spec-drive status                # Real-time cross-platform progress

# 7. Handle changes
/spec-drive change api /path "new field added"
/spec-drive propagate CR-001      # Automated rework

# 8. Finalize
/spec-drive verify                # Build verification
/spec-drive done                  # Version summary
```

### Incremental Update After PRD Changes

```bash
/spec-init 1.3 refresh            # Add new features without overwriting existing ones
/spec-drive next                  # Auto-detect new tasks
```

### Validation Only

```bash
/spec-init 1.3 validate           # Output pass/fail/warning report
```
