[English](./glossary.md) | [中文](./glossary.zh-CN.md)

# Spec System Glossary

> Definitions and relationships of all core terms. New members can understand the entire spec system by reading this document.

---

## Spec Layer — What + Constraint (defines what to do and how to constrain it)

### Feature YAML

Feature specification file, located at `moox/{version}/features/F{nn}-{name}.yaml`. The **single source of truth** for a feature, containing two categories of fields: What (what to do) and Constraint (how to constrain it).

**What fields** (can be auto-generated):

| Field | Meaning |
|-------|---------|
| `id` / `name` / `module` / `epic` | Feature identifier and ownership |
| `description` | Feature description (sourced from PRD) |
| `requirements` | R01-Rnn requirement items |
| `acceptance_criteria` | AC01-ACnn acceptance criteria, categorized as ui / interaction / data |
| `figma.pages[]` | Associated Figma design pages and node_id |
| `api[]` | Associated backend API definitions |
| `analytics[]` | Tracking events (type / stype / frominfo / trigger) |
| `i18n_ref` | Internationalization string reference (points to strings.md) |
| `platform_tasks` | Platform task mapping (ios: T{nn}, android: T{nn}, backend: B{nn}) |
| `dependencies` | Inter-feature dependencies |

**Constraint fields** (require manual or semi-automated completion):

| Field | Meaning |
|-------|---------|
| `ui_contract` | UI contract |
| `delivery_contract` | Delivery contract |
| `state_matrix` | State matrix |
| `pixel_baseline` | Pixel baseline |
| `conflict_resolution` | Conflict resolution |
| `verification_evidence` | Verification evidence |

**Division of labor**: `/spec-init` auto-generates What fields + Constraint skeleton (marked TODO); humans fill in Constraints by priority.

---

### UI Contract (ui_contract)

Defines the **visual constraint contract** for a feature, written in the Feature YAML.

| Subfield | Meaning | Example |
|----------|---------|---------|
| `source_nodes` | Figma design node IDs, named by state/scenario | `empty_state: "119:370"` |
| `required` | Structures/components/interactions that must be implemented | `Custom centered Modal` |
| `forbidden` | Prohibited implementation approaches | `UIAlertController` |
| `key_tokens` | Key visual parameters (dimensions/colors/corner radius) | `modal_corner_radius: 20` |
| `visual_blockers` | Visual issues that will block acceptance | `Modal must be centered, no offset` |

**Core principle**: Visual compliance is a blocker — if the visual gate check fails, the task status must not be marked as completed.

---

### Delivery Contract (delivery_contract)

Defines the **tech stack constraints** for a feature, written in the Feature YAML.

| Subfield | Meaning |
|----------|---------|
| `stack_baseline` | Required tech stack per platform (e.g., iOS: IGListKit + CollectionView) |
| `ui_split` | UI implementation layer breakdown: L1-Structure → L2-Visual → L3-Interaction State → L4-Verification Evidence |
| `data_contract` | Field source priority (e.g., `source_priority: [server, local_cache]`) |

---

### State Matrix (state_matrix)

Exhaustively enumerates **all key state scenarios** for a feature to prevent developers from missing edge cases. Written in the Feature YAML.

Each entry contains:

| Field | Meaning |
|-------|---------|
| `id` | Identifier (S01, S02...) |
| `name` | State name |
| `figma_node` | Corresponding Figma design node ID |
| `trigger` | What action/condition triggers this state |
| `expected` | Expected behavior upon entering this state |

**Value**: Each state is bound to a Figma node → developers locate the design during implementation → acceptance becomes a per-item checklist.

---

### Pixel Baseline (pixel_baseline)

**Quantified dimensions/spacing/tap areas** for key controls — no more "looks close enough by eye." Written in the Feature YAML.

```yaml
pixel_baseline:
  nav:
    bar_height: 44
    back_tap_area: "44x44"
  form:
    horizontal_inset: 16
    section_spacing: 8
```

---

### Conflict Resolution (conflict_resolution)

**Decision records** for when PRD vs Figma vs API contradict each other. Written in the Feature YAML.

```yaml
conflict_resolution:
  - key: "button_height"
    figma: "48pt"
    prd: "44pt"
    decided_source: figma
    owner: design
    decision_date: "2026-03-20"
```

---

### Acceptance Criteria (acceptance_criteria)

AC01-ACnn acceptance items, categorized into three types:

| Type | Meaning |
|------|---------|
| `ui` | Visual acceptance (compared against Figma) |
| `interaction` | Interaction acceptance (operation flows) |
| `data` | Data acceptance (APIs/storage) |

---

### config.yaml

Version configuration hub, located at `moox/{version}/config.yaml`.

Core sections:

| Section | Meaning |
|---------|---------|
| `version` / `codename` | Version identifier |
| `figma.file_key` | Figma design file key |
| `paths` | Path mappings for all version resources |
| `api.swagger_files` | Backend Swagger file list |
| `features[]` | Feature quick index (id / name / module / priority) |
| `dependency_index` | Reverse index (see below) |

---

### Dependency Index (dependency_index)

A **reverse lookup table** in config.yaml, used for change impact analysis.

| Sub-index | Direction | Purpose |
|-----------|-----------|---------|
| `api_to_features` | API endpoint → Feature list | Locate affected features when an API changes |
| `figma_to_features` | Figma node → Feature list | Locate affected features when a design changes |
| `feature_to_backend` | Feature → Backend task list | Locate backend dependencies when a feature changes |

---

## Task Layer — Who + Sequence (defines who does it and in what order)

### Task (T{nn})

Platform-side development task, written in `tasks/ios.md` or `tasks/android.md`. **Single source of truth for status** — the current task status is only read from and written to here.

Relationship to Feature: F{nn} and T{nn} share the same numbering (one-to-one); each Feature has one Task per platform.

### Backend (B{nn})

Backend API task, written in `tasks/backend.md`. Numbered on demand (not bound to F/T numbering) and serves as a prerequisite dependency for frontend tasks.

### Shared (S1-S3)

Cross-platform prerequisite dependencies, written in `tasks/shared.md`:

| ID | Item |
|----|------|
| S1 | PRD confirmation |
| S2 | Design review |
| S3 | API definition |

### Status Lifecycle

```
🔴 Not Started ──Lock──→ 🟡 In Progress ──Pass──→ 🟢 Completed
                              │                       │
                              │ Fail                   │ CR Change
                              ↓                        ↓
                         🟡 Blocked              🔵 Rework Needed ──Propagate──→ 🟡 → 🟢
```

| Symbol | Meaning |
|--------|---------|
| 🔴 | Not Started |
| 🟡 | In Progress / Blocked |
| 🟢 | Completed |
| 🔵 | Rework Needed (after CR change) |
| ⚫ | Not Applicable |

### Wave

Builds a DAG from task dependency columns to plan **parallel execution batches**:

- Wave 1: Tasks with no dependencies, can run in parallel
- Wave 2: Tasks that depend on Wave 1
- Blocked: Tasks waiting on backend APIs

### DASHBOARD

Progress dashboard, located at `moox/{version}/DASHBOARD.md`. **Aggregated** from `tasks/*.md` — Workers do not modify it directly.

---

## Orchestration Layer — Pipeline (defines the pipeline)

### spec-init

Generation-layer command. **One-shot generates a complete spec skeleton** from PRD + Figma + Swagger.

Three modes:

| Mode | Command | Purpose |
|------|---------|---------|
| generate | `/spec-init 1.3` | Full generation |
| refresh | `/spec-init 1.3 refresh` | Incremental update |
| validate | `/spec-init 1.3 validate` | Validation only |

### spec-drive

Orchestration-layer command. Task analysis + dependency graph + worktree creation + Worker dispatch + status monitoring.

| Subcommand | Purpose |
|------------|---------|
| `setup` | Check spec completeness → create version branch |
| `next` | Smart analysis → worktree → Worker dispatch |
| `status` | Aggregate cross-platform progress → update DASHBOARD |
| `change` | Record CR + impact analysis |
| `propagate` | CR code rework |
| `reset` | Reset stuck tasks |
| `verify` | Version branch build verification |
| `done` | Version completion summary |

### spec-next

Execution-layer command (Worker perspective). View all platform task statuses and locate the next available task.

### Worker

An AI agent that **develops autonomously** in a worktree, following an 11-step loop:

```
Config → Status → Resolve → Context → Lock → Analyze → Execute → Review → Merge → Update → Loop
```

Exit conditions: all completed / all blocked / 2 consecutive failures.

### Worktree

Isolated development environment via git worktree. One worktree per task, cleaned up after merge.

Branch naming: `feat/{project}/{MMDD}/T{nn}-{name}`

---

## Change Management — Change (defines how to change)

### CR (Change Record)

Change record, numbered CR-001, CR-002..., logged in `CHANGELOG.md`.

Each CR contains: change source, impact scope, and propagation checklist.

### propagate

CR propagation flow:

```
CR Record → Create worktree → Apply changes only → build → review → merge → All checklist items [x] → CR done
```

---

## Execution Observability — Observability (defines how to record)

### Work Types

| Type | Definition |
|------|------------|
| **task** | Feature development (T{nn}) |
| **sync** | External document sync (PRD/API/Figma) |
| **change** | Requirement change record (CR-{nnn}) |
| **review** | Walkthrough/fix |
| **visual-qa** | Screenshot-driven UI convergence |
| **fix** | Single-point defect fix |
| **retro** | Workflow retrospective |

### Execution Logs (_logs/)

Path: `moox/{version}/_logs/{date}-{type}-{scope}.md`. Must be written after every AI work session.

### Chain

A **linking mechanism** for multi-round iterations within the same module.

| Field | Meaning |
|-------|---------|
| `chain_id` | Format `{feature}-{scope}`, e.g., `f05-home-ui` |
| `iteration` | Current round (starting from 1) |
| `prev` | Previous round's log filename |

Purpose: Measure "how many rounds this module needs to converge."

### Gate Check

Gate check status record, mandatory for UI-related work:

- Feature YAML: pass/fail
- ui_contract: pass/warning/fail/N/A
- pixel_baseline: pass/fail/N/A
- data_contract: pass/fail/N/A
- Figma baseline image: pass/fail

### Outcome

Log closure. Mandatory at the end of every log:

- User acceptance: pass/fail/pending
- Next chain: next round filename / closed
- Convergence rounds: filled only when closed

---

## Implementation Layer — How + Why (defines how to implement)

### implementation/

Path: `moox/{version}/implementation/`. Feature YAML defines What; implementation defines **How**.

| File | Meaning | Generated by |
|------|---------|--------------|
| `overview.md` | Version-level design overview | First Worker |
| `{platform}/tech-plan.md` | Platform-level comprehensive technical plan | First Worker |
| `F{nn}-{name}/design.md` | Shared design (cross-platform) | Worker Step 6 |
| `F{nn}-{name}/{platform}.md` | Platform-specific refinement | Worker Step 6 |

---

## External Resources

### figma-index.md

A **page index** for the Figma design files. Grouped by Section, each Page records its node_id and purpose.

Path: `moox/{version}/figma-index.md`, auto-generated by `/spec-init` via Figma MCP.

### i18n/strings.md

The **single source of truth** for internationalization strings. Grouped by Feature, one key per line with zh/ja/en translations.

Feature YAML and Tasks only reference this file — keys are never inlined.

### prd/README.md

A **structured index** for the PRD. Contains the feature list + tracking requirements + key dependencies.

PRD source text is preferably read from the moox-prd git repository as Markdown, with PDF as fallback.
