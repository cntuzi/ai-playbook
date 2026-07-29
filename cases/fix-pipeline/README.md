# Fix Pipeline

[English](./README.md) | [中文](./README.zh-CN.md)

A queue-driven closed loop for putting a batch of bugs through multiple AI agents — with an independent verification agent and a human acceptance gate before anything is considered done.

Built on [Orca](https://orca.computer)'s orchestration primitives. Agent-agnostic: Claude, Codex, Gemini and others can each play any role.

## The Problem

Handing a batch of bugs to a coding agent fails in a specific way, and it is not the way people expect.

The agent usually *can* write the fix. What it cannot do is tell you whether the fix is real. It reports success on code it never ran, marks a task done when it only got the file to compile, and — most expensively — solves the wrong problem correctly.

Three failure modes compound:

- **Self-reported green.** The only signal you get is the agent saying it finished. That signal is uncorrelated with whether the bug is gone.
- **State scattered everywhere.** Terminal output, chat scrollback, git status, the issue tracker — four places, no single source of truth. Restart an agent and the state is gone.
- **Parallel agents collide.** Two agents editing the same file in the same checkout produce a merge conflict at best, silent overwrites at worst.

## Four Ideas

The whole system is four words. Everything else follows.

**The queue is the source of truth.** `orca orchestration task` is the only machine-readable state. Messages between agents are wake-up signals — losing one costs nothing. Losing the queue loses everything. Every scheduling decision reads the queue, never the chat log.

**Buckets are the isolation unit.** One bucket = a set of issues whose touched files don't overlap + one agent + one git worktree. Buckets determine concurrency; the number of issues does not. Non-overlapping files across buckets means parallel merges never conflict. Serial fixes inside a bucket mean the agent keeps full context on one module.

**Three-witness chain.** Self-witness (the fixing agent says it's done) → cross-witness (a *different*, read-only agent re-verifies) → human witness (a person accepts in the issue tracker). Skip any link and you have a false green light. The cross-witness must be a different agent than the fixer — that constraint is what makes it evidence rather than a rubber stamp.

**The back edge.** Verification fails, or the human rejects → the issue re-enters the queue as a new task. This edge is what makes it a loop instead of a pipeline.

## Five Roles

Each role reads only its own file. None of them reads the whole manual.

| Role | Does | File |
|---|---|---|
| **intake** | Human interface. Takes reported problems, dedupes, writes the queue and the tracker issue | [`roles/intake.md`](./roles/intake.md) |
| **analyzer** | Clusters issues into buckets by touched files, builds the task DAG, spawns workers | [`roles/analyzer.md`](./roles/analyzer.md) |
| **fixer** | Fixes serially inside one bucket, runs a self-verification loop, commits per issue | [`roles/fixer.md`](./roles/fixer.md) |
| **verifier** | Dispatches cross-witness, requests human acceptance, lands the code, destroys the bucket | [`roles/verifier.md`](./roles/verifier.md) |
| **watchdog** | Liveness probe over the other roles, replays from the queue | [`roles/watchdog.md`](./roles/watchdog.md) |

A sixth terminal, [`console`](./roles/console.md), exists purely as the human's interface and manual maintainer — it is not a pipeline role and holds no queue responsibilities.

## One Issue, End to End

```
you report a bug
  → intake      dedupe → create tracker issue → create task (ready)
  → analyzer    bucket it → create fix task + verify task (deps on fix) → spawn agent → dispatch
  → fixer       fix → self-verify (build/tests) → commit to the bucket branch → worker_done
  → verifier    spawn a different read-only agent → PASS → land it:
                write state first → rebase → build → archive reports → merge → destroy bucket
  → you         issue sits in Review; drag to Done to accept, to Todo to reject
```

Note the ordering in the landing step. **State is written before the bucket is destroyed** — once the worktree is gone there is nowhere left to write it. And **the merge happens on cross-witness PASS, before human acceptance**, so the human reviews on their own branch instead of checking out a bucket that is about to be deleted. The cost of that choice is that a human rejection requires a revert.

## What It Actually Cost

This section is the reason this document exists. The design above is easy to write down. What follows is what running it actually produced.

**One bug took three rounds.** Neither rework was caused by bad fixing:

- **Round 1 — rejected by the human, wrong direction.** The spec I wrote asked for a non-blocking toast. The product requirement doc explicitly required a blocking error state with retry. The cross-witness passed it — because it verified the wrong requirement correctly. Everything was reverted.
- **Round 2 — failed cross-witness, wrong acceptance criteria.** I had written a pre-existing defect into the acceptance criteria for this issue. The fix was sound; the criteria were not. The verifier applied them faithfully and failed a correct fix. That defect was split into its own issue — and that rework is what produced discipline #10 below.
- **Round 3 — passed, landed.** Self-verification quality had visibly risen by then: 5 real interaction paths exercised, 56 regression tests, clean build.

**Both reworks were input-quality failures, not output-quality failures.** The rules in the manual are not designed — they are the invoice for those two rounds.

**A second cost, harder to see:** for a stretch of this session, five agents were discussing methodology with each other while the pipeline made zero progress. The watchdog was the one that noticed and unilaterally scoped itself back down to liveness checks. Any system where agents can talk to each other needs someone empowered to say "we are producing insight and no output."

## Failure Modes Found by Running It

These were discovered by hitting them, and every one of them is silent — no error, no exception, no non-zero exit.

| Failure | Symptom | You conclude |
|---|---|---|
| Can't receive | Blocking wait returns empty, no error | "The queue is quiet" |
| Can't send | Send returns `ok: true` to a handle that no longer exists | "Message delivered" |
| Can't detect | Using send's return value as a liveness signal — it is **always true** | "They're alive" |
| Corrupted content | Message body passes through the shell; backticks execute, `$` expands | "I sent what I wrote" |

The common thread is not the addressing scheme. It is that **a command's return value reports that the command was accepted, not that the effect you wanted happened.** Assume this of every new command until proven otherwise.

Two more, from a category worth naming:

**Monitoring that lies confidently.** A probe rewrite was dry-run before deploying and turned out to match zero terminals — a constant had been written in selector format while the data field carried no such prefix. Deployed as-is, its first cycle would have declared all seven agents dead, and a well-behaved watchdog would have restarted six live ones. Other silent failures cause *missed* actions; a broken monitor causes *wrong* actions. Dry-run before you deploy anything that judges the world.

**"I've used it" ≠ "it works here."** The manual carried a fix that didn't exist: a `--body-file` flag documented as the remedy for shell-mangled message bodies. The flag is real — on a *different* subcommand of the same CLI, where it had been used successfully a dozen times. Wrong generalization from genuine experience is harder to catch than invention, because the author has real successes backing it and will skip right past it on reread. It survived until somebody typed it. **Record the boundary of an experience alongside the experience.**

## What Has Not Been Proven

Stated plainly, because a case study that only lists wins isn't evidence of anything:

- **Parallel buckets have never run.** Bucket isolation exists precisely to enable concurrency, and every session so far has been a single bucket, serially. The core claim of the design is untested.
- **Auto-wake on human acceptance is untested.** The design routes it through the watchdog probe noticing a tracker state change. Nobody has watched it happen.
- **Idle behavior is wasteful.** With an empty queue, resident roles sit in a blocking wait, waking on timeout to re-derive that nothing changed.

## Using It

Drop [`SKILL.md`](./SKILL.md) and [`roles/`](./roles/) into your agent's skill directory, open an agent in your project worktree, and say "start fix pipeline". The bootstrap section of `SKILL.md` covers the rest — control-plane creation, role terminals, the watchdog automation. No script required; the manual is the script.

The manual is written for agents to read, not humans. It is dense, it repeats itself where repetition prevents a specific mistake, and nearly every rule carries the incident that produced it.
