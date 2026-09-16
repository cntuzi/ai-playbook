# Local capture runtime

Read this reference when enabling/disabling automatic capture or when a runtime hook asks you to review pending sources. Use the actual installed skill directory to resolve `scripts/ledger.mjs`; shell-quote paths or pass an argument array through a process tool.

## Enable in a workspace

The user must have requested automatic recording for this workspace. Reuse the chosen ledger location; an existing `location.json` is honored. To initialize the default local ledger:

```bash
node /path/to/conversation-ledger/scripts/ledger.mjs install --workspace /path/to/project --agents codex,claude-code,pi
```

Pass `--root /path/to/vault/Agent` only when selecting a destination. The external parent must already exist. Choose the agents relevant to the user's request; supported names are `codex`, `claude-code`, and `pi`. The installer currently supports macOS/Linux with Node.js 22+.

The installer copies a self-contained, versioned runtime into the workspace and merges project-local configuration:

- Codex: `.codex/hooks.json`.
- Claude Code: `.claude/settings.local.json`.
- Pi: `.pi/extensions/conversation-ledger.ts`.

Existing handlers and settings are preserved. Original configurations are backed up under `.conversation-ledger/backups/`. Reinstall after updating the skill to deploy the new runtime. The copied runtime stays available if the original skill installation moves.

Codex requires project trust and user review of new/changed hook definitions through `/hooks`; do not modify trust records or bypass the review. Pi project extensions also require a trusted project. Reload/restart the selected host and inspect its hook/extension status. Configuration alone is not proof that an event was delivered. These are host requirements, not an extra skill approval flow.

## What happens automatically

Each supported callback writes an immutable JSON event to `.conversation-ledger/events/`, then exports a separate Markdown source note under `<root>/Sessions/S-<hash>/E-<id>.md`. The event contains only documented text/lifecycle fields, never a dump of the host's configuration or hidden reasoning. If export fails, the event remains local and the failure is reported. `flush` retries exports without replacing user-modified source notes.

| Host | Captured | Context guidance |
| --- | --- | --- |
| Codex | User prompt, final response, pre-compaction and interruption markers | Session start and user prompt |
| Claude Code | User prompt, final response, pre-compaction and API failure markers | Session start and user prompt |
| Pi | User/assistant text messages, settled/compaction/branch markers | Before agent start |

Claude Code `Stop` does not cover user interruption. The runtime does not read private transcript formats to fill that gap. Images, tool outputs, and earlier history are outside this capture scope. A Pi final text may also carry an interrupted/error outcome; a settled marker is not a statement that a question is resolved.

Native message/event IDs are used for deduplication only when supplied. Current hook payloads often lack them; in that case every delivery gets a new receipt ID, so a host retry can appear twice. Turn IDs and identical text are not sufficient to merge two messages. Re-exporting a persisted event is idempotent.

Start/prompt guidance asks the main Agent to apply this skill to pending records while handling the current request. Stop hooks only capture; they never force continuation. The final reply can therefore remain pending until the next user turn or explicit checkpoint. This version has no independent model observer and does not claim automatic semantic classification after the last reply.

## Review and acknowledge

1. Read the saved runtime configuration and use its `skill_path` or the currently installed CLI. Run:

   ```bash
   node /path/to/ledger.mjs review --workspace /path/to/project --limit 20
   ```

2. The command exports queued sources and returns a batch ID, exact event IDs, source paths, and bounded text previews. Read the full source note when `text_truncated` or `source_modified` is true, retaining user annotations alongside the original event evidence. Follow the checkpoint workflow in `SKILL.md`; lifecycle-only events can have a recorded outcome of “no question change.” Apply the current user request and preserve the user's question edits.
3. Save a review note under the ledger, such as `Sessions/review-B-<uuid>.md`. For every batch event, include its full event ID, a source link, and the outcome: linked question/progress, candidate retained, duplicate source, or no question change. Preserve interrupted/unprocessed items as pending. Read back the affected notes before acknowledging.
4. When all events in this batch have been accounted for, run:

   ```bash
   node /path/to/ledger.mjs ack --workspace /path/to/project --batch B-... --note Sessions/review-B-....md
   ```

   Acknowledgement requires a separate saved note containing every event ID. It marks only the batch snapshot; events captured later remain pending. It validates a receipt exists, not the semantic accuracy of its conclusions. If only part of a batch is processed, leave it unacknowledged; a subsequent review reuses source IDs and reconciles the saved partial work.

5. Repeat for remaining batches when completing an explicit checkpoint request. During ordinary task execution, keep extra work bounded and report pending counts honestly if the task leaves a backlog. Reading or starting a batch alone does not mark records reviewed.

Do not create question updates by turning every captured message into a question. Capture is mechanical; topic selection and closure follow the Skill's evidence and state rules.

## Status, pause and remove

```bash
node /path/to/ledger.mjs status --workspace /path/to/project
node /path/to/ledger.mjs flush --workspace /path/to/project
node /path/to/ledger.mjs disable --workspace /path/to/project
node /path/to/ledger.mjs uninstall --workspace /path/to/project
```

`status` distinguishes captured events, pending export, pending review, and the last event received for each host. It cannot infer host trust or enabled global policy from installed files. `disable` immediately makes callbacks stop recording; rerun `install` to enable again. `uninstall` removes owned hooks and leaves data, backups, unrelated handlers, and manually changed configuration intact.

Raw capture files can be written by concurrent callbacks. Automatic source exports are create-only. Question-note edits are still the Skill's one-writer workflow; this release does not provide a shared question writer, multi-device coordination, or automatic merging of concurrent question edits.

## Verified interfaces

Interface checks dated 2026-09-16: [Codex Hooks](https://learn.chatgpt.com/docs/hooks), [Claude Code Hooks](https://code.claude.com/docs/en/hooks), [Pi Extensions](https://pi.dev/docs/latest/extensions). Host versions and policies can change; validate actual delivery after installation.
