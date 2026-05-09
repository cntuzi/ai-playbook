[English](./spec-generation.md) | [中文](./spec-generation.zh-CN.md)

# Spec Generation Workflow

> The standard process for turning new version requirements into executable specs.
> Goal: generate specs of sufficient quality in one pass, minimizing patches during execution.

---

## Why This Workflow Exists

During v1.2 spec execution, the following issues were discovered — all of which could have been prevented at the generation stage:

| Issue Type | v1.2 Example | Root Cause |
|------------|--------------|------------|
| Inconsistent field names | `self_setting` vs Swagger's `self_desc` | Field names derived from PRD instead of checking Swagger |
| Wrong API model | Wrote `IM say(MtypeRewrite)`, actual is `POST /chat/rewrite_message` | Based on early tech discussions; actual implementation had changed |
| Missing response fields | `get_story_detail` missing `creator_id` | Assumed the API would return needed fields |
| Undefined enums | `status` field values unclear | Swagger or backend docs not consulted |
| Missing Figma pages | Feature YAML didn't reference pages from figma-index | YAML and figma-index authored independently |
| No defensive flow | No task locking, no API validation | Assumed specs were flawless |

---

## Generation Process

### Phase 0: Input Checklist

Before starting generation, confirm the following materials are ready:

```
□ PRD document (PDF / Markdown)
□ Figma design files (file_key + page structure)
□ Backend technical spec (if available)
□ Swagger / API documentation (if available)
□ Messaging platform / IM API docs (if available)
□ Previous version specs (for structural reference)
```

**Key principle**: For features without API documentation, mark them as `❓ To Be Confirmed` in backend.md — never assume.

### Phase 1: Scaffolding

Create the version directory structure:

```
moox/{version}/
├── config.yaml          # Version config (Figma key, path mappings)
├── summary.md           # Version overview
├── WORKFLOW.md          # Execution workflow (copy + adapt from previous version)
├── DASHBOARD.md         # Progress dashboard
├── prd/                 # PRD documents
├── features/            # Feature YAML files
├── figma-index.md       # Figma page index
├── i18n/                # Internationalization strings
└── tasks/               # Task plans
    ├── shared.md
    ├── backend.md
    ├── ios.md
    ├── android.md
    └── refs/            # Reference materials (API doc screenshots, etc.)
```

### Phase 2: Requirement Decomposition → Feature YAML

Decompose the PRD into Feature YAML files.

#### 2.1 PRD Sections → Feature ID Mapping

Map PRD functional sections to Feature IDs using these rules:

```
Steps:
1. Read through the PRD, identify all independent features (one feature = one complete user-facing interaction)
2. Group and number by module:
   - Chat module: F01-F05
   - Settings module: F06-F07
   - Story module: F08-F10
   - ...
3. For each Feature, determine:
   - module: owning module
   - priority: P0 (core) / P1 (important) / P2 (deferrable)
   - dependencies: dependent Feature IDs
4. One PRD section may split into multiple Features (e.g., "Chat Enhancements" → long-press menu + rewrite + rollback + copy)
5. Multiple PRD sections may merge into one Feature (e.g., "Story Editing" and "Edit Permissions" → F08)
```

#### 2.2 Figma Page Extraction

Figma node_id **must be extracted from figma-index.md** — never derived from the PRD:

```
Steps:
1. Read {version}/figma-index.md
2. Iterate through each page by section:
   - Identify which Feature the page belongs to (based on page name + feature description)
   - Extract node_id
3. Write to the Feature YAML's figma.pages:
   - node_id: "119:265"
     name: Page name (matching figma-index)
     source: figma-index
4. Pages in figma-index that cannot be mapped to any Feature → record as missing, create a new Feature or extend an existing one

Note: The PRD may mention Figma page names but without node_id. Do not substitute
PRD page names for figma-index node_ids.
```

#### 2.3 API Endpoint Resolution

API information must follow a strict priority order:

```
Steps:
1. For each Feature, determine the required API endpoints
2. Look up by source priority:
   a. Swagger documentation (api-doc/{service}_swagger.json):
      - /chatbot/* endpoints → chatbot_swagger.json
      - /post/* endpoints → post_swagger.json
      - Found → source: swagger, verified: true (if params also match)
   b. Backend technical spec / messaging platform docs:
      - /chat/* endpoints (messaging platform, no Swagger available)
      - Found → source: backend.md#B{nn}, verified: true
   c. Mentioned in PRD but not found in docs:
      - source: to-be-confirmed, verified: false
      - Create corresponding B{nn} entry in backend.md, marked ❓ To Be Confirmed
3. Strictly forbidden: deriving field names from PRD descriptions (e.g., PRD says "self settings" → do not assume field name is self_setting)

Each api entry must include:
  - endpoint: full path
  - method: HTTP method
  - source: source annotation
  - verified: whether validated
```

#### 2.4 Complete Feature YAML Format

**Every Feature must include:**

```yaml
id: F01
name: xxx
module: xxx
priority: P0
description: xxx

# === The following fields must have explicit sources — never assume ===

figma:
  pages:
    - node_id: "119:265"
      name: Page name
      source: figma-index  # Source annotation: figma-index / manually-added

api:
  - endpoint: /chat/rewrite_message
    method: POST
    source: backend.md#B01  # Source annotation: swagger / backend.md / to-be-confirmed
    verified: true           # Whether params have been validated
    params:
      - name: session_id
        type: uint64
        required: true
    response_fields:
      - name: ret
        type: int

i18n:
  keys: [...]
  source: strings.md  # Or "pending-translation"

analytics:
  events: [...]
```

**The source and verified fields are critical**: they force explicit provenance for every piece of data, rather than filling in from memory.

### Phase 3: API Alignment — Three-Way Verification

This is the core step that was missing in v1.2.

```
┌────────────────┐    ┌──────────────────┐    ┌─────────────────────────┐
│  Feature YAML  │    │ Swagger / API Doc │    │ Backend Spec / IM Doc   │
│  (expected API)│    │  (actual API)     │    │  (interaction flow)     │
└───────┬────────┘    └────────┬─────────┘    └─────────┬───────────────┘
        │                      │                        │
        └──────────────┬───────┘────────────────────────┘
                       ▼
              ┌────────────────┐
              │ Alignment      │
              │ Checklist      │
              └────────────────┘
```

#### 3.1 Per-Feature Verification Checklist

**Execute the following checks for each Feature YAML:**

```
For each Feature YAML:
  For each api entry:
    □ endpoint path exists in Swagger or backend.md
      - Swagger endpoints: search for the path in api-doc/{service}_swagger.json
      - Messaging platform endpoints: find corresponding B{nn} entry in backend.md
      - Not found → ❌ flag, create ❓ To Be Confirmed entry in backend.md

    □ method matches
      - Feature YAML method == Swagger/backend.md method
      - Mismatch → ⚠️ correct the Feature YAML

    □ All param names match
      - Compare Feature YAML params vs Swagger parameters field by field
      - Different field names (e.g., self_setting vs self_desc) → ⚠️ use Swagger as source of truth
      - Present in Feature YAML but absent in Swagger → ⚠️ confirm if optional or documentation gap
      - Required in Swagger but missing in Feature YAML → add it

    □ All response fields (that task logic depends on) exist
      - Extract dependent response fields from task technical notes and acceptance criteria
      - Confirm they exist in the Swagger response schema
      - Not found → ❌ flag (e.g., get_story_detail missing creator_id)

    □ Enum values are defined
      - Fields like status, type have explicit value mappings
      - Undefined → ⚠️ flag as to-be-confirmed

    □ Interaction model is correct
      - HTTP / SSE / WebSocket / persistent connection signaling
      - Wrong model (e.g., assumed IM say but actually HTTP POST) → ⚠️ correct

    □ Error codes are listed

    □ Persistent connection signals are defined (if applicable)

    Verification passed → verified: true
    Verification has discrepancies → correct Feature YAML, annotate ⚠️
    Verification incomplete → verified: false, annotate ❌
```

#### 3.2 Execution Method

1. Swagger endpoints (`/chatbot/*`, `/post/*`): automatically compare Feature YAML api fields against Swagger JSON
2. Messaging platform endpoints (`/chat/*`): manually compare against backend docs/screenshots (these endpoints have no Swagger)
3. Discrepancies found → correct Feature YAML and tasks/*.md immediately, not during execution

#### 3.3 Output

Annotate verification status on each entry in backend.md:

```markdown
| ID | API | Blocks Feature | Status | Verification |
|----|-----|----------------|--------|--------------|
| B01 | POST /chat/rewrite_message | F02 | 🟡 | ✅ Verified (2026-03-03) |
| B06 | POST /post/edit_story | F09 | 🟡 | ❓ Pending — Swagger response not confirmed |
| B07 | POST /post/get_story_detail | F10 | 🟡 | ❌ status enum undefined |
```

### Phase 4: Figma Alignment

#### 4.1 Cross-Check Process

```
For each section in figma-index.md:
  1. Identify the Feature ID for this section
     - Based on section title and page names
     - Example: "Story Interaction_Long Press Actions" → F01 Long Press Menu

  2. Find the corresponding Feature YAML
     - Read {version}/features/F{nn}-*.yaml

  3. For each page in the section:
     □ page.node_id exists in Feature YAML figma.pages
       - Exists → ✅
       - Missing → add to Feature YAML:
         - node_id: "{node_id}"
           name: "{page_name}"
           source: figma-index

  4. Reverse check: each node_id in Feature YAML figma.pages
     □ Has a corresponding entry in figma-index.md
       - Not found → node_id may be invalid or manually added
       - Annotate source: manually-added, pending verification
```

#### 4.2 Completeness Check

```
□ Every page in figma-index.md is referenced by at least one Feature YAML
□ Every node_id in Feature YAML figma.pages has a corresponding entry in figma-index
□ Missing pages are filled in and annotated with source: figma-index
□ Pages that cannot be mapped to a Feature → record as anomaly, confirm whether a new Feature is needed
```

### Phase 5: Task Generation → tasks/*.md

Generate platform task files from Feature YAML. **Generation rules:**

1. **Task overview table**: includes Feature column and schedule column
2. **API table**: extracted from Feature YAML `api` fields, includes full endpoint path, method, source column
3. **Figma table**: extracted from Feature YAML `figma.pages`, all node_ids validated against figma-index
4. **i18n table**: extracted from Feature YAML `i18n.keys`
5. **Analytics**: extracted from Feature YAML `analytics.events`
6. **Technical notes**: includes all ⚠️/❌ flags (from Phase 3 alignment checks)
7. **Dependencies**: derived from Feature YAML `dependencies`, with backend.md cross-references

**tasks/backend.md must include:**
- Complete parameter tables for each endpoint (extracted from Swagger or backend docs, not self-authored)
- Persistent connection signal definitions (if applicable)
- Error codes
- Verification status and date

### Phase 6: Readiness Gate

Before marking specs as "executable", pass the following checks:

```
=== Spec Readiness Checklist ===

Structural completeness:
□ config.yaml exists and figma.file_key is valid
□ All Feature YAML files exist
□ figma-index.md exists
□ i18n/strings.md exists
□ tasks/{ios,android,backend,shared}.md exist
□ WORKFLOW.md exists
□ DASHBOARD.md exists

API alignment:
□ Every Feature has api.verified == true, or is annotated ❓ To Be Confirmed
□ Every entry in backend.md has a verification status column
□ No field names without source annotations

Figma coverage:
□ figma-index 100% covered by Feature YAML
□ No invalid node_ids in Feature YAML

Task consistency:
□ Every Feature has a task entry in the corresponding platform tasks/*.md
□ No circular dependencies between tasks
□ Backend dependencies have corresponding entries in backend.md

Process completeness:
□ WORKFLOW.md includes a Lock step
□ WORKFLOW.md includes an API Contract Verify step
□ /spec-next command is deployed to all platform projects
```

---

## Role Responsibilities

| Role | Responsibility |
|------|----------------|
| **PM** | Provide PRD, Figma, confirm business rules |
| **Backend** | Provide Swagger, technical spec, IM API docs |
| **Spec Maintainer** | Execute Phases 1-6, ensure alignment |
| **AI Agent** | During execution, use API Contract Verify as a safety net; write back any gaps to specs |

---

## Ongoing Maintenance

Specs are not a one-time deliverable. Throughout the version development cycle:

1. **Backend API changes** → update backend.md + Feature YAML + tasks/*.md
2. **Design changes** → update figma-index + Feature YAML
3. **Requirement changes** → update PRD + Feature YAML + tasks/*.md + DASHBOARD.md
4. **Discrepancies found during execution** → API Contract Verify automatically writes back to tasks/*.md technical notes

Every change must be synced across all references — updating only one place is not allowed.

---

## Quick Reference

```
New Version Spec Generation:

Phase 0  Input Checklist    → Confirm all input materials are ready
Phase 1  Scaffolding        → Create directory and skeleton files
Phase 2  Decomposition      → PRD → Feature YAML (annotated with source + verified)
  2.1 PRD sections → Feature ID mapping
  2.2 Figma pages extracted from figma-index (never derived from PRD)
  2.3 API endpoints: Swagger first → backend.md → to-be-confirmed
Phase 3  API Alignment      → Feature YAML × Swagger/docs three-way verification ★★★
  3.1 Per-Feature, per-API verification checklist
  3.2 Swagger (/chatbot, /post) vs messaging platform (/chat) distinction
  3.3 Output: backend.md verification status column
Phase 4  Figma Alignment    → figma-index × Feature YAML cross-coverage
  4.1 Per-section, per-page bidirectional check
  4.2 Missing pages filled in + source annotated
Phase 5  Task Generation    → Feature YAML → tasks/*.md
Phase 6  Readiness Gate     → Readiness Checklist all passed
```

Phase 3 was where v1.2 hit the most issues — it must be executed thoroughly.
