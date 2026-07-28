# Skill Architecture — five principles from eight hand-written skills

[中文](./README.zh-CN.md)

I have 72 agent skills installed. I wrote 8 of them. This is what the 8 have in common —
derived after the fact, from artifacts that were written independently over months, not from a
style guide I set out with.

That matters: three of these principles show up in skills that were never meant to be related.
Independent rediscovery is the evidence that they're real, not aesthetic preference.

---

## 1. Decisions belong to the model, execution belongs to the script

The `wt` skill (git worktree + branch + tmux management) states it in its own overview:

> The script is a stateless thin wrapper — **path policy is decided by the agent.**

So `wt.sh` never decides *where* a worktree goes or *what* the branch is called. It takes a
name and does deterministic filesystem and tmux work. The agent reads "fix the chat crash",
decides `fix-chat-crash`, and hands that down.

`codex`, `gemini` and `weekly` are the same shape without saying so: a `SKILL.md` that holds
*when to delegate and what context to pass*, plus a script that holds *how to invoke*. The
script contains no judgement. The skill contains no CLI syntax.

The test: if your script has an `if` statement about *intent*, it's in the wrong half.

## 2. Authority and portable projection are different documents

`decision-hygiene` and `dirty-data-governance` both open with a version note that says, in
effect: the authoritative version with cases and templates lives in the team methodology
repository; **this file is the cross-project portable copy, kept in sync with it.**

`fix-pipeline` arrived at the same split independently — command syntax is owned by the
vendor's bundled guide (`orca skills get orchestration`), and the skill deliberately does not
restate it, so it cannot drift out of sync with whatever CLI version is installed.

Same rule appearing in three unrelated skills: **a portable copy must name its authority and
say it's a projection.** Otherwise the copy silently becomes a second source of truth, and the
two diverge without anyone noticing.

## 3. Discipline skills change the default, they don't wait for a trigger

`decision-hygiene` and `dirty-data-governance` both instruct: *treat this as a default check
on every summary, retrospective, or significant deliverable.*

That's a different contract from a tool skill. A tool skill fires on a trigger phrase and does
a job. A discipline skill has to alter behaviour on turns where nobody thought to invoke it —
its value is precisely in the cases you *didn't* think to ask for it. Which means the
description can't just list triggers; it has to name the recurring situation.

## 4. Rules must be contextual, never all-on

`taste-skill` is 1206 lines of frontend design rules, and its second line is:

> Every rule below is **contextual**. None of it fires automatically. First read the brief,
> then pull only what fits.

1206 lines applied unconditionally would produce exactly the templated slop the skill exists to
prevent. So the first section is brief inference — read the room, *then* select.

`fix-pipeline` solves the same problem structurally: a shared contract in `SKILL.md`, and one
file per role, so an agent playing verifier never loads the analyzer's steps. Both are the same
move — **volume is fine, unconditional application is not.**

## 5. Related skills draw their borders explicitly

`decision-hygiene`'s own description says: *use together with `dirty-data-governance`
(cleanup method); this skill owns when-to-trigger plus decision-layer dirt plus prevention.*

Two skills covering adjacent ground will compete for the same trigger unless one of them says
out loud where the line is. Cheapest possible fix — one clause in the description — and it
turns an ambiguous pair into a router.

---

## The eight, by shape

| Shape | Skills | Structure |
|---|---|---|
| **Delegating to another AI CLI** | `codex`, `gemini` | `SKILL.md` (when to delegate, how to pass context) + `scripts/*.py` (invocation, JSON parsing, session resume) |
| **Engineering workflow automation** | `wt`, `weekly` | `SKILL.md` (policy) + `scripts/*.sh` (deterministic execution) |
| **Methodology as discipline** | `decision-hygiene`, `dirty-data-governance` | `SKILL.md` only; no script, no trigger phrase — they change the default |
| **Taste constraint** | `taste-skill` (1206 lines) | one large reference body, gated by brief inference |
| **Multi-role orchestration** | [`fix-pipeline`](../fix-pipeline/) | `SKILL.md` (shared contract) + `roles/*.md` (one branch per role) |

Note the correlation: **the more the skill is about judgement, the less script it has.** The
two methodology skills have no script at all. The two CLI wrappers are nearly all script.

---

## What I install versus what I write

64 of the 72 are installed from upstream sources and are not mine to republish:

| Source | Skills |
|---|---|
| [mattpocock/skills](https://github.com/mattpocock/skills) | `ask-matt`, `code-review`, `codebase-design`, `domain-modeling`, `implement`, `tdd`, `teach`, `writing-*`, and others |
| Feishu/Lark official skill set | `lark-*` (~25) |
| Orca CLI bundled | `orca-cli`, `orca-linear`, `orchestration`, `computer-use` |
| Others | `stitch-*`, `obsidian-vault`, `prototype`, `research`, … |

The rule I use for the boundary: **install anything that encodes general craft; write only what
encodes my own environment or my own judgement.** Test discipline, code review, domain
modelling — someone has already thought harder about those than I will. Worktree layout, report
format, what counts as dirty data in my projects — nobody else can write those for me.

## Costs worth knowing before you write one

- **A model-invoked skill's description sits in the context window every single turn.** That's
  the standing cost of autonomous reach. A skill only you ever invoke by name should say so and
  pay nothing.
- **Splitting a skill spends one of two budgets**: context (a new always-loaded description) or
  memory (one more thing you have to remember exists). Neither is free, so a split has to earn
  it — a genuinely separate trigger, or a branch that carries material other branches shouldn't
  load.
- **A line the model would already obey is a line that costs tokens to say nothing.** "Be
  thorough" changes no behaviour. The fix is a sharper word, not more words.
