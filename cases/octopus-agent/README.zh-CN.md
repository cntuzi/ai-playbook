# 章鱼哥 (Octopus Agent)

一个自主 iOS 研发 agent，通过飞书接收任务，将编码工作派发给 AI agent，自动创建 MR 并推送进度 —— 全流程自动化。

## 它做什么

```
开发者在飞书发送任务
    → 章鱼哥 3 秒内确认
    → 创建 git worktree + tmux session
    → 派发给 Codex（编码）或 Claude Code（review/文档）
    → 监控进度，发送 thread 更新
    → 完成后：commit → push → 创建 MR → 通知 → 清理
```

开发者只需要 **发任务** 和 **review MR**。

## 架构

```
┌─────────────────────────────────────────────────────┐
│                       飞书                           │
│              WebSocket + REST API                    │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│              OpenClaw Gateway                        │
│  - WebSocket 接收消息                                │
│  - 按用户隔离 session（dmScope）                     │
│  - 消息队列（collect 模式，3 秒去重）                 │
│  - 路由：feishu/octopus → octopus agent              │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│           Octopus Agent Session                      │
│  - 模型：Claude Sonnet 4                             │
│  - 角色：路由器（15 秒内派发，不自己执行）             │
│  - 工具：bash, message, read, exec                   │
└────────┬─────────────────────────┬──────────────────┘
         │                         │
      代码任务                  非代码任务
         │                         │
┌────────▼────────┐     ┌─────────▼─────────┐
│  start-codex.sh │     │   Claude Code CLI  │
│  （一条命令搞定） │     │   （tmux session）  │
└────────┬────────┘     └───────────────────┘
         │
         ├── wt.sh（git worktree）
         ├── tmux session: moox-t{nn}
         │     ├── pane 0: Codex CLI
         │     └── pane 1: monitor-codex.sh
         │
         └── 完成后：
              └── post-codex.sh
                   ├── git commit（🐙 前缀）
                   ├── git push
                   ├── GitLab MR（API 创建）
                   ├── 飞书通知
                   └── 清理 worktree + tmux
```

## 关键设计决策

### 1. Agent 是路由器，不是执行者

章鱼哥 **不读代码、不分析 spec、不写代码**。它只做任务分类（代码 vs 非代码）并派发给对应工具。重活在 Codex/Claude Code 的 prompt 里完成。

**为什么：** 每个 agent turn 会阻塞消息队列。一个 turn 跑 60 秒，下一条消息就等 60 秒。把 turn 控制在 15 秒内，才能保持响应速度。

### 2. 按用户隔离 Session

```jsonc
{
  "session": {
    "dmScope": "per-channel-peer"  // 每个用户独立 session
  }
}
```

不加这个，所有私聊共享一个 session —— A 的上下文泄露给 B，回复发错人。加了 `per-channel-peer`，每个「用户+通道」组合有独立的 session、对话历史和投递目标。

### 3. 通知目标锁定

每个任务在派发时把 `.feishu-target` 文件写入 worktree。后续所有通知（进度、完成、MR 链接）都从这个文件读 —— 绝不查 session 存储。

**为什么：** 并发场景下，查 session 存储拿到的是「最近活跃的用户」。如果用户 B 刚发了消息，用户 A 的任务通知就发给 B 了。在派发时锁定目标，杜绝串线。

### 4. 一个任务一个 Worktree

每个编码任务有自己的 git worktree、tmux session 和 Codex 实例。任务之间完全隔离 —— 没有共享状态，执行期间不会有合并冲突。

```
章鱼哥（调度者）
  ├── moox-t01   → Codex 在 worktree A
  ├── moox-t03   → Codex 在 worktree B
  ├── claude-review → Claude Code
  └── claude-docs   → Claude Code
```

### 5. macOS 上的文件锁

共享资源（Codex 配置、主仓库的 git 操作）使用 `mkdir` 做锁，而不是 `flock`（macOS 上没有）。锁就是一个目录 —— `mkdir` 在所有 Unix 系统上都是原子操作。

## 配置

### OpenClaw Agent 定义

```jsonc
// openclaw.json → agents.list[]
{
  "id": "octopus",
  "name": "octopus",
  "workspace": "~/.openclaw/workspace-octopus",
  "model": "anthropic/claude-sonnet-4-20250514",
  "identity": {
    "name": "章鱼哥",
    "emoji": "🐙"
  }
}
```

### 通道绑定

```jsonc
// 飞书 octopus 应用的所有消息 → octopus agent
{
  "type": "route",
  "agentId": "octopus",
  "match": {
    "channel": "feishu",
    "accountId": "octopus"
  }
}
```

### 并发设置

```jsonc
{
  "session": {
    "dmScope": "per-channel-peer"
  },
  "messages": {
    "queue": {
      "mode": "collect",
      "debounceMs": 3000
    }
  }
}
```

## 工作区结构

```
workspace-octopus/
├── IDENTITY.md        # 名称、角色、emoji
├── SOUL.md            # 核心价值观和人格
├── USER.md            # 用户画像和偏好
├── AGENTS.md          # 启动流程、内存管理
├── TOOLS.md           # 执行规范、派发流程、红线
├── MEMORY.md          # 学习记录和进化日志
├── scripts/
│   ├── start-codex.sh     # 一键任务启动器
│   ├── monitor-codex.sh   # 进度跟踪 + 飞书通知
│   ├── post-codex.sh      # commit + push + MR + 清理
│   ├── feishu-notify.sh   # 飞书消息发送（支持 thread）
│   └── feishu.conf        # 共享飞书 API 配置
└── memory/
    └── *.md               # 日志和项目知识
```

## 角色分工

| 角色 | 职责 | 执行环境 |
|------|------|---------|
| 章鱼哥 | 派发、分类、通知、监控 | OpenClaw agent session |
| Codex CLI | 写代码（功能开发、Bug 修复、重构）| Worktree + tmux |
| Claude Code CLI | 非代码任务（review、文档、git、分析）| tmux |

**分类规则：** 涉及源代码文件 → Codex。其他一切 → Claude Code。

## 任务生命周期

### 1. 派发（< 15 秒）

```
收到消息 → 提取 sender_id
→ 发确认「🐙 开始执行 T{nn}...」
→ 写 prompt 文件到 /tmp/
→ 调用 start-codex.sh（后台模式）
→ thread 回复「🔧 已派发给 Codex」
→ turn 结束
```

### 2. 执行（自动）

`start-codex.sh` 自动处理一切：
1. 通过 `wt.sh` 创建 worktree
2. 写入 `.feishu-target`（锁定通知目标）
3. 将 worktree 加入 Codex trust 配置（带文件锁）
4. 创建 tmux session，启动 Codex + monitor

### 3. 监控（自动）

`monitor-codex.sh` 运行在 tmux pane 1：
- 启动时从 `.feishu-target` 锁定飞书目标
- 每 10 秒检测 Codex 状态
- 每 5 分钟发送进度快照
- 检测完成（BUILD SUCCEEDED/FAILED）

### 4. 后处理（自动）

`post-codex.sh` 在完成时运行：
1. `git add + commit`（🐙 前缀）
2. `git push` 到特性分支
3. 通过 GitLab API 创建 MR
4. 飞书通知（含 MR 链接）
5. 清理 tmux session + worktree（带文件锁）

## 踩坑记录

### 有效的做法

- **基于 Thread 的进度追踪** —— 每个任务一个飞书 thread，所有更新集中在一起
- **Worktree 隔离** —— 没有合并冲突，并行任务互不干扰
- **Agent 做路由器** —— 快速派发是保持响应的关键
- **🐙 commit 前缀** —— 在 git log 里一眼识别 AI 生成的提交

### 踩过的坑

- **Agent 在派发前分析 spec** —— 每个 turn 30-60 秒，阻塞消息队列
- **所有用户共享一个 session** —— 并发时回复发错人
- **macOS 上用 `flock`** —— 根本不存在，`set -e` 下静默失败
- **动态查询飞书目标** —— 并发场景下竞态条件，最后活跃的用户「赢了」

### 如果重来

- 从第一天就锁定通知目标（不要事后补）
- 一开始就用 `per-channel-peer` session 隔离（不要用默认的 `main`）
- 所有重活放在下游 agent prompt 里，调度器永远不做

## 前置要求

- macOS（使用 Keychain 存储密钥）
- [OpenClaw](https://github.com/nicepkg/openclaw) gateway
- Codex CLI 或 Claude Code CLI
- tmux
- Python 3（脚本中的 JSON 处理）
- 飞书机器人应用
- GitLab 实例（用于创建 MR）
