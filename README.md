# AI Playbook

[English](#english) | [中文](#中文)

---

<a id="english"></a>

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

---

<a id="中文"></a>

## 中文

真实的 AI 工程实践 —— 不是理论，是跑在生产环境的系统。

这个仓库记录了我构建 AI 驱动开发工作流的实践：自主编码 agent、spec 驱动开发、自动化报告等。每个案例都是完整的、经过实战验证的系统。

## 案例

### [章鱼哥 (Octopus Agent)](./cases/octopus-agent/)

基于 [OpenClaw](https://github.com/nicepkg/openclaw) 的自主 iOS 研发 agent。通过飞书接收任务，派发给 Codex/Claude Code 执行，自动创建 MR 并推送进度通知。

**技术栈：** OpenClaw + Claude Sonnet + Codex CLI + 飞书 + GitLab

### [Spec 驱动开发](./cases/spec-drive/)

一套管理多端应用开发的方法论。用结构化 spec 管理任务，AI agent 解析 spec、锁定任务、执行代码变更、更新状态 —— 把 PRD 变成 MR。

**技术栈：** Markdown specs + OpenClaw skills + Git worktrees + tmux

## 理念

- **记录真实运行的系统**，不是假想的架构
- **展示配置**，不只是概念
- **包含失败经验** —— 什么没用，为什么
- **保持实用** —— 读者能直接借鉴这些模式

## 适合谁

- 在搭建 AI 辅助开发工作流的工程师
- 在探索自主编码 agent 的团队
- 对「AI 工程化」长什么样感到好奇的人

## License

[MIT](./LICENSE)
