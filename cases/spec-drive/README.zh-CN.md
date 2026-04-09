# Spec 驱动开发

[English](./README.md) | [中文](./README.zh-CN.md)

一套弥合产品需求和 AI 生成代码之间鸿沟的方法论 —— 用结构化规格说明作为人与机器之间的契约。

开源实现：**[spec-orchestrator](https://github.com/cntuzi/spec-orchestrator)**

## 核心问题

AI 编码工具有一个上下文问题：

```
人类开发者读：PRD + Figma + API 文档 + 代码库 + 团队规范 + 历史决策
AI 编码工具读：你的一行 prompt
```

结果：AI 写的代码能编译，但不符合设计、用错了 API 字段、忽略了边界情况、违反了团队规范。你花在纠正上的时间比省下的还多。

通常的做法 —— 把所有东西塞进 prompt —— 无法规模化。20 个功能、3 个平台，为每个任务手动组装上下文就是新的瓶颈。

## 洞察：Spec 作为机器可读的契约

缺失的一层是**结构化规格说明**，位于 PRD 和代码之间：

```
PRD（自然语言，给人看的）
    ↓
Feature Spec（结构化 YAML，人和 AI 都能读）    ← 这是关键
    ↓
代码（给编译器的）
```

PRD 说：「用户可以编辑个人简介，默认显示 3 行折叠视图，点击展开。」

Feature Spec 说：

```yaml
id: F02
name: 个人资料编辑
tasks:
  - id: T20
    name: 简介折叠展开
    platforms: [ios]
    depends_on: []
    api_ready: true

requirements:
  - id: R01
    desc: 简介文本折叠时最多显示 3 行
  - id: R02
    desc: 点击「更多」展开全文
  - id: R03
    desc: 点击「收起」回到 3 行视图

api:
  - endpoint: GET /api/user/profile
    response: { bio: string, bio_length: int }

state_matrix:
  - { state: 空简介, trigger: 未设置简介, expected: "显示占位文字" }
  - { state: 短简介, trigger: "简介 < 3 行", expected: "显示全文，无展开按钮" }
  - { state: 长简介, trigger: "简介 >= 3 行", expected: "截断 + '更多'按钮" }

acceptance_criteria:
  - id: AC01
    type: ui
    desc: 折叠状态精确显示 3 行带省略号
  - id: AC02
    type: interaction
    desc: 展开/折叠动画 < 300ms 完成
```

现在 AI 有了：精确的需求、API 响应结构、所有边界情况、可量化的验收标准。不需要猜。

## 架构：三层模型

[Spec Orchestrator](https://github.com/cntuzi/spec-orchestrator) 实现了一个三层流水线：

```
┌─────────────────────────────────────────────────────────┐
│  生成层 — /spec-init                                     │
│                                                          │
│  PRD + Figma + Swagger API                              │
│      ↓                                                   │
│  Feature YAML × N + 任务看板 + i18n + Figma 索引         │
│                                                          │
│  一次性：读所有素材，生成完整 spec                         │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│  编排层 — /spec-drive                                    │
│                                                          │
│  依赖图 → 波次分析 → Worker 派发                          │
│                                                          │
│  "T20 依赖 T03" → 先 T03，再 T20                        │
│  "T20 api_ready: false" → 跳过，通知团队                  │
│  "T20 status: 🔴" → 锁定为 🟡，派发 worker               │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│  执行层 — Worker                                         │
│                                                          │
│  Check → Collect → Code → Build → Verify → Update       │
│                                                          │
│  在隔离的 worktree 中运行                                 │
│  读 Feature YAML 获取上下文                               │
│  遵循平台 Agent 规范写代码                                │
└─────────────────────────────────────────────────────────┘
```

### 为什么三层分离重要

**生成**是一次性投入。每个版本跑一次 `/spec-init`，读你的 PRD、Figma、API 文档，生成完整的 spec 骨架。人审查和完善。

**编排**处理人不擅长的复杂性：跨 3 个平台 20+ 任务的依赖追踪、记住哪些 API 就绪了、避免重复工作。这是[章鱼哥](../octopus-agent/)的领域。

**执行**是 AI 写代码的地方。但现在它从 Feature YAML 获得了完整上下文 —— 需求、API 结构、状态矩阵、验收标准。不需要即兴发挥。

## Spec-Agent-Worker 模型

```
Spec   = 做什么     Feature YAML、任务看板、API 契约
Agent  = 怎么做     平台规范、编码规则、UI 模式
Worker = 运行实例   结合两者，在隔离环境中执行
```

这个分离意味着：
- **相同 spec，不同平台**：iOS 和 Android worker 读同一份 Feature YAML，但遵循不同的 Agent 规范
- **Spec 变更不需要代码变更**：更新 YAML，重新派发 worker
- **Agent 独立演进**：iOS 团队优化 Swift 模式不影响 spec

### 绑定机制

```
spec-orchestrator/              平台仓库（iOS）
┌──────────────────┐           ┌──────────────────┐
│ features/F02.yaml│──symlink──│ specs/F02.yaml   │
│ tasks/ios.md     │──symlink──│ specs/tasks.md   │
│ config.yaml      │           │                  │
│                  │           │ ai/ios.md（怎么做）│
│ agents/ios/      │───sync────│ CLAUDE.md（怎么做）│
│   ai/ios.md      │           │                  │
│   CLAUDE.md      │           │ src/（代码）      │
└──────────────────┘           └──────────────────┘
```

Spec 仓库是「做什么」的唯一真相源。平台仓库是「怎么做」的唯一真相源。Worker 读两边。

## 任务生命周期与状态机

```
🔴 待开始 ──────→ 🟡 进行中 ──────→ 🟢 已完成
                                        │
                                   CR 变更需求
                                        │
                                   🔵 返工 ──→ 🟡 ──→ 🟢
```

每次状态转换都是一个 git commit：

```
🐙 lock: T20 进行中          (🔴 → 🟡)
🐙 feat(T20): Bio 折叠展开    (代码完成)
🐙 done: T20 完成, MR !11    (🟡 → 🟢)
```

`git blame tasks/ios.md` 展示完整历史：谁锁定了什么、什么时候、到 MR 的完整 commit 链。

### 依赖驱动的派发

```yaml
# config.yaml
tasks:
  - id: T03
    depends_on: []
    api_ready: true       # ← 可以立即开始

  - id: T07
    depends_on: [T03]     # ← T03 为 🟢 前阻塞
    api_ready: false       # ← 后端部署前阻塞

  - id: T20
    depends_on: []
    api_ready: true        # ← 可以立即开始
```

编排器构建依赖 DAG，按波次派发：
- **第 1 波**：T03, T20（无依赖，API 就绪）→ 并行执行
- **第 2 波**：T07（T03 完成 且 API 部署后）→ 等待

不需要人追踪。Spec 编码了依赖关系，编排器强制执行。

## 变更管理

多端开发最难的部分：需求在迭代中变了。

```
后端团队：「我们在 profile 接口加了 bio_html 字段」

没有 spec-drive：
  → iOS 开发代码报错才发现
  → Android 开发直到下次站会才知道
  → 返工 2 天

有 spec-drive：
  /spec-drive change api /api/user/profile "Added bio_html field"
  → 自动追溯：F02.yaml 用了这个 API → T20, T21 受影响
  → 创建变更记录 CR-001
  → 标记 T20, T21 需要返工（🟢 → 🔵）
  → /spec-drive propagate CR-001
  → Worker 应用针对性变更，重新构建，验证
```

关键：**spec 编码了 API 和功能之间的依赖图**。API 变了，影响分析是自动的。

## 这不是什么

- **不是项目管理工具** —— 不替代 Jira 做人员协调
- **不是代码生成器** —— 它为生成代码的 AI 结构化上下文
- **不要求全套自动化** —— 你可以只用 YAML 文件，不需要任何工具

最小可行的采用方式：每个功能一个 Feature YAML 文件。即使没有自动化，它也给 AI 提供了完整上下文。自动化可以渐进式添加。

## 踩坑总结

| 经验 | 原因 |
|------|------|
| YAML > 纯文本定义任务 | 结构化数据 agent 能解析；纯文本需要理解 |
| 状态在 Git > 状态在 Jira | 唯一真相源；跟踪工具和实际之间没有同步延迟 |
| 先锁再执行 | 防止两个 agent 同时做同一个任务 |
| API 就绪作为一等概念 | 被阻塞的任务快速失败，不产出对着错误 API 写的代码 |
| 一个任务 = 一个 worktree = 一个 MR | 干净隔离；不会有「这个 MR 顺便修了 T08」 |
| Spec 变更自动传播 | 依赖图驱动的变更追踪完胜口头传达 |

## 快速开始

完整实现：**[github.com/cntuzi/spec-orchestrator](https://github.com/cntuzi/spec-orchestrator)**

渐进路径：
1. 从 Feature YAML 文件开始 —— 先结构化你的需求
2. 加入任务看板和状态 emoji（🔴🟡🟢）
3. 在 config.yaml 中加入依赖追踪
4. 对接编排器（[章鱼哥](../octopus-agent/)或你自己的）
5. 启用全套自动化：`/spec-init` → `/spec-drive` → Workers
