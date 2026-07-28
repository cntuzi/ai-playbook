# Fix Pipeline — design

[中文](./design.zh-CN.md) · [back to case](./README.md)

> Depends on: Orca CLI v1.4.159 + one Linear team (written `<TEAM>` below)
> Primitives are documented by `orca skills get orchestration`. This file covers the workflow
> layer only and deliberately does not restate command syntax.
> Assumptions marked ⚠️ **unverified** must not be treated as fact.

---

## 1. Two nested loops

### Inner loop (inside one agent)

```
fix ──→ self-check ──→ fix ──→ self-check ...  until self-check passes
```

Invisible from outside. The only thing that escapes is one terminal signal: `worker_done`.

### Outer loop (across roles, driven by the queue)

```
[pending] → [dispatched] → [fix completed] → [awaiting peer] → [awaiting human] → [completed]
    ▲                                              │                  │
    └────────── peer-proof failed / human rejected ─┴──────────────────┘
                            back edge
```

**Outer ≠ inner + acceptance.** They nest: the inner loop *is* the implementation of the
`dispatched → fix completed` segment.

### The three-proof chain

| Layer | Who proves | What it establishes |
|---|---|---|
| **Self-proof** | the fixing agent | "I changed what I understood the problem to be" |
| **Peer-proof** | an independent read-only agent | "a different agent confirms it's fixed with no regression" |
| **Human-proof** | a person on the board | "this is what I wanted" — the only authority that closes |

Skip the layering and you get an agent lighting its own green light.

---

## 2. Roles

| Role | Form | Does | Loop driver |
|---|---|---|---|
| **intake** | resident TUI session | takes reports → normalizes → de-dupes → writes queue | human typing |
| **analyzer** | resident TUI agent (control plane) | clusters into buckets → builds tasks → spawns & dispatches | rolling `check --wait` + `task-list --ready` |
| **fixer** | TUI agent per bucket, reusable | fixes the bucket serially, runs the inner loop | woken by `dispatch --inject` |
| **verifier** | resident TUI agent (control plane) | pulls ready verifications → spawns peer-proof → requests acceptance | rolling `check --wait` + `task-list --ready` |
| **watchdog** | scheduled automation | liveness check on resident roles, rebuilds them | cron |

intake is a resident TUI rather than a programmatic listener because **it is the window the
human types into**. That residency is the inherent cost of a human interface, not an agent
burning context while waiting on IO.

---

## 3. Data model

| Concept | Carrier | Granularity | Role |
|---|---|---|---|
| **Problem** | orchestration task (parent) | one problem | **sole machine source of truth** |
| Fix task | orchestration task (`--parent`) | one bucket | machine |
| Verify task | orchestration task (`--deps=[fix]`) | one bucket | machine |
| **Bucket** | one isolated execution site | file-adjacent problems | isolation unit |
| **Human-facing problem** | board issue | one problem | projection + sole human input point |

Dependency depth stays at 2–3, within the official "no deeper than 3–4" guidance.

### The constraint that shapes everything

Task status has exactly six values and cannot be extended:

```
pending / ready / dispatched / completed / failed / blocked
```

"Awaiting verification" and "awaiting acceptance" have nowhere to live. Both are expressed
structurally instead — and both are patterns the orchestration layer already uses natively:

- **awaiting verification → dependency.** The verify task `--deps` on the fix task; when the
  fix completes it becomes independently claimable, and `task-list --ready` *is* the work list.
- **awaiting acceptance → gate.** `gate-create` blocks the parent task. Gates are meant for
  coordinator-managed DAG decisions, and human acceptance is exactly that.
  (The reverse direction — a worker needing an answer — uses `ask`, which raises a
  `decision_gate` message the coordinator answers with `reply`. Don't mix the two paths.)

---

## 4. State mapping and source-of-truth discipline

| Lifecycle | `task.status` (machine truth) | Board state | Written by |
|---|---|---|---|
| queued | `pending` | `Todo` | intake |
| bucketed & dispatched | `dispatched` | `In Progress` | analyzer (set by `dispatch`) |
| fixed, awaiting peer | fix `completed` (**set automatically by `worker_done`**), verify becomes ready | `In Progress` | fixer |
| peer-proof passed, awaiting human | `blocked` (gate) | **`In Review`** ← must be created | verifier |
| accepted | `completed` | `Done` | **human drags card** → verifier reads back |
| rejected | `failed` → new `pending` | `Todo` + comment | **human** → verifier reads back |
| peer-proof failed | `failed` → back to `pending` | `In Progress` + evidence comment | verifier |

A valid `worker_done` carrying `taskId` + `dispatchId` **marks the task and dispatch completed
automatically**. Don't follow it with a manual `task-update` — reserve those for explicit
recovery or override.

### Three state stores, one direction

- orchestration `task.status` = **sole machine truth**; every scheduling decision reads only this
- board issue state = **human projection + the only human input point**; humans write exactly
  one thing: accept or reject
- the worktree's `workspaceStatus` = **bucket-level progress projection, display only** — no
  automation may read it to decide anything

```
task ──push progress──▶ board
task ◀──read back acceptance only── board
task ──push bucket progress──▶ workspaceStatus (write-only)
```

This rule exists because of a real incident: a board status was changed and the orchestration
card never moved, because they are two independent stores with no linkage. Without a pinned
direction, that single failure repeats once per problem.

### Reading back human acceptance

```bash
orca linear list-issues --team <TEAM> --state Done --updated-at 1h --json
```

`--updated-at` takes a duration, so this is an incremental scan rather than a full pull.

---

## 5. How to actually dispatch work

`worktree create --agent --prompt` **does not attach** `taskId` / `dispatchId`. A worker
launched that way has no lifecycle authority and cannot emit a valid `worker_done` — you have
silently opted out of orchestration provenance.

The correct four steps:

```bash
# 1. Spawn the worker. Create a worktree only when parallel buckets would mutate one checkout.
orca worktree create --name <bucket> --agent codex --no-parent --json
#    worker handle = startupTerminal.handle from the response

# 2. Wait for TUI readiness, or the prompt gets swallowed
orca terminal wait --terminal <handle> --for tui-idle --timeout-ms 60000 --json

# 3. Create the task
orca orchestration task-create --spec "<bucket problem list + acceptance criteria>" \
  --parent <problem_task> --json

# 4. Dispatch with preamble injection — this is the step that confers lifecycle authority
orca orchestration dispatch --task <task_id> --to <handle> --inject --json
```

For a single bucket with no parallel mutation of the same checkout, a fresh terminal in the
existing worktree is enough.

**Workers are reusable.** After sending `worker_done` a worker ends its turn and idles; a new
`dispatch --inject` wakes it again.

---

## 6. Seven operating rules

### 1. A resident agent is a router, not a worker

It touches task ids, titles, file lists and report *paths* only. Anything that requires reading
content gets delegated to a throwaway sub-agent. Per-round context growth then stays constant
rather than kilobyte-scale. **Break this rule and the resident design dies within two days.**

### 2. Reports go to disk; messages carry paths

`worker_done` supports `reportPath` in its payload. Body text lands in a file; the message
carries the path. This is the mechanism that makes rule 1 enforceable.

### 3. Peer-proof uses a different agent, read-only

The verifying agent must not be the fixing agent, and must be read-only. Varying the *lens*
(does it still reproduce / any regression / did it fix the right place) beats spawning N
identical verifiers.

### 4. The queue is external memory; messages are only wake-ups

- Lifecycle authority comes from `taskId` + `dispatchId` in the payload, **not the terminal
  handle** — a pane gets a new handle after restart, so never decide provenance by comparing
  handles.
- `worker_done` / `heartbeat` must be sent **from the worker's own terminal** to the **concrete
  coordinator handle in the live preamble**. Broadcast progress with the `status` type instead.
- A coordinator restart therefore strands in-flight `worker_done` messages. **The fallback is
  `task-list --ready`** — the official guidance calls it the coordinator's external memory.
- `check --wait` **returns one message at a time**. If N workers may finish together, loop N
  times and dispatch newly-ready tasks after each.
- A `check --wait` timeout or `{count:0}` is a **checkpoint, not a failure**. Real coding tasks
  run 15–60 minutes; heartbeats and terminal activity prove liveness, not completion.

### 5. Buckets cluster by touched files

- No file overlap between buckets → conflict-free parallel merges
- Serial edits within a bucket → the agent sees the whole module context
- Worktree count equals **bucket** count, not problem count

**State the justification for each worktree.** Official guidance is that parallelism,
convenience, and task independence are *not* isolation requirements — only a concrete checkout
or filesystem conflict is. Here the justification is concrete: **parallel buckets mutating one
checkout collide on the git index and build artifacts.**

Problem category isn't wasted — it decides **who gets dispatched**: crashes and concurrency to
a strong model, copy and constants to a cheap one.

### 6. `workspaceStatus` is display only

Automation that reads it to make a decision has promoted a display layer to a source of truth.

### 7. Filter false positives at the door

A meaningful share of fan-out bug hunting is hallucination or not worth fixing. Every false
positive that gets through burns one fixing agent, one peer-proof, and one human acceptance.
**One extra round of judgement at intake is cheaper than three wasted rounds downstream.**

### Tool boundary

Orchestration state must be created through `task-create` + `dispatch --inject` (or
`orchestration run`). An agent's built-in sub-agent tools, generic spawn APIs, and chat-style
parallel workers can do the work, but they produce no task/dispatch provenance, inject no
lifecycle preamble, carry no `worker_done` authority, and have no decision gates.

Verify before claiming something was orchestrated:

```bash
orca orchestration task-list --json
orca orchestration dispatch-show --task <task_id> --json
```

---

## 7. Prerequisites

1. **Enable orchestration** — Settings > Experimental. It's an experimental feature; without it
   every `orchestration` command is unavailable.
2. **Add an `In Review` state to the board**, between `In Progress` and `Done`. Linear's
   defaults are `Backlog / Todo / In Progress / Done / Canceled / Duplicate`, which has no
   "machine-verified, awaiting human" state — and using `Done` for it pollutes the meaning of
   Done. ⚠️ The CLI can only read workflow states; **creating one is UI-only** — the single
   action in this whole design that cannot be scripted.
3. **A control-plane worktree** holding only orchestration scripts and a report directory.
4. **A watchdog automation** with `--workspace-mode existing --fresh-session`.
5. **A label taxonomy** on board issues, so analyzer can pick models.

---

## 8. Unverified assumptions ⚠️

| Assumption | Status | Blast radius | Fallback |
|---|---|---|---|
| `task-list --ready` filters strictly on satisfied `deps` | **untested.** Officially described as coordinator external memory, but deps semantics aren't spelled out | the entire "awaiting verification" state rests on it | pull all tasks and compute deps client-side |
| `@worktree:<id>` group addressing survives terminal recreation | documented, **behaviour untested** | whether intake/watchdog need a handle registry | maintain a handle registry |
| `gate-create` sets the task to exactly `blocked` | unconfirmed (docs only say "blocking a task") | one row of the state map | treat `gate-list` rather than `task.status` as the acceptance queue |

**Resolved by the official guide** (was previously an assumption here): `check --unread
--inject` renders mail **for the terminal that runs it** and **cannot wake a different
terminal**. Use `dispatch --inject` to deliver a tracked task, and `terminal send` to hand an
existing agent a free-form prompt. Resident roles therefore drive their own rolling
`check --wait` loop rather than being pushed.

---

## 9. Rejected alternatives

> An un-recorded rejection is negative-space dirt: it comes back and gets re-litigated.

| Rejected | Why |
|---|---|
| Dispatching via `worktree create --agent --prompt` | no `taskId`/`dispatchId`, so no lifecycle authority. Use `--agent` → `terminal wait --tui-idle` → `dispatch --inject` |
| Manual `task-update --status completed` after `worker_done` | a valid `worker_done` closes the task; manual updates are for recovery only |
| Deciding lifecycle ownership by comparing terminal handles | handles are routing metadata and change on restart; authority is `taskId` + `dispatchId` |
| Waking resident roles remotely via `check --inject` | it only renders mail for the terminal running it |
| Group-addressing every message | `worker_done` / `heartbeat` must target a concrete coordinator handle; groups are for `status` broadcasts |
| intake as a programmatic message listener | intake is a **human interface**; a TUI is supposed to be resident |
| Stateless tick workers (automations as workers) | chose resident TUI for latency and cross-round memory; automations became the watchdog |
| One coordinator doing both analyzer and verifier | two roles sharing one context, and boxed in by the built-in loop's semantics |
| Custom task statuses for the two business states | status is a fixed six-value set; `--deps` + `gate` is cleaner and native |
| Bucketing by problem category (crash / UI / perf) | category has no bearing on merge conflicts; touched files do. Category picks the model instead |
| One worktree per problem | worktree count should equal bucket count — cheaper setup, and same-module problems belong together |
| Multiple parallel fixers inside one worktree | they collide on the shared filesystem (git index, build artifacts) |
| A self-rendered HTML board, or CLI-only notifications, as the acceptance view | an existing board gives per-problem granularity, a real UI, and a comment thread where the acceptance rationale lands |
| Reading `workspaceStatus` to make scheduling decisions | that promotes a display projection to a source of truth |
| Replacing dispatch with an agent's built-in sub-agent tool | no provenance, no lifecycle preamble, no `worker_done` authority, no gates |

---

## 10. Known risks

| Risk | Mitigation |
|---|---|
| False positives flood the queue | rule 7 — filter at the door |
| One task fails dispatch repeatedly | **native circuit breaker**: three consecutive failures marks it `failed` |
| Humans reject repeatedly and the outer loop never converges | the native breaker only covers dispatch failures — **count human rejections yourself**; cap them per parent and escalate with `gate-create --options` |
| Three state stores drift | the one-directional rule in §4 |
| Resident agent context blows up | rules 1 and 2 |
| Coordinator restart strands in-flight `worker_done` | rule 4 — `task-list --ready` as fallback |
| Killing a worker that is still working | rule 4 — timeouts and `{count:0}` are checkpoints |
| No per-problem board in the orchestration layer | supply one externally |

---

## 11. Does this generalize beyond bugs?

Yes — but the dividing line isn't "bug vs task". The skeleton (queue, buckets, back edge,
three-proof chain, state machine, the seven rules) is entirely work-item agnostic.

The real invariants are two:

1. **Every queue item is independently acceptable.** A bug satisfies this naturally; an epic
   does not and must be decomposed first.
2. **Every queue item carries an executable acceptance criterion.** This is the one that
   matters.

The second explains why bugs fit so naturally: **a bug's reproduction path *is* its
criterion** — objective, executable, and directly runnable by the peer-proof agent. A feature
task carries no such thing; "add a filter" is not a criterion. The consequence of a missing
criterion isn't slowness — **peer-proof degrades into subjective opinion and the three-proof
chain collapses to two.**

So the accurate definition is: *a workflow driven by independently acceptable work items that
carry executable acceptance criteria.* Bug-driven is the special case where the criterion
already exists.

Generalizing touches exactly three components:

| Component | Type-specific? |
|---|---|
| Queue / buckets / back edge / state machine / board contract / seven rules | no change |
| **Intake spec template** | bug: symptom / repro / expected / impact hints / evidence. Task: requirement / acceptance criteria / scope / dependencies |
| **Bucketing basis** | bug: existing touched files. New feature: files don't exist yet, so bucket by **module ownership** |
| **Peer-proof criterion source** | bug: "no longer reproduces + no regression". Task: "each acceptance criterion satisfied" |
