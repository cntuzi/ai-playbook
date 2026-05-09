# Spec-Drive: 规格驱动双端开发指南

[English](./spec-drive-guide.md) | [中文](./spec-drive-guide.zh-CN.md)

> 从 PRD 到代码的全自动化：spec 生成 → 编排 → 双端并行开发。

---

## 1. 系统概览

### 1.1 解决什么问题

传统流程：手动分析 PRD → 手动写 spec → 手动分析任务 → 手动创建分支 → 手动开发 → 手动验证 → 手动合并

Spec-Drive：**两条命令，从 PRD 到代码全自动**

```
/spec-init 1.3              → PRD + Figma + API → 完整 spec 骨架
/spec-drive setup            → 创建版本分支
/spec-drive next             → 自动循环执行到完成
```

### 1.1.1 整体工作流

```
PRD + Figma + API 文档       ← 用户提供素材
        │
   /spec-init                ← 自动生成 spec 骨架
        │
   config + features + tasks + i18n + CHANGELOG
        │
   /spec-drive setup         ← 创建版本分支
        │
   /spec-drive next          ← 自动循环执行
        │
   Worker sessions × 2       ← iOS + Android 并行
        │
   /spec-drive done          ← 版本完成
```

### 1.2 三层架构

```
┌─────────────────────────────────────────────────────────────┐
│                    specs (生成 + 编排层)                       │
│  /spec-init:  PRD + 素材 → 完整 spec 骨架 (一次性)            │
│  /spec-drive: 任务分析 + 依赖图 + worktree 创建 + 状态监控    │
│  /spec-next:  状态查看 + 任务定位                             │
└───────────────┬──────────────────────┬──────────────────────┘
                │                      │
     ┌──────────▼──────────┐ ┌────────▼────────────┐
     │  pixel_muse_ios     │ │  pixel_muse_android  │
     │  (执行层)            │ │  (执行层)             │
     │                     │ │                      │
     │  feat/v1.2 ← 集成   │ │  feat/v1.2 ← 集成    │
     │    ↑                │ │    ↑                 │
     │  wt/T06-xxx ← 开发  │ │  wt/T06-xxx ← 开发   │
     └─────────────────────┘ └──────────────────────┘
```

### 1.3 关键概念

| 概念 | 说明 |
|------|------|
| **版本集成分支** | `feat/v1.2` — 所有任务的合并目标，不直接在上面开发 |
| **任务 Worktree** | 每个任务一个隔离的工作目录，基于版本分支创建 |
| **Worker Session** | 在 worktree 中运行的独立 Claude Code，自治完成开发全流程 |
| **任务循环** | Worker 完成一个任务后自动找下一个，直到全部完成或被阻塞 |
| **执行波次 (Wave)** | 基于依赖图规划的并行执行批次 |

### 1.4 权威文件

| 文件 | 说明 |
|------|------|
| `specs/.claude/commands/spec-init.md` | 生成命令 — **唯一生成协议** |
| `specs/.claude/commands/spec-drive.md` | 编排命令 — **唯一编排协议** |
| `{platform}/.claude/commands/spec-next.md` | 执行命令 — **唯一执行协议 (10 步)** |
| `moox/{version}/WORKFLOW.md` | 执行概要 (引用 spec-next) |
| `moox/{version}/tasks/{platform}.md` | 任务状态 — **唯一状态源** |
| `moox/{version}/DASHBOARD.md` | 进度看板 — 由 `/spec-drive status` 聚合生成 |

---

## 2. 仓库结构

```
{workspace}/
├── specs/                          # 规格仓库 (编排中心)
│   ├── .claude/
│   │   ├── config.yaml             # 平台路径 + 版本配置
│   │   └── commands/
│   │       ├── spec-drive.md       # 编排命令
│   │       └── spec-next.md        # 状态查看
│   ├── moox/
│   │   └── 1.2/                    # 当前版本
│   │       ├── config.yaml         # Figma key, 路径映射
│   │       ├── WORKFLOW.md         # 执行流程概要
│   │       ├── DASHBOARD.md        # 进度看板 (聚合生成)
│   │       ├── features/           # F01-F10 Feature YAML
│   │       ├── tasks/
│   │       │   ├── shared.md       # S1-S3 共享前置
│   │       │   ├── backend.md      # B01-B07 后端 API
│   │       │   ├── ios.md          # T01-T10 iOS 任务 (唯一状态源)
│   │       │   └── android.md      # T01-T10 Android 任务 (唯一状态源)
│   │       ├── prd/                # PRD 文档
│   │       ├── i18n/               # 国际化文案
│   │       └── figma-index.md      # Figma 页面索引
│   ├── _scripts/                   # 工具链文档
│   └── _templates/                 # 模板文件
│
├── pixel_muse_ios/                 # iOS 项目
│   ├── specs -> ../specs/moox      # 软链接
│   ├── .claude/
│   │   ├── config.yaml             # platform: ios, version: 1.2
│   │   └── commands/
│   │       └── spec-next.md        # 任务执行 (含循环)
│   └── scripts/build.sh            # 编译脚本
│
├── pixel_muse_android/             # Android 项目
│   ├── specs -> ../specs/moox      # 软链接
│   ├── .claude/
│   │   ├── config.yaml             # platform: android, version: 1.2
│   │   └── commands/
│   │       └── spec-next.md        # 任务执行 (含循环)
│   └── scripts/build.sh            # 编译脚本
│
├── wt/                             # Worktree 存储
│   ├── pixel_muse_ios/
│   │   └── 0304/
│   │       └── T06-self-settings/  # 任务 worktree
│   └── pixel_muse_android/
│       └── 0304/
│           └── T06-self-settings/
│
└── api-doc/                        # API 文档 (Swagger)
```

---

## 3. 快速开始

### 3.1 前提条件

- 必须在 **tmux session** 中运行（Worker 依赖 tmux window）
- 两端仓库已 clone 且可访问
- specs 软链接已创建
- PRD 文档已放置在 `moox/{version}/prd/` 目录

### 3.2 生成 Spec（新版本首次）

```
/spec-init 1.3
```

这会：
1. 读取 PRD → 提取功能列表 + 埋点 + 依赖
2. 查询 Figma → 构建页面索引 + 映射 Feature
3. 解析 Swagger → 匹配 API + 生成后端任务
4. 全量生成 config + features + tasks + i18n + CHANGELOG
5. 交叉校验 + 输出完成度报告

### 3.3 首次设置

```
/spec-drive setup
```

这会：
1. 检查 spec-init 产物完整性
2. 在 iOS 仓库创建 `feat/v1.3` 分支 (基于 master)
3. 在 Android 仓库创建 `feat/v1.3` 分支 (基于 master)
4. 验证 specs 软链接和 api-doc 可访问

### 3.3 查看状态

```
/spec-drive status
```

从 `tasks/ios.md` + `tasks/android.md` + `tasks/backend.md` 实时聚合，自动同步 DASHBOARD.md。

### 3.4 开始执行

```
/spec-drive next           # 自动分析，两端并行启动
/spec-drive next ios       # 只启动 iOS
/spec-drive T06            # 执行指定任务 (自动判断哪端需要)
/spec-drive T06 android    # 只在 Android 执行 T06
```

### 3.5 最终验证

```
/spec-drive verify         # 在 feat/v1.2 上编译两端
/spec-drive done           # 完成总结
```

---

## 4. 命令参考

### 4.0 /spec-init (specs 仓库)

| 参数 | 说明 |
|------|------|
| 无参数 | 读取 config.yaml version.current，交互式引导 |
| `{version}` | 指定版本号，全量生成 |
| `{version} refresh` | 增量更新（已有版本目录，补充缺失部分） |
| `{version} validate` | 仅校验，不生成 |

**输入素材**：PRD (必须) + Figma file_key (可选) + Swagger JSON (可选)

**生成产物**：config.yaml + features/*.yaml + tasks/*.md + i18n/strings.md + CHANGELOG.md + figma-index.md

**与 spec-drive 关系**：spec-init 在 spec-drive setup 之前执行。spec-drive setup 会检查 spec-init 产物完整性。

### 4.1 /spec-drive (specs 仓库)

| 子命令 | 参数 | 说明 |
|--------|------|------|
| `setup` | - | 创建版本集成分支 `feat/v1.2` |
| `status` | - | 全平台状态总览 + 聚合 DASHBOARD + 版本分支状态 |
| `next` | `[platform]` | 智能分析 → 创建 worktree → 启动 Worker |
| `T{nn}` | `[platform]` | 执行指定任务 |
| `F{nn}` | `[platform]` | 执行指定功能对应的任务 |
| `reset` | `T{nn} [platform]` | 重置卡死在 🟡 的任务回 🔴 |
| `change` | `<type> <scope> "<desc>"` | 记录变更 + 影响分析 → 生成 CR |
| `change status` | - | 变更传播状态看板 |
| `propagate` | `CR-{nnn} [platform]` | 驱动 CR 变更返工: 创建 worktree → 应用变更 → 更新 checklist |
| `verify` | - | 版本分支编译验证 |
| `done` | - | 版本完成总结 |

**多平台智能分析**：不指定 platform 时自动检测哪端需要执行：
- iOS 🟢 + Android 🔴 → 只执行 Android
- iOS 🔴 + Android 🔴 → 两端并行
- iOS 🟢 + Android 🟢 → 提示已完成

### 4.2 /spec-next (iOS / Android 仓库)

| 参数 | 说明 |
|------|------|
| 无参数 | 自动找下一个可用任务并执行 |
| `T{nn}` | 执行指定任务 |
| `F{nn}` | 执行指定功能对应的任务 |
| `status` | 输出状态总览 (不执行) |

**任务可用条件** (全部满足):
1. 状态为 🔴 (待开始)
2. 所有前置依赖为 🟢 (已完成)
3. 无活跃 worktree
4. 后端 API 已就绪 (或无后端依赖)

### 4.3 /spec-next (specs 仓库)

仅状态查看，不执行开发。提示用户使用 `/spec-drive` 进行开发编排。

**CR 变更注意**: 在状态总览中自动检测 🟡/🔴 CR 对已完成(🟢)任务的影响，输出 attention 提示。在任务详情中追加 ⚠️ 待处理 CR 变更。

---

## 5. 执行流程详解

### 5.1 编排器流程 (spec-drive)

```
/spec-drive next
       │
       ▼
  ┌─ Phase 0: 前置校验 ─────────────────────────┐
  │                                               │
  │  ✓ tmux 环境检查                               │
  │  ✓ 版本分支存在性检查                           │
  │  ✓ 仓库脏状态检查                              │
  └───────────────────────────────────────────────┘
       │
       ▼
  ┌─ Phase 1: 全局分析 ──────────────────────────┐
  │                                               │
  │  读取: tasks/ios.md + android.md + backend.md │
  │  构建依赖图 → 分类任务 → 规划 Wave            │
  │                                               │
  │  任务分类:                                     │
  │  🚀 可立即执行  ⏳ 等待依赖  🚫 等待后端       │
  │  ✅ 已完成      🔄 进行中    ❌ 阻塞           │
  └───────────────────────────────────────────────┘
       │
       ▼
  ┌─ Phase 2: 展示执行计划 ───────────────────────┐
  │                                                │
  │  依赖图 + 执行波次表 + 本次启动列表             │
  │  确认后继续                                     │
  └────────────────────────────────────────────────┘
       │
       ▼
  ┌─ Phase 3: 基础设施搭建 ──────────────────────┐
  │                                                │
  │  对每个 (task, platform):                       │
  │  1. wt.sh new → 创建 worktree + tmux window   │
  │  2. Lock → 🔴→🟡 + git commit                 │
  │  3. tmux send-keys → 启动 Claude Code          │
  └────────────────────────────────────────────────┘
       │
       ▼
  ┌─ Phase 4: 返回控制 ─────────────────────────┐
  │                                               │
  │  输出: 启动状态表 + 执行预期 + 监控方式        │
  │  Worker sessions 开始自治执行                  │
  └───────────────────────────────────────────────┘
```

### 5.2 Worker 流程 (spec-next + 循环)

```
┌─────────────────────────────────────────────────────────────┐
│                     Worker Session 循环                      │
│                                                             │
│  ┌─── LOOP ──────────────────────────────────────────────┐  │
│  │                                                       │  │
│  │  Step 1-4: 配置 → 状态 → 定位任务 → 展示上下文        │  │
│  │       ↓                                               │  │
│  │  Step 5: Lock (幂等: 已🟡则跳过)                      │  │
│  │       ↓                                               │  │
│  │  Step 6: Analyze + Design                             │  │
│  │    ├─ 分析项目现状 + 影响范围                          │  │
│  │    ├─ 设计实现方案                                     │  │
│  │    └─ 写入 implementation/F{nn}/ (design + 平台细化)       │  │
│  │       ↓                                               │  │
│  │  Step 7: Execute                                      │  │
│  │    ├─ API Contract Verify (无 API 则跳过)             │  │
│  │    ├─ Collect (Figma + API + i18n + 现有代码)         │  │
│  │    ├─ Execute (按方案实现功能)                         │  │
│  │    └─ Verify (./scripts/build.sh)                     │  │
│  │       ↓                                               │  │
│  │  Step 8: Review (Code Review 循环, 最多 3 轮)         │  │
│  │       ↓                                               │  │
│  │  Step 9: Merge → feat/v{version} + 清理 worktree     │  │
│  │       ↓                                               │  │
│  │  Step 10: Update (🟡→🟢 + git pull --rebase + commit)│  │
│  │       ↓                                               │  │
│  │  Step 11: Loop                                        │  │
│  │    ├─ 全部完成 → ✅ EXIT                              │  │
│  │    ├─ 全部阻塞 → ⏸ EXIT                              │  │
│  │    ├─ 连续 2 次失败 → ❌ EXIT                         │  │
│  │    └─ 有可用任务 → 创建新 worktree → GOTO Step 5     │  │
│  │                                                       │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 单任务 11 步流程

| Step | 名称 | 操作 | 位置 |
|------|------|------|------|
| 1 | Config | 读取 .claude/config.yaml + specs config | 平台仓库 |
| 2 | Collect Status | 读取任务列表 + 后端 API + worktree | specs |
| 3 | Resolve | 定位目标任务 | specs |
| 4 | Context | 展示任务上下文 (Figma/API/i18n) | specs |
| 5 | Lock | 幂等检查 → 🔴→🟡 + git pull --rebase + commit | specs |
| 6 | Analyze + Design | 分析现状 → design.md + {platform}.md → 写入 F{nn}/ | specs + worktree |
| 7 | Execute | API Verify → Collect → Code (按方案) → Build | worktree |
| 8 | Review | Code Review diff, 修复循环 | worktree |
| 9 | Merge | merge → feat/v{version} + cleanup wt | 主仓库 |
| 10 | Update | 🟡→🟢 + git pull --rebase + commit (不写 DASHBOARD) | specs |
| 11 | Loop | 检查退出条件 → 找下一个 → 新 worktree | 主仓库 |

### 5.4 Step 6: Analyze + Design 详解

三层方案体系：**版本总览** → **功能方案**（按 Feature 聚合）→ **端侧综合**。

```
版本启动
  │
  ├─ overview.md                         # 版本总设计概览
  │    ├─ 功能全景、跨功能架构决策
  │    ├─ 公共依赖、实施顺序
  │    └─ 风险总览
  │
  ├─ {platform}/tech-plan.md             # 端侧综合技术方案
  │    ├─ 基建改动、公共组件
  │    ├─ 平台特有约束
  │    └─ 技术债、测试策略
  │
  ▼
Feature 确定
  │
  ▼
通用方案: F{nn}-{name}/design.md
  ├─ 影响分析 (模块、依赖)
  ├─ 数据流设计 (API、状态管理)
  ├─ 关键决策 (业务逻辑层面)
  └─ 风险 + CR 变更要点
  │
  │  由 spec-drive 在任务分析阶段生成，或首个 Worker 生成
  │  生成后双端共享，不重复分析
  │
  ▼
Worker 执行 Step 6
  │
  ├─ 读取 overview.md（不存在 → 基于项目 + template 生成）
  ├─ 读取 {platform}/tech-plan.md（不存在 → 基于项目 + template 生成）
  ├─ 读取 F{nn}-{name}/design.md（不存在 → 基于 YAML + template 生成）
  ├─ 扫描 worktree 现有代码
  ├─ 生成平台细化: F{nn}-{name}/{platform}.md
  │    ├─ 现有代码分析 (可复用组件、需改文件)
  │    ├─ 文件变更清单
  │    ├─ 平台技术选型
  │    └─ 🔵 返工: "只改什么，不改什么"
  │
  └─ git add + commit (到 specs 仓库)
```

**文档结构** (按功能聚合):

```
moox/{version}/
├── tasks/                                  # 规格定义
│   ├── ios.md
│   ├── android.md
│   ├── backend.md
│   └── shared.md
├── features/                               # Feature YAML
├── implementation/                         # 实现方案 (与规格分离)
│   ├── overview.md                         # 版本总设计概览
│   ├── ios/
│   │   └── tech-plan.md                    # iOS 端综合技术方案
│   ├── android/
│   │   └── tech-plan.md                    # Android 端综合技术方案
│   ├── F01-message-longpress-menu/         # 按功能聚合
│   │   ├── design.md                       # 通用方案 (平台无关)
│   │   ├── ios.md                          # iOS 细化
│   │   └── android.md                      # Android 细化
│   ├── F06-self-settings/
│   │   ├── design.md
│   │   ├── ios.md
│   │   └── android.md
│   └── ...
```

**版本总览** (`_templates/implementation-overview.template.md`):
- 功能全景、跨功能架构决策、公共依赖、实施顺序、风险总览
- 版本启动时生成，所有 Worker 参考

**端侧综合** (`_templates/implementation-platform-tech.template.md`):
- 基建改动、公共组件、平台约束、技术债、测试策略
- 跨任务的平台级技术方案，不属于任何单个 Feature

**通用方案** (`_templates/implementation.template.md`):
- 影响分析、数据流、API 调用、关键决策、业务规则、风险
- Feature 确定后即可生成，不依赖具体平台
- 双端 Worker 共同参考，只写一次

**平台细化** (`_templates/implementation-platform.template.md`):
- 现有代码分析、文件变更清单、平台技术选型、实现步骤
- Worker 在 Step 6 基于通用方案 + 端侧综合 + 项目现状生成
- 🔵 返工任务必须填写 CR 段，明确修改边界

**Feature YAML vs design.md 分工**:
- YAML = What + Constraint（做什么、UI 契约、数据契约、状态矩阵）
- design.md = How + Why（怎么做、为什么这样做、数据流转、模块交互）
- YAML 是需求规格，design.md 是实现设计——不重复，互补

**生成时机**:
- overview.md + tech-plan.md: 版本首次执行时，首个 Worker 生成
- design.md: 该 Feature 首个任务的 Worker 在 Step 6 生成，后续 Worker 复用
- {platform}.md: 每个 Worker 在 Step 6 生成自己平台的细化

**要求**:
- 先写方案再写代码，不允许边写边想
- 关键决策必须有理由，不接受"按直觉做"
- 查阅某功能时，一个目录看全貌（通用 + 双端）
- 通用方案只写一次，第二个 Worker 直接复用
- 平台细化可以不同（平台差异允许不同实现）

---

## 6. 任务状态生命周期

```
🔴 待开始
    │
    │  Step 5: Lock (幂等: 已🟡则跳过)
    ▼
🟡 进行中
    │
    ├── 编译通过 + Review 通过 ──→ 🟢 已完成
    │                              │
    │                              ├── Step 8: merge → feat/v{version}
    │                              │
    │                              └── CR 变更需求 → 🔵 需返工
    │                                                  │
    │                                                  │ propagate → Lock
    │                                                  ▼
    │                                                🟡 进行中 → 🟢 已完成
    │
    └── 编译失败 / Review 失败
         │
         └── 🟡 进行中 — 阻塞: {原因}
              │
              ├── Worker 跳过此任务, 尝试下一个
              └── 恢复: /spec-drive reset T{nn} → 🔴 → 重新执行
```

### 状态标记

| 符号 | 含义 | 出现位置 |
|------|------|---------|
| 🔴 | 待开始 | tasks/{platform}.md 概览表 + 详情 |
| 🟡 | 进行中 | 同上，Lock 后变更 |
| 🔵 | 需返工 | 同上，已完成但 CR 变更了需求，代码需定向更新 |
| 🟢 | 已完成 | 同上，验证通过后变更 |
| ⚫ | 不适用 | DASHBOARD.md (如纯客户端无后端) |

### 状态唯一源

- `tasks/{platform}.md` 是任务状态的**唯一来源**
- `DASHBOARD.md` 由 `/spec-drive status` 从任务文件聚合生成，Worker 不直接修改
- 这消除了双端 Worker 并发写 DASHBOARD 导致的竞态条件

---

## 7. 分支与 Worktree 策略

### 7.1 分支模型

```
master (or main)
  │
  └── feat/v1.2  ← 版本集成分支 (所有任务合并到这里)
       │
       ├── feat/pixel_muse_ios/0304/T06-self-settings     ← 任务分支
       ├── feat/pixel_muse_ios/0304/T07-character-settings
       ├── feat/pixel_muse_android/0304/T06-self-settings
       └── feat/pixel_muse_android/0304/T07-character-settings
```

### 7.2 Worktree 目录结构

```
wt/
└── pixel_muse_ios/
    └── 0304/                        # 日期 (MMDD)
        ├── T06-self-settings/       # 任务 worktree
        │   ├── (iOS 项目文件)
        │   ├── specs -> ../specs/moox  # 自动 symlink
        │   └── api-doc -> ...          # 自动 symlink
        └── T07-character-settings/
```

### 7.3 Worktree 生命周期

```
创建: wt.sh new T06-self-settings feat/v1.2
  → wt/pixel_muse_ios/0304/T06-self-settings/
  → branch: feat/pixel_muse_ios/0304/T06-self-settings
  → tmux window: T06-self-settings (3-pane layout)
  → 自动执行 setup-links.sh

使用: Worker session 在此目录中开发

合并: git -C {REPO_ROOT} merge {task_branch} --no-ff

清理: wt.sh -f rm T06-self-settings
  → 删除 worktree 目录
  → 删除 task 分支
  → 关闭 tmux window
```

---

## 8. 智能分析

### 8.1 依赖图构建

从 tasks/{platform}.md 概览表的"依赖"列解析：

```
T01 (无依赖)
 ├── T02 (依赖 T01) ──→ 需要 B01 (后端 API)
 ├── T03 (依赖 T01) ──→ 需要 B02
 ├── T04 (依赖 T01) ──→ 需要 B03
 └── T05 (依赖 T01)

T06 (无依赖) ──→ 需要 B04
T07 (无依赖) ──→ 需要 B05

T08 (无依赖)
 └── T09 (依赖 T08) ──→ 需要 B06
      └── T10 (依赖 T09) ──→ 需要 B07
```

### 8.2 执行波次规划

```
Wave 1: T06, T07        ← 无依赖, 后端就绪, 可并行
Wave 2: T08             ← 无依赖, 无后端要求
Wave 3: T09             ← 依赖 T08
Wave 4: T10             ← 依赖 T09
Blocked: T02, T03, T04  ← 等待 B01-B03 后端 API
```

### 8.3 跨平台对齐

同一任务在两端的状态可能不同：

| 任务 | iOS | Android | 决策 |
|------|-----|---------|------|
| T06 | 🔴 | 🔴 | 两端并行启动 |
| T01 | 🟢 | 🟢 | 跳过 |
| T02 | 🟢 | 🔴 | 只启动 Android |

---

## 9. API Contract Verify

每个有后端 API 的任务，在开发前自动校验 specs 与实际接口文档的一致性。
纯客户端任务 (API 表为"无") 跳过此步。

### 9.1 接口来源区分

| 路径前缀 | 来源 | 校验方式 |
|---------|------|---------|
| `/chatbot/*` | Swagger | `{api_doc_path}/chatbot_swagger.json` |
| `/post/*` | Swagger | `{api_doc_path}/post_swagger.json` |
| `/chat/*` | 私信中台 | `tasks/backend.md` 参数表 + 信令定义 |

**api_doc_path**: 从 `.claude/config.yaml` 的 `api_doc.path` 获取（iOS: `../api-doc`, Android: `docs/api-doc`）

### 9.2 校验内容

- 请求参数名是否与文档一致
- 响应字段是否存在
- 枚举值是否有定义
- 接口文档是否存在

### 9.3 不一致处理

```
⚠️ specs 写 self_setting，Swagger 实际为 self_desc → 以 Swagger 为准开发
❌ 缺少接口文档: /chat/rewrite_message → 不阻塞，标记到技术要点
```

---

## 10. 配置文件

### 10.1 specs/.claude/config.yaml

```yaml
project:
  name: moox
version:
  current: "1.2"
platforms:
  ios:
    repo: ../pixel_muse_ios
    build_cmd: ./scripts/build.sh
  android:
    repo: ../pixel_muse_android
    build_cmd: ./scripts/build.sh
wt_script: ~/.claude/skills/wt/scripts/wt.sh
branch:
  version_prefix: "feat/v"
```

### 10.2 平台 .claude/config.yaml

```yaml
project:
  name: moox
  platform: ios          # 或 android
version:
  current: "1.2"
specs:
  path: specs            # 软链接 → ../specs/moox
api_doc:
  path: ../api-doc       # iOS: ../api-doc, Android: docs/api-doc
paths:
  version_config: "{specs}/{version}/config.yaml"
  prd: "{specs}/{version}/prd/"
  features: "{specs}/{version}/features/"
  tasks:
    self: "{specs}/{version}/tasks/{platform}.md"
    backend: "{specs}/{version}/tasks/backend.md"
```

---

## 11. 故障处理

### 11.1 编译失败

```
场景: ./scripts/build.sh 返回失败
处理:
  1. Worker 自动分析错误日志
  2. 修复编译错误
  3. 重新编译 (最多 3 次)
  4. 3 次仍失败 → 标记 🟡 阻塞 → 保留 worktree → 跳到下一个任务
恢复:
  1. tmux select-window -t "T{nn}-xxx"
  2. 手动修复编译问题
  3. ./scripts/build.sh 验证通过
  4. 或 /spec-drive reset T{nn} 重置后重新执行
```

### 11.2 Merge 冲突

```
场景: git merge 产生冲突 (两个任务修改同一文件)
处理:
  1. Worker 输出冲突文件列表
  2. 不自动清理 worktree
  3. 等待人工处理
恢复:
  1. tmux select-window -t "T{nn}-xxx"
  2. cd 到 worktree 路径
  3. git status  # 查看冲突文件
  4. 手动解决冲突 → git add → git commit
  5. cd {REPO_ROOT} && bash ~/.claude/skills/wt/scripts/wt.sh -f rm T{nn}-xxx
```

### 11.3 任务卡死在 🟡

```
场景: Worker 崩溃、worktree 已清理，任务卡死在 🟡
诊断:
  1. git -C {repo} worktree list | grep T{nn}
     - 有 worktree → 进入 worktree 继续开发
     - 无 worktree → 需要 reset
恢复:
  # 方式 A: 从 specs 编排器 reset
  /spec-drive reset T{nn}         # 重置回 🔴
  /spec-drive T{nn}               # 重新执行

  # 方式 B: 手动 reset
  # 编辑 moox/{version}/tasks/{platform}.md:
  #   概览表 🟡→🔴 + 统计行 + 详情状态行
  # git add + commit: "chore: reset T{nn} to pending"
```

### 11.4 Worker Session 中断

```
场景: Claude Code session 意外退出
处理:
  1. Worktree 和代码仍在
  2. 任务状态为 🟡 (已 Lock)
恢复:
  1. tmux select-window -t "T{nn}-xxx"  # 或 tmux list-windows 查找
  2. cd {worktree_path}
  3. claude                             # 启动新 session
  4. /spec-next T{nn}                   # 继续 (Lock 幂等: 已🟡自动跳过)
```

### 11.5 Specs 并发提交冲突

```
场景: 两个 Worker 同时提交到 specs 仓库
处理:
  - Worker 在每次 specs 提交前执行 git pull --rebase
  - ios.md 和 android.md 是独立文件，不会冲突
  - Worker 不再写 DASHBOARD.md，消除了主要冲突源
  - 极端 rebase 冲突 → Worker 报告，等待人工处理
恢复:
  1. cd specs/
  2. git status                          # 查看冲突
  3. 手动解决 → git rebase --continue
  4. 或 git rebase --abort + 手动 commit
```

---

## 12. Git Push 策略

整个系统的所有操作默认**只在本地**，不自动 push。这意味着：
- 进度不会自动同步到远端
- 宕机会丢失未 push 的工作

### 建议的 push 时机

| 时机 | 操作 | 说明 |
|------|------|------|
| 每日工作结束 | `git -C {repo} push` | 保存当日进度 |
| `/spec-drive done` 后 | 两端 push feat/v1.2 | 版本完成后归档 |
| 重要里程碑 | specs + 两端都 push | 如一批任务全部完成 |

### 具体命令

```bash
# Push specs 仓库
cd specs && git push

# Push 两端版本分支
git -C ../pixel_muse_ios push -u origin feat/v1.2
git -C ../pixel_muse_android push -u origin feat/v1.2
```

---

## 13. 共享前置 (S-Tasks)

S1-S3 (PRD 确认 / 设计评审 / API 定义) 是**人工前置条件**，不是自动化任务。

- 所有 T 任务的执行都会先检查 S1-S3 是否 🟢
- S-tasks 只能由人工手动更新状态
- 系统不会自动执行或恢复 S-tasks
- 如果 S-task 为 🔴，所有 T-tasks 都会被阻塞

---

## 14. 典型使用场景

### 场景 A: 新版本全量开发

```bash
# 1. 在 tmux 中打开 specs 仓库
tmux new -s moox
cd specs

# 1.5. 生成 spec（新版本首次）
/spec-init 1.3               # PRD + Figma + API → 完整 spec

# 2. 初始化
/spec-drive setup            # 创建 feat/v1.3 分支（自动检查 spec-init 产物）

# 3. 查看全景
/spec-drive status           # 查看所有任务状态 + 聚合 DASHBOARD

# 4. 启动全自动开发
/spec-drive next             # 自动分析 + 双端并行启动

# 5. 等待... Worker sessions 自动循环执行
# iOS:     T06 → T07 → T08 → T09 → T10 → ⏸ (等后端)
# Android: T06 → T07 → T08 → T09 → T10 → ⏸ (等后端)

# 6. 查看进度
/spec-drive status

# 7. 后端 API 就绪后, 继续
/spec-drive next             # 自动找到 T02/T03/T04

# 8. 最终验证
/spec-drive verify
/spec-drive done
```

### 场景 B: 执行单个任务

```bash
/spec-drive T06 ios          # 只在 iOS 执行 T06
```

### 场景 C: 补齐落后平台

```bash
/spec-drive status           # 发现 Android 落后
/spec-drive next android     # 只启动 Android Worker
```

### 场景 D: 恢复卡死任务

```bash
/spec-drive status           # 发现 T06 🟡 但无 worktree
/spec-drive reset T06        # 重置为 🔴
/spec-drive T06 android      # 重新执行
```

### 场景 E: CR 变更返工

```bash
# 方式 1: next 自动检测 + 自动传播 (推荐)
/spec-drive next                     # 自动检测 CR 返工任务，与新任务并行启动

# 方式 2: 手动指定传播
/spec-drive propagate CR-003         # 全自动: 创建 worktree → 应用变更 → build → review → merge
/spec-drive propagate CR-004 ios     # 只传播到 iOS

# 发现 + 监控
/spec-next                           # 状态总览 → CR 变更注意段
/spec-next T06                       # 任务详情 → ⚠️ CR-003 待处理
/spec-drive change status            # 所有 CR 传播状态看板
```

### 场景 F: 在平台项目中直接执行

```bash
# 在 iOS 项目中
cd pixel_muse_ios

# 方式 1: 手动在主仓库
/spec-next T06               # 直接在当前分支开发 (无 worktree)

# 方式 2: 先创建 worktree
/wt T06-self-settings        # 创建 worktree
/spec-next T06               # 在 worktree 中开发 (自动 merge)
```

---

## 15. 变更管理

### 15.1 问题

specs 体系是静态规格树：PRD → Feature YAML → Task → Code。初始创建完整，但 PRD / API / Figma / i18n 发生变更时，下游文件不会自动感知。

### 15.2 解决方案

统一 CHANGELOG + 依赖索引 + `/spec-drive change` 命令，实现：记录变更 → 分析影响 → 追踪传播。

```
CHANGELOG.md (统一变更日志，每条变更一个 CR 编号)
     │
     ▼ 查询
config.yaml dependency_index (反向依赖图)
     │
     ▼ 驱动
/spec-drive change (自动分析影响 → 生成 CR → 传播 checklist)
     │
     ▼ 记录
Feature YAML revisions (变更历史)
```

### 15.3 核心文件

| 文件 | 作用 |
|------|------|
| `moox/{version}/CHANGELOG.md` | 统一变更日志，CR 编号全局递增 |
| `moox/{version}/config.yaml` → `dependency_index` | 反向依赖图: API→Feature, Figma→Feature, Feature→Backend |

### 15.4 CR 生命周期

```
变更发生 (API/PRD/Figma/i18n)
  │
  ▼
/spec-drive change api /post/get_story_detail "新增 creator_id"
  │
  ├── 读取 dependency_index → 找到影响范围
  ├── 生成 CR-{nnn} 条目 (含影响列表 + checklist)
  └── 追加到 CHANGELOG.md
  │
  ▼
手动或自动传播变更到各文件
  │
  ├── 每完成一项 → 勾选 checklist [x]
  └── Feature YAML 添加 revisions 记录
  │
  ▼
/spec-drive change status → 查看传播看板
  │
  ├── 🔴 待传播: 所有 checklist 未勾选
  ├── 🟡 部分传播: 部分勾选
  └── ✅ 已传播: 全部勾选
```

### 15.5 命令用法

```bash
# 记录一个 API 变更，自动分析影响
/spec-drive change api /post/get_story_detail "新增 creator_id"
# → 影响: F08, F09, F10 → 6 个 Task + B06, B07

# 记录 Figma 变更
/spec-drive change figma 152:75 "主态页新增编辑按钮样式"

# 记录 PRD 变更
/spec-drive change prd F06 "自我设定增加字数限制 200→500"

# 查看所有 CR 传播状态
/spec-drive change status
```

### 15.6 CR 变更传播 (propagate)

当 CR 影响的任务已经标记 🟢 完成，但 CR 存在未传播的代码变更时，需要返工。

**两种触发方式**:

1. **自动**: `/spec-drive next` 在规划执行波次时，自动检测 🔁 CR 返工任务，与新任务并行启动
2. **手动**: `/spec-drive propagate CR-{nnn}` 指定传播某个 CR

两种方式都是**全自动执行**，无需中间确认。最终通过 build + code review 验收质量。

**手动命令**:

```bash
# 自动传播 CR-003 到所有受影响平台
/spec-drive propagate CR-003

# 只传播到 iOS
/spec-drive propagate CR-003 ios

# 只传播到 Android
/spec-drive propagate CR-003 android
```

**流程**:

```
/spec-drive propagate CR-003 (或 next 自动触发)
       │
       ▼
  读取 CHANGELOG.md → CR-003 条目
       │
       ├── 状态 ✅ → "已全部传播，无需操作"，退出
       │
       ▼
  解析 checklist → 过滤代码相关 [ ] 项
       │
       ├── 无代码项 → "剩余项需人工确认"，退出
       │
       ▼
  读取 Feature YAML → [CR-003] 标注的变更点
       │
       ▼
  直接执行 (无需确认):
    创建 worktree (CR003-T06-self-settings)
    启动 Claude Code session (仅应用 CR 变更)
       │
       ▼
  Worker: 应用变更 → build 验证 → code review
       │
       ▼
  合并 → 更新 CHANGELOG checklist
       │
       ├── 全部完成 → CR 状态 → ✅
       └── 部分完成 → CR 状态保持 🟡
```

**注意**: `propagate` 只处理代码变更项。后端确认 (B{nn})、Figma 确认等非代码项需人工完成后手动勾选。

### 15.7 dependency_index 结构

在 `config.yaml` 中维护三组反向映射:

- **api_to_features**: API 端点 → 哪些 Feature 使用
- **figma_to_features**: Figma 节点 → 哪些 Feature 引用
- **feature_to_backend**: Feature → 依赖的 Backend 任务

新增 API / Figma 页面时需同步更新此索引。

---

## 16. 变更处理新手引导

> 你发现了一个变更（PRD 改了、API 变了、Figma 更新了），该怎么做？

### 全流程一览

```
发现变更 → 记录 CR → 传播 specs → 传播代码 → 验收完成
  (你)      (1条命令)   (自动)      (自动)     (自动)
```

你只需要做第一步，剩下的系统自动处理。

---

### Step 1: 记录变更

发现变更后，在 specs 仓库执行一条命令：

```bash
# PRD 变了 (最常见)
/spec-drive change prd F06 "自我设定字数 2000→800"

# API 变了
/spec-drive change api /post/get_story_detail "新增 creator_id 字段"

# Figma 变了
/spec-drive change figma 152:75 "主态页新增编辑按钮"

# i18n 变了
/spec-drive change i18n F06 "新增称呼说明文案"
```

系统会自动：
- 分配 CR 编号 (如 CR-006)
- 通过 dependency_index 分析影响范围 (哪些 Feature → 哪些 Task → 哪些后端)
- 生成 checklist (每个需要更新的文件/模块一项)
- 写入 CHANGELOG.md
- git commit

**输出示例**：
```
━━━ CR-006 影响分析 ━━━
类型: PRD
变更: 自我设定字数 2000→800
影响范围:
  Features: F06
  iOS Tasks: T06
  Android Tasks: T06
  Backend: B04
生成 checklist: 5 项
```

---

### Step 2: 传播到 specs 文件

CR 记录后，需要把变更传播到 Feature YAML 和 Task 文件。

**如果任务还没开始 (🔴)**：直接更新 Feature YAML + Task 文件即可，开发时自然用新规格。

**如果任务已完成 (🟢)**：这就是需要 propagate 的场景。不用手动操心，下一步会自动处理。

一般来说，`/spec-drive change` 执行后你会被引导更新相关的 Feature YAML 和 Task 文件，每更新一项就在 CHANGELOG 中勾选 `[x]`。

---

### Step 3: 传播到代码 (全自动)

specs 文件更新完毕后，代码怎么跟上？

**方式 A: 自动 (推荐)**

```bash
/spec-drive next
```

`next` 在规划执行波次时会自动扫描 CHANGELOG：
- 发现 🟡/🔴 CR 影响了已完成的 🟢 任务
- 自动创建 CR 返工 worktree (如 `CR003-T06-self-settings`)
- 启动 Worker 仅应用 CR 变更 → build → review → merge
- 与新任务并行执行，不需要你额外操作

**方式 B: 手动指定**

```bash
/spec-drive propagate CR-003           # 两端都传播
/spec-drive propagate CR-003 ios       # 只传播 iOS
```

---

### Step 4: 验收

**自动验收** — Worker 完成后会：
1. 编译验证 (build)
2. Code Review (自动)
3. 合并到版本分支
4. 更新 CHANGELOG checklist `[x]`

**人工验收** — 有些项系统无法自动处理：
- `B04 后端 API 确认` → 找后端确认接口是否同步调整
- `Figma 确认` → 找设计确认设计稿是否更新

这些需要你手动确认后，去 CHANGELOG.md 勾选 `[x]`。

---

### Step 5: 检查完成度

```bash
/spec-drive change status
```

输出所有 CR 的传播看板：

```
| CR     | 日期       | 描述              | 完成度 | 状态 |
|--------|-----------|-------------------|--------|------|
| CR-001 | 2026-03-02 | IM say → HTTP POST | 4/4   | ✅   |
| CR-003 | 2026-03-05 | F06 字段规则调整    | 4/6   | 🟡   |
| CR-004 | 2026-03-05 | F07 字数缩减 800   | 4/5   | 🟡   |
```

所有项 `[x]` → 状态自动变为 ✅，这条 CR 就彻底关闭了。

---

### 速查：一张图

```
你发现 PRD 改了
  │
  ▼
/spec-drive change prd F06 "xxx"     ← 你做这一步
  │
  ├─→ 自动生成 CR-006 + checklist
  │
  ▼
更新 Feature YAML + Task 文件           ← 你做这一步 (或 AI 协助)
  │                                       每项完成 → CHANGELOG 勾 [x]
  ▼
/spec-drive next                        ← 你做这一步 (或定期执行)
  │
  ├─→ 自动检测 CR 返工 → worktree → Worker
  ├─→ build + review (自动)
  ├─→ merge + 更新 checklist (自动)
  │
  ▼
/spec-drive change status               ← 随时检查
  │
  └─→ 全部 ✅ = 变更彻底落地
```

### 你需要人工做的事 (总共 3 件)

| # | 操作 | 什么时候 |
|---|------|---------|
| 1 | `/spec-drive change ...` 记录变更 | 发现变更时 |
| 2 | 更新 Feature YAML + Task 文件中的规格 | 记录后立即 |
| 3 | 勾选非代码 checklist (后端确认/Figma 确认) | 确认后随时 |

代码传播、build、review、merge、checklist 更新 — 全自动。

---

## 17. 数据流

```
PRD (prd/README.md)
  ↓
CHANGELOG.md (CR 记录变更 + 影响分析)
  ↓
Feature YAML (features/F{nn}-*.yaml)
  ├── figma.pages → Figma MCP → 设计截图
  ├── api → Swagger/backend.md → API Contract Verify
  ├── i18n_keys → strings.md → Localizable.xcstrings / strings.xml
  └── analytics → 埋点代码
  ↓
tasks/{platform}.md (任务计划 + 状态追踪 — 唯一状态源)
  ↓
/spec-drive (编排) → Worker Session (执行)
  ↓
代码实现 (worktree) → 编译验证 → Code Review
  ↓
merge → feat/v{version} → 最终验证 → master
```

---

## 18. Spec 生成层 (spec-init)

### 18.1 角色定位

spec-init 是 **生成层**，在 spec-drive（编排层）之前执行。负责从 PRD + 素材一次性生成完整的 spec 骨架。

```
生成层: /spec-init   → config + features + tasks + i18n + CHANGELOG
编排层: /spec-drive  → 分析 + worktree + Worker 分派
执行层: /spec-next   → 单任务 11 步流程
```

### 18.2 输入素材要求

| 素材 | 必须 | 格式 | 放置位置 |
|------|------|------|---------|
| **PRD** | ✅ 必须 | PDF 或 Markdown | `moox/{version}/prd/` |
| **Figma** | 可选 | file_key 或 URL | 交互式输入 |
| **Swagger** | 可选 | JSON | `api-doc/*.json` |
| **技术方案** | 可选 | Markdown | `api-doc/tec_docs/` |
| **i18n 种子** | 可选 | 现有翻译文件 | `moox/{version}/i18n/` |

### 18.3 生成产物清单

| 产物 | 路径 | 来源 |
|------|------|------|
| 版本配置 | `config.yaml` | PRD 元信息 + Figma + API |
| Feature YAML × N | `features/F{nn}-*.yaml` | PRD 功能描述 |
| iOS 任务计划 | `tasks/ios.md` | Feature → Task 散射 |
| Android 任务计划 | `tasks/android.md` | 镜像 iOS |
| 后端 API 任务 | `tasks/backend.md` | Swagger + PRD 依赖 |
| 共享前置 | `tasks/shared.md` | 固定模板 + API 模式 |
| 国际化文案 | `i18n/strings.md` | PRD 中文文案提取 |
| Figma 索引 | `figma-index.md` | Figma MCP 查询 |
| 变更日志 | `CHANGELOG.md` | 空模板 |
| 实现方案目录 | `implementation/` | 空骨架 |

### 18.4 字段补充指南

spec-init 生成的 Feature YAML 中，部分字段标记 ⚠️ TODO 需人工补充：

| 字段 | 补充时机 | 补充方式 | 不补影响 |
|------|---------|---------|---------|
| `ui_contract` | setup 前 | 基于 Figma 逐个填充 | Worker 无法执行视觉验收 |
| `delivery_contract.stack_baseline` | setup 前 | 分析 iOS/Android 现有代码 | Worker 可能选错技术栈 |
| `delivery_contract.data_contract` | setup 前 | 确认字段来源优先级 | 数据回显逻辑可能错误 |
| `state_matrix.figma_node` | 开发前 | 手动映射 Figma 节点 ID | 无法做 Figma 基线对比 |
| `api[].verified` | 开发前 | 逐字段校验 Swagger/文档 | API Contract Verify 跳过 |
| `pixel_baseline` | 验收前 | 从 Figma 测量关键尺寸 | 无法做像素级对比 |

**优先级建议**：
1. **必须在 setup 前补**：ui_contract、delivery_contract（影响开发方案质量）
2. **可以边开发边补**：state_matrix.figma_node、api verified（Worker 会标注缺失）
3. **验收时补即可**：pixel_baseline、verification_evidence（不影响开发）

### 18.5 三种模式

```bash
/spec-init 1.3               # 全量生成（版本目录不存在时）
/spec-init 1.3 refresh       # 增量更新（PRD 变更后补充新功能，不覆盖已有）
/spec-init 1.3 validate      # 仅校验，输出通过/失败/警告报告
```

---

## 19. 版本升级

新版本开发流程（以 v1.3 为例）：

1. 准备 PRD: 放置到 `moox/1.3/prd/` 目录
2. `/spec-init 1.3` → 自动生成完整 spec 骨架
3. 补充 ⚠️ 字段（ui_contract、delivery_contract 等）
4. `/spec-drive setup` → 创建 `feat/v1.3` 分支
5. `/spec-drive next` → 开始执行
