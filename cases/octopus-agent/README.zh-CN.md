# 章鱼哥 (Octopus Agent)

[English](./README.md) | [中文](./README.zh-CN.md)

一个自主研发 agent，连接**结构化 spec** 和 **AI 编码 agent** —— 从任务描述到 MR，中间不需要人介入。

基于 [OpenClaw](https://github.com/nicepkg/openclaw) 网关 + [Spec Orchestrator](https://github.com/cntuzi/spec-orchestrator) 方法论构建。

## 为什么要做这个

AI 能写代码。但「写代码」只是漫长链条中的一步：

```
理解需求 → 找到正确的文件 → 读 API 契约
→ 写代码 → 构建 → 测试 → 提交 → 推送 → 创建 MR → 通知 → 清理
```

如果每一步都要人来触发，你只是把打字换成了发 prompt —— 瓶颈没变，只是换了个键盘。

章鱼哥的目标：**把人从链条中间移除**。人只负责两端：定义要做什么（通过 spec）和审查结果（通过 MR）。

## 核心洞察：三层分离

系统基于 [Spec Orchestrator](https://github.com/cntuzi/spec-orchestrator) 的三层模型构建：

```
┌─────────────────────────────────────────────┐
│  Spec 层 — 做什么                            │
│  Feature YAML + 任务看板 + API 契约          │
│  (spec-orchestrator)                        │
└──────────────────┬──────────────────────────┘
                   │ 读取
┌──────────────────▼──────────────────────────┐
│  Agent 层 — 怎么做                           │
│  平台规范 + 编码规则                          │
│  (agents/ios/ai/*.md, CLAUDE.md)            │
└──────────────────┬──────────────────────────┘
                   │ 执行
┌──────────────────▼──────────────────────────┐
│  Worker 层 — 运行时执行                      │
│  Codex/Claude Code 在隔离的 worktree 中运行  │
│  (每个任务一个实例，完全自主)                  │
└─────────────────────────────────────────────┘
```

**Spec** 定义需求、依赖、验收标准 —— 人和 AI 共享，跨平台通用。

**Agent** 定义平台规范 —— iOS 用 Swift/UIKit 的模式，Android 用 Kotlin/Compose 的模式。放在平台仓库里。

**Worker** 是运行时实例，结合两者：读 Spec 获取上下文，遵循 Agent 规范执行。每个 Worker 在独立的 git worktree 中运行。

### 章鱼哥在哪一层？

章鱼哥是**编排层**，在运行时连接这三层：

```
                    ┌─────────────┐
                    │     人      │
                    │  "执行 T20"  │
                    └──────┬──────┘
                           │ 飞书消息
                    ┌──────▼──────┐
                    │   章鱼哥     │ ← 编排器
                    │  (OpenClaw) │
                    └──┬───┬───┬──┘
                       │   │   │
              ┌────────┘   │   └────────┐
              │            │            │
        ┌─────▼─────┐ ┌───▼───┐ ┌─────▼─────┐
        │ 读取 Spec  │ │ 锁定  │ │  派发     │
        │ 检查依赖   │ │ 任务  │ │  Worker   │
        └───────────┘ └───────┘ └───────────┘
                                      │
                               ┌──────▼──────┐
                               │   Worker    │
                               │ (Codex 在   │
                               │  worktree)  │
                               └──────┬──────┘
                                      │
                               ┌──────▼──────┐
                               │  自动化后处理 │
                               │ commit/push │
                               │  MR/通知     │
                               └─────────────┘
```

章鱼哥**不写代码**。它读 spec、检查依赖、锁定任务、派发 worker、处理后续流水线。这个分离是关键。

## 架构：为什么用 OpenClaw

章鱼哥可以是一个简单脚本。为什么要用 OpenClaw 做网关？

### 问题：聊天到流水线的桥梁

开发者用聊天工具（飞书/Slack/Discord）沟通。AI 编码工具在终端运行。中间需要有人搭桥 —— 接收聊天消息、理解意图、启动正确的工具、汇报结果。

### 方案：OpenClaw 作为消息路由

```
┌─────────────────────────────────────────────────────┐
│                       飞书                           │
│              WebSocket（持久连接）                    │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│              OpenClaw Gateway                        │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │ Session 管理                                 │    │
│  │ • per-channel-peer 隔离                      │    │
│  │ • 每个用户独立对话历史                         │    │
│  │ • 模型 + 工具 + 工作区绑定                     │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │ 消息队列                                     │    │
│  │ • collect 模式：批量合并快速连发的消息          │    │
│  │ • session 内 FIFO：保证顺序                   │    │
│  │ • 跨 session 并行：最多 maxConcurrent=4       │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │ Agent 运行时                                  │    │
│  │ • LLM 驱动的意图分类                          │    │
│  │ • 工具执行（bash, message, 文件 I/O）         │    │
│  │ • 技能系统（spec-drive, coding-agent）        │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

OpenClaw 提供：
1. **持久连接** —— WebSocket 连飞书，始终在线
2. **Session 隔离** —— 每个用户独立的对话状态
3. **LLM 做路由** —— agent 理解自然语言意图，不需要死板的命令解析
4. **工具编排** —— bash、文件操作、消息发送，全由 LLM 协调
5. **技能系统** —— 模块化能力（spec-drive, coding-agent），按需加载

## 调度器模式

最重要的设计决策：**章鱼哥是调度器，不是执行者。**

### 反模式（我们最初的做法）

```
用户: "执行 T20"
Agent turn:
  1. 读 spec YAML (5s)
  2. 读 PRD 段落 (3s)
  3. 读 API 文档 (3s)
  4. 读 Figma 引用 (2s)
  5. 分析实现方案 (10s)
  6. 创建 worktree (3s)
  7. 写 Codex prompt (2s)
  8. 启动 Codex (2s)
  9. 发确认消息 (1s)
合计: ~30 秒阻塞消息队列
```

这 30 秒内，session 中的其他消息都在排队。发两个任务？第二个等半分钟。

### 正确模式

```
用户: "执行 T20"
Agent turn:
  1. 发确认消息 (1s)
  2. 写 prompt 文件，包含 spec 路径 (2s)
  3. 后台调用 start-codex.sh (1s)
  4. 发「已派发」回复 (1s)
合计: ~5 秒，session 释放

与此同时，在后台：
  start-codex.sh → worktree → tmux → Codex 自己读 spec
```

核心洞察：**把所有重活放进 worker prompt**。调度器不读 spec —— 它告诉 worker spec 在哪。Worker (Codex) 在自己的上下文里读，用自己的时间预算。

## 并发模型

### 跨用户：Session 隔离

```jsonc
{ "session": { "dmScope": "per-channel-peer" } }
```

```
用户 A → session:octopus:feishu:direct:A ──┐
用户 B → session:octopus:feishu:direct:B ──┼── 并行（最多 4 个）
群聊 X → session:octopus:feishu:group:X ──┘
```

每个 session 有独立的对话历史、投递目标和处理队列。不会串。

### 同用户：快速 Turn + 队列

同一用户发两个任务 → 同一个 session → 顺序处理。但调度只需 ~5 秒/turn，第二个任务几乎立刻开始。

`collect` 模式 + 3 秒去重：快速连发的消息被合并成一个 turn —— agent 同时看到两个任务，并行派发。

### 通知目标锁定

最难的并发 bug：**通知发给谁？**

```
问题：
  用户 A 发任务 → agent 派发 → monitor 启动
  用户 B 发任务 → 变成「最近活跃」session
  用户 A 的 monitor 查询「当前目标」→ 拿到用户 B
  用户 A 的完成通知 → 发给了用户 B ✗

解法：
  派发时写 .feishu-target 到 worktree（创建后不可变）
  Monitor 启动时读 .feishu-target → 永久锁定目标
  不做运行时查询 → 没有竞态条件
```

这是一个通用模式：**在派发时锁定上下文，不要在并发 worker 中动态解析状态。**

## Spec Orchestrator 如何连接章鱼哥

```
spec-orchestrator/                    章鱼哥 Agent
├── features/F02.yaml   ──────────>  读任务 ID → 找到功能定义
├── tasks/ios.md        ──────────>  检查状态（🔴=就绪, 🟡=已锁定）
├── config.yaml         ──────────>  检查依赖 + API 就绪状态
└── workflows/          ──────────>  遵循 spec-protocol 阶段
        │
        │  派发到
        ▼
平台仓库（worktree）
├── ai/ios.md           ──────────>  Worker 读平台规范
├── specs/ → symlink    ──────────>  Worker 读 Feature YAML
└── src/                ──────────>  Worker 在这里写代码
```

Spec Orchestrator 提供：
- **Feature YAML** —— 需求、API 契约、状态矩阵、i18n、埋点
- **任务看板** —— emoji 状态标记（🔴🟡🟢）
- **依赖图** —— 哪些任务阻塞哪些，API 就绪标记
- **执行协议** —— Worker 的 7 步循环（Check → Collect → Code → Build → ...）

章鱼哥读这套结构，派发遵循它的 worker。

### 自动化后处理

Codex 写完代码后，流水线继续运行，无需人介入：

```
Codex 完成
  → monitor 检测到 "done" 状态
  → post-codex.sh 运行：
      1. git commit（🐙 前缀）
      2. git push 到特性分支
      3. GitLab API 创建 MR
      4. 飞书通知（含 MR 链接）
      5. 清理：停 tmux，删 worktree
  → 任务状态更新：🟡 → 🟢
```

🐙 commit 前缀的实际用途：`git log --oneline | grep 🐙` 一眼看出所有 AI 生成的提交。

## 踩坑记录

### 做对了什么

| 决策 | 为什么重要 |
|------|-----------|
| 调度器模式 | 保持消息队列响应；第二个任务不用等 60 秒 |
| Spec 做契约 | AI 读结构化 YAML，不是模糊的聊天消息 —— 行为可预测 |
| Worktree 隔离 | 完全隔离；并行任务互不干扰 |
| Thread 进度追踪 | 一个任务的所有更新在一个飞书 thread 里 —— 好跟踪 |

### 做错了什么（以及修复）

| 错误 | 根因 | 修复 |
|------|------|------|
| 所有用户共享一个 session | 默认 `dmScope: "main"` | 改为 `per-channel-peer` |
| 通知发错人 | 并发模式下动态解析目标 | 派发时用 `.feishu-target` 锁定 |
| `flock` 在 macOS 上崩 | Linux 假设；`set -e` 让错误变成致命 | 改用 `mkdir` 做锁 |
| Agent 花 60 秒读 spec | 调度器干了执行者的活 | 所有 spec 读取移到 worker prompt |

### 设计原则（适用于这个项目之外）

1. **分离编排和执行** —— 路由工作的东西不应该做工作
2. **在派发时锁定上下文** —— 并发系统中，不要在 worker 里动态解析状态
3. **让契约显式化** —— 结构化 spec > 自然语言需求
4. **默认隔离** —— 独立 session、独立 worktree、独立通知目标

## 前置要求

- macOS
- [OpenClaw](https://github.com/nicepkg/openclaw) 网关
- [Spec Orchestrator](https://github.com/cntuzi/spec-orchestrator)（spec 结构）
- Codex CLI 或 Claude Code CLI
- tmux, Git, Python 3
- 飞书机器人应用 + GitLab 实例
