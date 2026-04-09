# Spec 驱动开发

一套管理多端应用开发的方法论。用结构化 spec 管理任务，AI agent 解析 spec、锁定任务、执行代码变更、更新状态 —— 把 PRD 变成 MR。

## 痛点

用 AI 编码 agent 做多端应用（iOS + Android + 后端），协调起来很混乱：
- 哪些任务可以开始？哪些被后端 API 阻塞了？
- 谁在做什么？T07 完了没有？
- PRD 在哪？Figma 在哪？API 文档在哪？
- AI agent 是按 spec 实现的，还是自己幻觉了一个方案？

## 解法：Spec 即唯一真相

```
specs/
├── moox/
│   ├── 1.4/                          # 版本目录
│   │   ├── features/
│   │   │   ├── F01-chat.yaml         # 功能定义
│   │   │   ├── F02-profile.yaml
│   │   │   └── ...
│   │   ├── tasks/
│   │   │   ├── ios.md                # iOS 任务看板（🔴🟡🟢）
│   │   │   ├── android.md
│   │   │   └── backend.md
│   │   ├── prd/                      # 产品需求文档
│   │   ├── design/                   # Figma 索引
│   │   └── CHANGELOG.md
│   └── api/                          # API 文档
├── workflows/
│   └── spec-protocol.md              # 工作流协议
└── AI-CONTEXT.md                     # 项目速查
```

### 任务状态

```
🔴 未开始
🟡 进行中（被 agent 锁定）
🟢 已完成（MR 已合并）
```

### 功能 YAML

```yaml
id: F02
name: 个人资料编辑
status: in-progress
tasks:
  - id: T20
    name: 简介3行折叠展开
    platforms: [ios]
    depends_on: []
    api_ready: true
    priority: high
```

## 工作流协议

```
1. Parse    → 读取功能 YAML + 任务定义
2. Check    → 验证 API 就绪 + 依赖任务完成
3. Lock     → 更新任务状态 🔴→🟡，commit 锁定
4. Collect  → 收集 PRD + API 文档 + 设计上下文
5. Execute  → 派发给 Codex/Claude Code
6. Verify   → 检查构建结果
7. Update   → Push + MR + 更新状态 🟡→🟢
```

### 谁做什么

| 步骤 | 执行者 | 动作 |
|------|--------|------|
| Parse, Check, Lock | 章鱼哥 agent | 读 YAML、验证依赖、commit 状态变更 |
| Collect, Execute | Codex（在 worktree 内）| 读 spec、写代码、构建 |
| Verify, Update | post-codex.sh | Push、创建 MR、更新状态 |

Spec 协议给 AI agent 提供了**结构化上下文**，而不是模糊的指令。「实现 T20」变成了可追溯的全链路流水线。

## 与章鱼哥的集成

[章鱼哥](../octopus-agent/) 将 spec-drive 作为技能使用：

```
用户：「执行 T20」
  → 章鱼哥从 specs 解析任务 ID
  → 检查后端 API 是否就绪
  → 锁定任务（🔴→🟡），git commit
  → 写 Codex prompt（带 spec 引用）
  → 通过 start-codex.sh 派发
  → 完成后：push + MR + 更新状态（🟡→🟢）
```

## 核心原则

### 1. Spec 用 Git 管理

每次状态变更都是一个 git commit。你可以 `git blame` 看到任务何时被锁定、被谁锁定，追溯完整历史。

```
🐙 lock: T20 进行中
🐙 feat(T20): 个人中心简介3行折叠展开收起
🐙 done: T20 完成，MR !11
```

### 2. 任务有明确的依赖关系

```yaml
- id: T07
  depends_on: [T03]      # T03 完成前不能开始
  api_ready: false        # 后端 API 还没部署
```

Agent 在开始前会检查这些。不会在被阻塞的任务上浪费时间。

### 3. 一个任务，一个 Worktree，一个 MR

每个任务从一个独立的 worktree 产出恰好一个 MR。不混改动，不搞「这个 MR 顺便修了 T08」。

### 4. AI 和人读同一份 Spec

Specs 目录被 symlink 到每个 worktree。Codex 读的 PRD、API 文档、设计参考，和人类开发者看的完全一样。

## 踩坑记录

- **YAML > 纯文本** 定义任务 —— 结构化数据 agent 才能解析
- **状态在 Git > 状态在 Jira** —— 唯一真相源，不需要同步
- **先锁再执行** —— 防止两个 agent 同时做同一个任务
- **API 就绪检查省时间** —— 被阻塞的任务快速失败，不产出废代码

## 快速开始

1. 在项目中创建 `specs/` 目录
2. 用 YAML 文件定义功能和任务列表
3. 在任务看板中使用状态标记（🔴🟡🟢）
4. 把 AI agent 指向 specs 目录
5. 实现 Parse → Check → Lock → Execute → Update 协议
