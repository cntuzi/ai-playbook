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

### [Lark Agent Bridge](./cases/lark-agent-bridge/)

A lightweight local bridge that routes Feishu/Lark bot messages into existing Codex/Claude Code sessions running in tmux, with an Agent management page and progress/result feedback.

**Stack:** Node.js + lark-cli + tmux + Codex CLI + Feishu/Lark

### [Spec-Driven Development](./cases/spec-drive/)

A methodology for managing multi-platform app development with structured specs. AI agents parse specs, lock tasks, execute code changes, and update status — turning PRDs into merge requests.

**Stack:** Markdown specs + OpenClaw skills + Git worktrees + tmux

### [Fix Pipeline](./cases/fix-pipeline/)

A queue-driven multi-agent loop for batch bug fixing. Every fix is verified by a *different*
agent than the one that wrote it, then accepted by a human on a Kanban board — three proofs
before anything closes. Includes the rejected-alternatives table and the assumptions still
unverified.

**Stack:** Orca orchestration + any TUI coding agent (Claude Code / Codex / omp / Gemini) + Linear

### [Skill Architecture](./cases/skill-architecture/)

Five principles distilled from eight hand-written agent skills — derived after the fact from
artifacts written months apart, not from a style guide. Three of them were independently
rediscovered in unrelated skills.

**Stack:** Agent skills (SKILL.md + scripts)

## Tips

Small, self-contained tricks — see [tips/](./tips/) (Chinese only).

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

### [Lark Agent Bridge](./cases/lark-agent-bridge/)

一个轻量级本地桥接工具，把飞书 / Lark 机器人消息路由到 tmux 中已有的 Codex/Claude Code 会话，并提供 Agent 管理页、进度回传和结果回传。

**技术栈：** Node.js + lark-cli + tmux + Codex CLI + 飞书 / Lark

### [Spec 驱动开发](./cases/spec-drive/)

一套管理多端应用开发的方法论。用结构化 spec 管理任务，AI agent 解析 spec、锁定任务、执行代码变更、更新状态 —— 把 PRD 变成 MR。

**技术栈：** Markdown specs + OpenClaw skills + Git worktrees + tmux

### [Fix Pipeline —— 队列驱动的多 Agent 修复闭环](./cases/fix-pipeline/README.zh-CN.md)

批量修问题的闭环。每个修复都由**另一个** agent 复验（不是写它的那个），再由人在看板上验收 ——
关单之前要挣三次「完成」。含**已否决方案及理由**表和仍未验证的假设。

**技术栈：** Orca orchestration + 任意 TUI 编码 agent（Claude Code / Codex / omp / Gemini）+ Linear

### [Skill 架构 —— 五条原则](./cases/skill-architecture/README.zh-CN.md)

从八个手写 agent skill 里抽出的五条原则 —— 事后从产物里抽的，不是先立规范。其中三条是在毫无
关系的 skill 里被独立重复发现的。

**技术栈：** Agent skills（SKILL.md + scripts）

## 小技巧

独立的小技巧记录，不成体系但实用：

- [macOS 脚本自动连接带 TOTP 动态码的 VPN](./tips/macos-vpn-totp-autoconnect.md) —— 动态码本地计算 + 钥匙串 partition ID 坑

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
