# Lark Agent Bridge

[English](./README.md) | [中文](./README.zh-CN.md)

一个轻量级桥接工具：把**飞书 / Lark 机器人消息**连接到**本地 tmux 中已经运行的 AI Agent 会话**。

本案例包含可运行实现：[`skill/`](./skill/)

## 为什么要做这个

章鱼哥展示的是完整生产流水线：聊天消息 → 调度器 → 隔离 worktree →
编码 worker → commit/MR/通知。

但很多开发时刻不需要这么重。实际工作中，我经常已经开着多个 Codex 会话：

```
pm          产品 / 规划 agent
ai-native   研究 / 架构 agent
web-dev     实现 agent
qa          验证 agent
```

这时缺的不是另一个编排框架，而是一个小型本地控制面：

```
聊天消息 → 选择机器人 profile → 路由到正确的 tmux pane
        → agent 在已有会话中处理
        → 进度 / 结果回到原聊天
```

`lark-agent-bridge` 做的就是这件事。

## 核心洞察：复用正在运行的 Agent 会话

很多聊天到 Agent 的桥接方案会为每条消息启动一个新进程。这样很干净，但会丢掉活动终端会话里最有价值的东西：

- 当前仓库状态
- 已经加载过的上下文
- 长线程推理状态
- 可见的执行进度
- 人可以随时检查或打断

这个 bridge 把 tmux pane 当成持久的 Agent runtime。

```
┌──────────────────────┐
│  飞书 / Lark 机器人   │
└──────────┬───────────┘
           │ 消息事件
┌──────────▼───────────┐
│  Bridge Worker        │
│  lark-cli + Node.js   │
└──────────┬───────────┘
           │ paste + submit
┌──────────▼───────────┐
│  tmux pane            │
│  Codex / Claude Code  │
└──────────┬───────────┘
           │ feedback 命令
┌──────────▼───────────┐
│  原聊天 thread        │
└──────────────────────┘
```

Bridge 不扮演 Agent。它只负责路由消息、观察可见进度，并提供安全的反馈通道。

## Agent 管理台

skill 内置本地管理页：

```bash
node skill/scripts/manager.mjs --host 127.0.0.1 --port 17654
```

它提供：

- 从本地 `lark-cli` profiles 选择机器人
- 选择 tmux pane，并显示可读的 window 名称
- 多个 Agent 同时活跃
- 脱敏后的 Agent 工作内容预览
- 每个 Agent 独立启动、重启、停止
- 低频运行信息收敛到详情弹窗

页面定位是 **Agent 管理平台**，不是飞书后台。外部平台名只保留在 setup、日志和代码路径里；操作者 UI 使用 Agent 语义。

## 进度与结果回传

收到消息后，bridge 会注入一段指令，告诉 Agent 如何回传：

```bash
node skill/scripts/feedback.mjs \
  --profile <profile-name> \
  --message-id <message-id> \
  --kind progress \
  --text "处理进度"

node skill/scripts/feedback.mjs \
  --profile <profile-name> \
  --message-id <message-id> \
  --kind result \
  --text "最终结果"
```

worker 也会观察目标 pane，把明显的可见进度回到原消息。这个机制故意保守：

- 脱敏常见密钥和长 ID
- 过滤 prompt、ID、命令和终端状态行
- 不把进度当成最终结果
- 最终结果必须显式用 `--kind result` 发送

## 这些坑塑造了设计

| 问题 | 根因 | 修复 |
|------|------|------|
| 消息进了 Codex 输入框但没执行 | TUI 还在处理 bracketed paste 时就发送了提交键 | 先 paste，短暂等待，再提交 |
| 长连接进程还在但收不到消息 | 事件流经过本地网络 / 代理后变 stale | 定期轮换事件连接，并自动重启 worker |
| 启动一个机器人会停掉其他机器人 | 早期 manager 把 bridge 当单例 | 只重启当前 profile |
| 操作者看不到 Agent 在做什么 | 只有日志，没有 pane 预览 | 增加脱敏后的工作内容预览 |
| 页面暴露太多实现细节 | profile、ID、命令过于突出 | 详情收敛到弹窗，并脱敏 ID |

## 什么时候用它，什么时候用章鱼哥

适合用 **Lark Agent Bridge** 的场景：

- 你已经在 tmux 里运行 Codex / Claude Code
- 你想把聊天消息路由到已有会话
- 你需要多个命名的本地 Agent
- 你需要本地控制面，不需要完整 MR 流水线

适合用 **章鱼哥** 的场景：

- 每个任务都应该创建隔离 worktree
- 系统要自动 commit、push、创建 MR
- 需要任务锁、依赖检查和后处理流水线
- 你需要生产级调度器，而不是操作者控制台

## 前置要求

- Node.js 20 或更新版本
- tmux
- `lark-cli`
- 具备接收消息事件和回复权限的飞书 / Lark 机器人应用
- Codex CLI 或其他终端型 Agent 会话

配置方式见 [`skill/references/setup.md`](./skill/references/setup.md)。

## 安全规则

不要发布 runtime state、日志、chat ID、message ID、user ID、app ID、token、app secret 或终端 transcript。

内置 manager 和脚本会脱敏常见敏感值，但脱敏只是最后一道防线。发布或分享前仍然要人工检查输出。
