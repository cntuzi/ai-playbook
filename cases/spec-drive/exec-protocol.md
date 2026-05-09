[English](./exec-protocol.md) | [中文](./exec-protocol.zh-CN.md)

# Task Execution Protocol

> Standard workflow for AI Agent task execution.
> Updated based on v1.2 practical experience, including Lock step and API Contract Verify.

---

## Trigger Methods

```
User: execute F01
User: execute T01
User: execute ios/T01
User: execute D1
```

---

## Execution Flow — 7 Steps

### Step 1: Parse — Identify Target

```yaml
steps:
  parse_input:
    - F{nn} → read {version}/features/F{nn}-*.yaml → get platform task ID
    - T{nn} → read {version}/tasks/{platform}.md#T{nn}
    - ios/T{nn} → read {version}/tasks/ios.md#T{nn}
    - D{n} → find all tasks with day=D{n}, sort by dependency order

  pre_check:
    - status 🟢 → prompt "T{nn} already completed, re-execute?"
    - status 🟡 → prompt "T{nn} in progress, continue?" → search for existing code context

output:
  - target task ID and details
  - associated Feature YAML path
```

### Step 2: Check — Verify Dependencies

```yaml
steps:
  1. shared_dependencies:
     - read {version}/tasks/shared.md to check S1-S3 status
     - any 🔴 → report blocking reason

  2. backend_dependencies:
     - read {version}/tasks/backend.md to check corresponding B{nn} status
     - status 🔴 → report blocking reason

  3. feature_dependencies:
     - check dependencies field in Feature YAML
     - check dependency list in task details
     - dependent task incomplete → report blocking reason

  4. API Contract Verify (mandatory when backend dependencies exist):
     a. get endpoint list from task details API table
     b. distinguish API sources:
        - Swagger endpoints (/chatbot/*, /post/*)
          → extract schema from api-doc/{service}_swagger.json
        - messaging middleware endpoints (/chat/*)
          → get parameter tables and signaling definitions from {version}/tasks/backend.md
     c. availability check:
        - ❌ Swagger file missing → prompt "backend may not have provided API documentation yet"
        - ❌ endpoint undefined → prompt "{endpoint} not defined in Swagger"
        - does not block execution, but writes missing info to task technical notes (❌ marker)
     d. field-by-field validation:
        - request params: do field names in tasks/*.md match Swagger/backend.md?
        - response fields: do fields the task logic depends on exist?
        - enum values: are referenced status enums defined?
     e. discrepancy handling:
        - inconsistency found → output discrepancy report (⚠️ marker)
        - write discrepancies to corresponding task technical notes in tasks/*.md
        - during development, Swagger/backend.md is authoritative, not spec assumptions

output:
  - executable / blocked (with reason)
  - API validation report (if discrepancies exist)
```

### Step 3: Lock — Lock the Task

```yaml
steps:
  1. update {version}/tasks/{platform}.md:
     - task overview table: status column 🔴→🟡
     - stats row: update counts
     - task details: status line 🔴→🟡
  2. git commit: "chore: mark T{nn} as in-progress"
  3. this step must complete before Collect/Execute

purpose:
  - prevent other sessions from claiming the same task
  - leave a clear start timestamp in git history
```

### Step 4: Collect — Gather Context

```yaml
steps:
  a. PRD details:
     - read corresponding feature section from {version}/prd/README.md
     - if original PRD needed, read PDF under {version}/prd/

  b. Figma designs:
     - get node_id list from Feature YAML figma.pages (primary source)
     - cross-check corresponding section in {version}/figma-index.md (supplementary source):
       - present in figma-index but not referenced in YAML → identify as missing page
       - auto-append to Feature YAML, annotate source: figma-index
       - output supplement log: "+ F02: added 119:797 free_chat_rewriting"
     - get figma.file_key from {version}/config.yaml
     - call Figma MCP to download screenshots to .claude/cache/{version}/figma/

  c. API endpoints:
     - get endpoints from Feature YAML api field
     - distinguish sources:
       - Swagger endpoints → extract full definitions from api-doc/{service}_swagger.json
       - messaging middleware endpoints → get parameter tables, signaling, error codes from {version}/tasks/backend.md
       - reference screenshots: related files under {version}/tasks/refs/

  d. i18n strings:
     - get corresponding feature strings from {version}/i18n/strings.md
     - note platform format differences (%s → iOS %@)

  e. analytics:
     - get analytics event definitions from Feature YAML analytics field

  f. existing code:
     - search project code to find related module implementations
     - identify reusable components/patterns
     - determine files that need modification

output:
  - Figma screenshot paths
  - API definitions (distinguishing Swagger source vs messaging middleware source)
  - i18n string list
  - related code file list
```

### Step 5: Execute — Implement

```yaml
steps:
  1. create/modify source files to implement the feature
  2. add i18n strings to platform localization files in parallel
  3. add analytics tracking code in parallel
  4. follow platform coding conventions (ai/{platform}.md)
  5. API parameters follow Swagger/backend.md as authoritative, not Feature YAML assumptions
```

### Step 6: Verify — Build Verification

```yaml
steps:
  iOS:    ./scripts/build.sh → expect BUILD SUCCEEDED
  Android: ./scripts/build.sh → expect BUILD SUCCESSFUL

  build failure handling:
    1. analyze error logs, locate problematic source files
    2. fix build errors (prioritize issues introduced by current changes)
    3. re-build to verify
    4. 3 consecutive failures → pause, prompt user to intervene
```

### Step 7: Update — Update Status

```yaml
build passed:
  1. update {version}/tasks/{platform}.md status 🟡→🟢
     - task overview table + stats row + task details status line
  2. update {version}/DASHBOARD.md feature progress
  3. git commit: "feat: complete T{nn} - {task_name}"

build failed/interrupted:
  1. status remains 🟡 (in progress)
  2. append blocking reason to task details
  3. do not update DASHBOARD.md (only update on successful build)
```

---

## State Machine

```
                    dependencies ready + Check passed
┌──────────┐ ─────────────────────────────▶ ┌──────────────┐
│ 🔴 pending │                                │ 🟡 in_progress │
│          │                                │              │
└──────────┘                                └──────┬───────┘
     ▲                                             │
     │                                    ┌────────┴────────┐
     │                                    │                 │
     │ dependencies incomplete      verify passed      verify failed/interrupted
     │                                    │                 │
     │                                    ▼                 ▼
┌──────────┐                        ┌───────────┐   ┌───────────┐
│ blocked  │◀───────────────────────│ 🟢 completed│   │ 🟡 blocked  │
└──────────┘  external dep changed  │           │   │ (with reason)│
                                    └───────────┘   └───────────┘

Lock:   🔴→🟡 + git commit
Update: 🟡→🟢 + git commit (success) or 🟡 remains (failure)
```

---

## Quick Commands

| Command | Description |
|---------|-------------|
| `execute F01` | Execute a feature (auto-selects current platform) |
| `execute T01` | Execute a task on the current platform |
| `execute ios/T01` | Execute a task on a specific platform |
| `execute D1` | Execute all tasks for a given day |
| `status` | Show current version progress |
| `blocked` | Show all blocked items |
| `next` | Execute the next available task |

---

## Example Execution

```
User: execute F02

Claude Code:
┌─────────────────────────────────────────────────────────────────────┐
│ Step 1: Parse — Identify Target                                     │
│    F02 → AI Reply Rewrite → iOS task T02                            │
│    Status: 🔴 pending                                               │
├─────────────────────────────────────────────────────────────────────┤
│ Step 2: Check — Verify Dependencies                                 │
│    • S1 PRD confirmed: ✅                                           │
│    • S2 Design review: ✅                                           │
│    • S3 API definition: ✅                                          │
│    • T01 Long-press menu: ✅ completed                              │
│    • B01 Backend API: 🟡 in progress                                │
│                                                                     │
│    API Contract Verify:                                             │
│    • POST /chat/rewrite_message                                     │
│      Source: messaging middleware (backend.md#B01)                   │
│      Params: ✅ session_id, session_type, msgid, content, mid       │
│      Signal: ✅ MESSAGE_TYPE_CMD_MESSAGE_RECALL defined             │
│    • stream_chat (SSE)                                              │
│      Source: messaging middleware                                    │
│      ✅ Reuse existing SSE streaming logic                          │
├─────────────────────────────────────────────────────────────────────┤
│ Step 3: Lock — Lock the Task                                        │
│    • tasks/ios.md T02: 🔴→🟡                                        │
│    • git commit: "chore: mark T02 as in-progress"                   │
├─────────────────────────────────────────────────────────────────────┤
│ Step 4: Collect — Gather Context                                    │
│    • Figma: downloaded 4 page screenshots (119:370, 119:462,        │
│      119:555, 119:649)                                              │
│    • API: extracted messaging middleware definitions from            │
│      backend.md#B01                                                 │
│    • i18n: extracted 5 strings from strings.md                      │
│    • Code: searched RewriteModal, MessageStream related files       │
├─────────────────────────────────────────────────────────────────────┤
│ Step 5: Execute — Implement                                         │
│    [implementing code...]                                           │
├─────────────────────────────────────────────────────────────────────┤
│ Step 6: Verify — Build Verification                                 │
│    • ./scripts/build.sh → BUILD SUCCEEDED                           │
├─────────────────────────────────────────────────────────────────────┤
│ Step 7: Update — Update Status                                      │
│    • tasks/ios.md T02: 🟡→🟢                                        │
│    • DASHBOARD.md: F02 iOS completed                                │
│    • git commit: "feat: complete T02 - AI Reply Rewrite"            │
└─────────────────────────────────────────────────────────────────────┘
```
