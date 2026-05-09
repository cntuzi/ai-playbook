[English](./spec-init.md) | [中文](./spec-init.zh-CN.md)

# /spec-init — Automated Version Spec Generation

> PRD + Figma + Swagger → complete spec scaffold, one command.

**Protocol file**: `.claude/commands/spec-init.md`
**Related docs**: [SPEC-ARCHITECTURE.md](./SPEC-ARCHITECTURE.md) · [SPEC-DRIVE-GUIDE.md](./SPEC-DRIVE-GUIDE.md)

---

## 1. Purpose

spec-init is the **generation layer** of the spec system, bridging the gap from PRD to spec:

```
PRD + Figma + Swagger         ← provided by user
        │
   /spec-init                 ← generation layer (this command)
        │
   moox/{version}/            ← config + features + tasks + i18n + ...
        │
   /spec-drive setup          ← orchestration layer (takes over execution)
```

**Design principles**:
- **One-shot**: Run generate once per version; use refresh for incremental updates afterward
- **Scaffold-first**: Auto-fill what's possible, mark the rest with `⚠️ TODO` without blocking downstream flows
- **Verifiable**: Built-in 7-item cross-validation ensures artifact completeness

---

## 2. Command Format

```
/spec-init                     # reads config.yaml version.current
/spec-init 1.3                 # specify version, full generation
/spec-init 1.3 refresh         # incremental update (after PRD changes add new features)
/spec-init 1.3 validate        # validation only, no file modifications
```

### Three Modes

| Mode | Precondition | Behavior | Typical Scenario |
|------|-------------|----------|-----------------|
| **generate** | Version directory does not exist | Full creation of 23+ files | New version kickoff |
| **refresh** | Version directory already exists | Fill in gaps, never overwrite existing | PRD adds new features |
| **validate** | Version directory already exists | Run validation only, zero modifications | CI checks / manual review |

---

## 3. Input Materials

| Material | Required | Source | Purpose |
|----------|----------|--------|---------|
| **PRD** | Required | `moox/{version}/prd/README.md` or `.pdf` | Feature extraction, requirements, analytics |
| **Figma** | Recommended | file_key (e.g., `jaVhFJr7WwAQ8QQY97KvvJ`) | Page index, UI mapping |
| **Swagger** | Recommended | `api-doc/*_swagger.json` | API params, responses, endpoints |
| **i18n seed** | Optional | Existing translation files | Copy initialization |

**Missing material handling**: Abort if PRD is missing; mark others as `⚠️ TBD` and continue generation.

---

## 4. Execution Flow

### Overview

```
Step 1 ─── Parse arguments       → version, mode
Step 2 ─── Environment setup     → create directories, collect material paths
Step 3 ─── PRD parsing           → feature mapping table (F01-F{N})
Step 4 ─── Figma indexing        → figma-index.md + Page→Feature mapping
Step 5 ─── API parsing           → Feature.api[] + backend.md scaffold
Step 6 ─── Full generation       → 12 file categories produced at once
Step 7 ─── Validation + report   → 7-item cross-validation + generation stats
```

### Step 3: PRD Parsing (Core)

Extracted from PRD:

```
PRD
 ├── Version metadata (version number / codename / cycle / QA date)
 ├── Epic structure
 │    ├── Epic 1: Chat Enhancement
 │    │    ├── F01: Message Long-Press Menu
 │    │    ├── F02: AI Reply Rewrite
 │    │    └── ...
 │    ├── Epic 2: Settings Features
 │    └── ...
 ├── Analytics requirements → analytics[]
 └── Key dependencies → backend B{nn}
```

**Module derivation rules**:

| Epic content keywords | Module |
|----------------------|--------|
| Chat / Message / Conversation | `chat` |
| Settings / Self / Character | `settings` |
| Story / Edit / Review | `story` |
| Analytics / Statistics | `analytics` |
| Interaction / Optimization | `interaction` |

### Step 4: Figma Indexing

```
Figma file_key
    │
    ▼
mcp__figma-developer__get_figma_data(fileKey, depth=2)
    │
    ▼
┌──────────────────────────────────────┐
│  figma-index.md                       │
│                                       │
│  Section 1: Rewrite (119:264)         │
│    Page 1: Story_LongPress  119:265   │
│    Page 2: Story_Rewrite_Empty 119:370│
│    ...                                │
│  Section 2: Backtrack (119:1665)      │
│    ...                                │
└──────────────────────────────────────┘
    │
    ▼
Feature.figma.pages[] ← Page→Feature fuzzy match + PRD link extraction
```

### Step 5: API Parsing

```
Swagger JSON                    PRD Dependency Table
    │                              │
    ├── Extract endpoints          ├── Feature→API mapping
    ├── Extract params/response    │
    └── Match Feature ─────────────┘
                │
                ▼
    Feature.api[] (endpoint, params, verified:false)
    backend.md B{nn} (detailed parameter tables)
```

### Step 6: Full Generation (12 File Categories)

Generated in dependency order:

| # | File | Depends On | Description |
|---|------|-----------|-------------|
| 6.1 | `prd/README.md` | - | Generate index when PRD is from PDF |
| 6.2 | `config.yaml` | Step 3-5 | Version config + dependency_index |
| 6.3 | `features/F{nn}-*.yaml` × N | Step 3-5 | One YAML per feature |
| 6.4 | `tasks/shared.md` | Step 5 | S1-S3 + API patterns |
| 6.5 | `tasks/backend.md` | Step 5 | B{nn} API details |
| 6.6 | `tasks/ios.md` | 6.3 | T{nn} task details (iOS) |
| 6.7 | `tasks/android.md` | 6.6 | Mirror iOS, platform-specific replacements |
| 6.8 | `i18n/strings.md` | 6.3 | key + zh, en/ja pending translation |
| 6.9 | `CHANGELOG.md` | - | Empty template |
| 6.10 | `figma-index.md` | Step 4 | Already generated earlier |
| 6.11 | `implementation/` | - | Directory scaffold (.gitkeep) |
| 6.12 | `.claude/config.yaml` update | - | version.current |

---

## 5. Output Artifacts

Using the `cc-100.0` validation version as an example (12 features, 7 backend APIs):

```
moox/cc-100.0/
├── config.yaml                     ← version config + dependency_index
├── prd/
│   └── README.md                   ← structured PRD index
├── features/
│   ├── F01-message-longpress-menu.yaml
│   ├── F02-ai-rewrite.yaml
│   ├── F03-restart-conversation.yaml
│   ├── F04-message-backtrack.yaml
│   ├── F05-message-copy.yaml
│   ├── F06-self-settings.yaml
│   ├── F07-character-settings.yaml
│   ├── F08-story-edit-entry.yaml
│   ├── F09-story-edit-page.yaml
│   ├── F10-review-state-machine.yaml
│   ├── F11-rating-dialog-analytics.yaml
│   └── F12-create-page-keyboard.yaml
├── tasks/
│   ├── shared.md                   ← S1-S3 + API interaction patterns
│   ├── backend.md                  ← B01-B07 API details
│   ├── ios.md                      ← T01-T12 task details (iOS)
│   └── android.md                  ← T01-T12 task details (Android)
├── i18n/
│   └── strings.md                  ← 46 keys (zh + en)
├── figma-index.md                  ← 43 pages x 8 Sections
├── CHANGELOG.md                    ← empty template
└── implementation/
    ├── ios/.gitkeep
    └── android/.gitkeep
```

**Generation stats**:

| Type | Count |
|------|-------|
| Feature YAML | 12 |
| Platform tasks | iOS 12 + Android 12 |
| Backend APIs | 7 |
| i18n Keys | 46 |
| Figma Pages | 43 |

---

## 6. Feature YAML Full Schema

Each Feature YAML is the **single source of truth** for a feature (What + Constraints).

```yaml
# -- Basic Info --
id: F02
name: AI Reply Rewrite
module: chat                    # module assignment
epic: 1                         # Epic number
priority: P0
prd_ref: "prd/README.md#1.1"   # PRD section reference
day: D1-D2                      # schedule

# -- Requirements --
description: |
  Long-press character message → rewrite modal → 100-char input → streaming output replacement.

requirements:
  - id: R01
    desc: Both long-press menu and bottom menu of latest character message can trigger rewrite

# -- Acceptance Criteria --
acceptance_criteria:
  - id: AC01
    type: ui                    # ui / interaction / api / data
    desc: Rewrite modal style matches Figma

# -- Contracts (⚠️ TODO to be filled manually) --
ui_contract: {}                 # source_nodes / required / forbidden
delivery_contract: {}           # stack_baseline / data_contract

# -- State Matrix --
state_matrix:
  - id: S01
    name: Empty Input
    figma_node: "⚠️ TODO"      # Figma node mapping pending
    trigger: Open rewrite modal
    expected: Empty input field + confirm button clickable

# -- Figma Design Resources --
figma:
  file_key: jaVhFJr7WwAQ8QQY97KvvJ
  pages:
    - name: Story_Rewrite_Empty
      node_id: "119:370"
      usage: Rewrite modal empty state
      source: figma-index

# -- API Endpoints --
api:
  - endpoint: /chat/rewrite_message
    method: POST
    source: "backend.md#B01"
    verified: false              # per-field verification pending
    params:
      - name: session_id
        type: uint64
        required: true

# -- Analytics --
analytics:
  - type: click
    stype: story/chat
    frominfo: rewrite
    trigger: Click rewrite button in message menu

# -- Internationalization --
i18n_keys:
  - key: chat.rewrite.modal.title
    zh: 重写剧情

# -- Platform Mapping --
platform_tasks:
  ios: T02
  android: T02
  backend: B01                  # null = no backend dependency

# -- Dependencies --
dependencies: [F01]

# -- Status --
status: pending
```

---

## 7. ID Naming Convention

### F{nn} → T{nn} → B{nn} Mapping

```
F01 → T01 (iOS + Android)    backend: null       ← no backend dependency
F02 → T02 (iOS + Android)    backend: B01        ← has backend dependency
F03 → T03 (iOS + Android)    backend: B02
F04 → T04 (iOS + Android)    backend: B03
F05 → T05 (iOS + Android)    backend: null
F06 → T06 (iOS + Android)    backend: B04
...
```

**Rules**:
- **F{nn} maps 1:1 to T{nn}**, numbering is consistent
- **B{nn} assigned on demand**, only features with backend dependencies get one
- B{nn} numbering increments independently, not bound to F/T

### File Naming

```
F{nn}-{kebab-name}.yaml

kebab-name derived from feature name:
  Message Long-Press Menu Enhancement  → message-longpress-menu
  AI Reply Rewrite                     → ai-rewrite
  Self Settings Page                   → self-settings
  Review State Machine                 → review-state-machine
```

---

## 8. Auto-Filled vs Manual Fields

| Field | spec-init Auto | Manual | Blocks execution? |
|-------|:-------------:|:------:|:-----------------:|
| id / name / module / epic | ✅ | - | - |
| description / requirements | ✅ from PRD | - | - |
| acceptance_criteria | ✅ inferred | Confirm | No |
| figma.pages[] | ✅ index mapping | Confirm | No |
| api[] | ✅ Swagger | ✅ per-field verification | No |
| analytics[] | ✅ PRD analytics table | - | - |
| i18n_keys[] | ✅ PRD copy | ✅ translation | No |
| **ui_contract** | ⚠️ empty scaffold | **✅ Figma fill** | No* |
| **delivery_contract** | ⚠️ empty scaffold | **✅ tech stack analysis** | No* |
| **state_matrix.figma_node** | ⚠️ TODO | **✅ manual mapping** | No* |
| **pixel_baseline** | ⚠️ TODO | **✅ Figma measurement** | No* |

> *Does not block spec-drive execution, but affects Worker design quality. Recommended to fill before executing the first batch of tasks.

---

## 9. dependency_index (Reverse Index)

The `dependency_index` in config.yaml is the core data structure for change management:

```yaml
dependency_index:
  # API change → which Features are affected?
  api_to_features:
    /chat/rewrite_message: [F02]
    /chatbot/user_self_setting/save: [F06]
    /post/edit_story: [F09, F10]

  # Figma node change → which Features are affected?
  figma_to_features:
    "119:370": [F02]
    "140:330": [F06]
    "152:75": [F08, F10]

  # Feature → which backend APIs does it depend on?
  feature_to_backend:
    F02: [B01]
    F06: [B04]
    F09: [B06]
```

**Usage**:
- `/spec-drive change api /path "desc"` → look up `api_to_features` → locate affected Features → generate CR
- `/spec-drive change figma "nodeId" "desc"` → look up `figma_to_features` → same as above

---

## 10. Cross-Validation (7 Items)

Automatically executed in Step 7:

| # | Check Item | Failure = Blocking? | Description |
|---|-----------|:-------------------:|-------------|
| 1 | Feature ID continuity | Blocking | F01-F{N} with no gaps |
| 2 | Task ID consistency | Blocking | Every F{nn} has T{nn} in both ios.md and android.md |
| 3 | Backend mapping | Blocking | Feature.platform_tasks.backend matches backend.md B{nn} |
| 4 | i18n completeness | Blocking | All Feature.i18n_keys[] appear in strings.md |
| 5 | Figma references | Warning | Feature.figma.pages[].node_id appears in figma-index.md |
| 6 | dependency_index coverage | Blocking | All API/Figma/Backend mappings are complete |
| 7 | No dependency cycles | Blocking | Feature.dependencies forms no circular references |

---

## 11. Refresh Mode

Incremental update for an existing version:

```
/spec-init 1.3 refresh

1. Scan existing files
2. Re-parse PRD
   ├── New features → create YAML + append Tasks
   └── Existing features → skip (no overwrite)
3. Fill in missing files (config / figma-index / tasks / i18n / CHANGELOG)
4. Missing fields in existing YAMLs → fill in (never overwrite filled content)
5. Fully recompute dependency_index
6. Run validation
7. Output diff report:

   | Action | File | Description |
   |--------|------|-------------|
   | Created | features/F13-xxx.yaml | New feature from PRD |
   | Updated | config.yaml | dependency_index rebuilt |
   | Skipped | features/F01-xxx.yaml | Already exists |
```

---

## 12. Integration with spec-drive

```
/spec-init {version}                    ← generate spec scaffold
    │
    ├── (optional) manually fill ⚠️ fields
    │
    ▼
/spec-drive setup                       ← check spec completeness → create version branch
    │
    ▼
/spec-drive next                        ← analyze dependencies → create worktree → dispatch Worker
```

**spec-drive setup completeness check** (Step 0):

```
✅ moox/{version}/ directory exists
✅ moox/{version}/config.yaml exists
✅ moox/{version}/features/ has at least 1 .yaml
✅ moox/{version}/tasks/ios.md exists
✅ moox/{version}/tasks/android.md exists

All pass → proceed with setup
Any fail → ❌ "Please run /spec-init {version} first"
```

---

## 13. Task Detail Projection

Each task in Task files (ios.md / android.md) is projected from the Feature YAML:

```
Feature YAML                          tasks/ios.md T{nn}
────────────                          ────────────────
description         ───→              #### Requirements
figma.pages[]       ───→              #### Figma Table
ui_contract         ───→              #### UI Contract (blocking)
delivery_contract   ───→              #### Delivery Gate (blocking)
api[]               ───→              #### API Table
i18n_keys[]         ───→              #### i18n Table
analytics[]         ───→              #### Analytics
acceptance_criteria ───→              #### Acceptance Criteria
state_matrix        ───→              #### Visual Acceptance
verification_evidence ──→             #### Acceptance Evidence
dependencies        ───→              #### Dependencies
                    ───→              #### L1-L4 Layered Execution Checklist
```

**L1-L4 layered execution per task**:
```
- [ ] L1-Structure: Layout, component hierarchy, data binding
- [ ] L2-Visual: Colors, fonts, spacing, border radius
- [ ] L3-Interaction State: Gestures, animations, state transitions, error handling
- [ ] L4-Acceptance Evidence: Screenshots/recordings compared against Figma
```

---

## 14. Real-World Example

### cc-100.0 Validation Run

```bash
# Execute
/spec-init cc-100.0

# Input materials
#   PRD:     moox/1.2/prd/README.md (reused)
#   Figma:   jaVhFJr7WwAQ8QQY97KvvJ
#   Swagger: api-doc/chatbot_swagger.json + post_swagger.json

# Output
#   12 Feature YAMLs, 24 Tasks (iOS 12 + Android 12)
#   7 Backend APIs, 46 i18n keys, 43 Figma pages
#   Cross-validation: 7/7 passed
```

### Generated config.yaml dependency_index

```yaml
dependency_index:
  api_to_features:
    /chat/rewrite_message: [F02]
    /chat/reset_session: [F03]
    /chat/retrieve_messages: [F04]
    /chatbot/user_self_setting/save: [F06]
    /chatbot/user_self_setting/get: [F06]
    /chatbot/user_character_setting/save: [F07]
    /chatbot/user_character_setting/get: [F07]
    /post/edit_story: [F09, F10]
    /post/get_story_detail: [F08, F09, F10]

  figma_to_features:
    "119:265": [F01]
    "119:370": [F02]
    "119:2695": [F03]
    "119:1771": [F04]
    "119:2349": [F05]
    "140:330": [F06]
    "140:1373": [F07]
    "152:75": [F08, F10]
    "229:606": [F09, F10]

  feature_to_backend:
    F02: [B01]
    F03: [B02]
    F04: [B03]
    F06: [B04]
    F07: [B05]
    F09: [B06]
    F10: [B07]
```

### Generated Feature YAML Example (F02-ai-rewrite.yaml)

```yaml
id: F02
name: AI Reply Rewrite
module: chat
epic: 1
priority: P0
day: D1-D2

description: |
  Long-press character message → rewrite modal → 100-char input → streaming output replacement.

requirements:
  - id: R01
    desc: Both long-press menu and bottom menu of latest character message can trigger rewrite
  - id: R02
    desc: Modal popup + 100-char input field, optional rewrite instruction
  - id: R03
    desc: After modal closes, original message bubble shows loading, streaming output replaces content
  - id: R04
    desc: Tapping input field raises keyboard, modal adjusts position

figma:
  pages:
    - name: Story_Rewrite_Empty
      node_id: "119:370"
    - name: Story_Rewrite_Filled
      node_id: "119:462"
    - name: Story_Rewrite_OverLimit
      node_id: "119:555"
    - name: Story_Rewriting
      node_id: "119:649"

api:
  - endpoint: /chat/rewrite_message
    method: POST
    source: "backend.md#B01"
    verified: false
    params: [session_id, session_type, msgid, content, mid]

i18n_keys:
  - key: chat.rewrite.modal.title
    zh: 重写剧情
  - key: chat.rewrite.modal.placeholder
    zh: 可以输入你希望AI按照的剧情方向来进行修改（可选）

platform_tasks:
  ios: T02
  android: T02
  backend: B01

dependencies: [F01]
status: pending
```

---

## 15. FAQ

### Q: What happens if ⚠️ TODO fields are left empty?

It does not block spec-drive execution. Workers read the Feature YAML during Step 6 (Analyze+Design) -- empty fields mean the Worker must analyze on its own, which may reduce design quality. It is recommended to fill in at least `ui_contract` and `delivery_contract` before executing the first batch of tasks.

### Q: Does refresh overwrite existing content?

No. Existing Feature YAMLs are skipped entirely; only missing features are added. Missing fields in existing files are filled in, but already-populated fields are never overwritten.

### Q: What if validate fails?

Blocking items (Feature ID gaps, missing Tasks, etc.) must be fixed manually before re-running validate. Warning items (missing Figma references, etc.) do not block spec-drive execution.

### Q: Can I skip spec-init and write specs by hand?

Yes. As long as the spec-drive setup completeness check passes (directory + config + features + tasks), spec-drive can take over. spec-init is an automation tool, not a mandatory prerequisite.

### Q: How to handle PRD changes?

```bash
# 1. Update the PRD file
# 2. Run refresh for incremental update
/spec-init 1.3 refresh

# 3. If changes affect already-completed tasks
/spec-drive change prd "scope" "desc"     # record CR
/spec-drive propagate CR-{nnn}            # auto-rework
```
