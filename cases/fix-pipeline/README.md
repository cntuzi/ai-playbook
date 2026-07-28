# Fix Pipeline — a queue-driven, multi-agent bug-fixing loop

[中文](./README.zh-CN.md)

A batch of bugs goes in. Fixes come out the other end, each one independently verified by a
*different* agent and accepted by a human on a Kanban board.

**Stack:** Orca orchestration (task queue, dispatch, decision gates) + any TUI coding agent
(Claude Code / Codex / omp / Gemini) + Linear as the human acceptance board.

> **Status:** design complete, minimum viable loop not yet run. Assumptions that are still
> unverified are marked as such in [design.md](./design.md) — this repo documents working
> systems, and this one is honest about which parts have not been proven yet.

---

## The problem

Throw ten bugs at an agent and you get ten plausible-looking fixes. Some of them are real.
Some fix a symptom. Some were never bugs — the agent hallucinated the problem. And the agent
that wrote the fix is the same one telling you it works.

Scaling that up doesn't need more parallelism. It needs a structure where **"done" has to be
earned three times**.

## Four ideas hold it together

**The queue is the source of truth.** Every problem is a row in an orchestration task queue.
Messages between agents are only wake-up signals — lose one and nothing breaks, because any
agent can recover its work list from the queue. Lose the queue and everything breaks. This is
what makes resident agents restartable at any moment.

**Buckets, not tickets, set the concurrency.** A bucket is a set of problems whose touched
files don't overlap, handled by one agent in one place. Bucket count sets parallelism; problem
count does not. Clustering by *touched files* rather than by problem category (crash / UI /
perf) is what makes parallel merges conflict-free — category has nothing to do with merge
conflicts, and is used instead to pick which model to dispatch.

**The three-proof chain.** Self-proof (the fixing agent says it's done) → peer-proof (a
*different*, read-only agent re-verifies) → human-proof (a person accepts on the board). Drop
any link and you get a green light that means nothing. Peer-proof must be a different agent:
an agent verifying its own work is not verification.

**The back edge.** Failed peer-proof and human rejection both send the problem back to
`pending`. That edge is what makes this a loop rather than a pipeline.

## Shape

```
intake ──▶ [queue] ──▶ analyzer ──▶ buckets ──▶ fixer ──▶ peer-proof ──▶ gate ──▶ human
              ▲                                                                     │
              └───────────── rejected: back to pending ◀────────────────────────────┘
```

Five roles, each a plain TUI agent session reading one role file:

| Role | Does | Lives |
|---|---|---|
| **intake** | takes problem reports, normalizes, de-dupes, writes the queue | resident (it's the human interface) |
| **analyzer** | clusters by touched files into buckets, builds the task chain, dispatches | resident |
| **fixer** | fixes one bucket serially, runs the self-proof loop | per bucket, reusable |
| **verifier** | pulls ready verification tasks, spawns peer-proof, asks for human acceptance | resident |
| **watchdog** | restarts dead resident roles; they recover work from the queue | scheduled automation |

## Why the state model looks the way it does

The orchestration layer has exactly six task statuses and they can't be extended:
`pending / ready / dispatched / completed / failed / blocked`. Two business states —
"awaiting verification" and "awaiting human acceptance" — have nowhere to live.

Rather than bolt on a parallel status store, both are expressed structurally:

- **awaiting verification** → a verification task that `--deps` on the fix task. When the fix
  completes, the verification task becomes claimable on its own.
- **awaiting acceptance** → a decision gate blocking the parent task. The gate list *is* the
  acceptance queue.

This turned out cleaner than custom states would have been, and both are patterns the
orchestration layer already uses natively.

## Contents

- **[design.md](./design.md)** — full design: state mapping, seven operating rules, the
  rejected-alternatives table, unverified assumptions, known risks
- **[skill/](./skill/)** — the actual skill, portable across agents: shared contract plus one
  file per role *(Chinese)*

## Notes for adapting this

Linear is used as the human board because the orchestration layer has no per-problem UI — its
task and gate lists are CLI-only. Any board with a programmable API works; what matters is
that exactly one store is authoritative for machines and the board is a **projection** with a
single human-writable field (accept / reject). Bidirectional sync between two state stores is
how you get drift.

The bundled orchestration guide (`orca skills get orchestration`) is the source of truth for
primitives. This case documents the workflow layer on top and deliberately does not restate
command syntax, so it can't drift out of sync with the CLI version you're running.
