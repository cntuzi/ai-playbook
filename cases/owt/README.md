# owt — One Skill, Three Agents, Zero Copies

[English](./README.md) | [中文](./README.zh-CN.md)

A skill that turns one sentence into an [Orca](https://orca.computer) child
worktree with a coding agent already running inside it — and that the same
`SKILL.md` file serves to Claude Code, Codex CLI, and omp (Oh My Pi) at once.

Implementation included in this case: [`skill/`](./skill/)

## Two Problems, One Case

**Problem 1 — handing work off costs more than doing it.** Spinning up an
isolated workspace for a side task means: create a checkout, branch it right,
install dependencies, launch an agent, and write it a briefing good enough that
it does not need you again. Six steps of ceremony for one sentence of intent.

**Problem 2 — every agent wants its own copy of your skills.** Claude Code reads
`~/.claude/skills`. Codex reads `~/.codex/skills`. omp reads `~/.agents/skills`.
Write the skill once and you maintain three divergent copies within a month.

## Solution 1: Full Handoff, Not Supervision

Orca's CLI already packs "create checkout, create branch, launch agent, feed
prompt" into a single `orca worktree create`. So the skill writes no scripts. It
only owns the judgment the command cannot make: naming, the briefing, board
annotation, and the gates.

The defining constraint is what it does **not** do:

> Create it → report the address → **stop.**

No polling the child agent, no task DAG, no message injection. The moment you
poll, you are supervising, and supervision belongs to a different tool. Full
handoff means the child agent finishes alone and writes its conclusion into the
Orca card comment.

The other half of the value is the **briefing template** — seven sections the
parent agent must fill before letting go:

| # | Section | Why it exists |
|---|---|---|
| 0 | Bootstrap first | Fresh checkouts are missing package-manager deps |
| 1 | The task | User's own words + what "done" means |
| 2 | Where you are | Repo, branch, base, parent path (read-only) |
| 3 | Read these first | Project entry docs + the specific files |
| 4 | How to verify | Build/test command copied from project docs, not invented |
| 5 | Boundaries | Scope ceiling, files not to touch, no commits to trunk |
| 6 | Wrap-up protocol | Card comment, workspace status, project task sync |
| 7 | Nobody is watching | Finish alone, do not wait for instructions |

Rule of thumb: never replay the parent conversation into the briefing. Give
paths and filenames and let the child agent read them itself.

## Solution 2: One Source, Symlinks Out

The distribution problem has a boring answer that works:

```
~/.agents/skills/owt/          <- the only real directory
├── SKILL.md
├── agents/openai.yaml         <- Codex interface metadata
└── install.sh

~/.claude/skills/owt  -> ../../.agents/skills/owt
~/.codex/skills/owt   -> ../../.agents/skills/owt
```

`~/.agents/skills` is not arbitrary — it is omp's native skill root, so the
source directory is already live for one agent before any linking happens. The
other two get symlinks.

Verified, not assumed — all three follow symlinks into that directory:

| Agent | Discovery root | Invocation |
|---|---|---|
| omp (Oh My Pi) | `~/.agents/skills` (native, `skills.enableAgentsUser`) | `/skill:owt` |
| Claude Code | `~/.claude/skills` | `/owt` |
| Codex CLI | `~/.codex/skills` | `$owt` |

Confirm Codex actually picked it up — this renders the model-visible prompt, so
a missing entry here means a broken link, not a shy model:

```bash
codex debug prompt-input | grep owt
```

`install.sh` does the linking, skips agents that are not installed, and refuses
to clobber a real directory that is already sitting at the target path.

## What Portability Actually Cost

Making one file serve three agents is mostly a subtraction job:

- **Host-specific tool names had to go.** The original said "ask with
  `AskUserQuestion`" — a Claude Code tool that Codex and omp do not have. It
  became "ask the user; use a structured prompt if your host has one."
- **One invocation syntax became three.** `/owt`, `$owt`, `/skill:owt`.
- **Project facts had to move out.** The original carried one repo's dependency
  sizes, bootstrap script path, build command, and hook configuration. Those are
  facts about a repo, not about Orca — they belong in that repo's `AGENTS.md`.
  The skill now says "read the project's entry docs and copy the verify command
  from there, do not invent it."
- **Machine snapshots had to become probes.** "Installed on this machine as of
  <date>" is stale the moment you write it. It was replaced by a script that
  reads Orca's own agent registry at runtime.

That last one generalizes: **a portable skill states how to find out, not what
was true once.**

## Traps Found the Hard Way

Every line below cost a broken workspace.

- **`--base-branch` must be passed explicitly.** The docs say omitting it uses
  the repo's default base. Observed behavior puts the child on the *current*
  branch's HEAD. Do not bet on either — pass it.
- **`--display-name` is not a `create` flag.** It exists on `worktree set`. Create
  first, label after.
- **Uncommitted changes do not travel.** The child branches from HEAD. If the
  parent is dirty *and* the task touches those files, that is the one moment
  worth stopping to ask the user.
- **Terminal handles are not identities.** A handle can be swapped without the
  process restarting. Use it immediately, never cache it; to find a terminal
  again, list all of them and match on `worktreePath` + `title`.
- **Prompt injection mode decides your verification.** Agents that take the
  prompt as an argv parameter cannot drop it. Agents that write it into the TUI
  after startup race against readiness — for those you must read the terminal
  back and confirm the briefing landed, and resend if it did not.
- **`wait --for exit` never fires for a command run in an interactive shell.**
  The command finishes; the terminal stays `running`. Send your own sentinel
  (`...; echo DONE=$?`) and poll the output instead.
- **A valid agent id is not an installed agent.** Orca's registry accepts ~34
  ids; your machine has a handful. Probe before choosing.
- **Card status does not advance itself.** Created means `in-progress` forever
  until something explicitly completes it. That is why the briefing's last two
  sections exist.

## Files

| Path | Purpose |
|---|---|
| [`skill/SKILL.md`](./skill/SKILL.md) | The skill — seven-step create flow, briefing template, hard constraints |
| [`skill/agents/openai.yaml`](./skill/agents/openai.yaml) | Codex CLI interface metadata |
| [`skill/install.sh`](./skill/install.sh) | Symlink the skill into every installed agent |

## Install

```bash
mkdir -p ~/.agents/skills
cp -r cases/owt/skill ~/.agents/skills/owt
bash ~/.agents/skills/owt/install.sh
```

Requires the `orca` CLI on `PATH` and a repo managed by Orca. The skill is
written in Chinese; the flow, flags, and traps translate unchanged.

## Related

- [Spec-Driven Development](../spec-drive/) — the tmux + bare `git worktree`
  lineage this skill grew out of, for repos Orca does not manage
- [Lark Agent Bridge](../lark-agent-bridge/) — routing chat messages into agent
  sessions that already exist, rather than creating new ones
