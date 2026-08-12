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

### [Building a Data Analyst](./cases/data-analyst/) (Chinese only)

Three generations of an AI data-analysis assistant, and why the first two produced confident wrong numbers. The fix wasn't a better prompt — it was an event registry, a single-source-of-truth metric layer, and three automated gates. Includes a 7-step build tutorial and a field guide to 14 real data pitfalls.

**Stack:** Apache Doris + Python + Claude Code subagent + metric SSOT

### [Fix Pipeline](./cases/fix-pipeline/)

A queue-driven closed loop for putting a batch of bugs through multiple agents. A coding agent can usually write the fix; what it cannot do is tell you whether the fix is real. So every fix passes through a *different* read-only agent for cross-verification and a human acceptance gate before it counts. Includes the full agent manual and an honest account of what running it cost — three rounds on one bug, both reworks caused by bad inputs rather than bad fixing.

**Stack:** Orca orchestration + Claude + Codex + git worktrees + issue tracker

### [owt — One Skill, Three Agents](./cases/owt/)

A skill that turns one sentence into an Orca child worktree with a coding agent already running inside it. The interesting half is distribution: Claude Code, Codex CLI, and omp each read a different skills directory, so one real directory plus two symlinks serves all three — no divergent copies. Includes why "the agent says it's done" is not a reason to reclaim its workspace, and a trap list that each entry cost a broken workspace to learn.

**Stack:** Orca CLI + Agent Skills (`SKILL.md`) + Claude Code / Codex CLI / omp

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

### [构建一个数据分析师](./cases/data-analyst/)

AI 数据分析助手的三代演进，以及前两代为什么会输出「很有说服力的错数字」。解法不是更好的 prompt —— 是埋点注册表、指标唯一实现层和三道自检闸。含七步构建教程和 14 个真实数据口径陷阱手册。

**技术栈：** Apache Doris + Python + Claude Code subagent + 指标 SSOT

### [问题修复流水线](./cases/fix-pipeline/)

把一批 bug 交给多个 agent 跑成队列驱动的闭环。编码 agent 通常写得出那个修复，它做不到的是告诉你这个修复是不是真的 —— 所以每个修复都必须过一个**不同的**只读 agent 做独立复验，再由人验收才算数。含完整的 agent 手册，以及一份诚实的账：一个 bug 跑了三轮，两次返工都不是修得不好，是我给的输入不对。

**技术栈：** Orca orchestration + Claude + Codex + git worktree + 问题看板

### [owt —— 一份 skill，三个 agent](./cases/owt/)

一句话变成一个 Orca 子工作空间，里面的 coding agent 已经开跑了。更有意思的是分发那一半：Claude Code、Codex CLI、omp 各读各的 skills 目录，所以一个真实目录 + 两条软链就能同时服务三个 agent，不留互相漂移的副本。含「agent 说干完了」为什么不足以回收它的空间，以及一份每条都赔过一个工作空间的坑表。

**技术栈：** Orca CLI + Agent Skills (`SKILL.md`) + Claude Code / Codex CLI / omp

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
