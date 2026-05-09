[English](./overview.md) | [中文](./overview.zh-CN.md)

# Specs Automation Toolchain

> Automation support for spec-driven development

---

## Tool Overview

| Command | Function | Status |
|-----|------|------|
| `specs-cli parse-prd` | PRD → Feature Definitions | 🔴 Planned |
| `specs-cli gen-tasks` | Feature Definitions → Platform Tasks | 🔴 Planned |
| `specs-cli status` | Update Global Dashboard | 🔴 Planned |
| `specs-cli exec` | Execute Task (Context Assembly) | 🔴 Planned |
| `specs-cli new-version` | Create New Version | 🔴 Planned |
| `specs-cli verify-api` | API Contract Verify | 🔴 Planned |

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  Phase 0: Input Materials                                           │
│  PRD (PDF/Docs) + Figma + Swagger + Backend Docs                   │
│       │                                                             │
│       ▼ Phase 2: specs-cli parse-prd                                │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  {version}/features/F01-xxx.yaml                            │   │
│  │  • Feature description + requirements + acceptance criteria │   │
│  │  • UI contract + state matrix (ui_contract/state_matrix)    │   │
│  │  • Figma pages (source: figma-index)                        │   │
│  │  • API endpoints (source: swagger/backend.md, verified: bool)│  │
│  │  • i18n + analytics                                         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│       │                                                             │
│       ▼ Phase 3: API Alignment (Verification Gate) ★★★              │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Feature YAML × Swagger × backend.md three-way validation   │   │
│  │  • Endpoint paths match                                     │   │
│  │  • Request parameter field names match                      │   │
│  │  • Response fields satisfy requirements                     │   │
│  │  • Pass → verified: true | Fail → ⚠️/❌ flagged             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│       │                                                             │
│       ▼ Phase 5: specs-cli gen-tasks                                │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  {version}/tasks/ios.md                                     │   │
│  │  {version}/tasks/android.md                                 │   │
│  │  {version}/tasks/backend.md                                 │   │
│  └─────────────────────────────────────────────────────────────┘   │
│       │                                                             │
│       ▼ specs-cli exec T01 --platform ios                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  7-step execution flow (see EXEC-PROTOCOL.md):              │   │
│  │  1. Parse   — Resolve target                                │   │
│  │  2. Check   — Verify dependencies + API Contract Verify     │   │
│  │  3. Lock    — Lock task 🔴→🟡 + git commit                  │   │
│  │  4. Collect — Gather context (Figma cross-check + API       │   │
│  │               source differentiation)                       │   │
│  │  5. Execute — Perform development                           │   │
│  │  6. Verify  — Build verification                            │   │
│  │  7. Update  — Update status 🟡→🟢 + git commit              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│       │                                                             │
│       ▼ specs-cli status                                            │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  {version}/DASHBOARD.md                                     │   │
│  │  • Overall progress                                         │   │
│  │  • Blockers                                                 │   │
│  │  • Dependencies                                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

> Phase 3 API Alignment was the biggest pain point in v1.2 and must be completed before generating tasks.
> Visual alignment is equally high-risk; the execution phase must follow the blocking rules in `specs/workflows/ui-contract.md`.
> For the full generation workflow, see [SPEC-GENERATION.md](./SPEC-GENERATION.md).

---

## Implementation Approach

### Current Phase: AI-Driven

The toolchain is interpreted and executed by an AI Agent (Claude Code/Codex):

```
User: Execute F01

Claude Code:
1. Parse   — Read {version}/features/F01-*.yaml
2. Check   — Verify dependencies + API Contract Verify
3. Lock    — Mark 🔴→🟡 + git commit
4. Collect — Download Figma + extract API (Swagger vs backend.md)
5. Execute — Implement code
6. Verify  — Build verification
7. Update  — Mark 🟡→🟢 + git commit
```

### Future Phase: Script Automation

```bash
# Python/Node.js implementation
specs-cli exec F01 --platform ios
```

---

## Feature Definition Format (YAML)

```yaml
id: F01
name: Feature Name
module: Module
priority: P0/P1/P2

description: |
  Feature description

requirements:
  - id: R01
    desc: Requirement description

acceptance_criteria:
  - id: AC01
    type: ui/api/interaction/deeplink
    desc: Acceptance description
    check: screenshot_diff/api_test/manual

ui_contract:
  required:
    - Custom modal
  forbidden:
    - UIAlertController(.alert/.actionSheet)
  key_tokens:
    modal_size: "267x334"

state_matrix:
  - id: S01
    figma_node: "119:370#119:448"
    trigger: Long press then tap rewrite
    expected: Center modal appears

figma:
  file_key: xxx
  pages:
    - name: Page Name
      node_id: "123:456"
      source: figma-index  # Source: figma-index / manually added

api:
  - endpoint: /chat/rewrite_message
    method: POST
    source: backend.md#B01  # Source: swagger / backend.md / unconfirmed
    verified: true           # Whether verified against the actual API
    params:
      - name: session_id
        type: uint64
        required: true
      - name: content
        type: string
        required: false
    response_fields:
      - name: ret
        type: int
      - name: data
        type: object

i18n:
  keys:
    - key: chat.rewrite.modal.title
      default: Rewrite Plot
  source: strings.md  # Or "pending translation"

analytics:
  events:
    - action: click
      scene: story
      object: rewrite

platform_tasks:
  ios: T01
  android: T01
  web: null
  backend: B01

dependencies:
  - F00  # Dependent feature ID

status: pending/in_progress/completed
```

> `source` and `verified` are critical fields: they enforce explicit attribution for every piece of data rather than relying on memory.
> `params` and `response_fields` are used for automated API Contract Verify checks.

---

## Task Execution Protocol

See [EXEC-PROTOCOL.md](./EXEC-PROTOCOL.md) for details.

### Execution Command Format

```
Execute <FeatureID|TaskID> [--platform <ios|android|web|backend>]
```

### Execution Flow (7 Steps)

1. **Parse** — Resolve target (F{nn} / T{nn} / D{n})
2. **Check** — Verify dependencies + API Contract Verify (Swagger vs backend.md)
3. **Lock** — Lock task 🔴→🟡 + git commit
4. **Collect** — Gather context (Figma cross-check + API source differentiation)
5. **Execute** — Perform development
6. **Verify** — Build verification
7. **Update** — Update status 🟡→🟢 + git commit

---

## Status Synchronization Rules

| Scenario | Trigger | Action |
|-----|------|------|
| Task locked | Step 3 Lock | Update tasks/{platform}.md 🔴→🟡 + git commit |
| Task completed | Step 7 Update | Update tasks/{platform}.md 🟡→🟢 + git commit |
| All platform tasks completed | Auto-detected | Feature marked as completed |
| Dependent feature completed | Auto-detected | Unblock downstream features |
| Any status change | Automatic | Refresh DASHBOARD.md |

---

## Directory Structure Convention

Version files are placed directly under `moox/{version}/`, without a `versions/` subdirectory:

```
moox/{version}/
├── config.yaml          # Version config (Figma key, path mappings)
├── summary.md           # Version overview
├── WORKFLOW.md          # Execution workflow
├── DASHBOARD.md         # Progress dashboard
├── prd/                 # PRD documents
├── features/            # Feature YAML
├── figma-index.md       # Figma page index
├── i18n/                # Internationalization copy
└── tasks/               # Task plans
    ├── shared.md
    ├── backend.md       # Includes verification status column
    ├── ios.md
    ├── android.md
    └── refs/            # Reference materials (API doc screenshots, etc.)
```

---

## Documentation Index

| Document | Purpose | Suggested Reading Order |
|------|------|-------------|
| [TUTORIAL.md](./TUTORIAL.md) | **Beginner Tutorial** — Understand the spec system from scratch | 1 (Start here) |
| [GLOSSARY.md](./GLOSSARY.md) | Glossary — Definitions and relationships of all core terms | 2 |
| [SPEC-ARCHITECTURE.md](./SPEC-ARCHITECTURE.md) | Architecture Doc — Three-layer architecture + data flow + branching strategy | 3 |
| [SPEC-GENERATION.md](./SPEC-GENERATION.md) | Generation Workflow — Complete spec generation protocol | As needed |
| [SPEC-DRIVE-GUIDE.md](./SPEC-DRIVE-GUIDE.md) | Orchestration Guide — spec-drive operations manual | As needed |
| [EXEC-PROTOCOL.md](./EXEC-PROTOCOL.md) | Execution Protocol — Worker 7-step loop | As needed |
| [SPEC-INIT.md](./SPEC-INIT.md) | Initialization Guide — spec-init usage instructions | As needed |

## Next Steps

1. [ ] PRD Parsing (AI-assisted, human-confirmed)
2. [ ] API Contract Verify Automation (Feature YAML x Swagger auto-comparison)
3. [ ] Task Generation (auto-generate from feature definitions)
4. [ ] Status Synchronization Scripts
5. [ ] Execution Engine (automatic context assembly)
6. [ ] Acceptance Automation (screenshot comparison, API testing)
