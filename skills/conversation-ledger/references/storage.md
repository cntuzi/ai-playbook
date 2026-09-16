# Storage and source conventions

## Select a root

Use, in order:

1. The ledger directory or question-note path explicitly selected in the current request.
2. `<workspace>/.conversation-ledger/location.json`, if present.
3. `<workspace>/.conversation-ledger/data/` for a new checkpoint.

`workspace` means the current project root if known, otherwise the working directory. If neither is available, ask for a destination before saving; the conversation analysis can proceed.

The mapping stores only a version and a root, for example:

```json
{
  "version": 1,
  "root": "/path/to/vault/Agent"
}
```

Resolve a relative `root` against the workspace, not against the installed skill directory. Validate that a supplied Obsidian vault or external parent directory exists before creating its ledger folder; a mistyped path should not silently create a new vault. A path to an existing question selects that ledger for the operation but does not by itself change the workspace default.

When initializing a ledger or when the user selects a default root, persist that root in the local mapping so other agents in this workspace can find it. Preserve the existing default for a one-off operation on a supplied question path. Create `.conversation-ledger/.gitignore` with `*` for a new local configuration directory; preserve an existing file. This keeps the default ledger and machine-specific mapping out of ordinary Git adds. It does not untrack previously committed files or affect a separately chosen vault. Publishing conversation data needs the user's instruction for that data.

Status reads do not create directories. For a missing default ledger, report that no records exist yet. For a missing configured root, report the unavailable path and ask for a correction before writing elsewhere.

Different projects can point to the same external root. In each new workspace, the user can name that root once. Installing the skill distributes instructions; it does not discover or synchronize ledgers across computers.

## Layout

```text
<ledger-root>/
  Questions/Q-<uuid>.md
  Sessions/S-<uuid>.md
  questions.base             # optional Obsidian view
```

Generate UUIDs with the host's available UUID facility. Prefix question IDs with `Q-` and session IDs with `S-`. Keep IDs and filenames stable even when titles change; never use a global sequential counter across agents.

Use flat YAML properties and quoted strings for titles, links, paths, and native IDs. Escape embedded quotes and other special characters when filling template values. Dates use the actual local date. Templates are source assets: copy and fill them into the ledger; never store user conversations inside the installed skill folder.

Question properties:

| Field | Meaning |
| --- | --- |
| `id`, `type` | Stable identity; `type: conversation-question` |
| `title`, `project` | Human title and project scope |
| `status`, `status_owner` | State and its authority (`agent` or `user`) |
| `created`, `updated` | Local dates |
| `sources` | Links to supporting session notes, blocks, or artifacts |
| `discovered_from`, `depends_on` | Related question links |

Session notes carry their own ID, host, native session ID if available, project, recording mode (`checkpoint`, `tracking`, or `stopped`), coverage, and question links. Reuse the note only when the host session identity or an explicit user-selected session makes the match clear. A new conversation gets its own source note while retaining existing question IDs. A persisted `tracking` value describes that recorded session, not a command to enable tracking in every future session.

## Source evidence

For Obsidian, link from question YAML using a quoted vault-relative link such as `"[[Agent/Sessions/S-<uuid>#^m-<uuid>]]"`. Compute the actual vault-relative prefix; `Agent/` is an example. Give the corresponding source paragraph a stable `^m-<uuid>` block ID.

For ordinary Markdown, use relative file links such as `../Sessions/S-<uuid>.md`, with an explicit HTML anchor if a specific block needs targeting. Keep references valid from the question file's directory. Templates start with empty link lists so the agent can choose the correct form for the destination.

Each source entry records who said it, the known native message ID if available, and whether the text is an excerpt or a summary. When only compacted or partial context is visible, set coverage accordingly and describe the missing range. Never imply that inaccessible earlier turns have been inspected.

When retrying a partially completed checkpoint, reuse persisted source IDs. Match native message identity where available; without it, inspect the recorded coverage and existing entry before appending. Equal text alone does not establish equal events. Store source entries before updating notes that cite them, and retain enough pending-question information in the session note to finish an interrupted checkpoint.

## Updating notes

The Markdown files hold current state. Read them before making decisions; an index, a session summary, or the agent's recollection does not override current user edits.

- Keep **User notes / 我的判断** for the user's edits. Preserve unknown headings and properties.
- Keep progress, remaining questions, continuation cues, and dated evidence together. Edit only the needed parts rather than regenerating the entire file.
- Record explicit user state choices as `status_owner: user`. Treat unrecognized or ambiguous manual edits conservatively and append suggestions when needed.
- Append progress with its source reference; repeated checkpoints of the same source should not append the same finding again.
- Before mutation, compare the current file with what was read. After mutation, read it back and check references and state. Use the host's revision-checked edit API if available.

This pure-file version is intended for one writer at a time. A read-before-write check alone cannot guarantee safe simultaneous edits by independent agents, Obsidian, and sync software. If overlapping writers are active, save a separate session note with pending changes and leave shared question edits for reconciliation. A shared writer service belongs to the later runtime design.

The optional [capture runtime](runtime.md) additionally creates source notes at `Sessions/S-<hash>/E-<id>.md`, with `type: conversation-source`. Treat these as source evidence, separate from the manually maintained session summary and question notes. Its queue and review receipts are local runtime state; they do not replace Markdown question state. Use the runtime batch workflow to mark captured records reviewed.

## Obsidian access

Use available local filesystem tools for Markdown and `.base` files; the skill has no mandatory Obsidian plugin or CLI dependency. Preserve live user edits as described above. If the user already has an Obsidian integration, it can provide reads and targeted writes through the same workflow.

The supplied Bases view filters `type: conversation-question` within an explicit vault-relative folder. Replace `{{vault_relative_ledger_root}}` with the actual folder, such as `Agent`, escaping it as a string in the filter expression and YAML. Using a fixed folder keeps the scope stable when the view is embedded in another note. Render it only when useful; preserve an existing view. A cloud or browser-only agent without filesystem or vault tools can generate a checkpoint or handoff for the user to save, but cannot report a successful local write.
