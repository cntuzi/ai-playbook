# AI Playbook

Real-world AI engineering practices — not theory, but working systems.

This repo documents how I build AI-powered development workflows: autonomous coding agents, spec-driven development, automated reporting, and more. Each case is a complete, battle-tested system running in production.

## Cases

### [Octopus Agent (章鱼哥)](./cases/octopus-agent/)

An autonomous iOS development agent built on [OpenClaw](https://github.com/nicepkg/openclaw). Receives tasks via Feishu (Lark), dispatches to Codex/Claude Code, creates merge requests, and reports progress — all automatically.

**Stack:** OpenClaw + Claude Sonnet + Codex CLI + Feishu + GitLab

### [Spec-Driven Development](./cases/spec-drive/)

A methodology for managing multi-platform app development with structured specs. AI agents parse specs, lock tasks, execute code changes, and update status — turning PRDs into merge requests.

**Stack:** Markdown specs + OpenClaw skills + Git worktrees + tmux

## Philosophy

- **Document working systems**, not hypothetical architectures
- **Show the config**, not just the concept
- **Include the failures** — what didn't work and why
- **Keep it practical** — readers should be able to adapt these patterns

## Who is this for

- Engineers building AI-assisted development workflows
- Teams exploring autonomous coding agents
- Anyone curious about what "AI engineering" looks like in practice

## License

[MIT](./LICENSE)
