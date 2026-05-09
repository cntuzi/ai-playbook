[English](./glossary.md) | [中文](./glossary.zh-CN.md)

# Spec 系统术语表

> 所有核心名词的定义与关系。新成员阅读本文件即可理解 spec 系统全貌。

---

## 规格层 — What + Constraint（定义做什么、怎么约束）

### Feature YAML

功能规格文件，路径 `moox/{version}/features/F{nn}-{name}.yaml`。一个功能的**单一权威定义**，包含 What（做什么）和 Constraint（怎么约束）两大类字段。

**What 字段**（可自动生成）：

| 字段 | 含义 |
|------|------|
| `id` / `name` / `module` / `epic` | 功能标识与归属 |
| `description` | 功能描述（来源 PRD） |
| `requirements` | R01-Rnn 需求条目 |
| `acceptance_criteria` | AC01-ACnn 验收标准，分 ui / interaction / data 类型 |
| `figma.pages[]` | 关联的 Figma 设计页面与 node_id |
| `api[]` | 关联的后端接口定义 |
| `analytics[]` | 埋点事件（type / stype / frominfo / trigger） |
| `i18n_ref` | 国际化文案引用（指向 strings.md） |
| `platform_tasks` | 平台任务映射（ios: T{nn}, android: T{nn}, backend: B{nn}） |
| `dependencies` | 功能间依赖 |

**Constraint 字段**（需人工或半自动补充）：

| 字段 | 含义 |
|------|------|
| `ui_contract` | UI 合同 |
| `delivery_contract` | 交付合同 |
| `state_matrix` | 状态矩阵 |
| `pixel_baseline` | 像素基线 |
| `conflict_resolution` | 冲突决策 |
| `verification_evidence` | 验收证据 |

**分工**：`/spec-init` 自动生成 What 字段 + Constraint 骨架（标 TODO），人工按优先级补充 Constraint。

---

### UI 合同 (ui_contract)

定义功能的**视觉约束合同**，写在 Feature YAML 中。

| 子字段 | 含义 | 示例 |
|--------|------|------|
| `source_nodes` | Figma 设计稿节点 ID，按状态/场景命名 | `empty_state: "119:370"` |
| `required` | 必须实现的结构/组件/交互 | `自定义居中 Modal` |
| `forbidden` | 禁止的实现方式 | `UIAlertController` |
| `key_tokens` | 关键视觉参数（尺寸/颜色/圆角） | `modal_corner_radius: 20` |
| `visual_blockers` | 会阻断验收的视觉问题 | `弹窗居中，不偏移` |

**核心原则**：视觉是阻断项 — 视觉门禁未通过，任务状态不得标记为 🟢。

---

### 交付合同 (delivery_contract)

定义功能的**技术栈约束**，写在 Feature YAML 中。

| 子字段 | 含义 |
|--------|------|
| `stack_baseline` | 各平台必须使用的技术栈（如 iOS: IGListKit + CollectionView） |
| `ui_split` | UI 实现拆分层级：L1-结构层 → L2-视觉层 → L3-交互状态层 → L4-验收证据层 |
| `data_contract` | 字段来源优先级（如 `source_priority: [server, local_cache]`） |

---

### 状态矩阵 (state_matrix)

穷举功能的**所有关键状态场景**，防止开发遗漏边界情况。写在 Feature YAML 中。

每条包含：

| 字段 | 含义 |
|------|------|
| `id` | 编号（S01, S02...） |
| `name` | 状态名称 |
| `figma_node` | 对应 Figma 设计稿节点 ID |
| `trigger` | 什么操作/条件触发此状态 |
| `expected` | 进入此状态后的预期表现 |

**价值**：每个状态绑定 Figma 节点 → 开发时定位设计稿 → 验收时逐条 checklist。

---

### 像素基线 (pixel_baseline)

关键控件的**量化尺寸/间距/点击区**，拒绝"肉眼差不多"。写在 Feature YAML 中。

```yaml
pixel_baseline:
  nav:
    bar_height: 44
    back_tap_area: "44x44"
  form:
    horizontal_inset: 16
    section_spacing: 8
```

---

### 冲突决策 (conflict_resolution)

PRD vs Figma vs API 出现矛盾时的**裁定记录**。写在 Feature YAML 中。

```yaml
conflict_resolution:
  - key: "按钮高度"
    figma: "48pt"
    prd: "44pt"
    decided_source: figma
    owner: design
    decision_date: "2026-03-20"
```

---

### 验收标准 (acceptance_criteria)

AC01-ACnn 验收条目，分三种类型：

| 类型 | 含义 |
|------|------|
| `ui` | 视觉验收（对照 Figma） |
| `interaction` | 交互验收（操作流程） |
| `data` | 数据验收（接口/存储） |

---

### config.yaml

版本配置中心，路径 `moox/{version}/config.yaml`。

核心段：

| 段 | 含义 |
|----|------|
| `version` / `codename` | 版本标识 |
| `figma.file_key` | Figma 设计文件 key |
| `paths` | 所有版本资源的路径映射 |
| `api.swagger_files` | 后端 Swagger 文件列表 |
| `features[]` | 功能快速索引（id / name / module / priority） |
| `dependency_index` | 反向索引（见下文） |

---

### 依赖索引 (dependency_index)

config.yaml 中的**反向查询表**，供变更影响分析使用。

| 子索引 | 方向 | 用途 |
|--------|------|------|
| `api_to_features` | API 端点 → Feature 列表 | API 变更时定位受影响功能 |
| `figma_to_features` | Figma 节点 → Feature 列表 | 设计变更时定位受影响功能 |
| `feature_to_backend` | Feature → Backend 任务列表 | 功能变更时定位后端依赖 |

---

## 任务层 — Who + Sequence（定义谁做、什么顺序）

### Task (T{nn})

平台端开发任务，写在 `tasks/ios.md` 或 `tasks/android.md` 中。**唯一状态源** — 任务的当前状态只在这里读写。

与 Feature 的关系：F{nn} 和 T{nn} 编号一致（一对一），一个 Feature 在每个平台各有一个 Task。

### Backend (B{nn})

后端 API 任务，写在 `tasks/backend.md`。按需分配编号（不与 F/T 绑定），是前端任务的前置依赖。

### Shared (S1-S3)

跨端前置依赖，写在 `tasks/shared.md`：

| ID | 事项 |
|----|------|
| S1 | PRD 确认 |
| S2 | 设计评审 |
| S3 | API 定义 |

### 状态生命周期

```
🔴 待开始 ──Lock──→ 🟡 进行中 ──Pass──→ 🟢 已完成
                         │                    │
                         │ Fail               │ CR 变更
                         ↓                    ↓
                    🟡 阻塞              🔵 需返工 ──Propagate──→ 🟡 → 🟢
```

| 符号 | 含义 |
|------|------|
| 🔴 | 待开始 |
| 🟡 | 进行中 / 阻塞 |
| 🟢 | 已完成 |
| 🔵 | 需返工（CR 变更后） |
| ⚫ | 不适用 |

### 波次 (Wave)

从任务依赖列构建 DAG，规划**并行执行批次**：

- Wave 1：无依赖的任务，可并行
- Wave 2：依赖 Wave 1 的任务
- Blocked：等后端 API 的任务

### DASHBOARD

进度看板，路径 `moox/{version}/DASHBOARD.md`。从 `tasks/*.md` **聚合生成**，Worker 不直接修改。

---

## 编排层 — Pipeline（定义流水线）

### spec-init

生成层命令。从 PRD + Figma + Swagger **一次性生成完整 spec 骨架**。

三种模式：

| 模式 | 命令 | 用途 |
|------|------|------|
| generate | `/spec-init 1.3` | 全量生成 |
| refresh | `/spec-init 1.3 refresh` | 增量补充 |
| validate | `/spec-init 1.3 validate` | 仅校验 |

### spec-drive

编排层命令。任务分析 + 依赖图 + worktree 创建 + Worker 分派 + 状态监控。

| 子命令 | 用途 |
|--------|------|
| `setup` | 检查 spec 完整性 → 创建版本分支 |
| `next` | 智能分析 → worktree → Worker 分派 |
| `status` | 聚合双端进度 → 更新 DASHBOARD |
| `change` | 记录 CR + 影响分析 |
| `propagate` | CR 代码返工 |
| `reset` | 重置卡死任务 |
| `verify` | 版本分支编译验证 |
| `done` | 版本完成总结 |

### spec-next

执行层命令（Worker 视角）。查看所有平台任务状态，定位下一个可用任务。

### Worker

在 worktree 中**自治开发**的 AI agent，走 11 步循环：

```
Config → Status → Resolve → Context → Lock → Analyze → Execute → Review → Merge → Update → Loop
```

退出条件：全部完成 / 全部阻塞 / 连续 2 次失败。

### Worktree

git worktree 隔离开发环境。每个任务一个 worktree，合并后清理。

分支命名：`feat/{project}/{MMDD}/T{nn}-{name}`

---

## 变更管理 — Change（定义怎么改）

### CR (Change Record)

变更记录，编号 CR-001、CR-002...，记在 `CHANGELOG.md`。

每个 CR 包含：变更来源、影响范围、传播 checklist。

### propagate

CR 传播流程：

```
CR 记录 → 创建 worktree → 仅应用变更 → build → review → merge → checklist 全 [x] → CR ✅
```

---

## 执行可观测性 — Observability（定义怎么记）

### 工作类型

| 类型 | 定义 |
|------|------|
| **task** | 功能开发（T{nn}） |
| **sync** | 外部文档同步（PRD/API/Figma） |
| **change** | 需求变更记录（CR-{nnn}） |
| **review** | 走查/修复 |
| **visual-qa** | 截图驱动 UI 收敛 |
| **fix** | 单点缺陷修复 |
| **retro** | 工作流回顾 |

### 执行日志 (_logs/)

路径 `moox/{version}/_logs/{date}-{type}-{scope}.md`。每次 AI 工作必写。

### Chain

同模块多轮迭代的**关联机制**。

| 字段 | 含义 |
|------|------|
| `chain_id` | 格式 `{feature}-{scope}`，如 `f05-home-ui` |
| `iteration` | 当前轮次（从 1 开始） |
| `prev` | 前一轮日志文件名 |

用途：度量"这个模块需要 N 轮才收敛"。

### Gate Check

门禁状态记录，UI 相关工作强制：

- Feature YAML: ✅/❌
- ui_contract: ✅/⚠️/❌/N/A
- pixel_baseline: ✅/❌/N/A
- data_contract: ✅/❌/N/A
- Figma 基线图: ✅/❌

### Outcome

日志闭环。每个日志结尾强制：

- 用户验收: ✅/❌/⏳
- 后续 chain: 下一轮文件名 / closed
- 收敛轮次: 仅 closed 时填写

---

## 实现层 — How + Why（定义怎么做）

### implementation/

路径 `moox/{version}/implementation/`。Feature YAML 定义 What，implementation 定义 **How**。

| 文件 | 含义 | 生成者 |
|------|------|--------|
| `overview.md` | 版本总设计概览 | 首个 Worker |
| `{platform}/tech-plan.md` | 平台级综合技术方案 | 首个 Worker |
| `F{nn}-{name}/design.md` | 通用方案（双端共享） | Worker Step 6 |
| `F{nn}-{name}/{platform}.md` | 平台细化方案 | Worker Step 6 |

---

## 外部资源

### figma-index.md

Figma 设计稿的**页面索引**。按 Section 分组，每个 Page 记录 node_id 和用途。

路径 `moox/{version}/figma-index.md`，由 `/spec-init` 通过 Figma MCP 自动生成。

### i18n/strings.md

国际化文案的**唯一权威源**。按 Feature 分组，每行一个 key + zh/ja/en 翻译。

Feature YAML 和 Task 只引用此文件，不内联 key。

### prd/README.md

PRD 的**结构化索引**。功能清单 + 埋点需求 + 关键依赖。

PRD 原文优先从 moox-prd git 仓库读取 Markdown，PDF 兜底。
