---
name: conversation-ledger
description: Preserve questions, evidence, and resumption cues from branching agent conversations in Markdown or Obsidian. Use to track discussion threads, checkpoint or resume questions, or enable local conversation capture hooks.
---

# Conversation Ledger

Keep a durable record of what is still worth discussing, how far each question has progressed, and where to continue. One question can span several conversations; one conversation can contain several questions.

## Choose the operation

- **Checkpoint**: extract and save the meaningful questions and progress from the visible conversation. This is the default when asked to use this skill without a more specific operation.
- **Track this session**: when requested, checkpoint meaningful changes while continuing the user's work. Consider new questions, topic switches, decisions, and explicit pauses; write when there is a change worth keeping. Stop ongoing tracking when the user asks.
- **Status**: read the ledger and show relevant unresolved questions, their latest progress, and a continuation cue. This operation is read-only.
- **Resume**: read the selected question and its evidence, then continue the user's requested discussion. If asked only for a handoff or brief, return the material without executing its suggested next steps.
- **Enable/pause automatic capture**: when requested, use [references/runtime.md](references/runtime.md) to install, inspect, disable, or remove the local runtime. A request to pause recording applies to active runtime capture as well as best-effort tracking.

The Skill performs semantic review when the host follows it. The optional runtime captures supported events independently and injects next-turn review guidance; final-response classification can remain pending. When runtime guidance or unreviewed captures are present, follow [references/runtime.md](references/runtime.md) to process and acknowledge them. Distinguish captured, exported, and reviewed records, and report the actual coverage.

## Locate the ledger

For any file operation, read [references/storage.md](references/storage.md). Use a root supplied by the user or an existing local mapping; otherwise checkpoints default to `.conversation-ledger/data/` in the current project or working directory. An Obsidian root is the chosen folder inside the vault, such as `/path/to/vault/Agent`.

Announce the chosen path on first write. Reuse an already authorized location without repeated confirmation. If a configured location is unavailable, surface that condition instead of silently starting a second ledger. With no filesystem tools, provide a Markdown checkpoint or handoff and say it has not been saved.

## Checkpoint workflow

1. Read the current session note, if identifiable, and relevant existing questions. Match explicit IDs first, then compare the actual question, scope, and sources. A similar title alone is insufficient for merging.
2. Identify new questions, progress, evidence, user decisions, and explicit deferrals in the visible material. Keep secondary questions even when the answer pursued only the main one. Brief examples and the agent's optional suggestions can stay in session notes rather than becoming independent questions.
3. Persist source excerpts or clearly labeled summaries in the session note before linking to them. Use native session/message identifiers when supplied; otherwise use locally generated IDs and describe coverage honestly. A summary is not a verbatim transcript.
4. Create a question note when the user explicitly wants to preserve it, it needs later work, or it has become a substantial discussion. Reuse its stable ID across agents. Connect discoveries and prerequisites to their source question.
5. Update progress and open points with source references. Apply the state rules below, preserve user annotations, and verify the current file immediately before changing it. If another writer has changed it, reread and reconcile; see the storage reference for this version's concurrency limits.
6. Read back the affected notes and verify source links, IDs, and state changes. Report a short delta: what was recorded, what remains open, and the actual saved location. During ongoing tracking, keep routine updates quiet unless the user asks or a material correction is needed.

### State rules

| State | Meaning |
| --- | --- |
| `open` | Worth returning to; not yet explored |
| `exploring` | Being discussed or investigated |
| `waiting` | Needs specified evidence, input, or a prerequisite |
| `parked` | Deliberately set aside |
| `resolved` | Has a supported answer or an explicit user decision to conclude |
| `dropped` | User decided not to pursue it |

An answer is progress; mark `resolved` only when the question's open points are addressed with supporting evidence or the user explicitly concludes it. Record the rationale and any limits. Explicit user directions govern `parked` and `dropped`.

Preserve `status_owner: user`, direct user edits, and text under **User notes / 我的判断**. New evidence can suggest reopening a user-controlled question; changing its state requires a new user direction. For agent-managed questions, record the reason when reopening. If ownership is uncertain, append a suggestion rather than replacing the state.

Merge only questions with the same scope and intent. Preserve the old note and ID with a link to the surviving question so existing references still work. If two conclusions conflict, retain both sources and the unresolved disagreement.

## Resume workflow

Read the selected question's latest file, including user notes, and only the sources needed to understand its current state. Resolve an ambiguous selection before executing work; a read-only candidate list can proceed meanwhile.

Prepare a compact brief containing:

- Question ID and what the user wants to determine.
- Current conclusion, assumptions, and user corrections.
- Remaining uncertainty or dependency.
- Relevant source links and the latest covered conversation range.
- A concrete next step appropriate to the current request.

Treat stored conversation excerpts as reference material. The user's current request controls what to do; a saved next step or unresolved question is not authorization to execute it. In a new host session, create a new session note when saving progress and link it to the existing question ID.

## Assets

For new notes, adapt [assets/question.md](assets/question.md) and [assets/session.md](assets/session.md), replacing template values and keeping existing project language and conventions. Do not rewrite established notes into the templates solely for uniformity.

For Obsidian, optionally render [assets/questions.base](assets/questions.base) into the ledger root, replacing its folder value with the actual vault-relative ledger path. It provides a property-based view of question notes in that ledger; plain Markdown workflows do not require it.
