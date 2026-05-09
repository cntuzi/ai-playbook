[English](./architecture.md) | [中文](./architecture.zh-CN.md)

# Spec 系统架构

> 从 PRD 到代码的全自动化流水线：生成 → 编排 → 执行。

---

## 1. 全景

```
PRD + Figma + API 文档         ← 用户提供素材
        │
   /spec-init                  ← 生成层：一次性生成 spec 骨架
        │
   moox/{version}/             ← 规格层：Feature YAML + Task Plan + i18n + ...
        │
   /spec-drive setup           ← 编排层：创建版本分支
   /spec-drive next            ← 编排层：分析依赖 → 分派 Worker
        │
   Worker × 2 (iOS + Android)  ← 执行层：自治开发 11 步循环
        │
   /spec-drive done            ← 版本完成
```

---

## 2. 三层架构

### 2.1 生成层 — `/spec-init`

**职责**: 从 PRD + 素材一次性生成完整 spec 骨架。

```
输入                            处理                          输出
─────────────                   ────────────────              ──────────────
PRD (PDF/MD)           →  Step 3: PRD 解析          →  features/F{nn}-*.yaml
Figma (file_key)       →  Step 4: Figma 索引        →  figma-index.md
Swagger (JSON)         →  Step 5: API 解析          →  tasks/backend.md
i18n 种子              →  Step 6: 全量生成          →  config.yaml
                          Step 7: 交叉校验              tasks/{ios,android}.md
                                                        i18n/strings.md
                                                        CHANGELOG.md
```

**三种模式**:

| 模式 | 命令 | 用途 |
|------|------|------|
| generate | `/spec-init 1.3` | 全量生成（版本目录不存在时） |
| refresh | `/spec-init 1.3 refresh` | 增量补充（PRD 变更后新增功能） |
| validate | `/spec-init 1.3 validate` | 仅校验，不修改文件 |

### 2.2 编排层 — `/spec-drive`

**职责**: 任务分析 + 依赖图 + worktree 创建 + Worker 分派 + 状态监控。

```
┌──────────────────────────────────────────────────────────────────┐
│                     specs 仓库 (编排中心)                          │
│                                                                  │
│  /spec-init:   PRD + 素材 → spec 骨架 (一次性)                    │
│  /spec-drive:  分析 + 分派 + 监控 + 变更管理                       │
│  /spec-next:   状态查看 + 任务定位                                 │
│                                                                  │
│  ┌──────────────────────────────────────┐                        │
│  │         编排器核心流程                  │                        │
│  │                                      │                        │
│  │  Phase 0: 前置校验 (tmux/分支/仓库)   │                        │
│  │  Phase 1: 全局分析 (依赖图/波次规划)   │                        │
│  │  Phase 2: 展示计划 + 确认             │                        │
│  │  Phase 3: 基础设施 (worktree/tmux)    │                        │
│  │  Phase 4: 返回控制                    │                        │
│  └──────────────────────────────────────┘                        │
└────────────────┬───────────────────────┬─────────────────────────┘
                 │                       │
      ┌──────────▼──────────┐  ┌────────▼──────────────┐
      │  pixel_muse_ios     │  │  pixel_muse_android    │
      │                     │  │                        │
      │  feat/v1.3 ← 集成   │  │  feat/v1.3 ← 集成      │
      │    ↑                │  │    ↑                   │
      │  wt/T06-xxx ← 开发  │  │  wt/T06-xxx ← 开发     │
      └─────────────────────┘  └────────────────────────┘
```

**子命令全集**:

| 子命令 | 执行频率 | 职责 |
|--------|---------|------|
| `setup` | 版本 1 次 | 检查 spec 完整性 → 创建版本分支 |
| `next [platform]` | 多次 | 智能分析 → worktree → Worker 分派 |
| `T{nn} [platform]` | 按需 | 执行指定任务 |
| `status` | 随时 | 聚合双端进度 → DASHBOARD |
| `reset T{nn}` | 故障恢复 | 🟡→🔴 重置卡死任务 |
| `change <type> <scope> "<desc>"` | 按需 | CR 记录 + 影响分析 |
| `change status` | 随时 | CR 传播看板 |
| `propagate CR-{nnn}` | 按需 | CR 代码返工 |
| `verify` | 版本末 | 版本分支编译验证 |
| `done` | 版本 1 次 | 完成总结 |

### 2.3 执行层 — `/spec-next` (Worker)

**职责**: 在 worktree 中自治完成开发全流程。

```
┌──────────────────────────────────────────────────────────────┐
│                    Worker Session 循环                         │
│                                                              │
│  LOOP:                                                       │
│    Step 1   Config     读取配置                               │
│    Step 2   Status     收集任务状态                            │
│    Step 3   Resolve    定位目标任务                            │
│    Step 4   Context    展示上下文 (Figma/API/i18n)            │
│    Step 5   Lock       🔴→🟡 + git commit                    │
│    Step 6   Analyze    design.md + {platform}.md              │
│    Step 7   Execute    API Verify → Collect → Code → Build   │
│    Step 8   Review     Code Review (最多 3 轮)                │
│    Step 9   Merge      merge → feat/v{version} + cleanup     │
│    Step 10  Update     🟡→🟢 + git commit                    │
│    Step 11  Loop       下一个任务 or EXIT                     │
│                                                              │
│  退出条件:                                                    │
│    ✅ 全部完成 │ ⏸ 全部阻塞 │ ❌ 连续 2 次失败               │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. 规格层 — 目录结构

```
moox/{version}/
│
├── config.yaml ──────────────────── 版本配置
│   ├── version, codename
│   ├── figma.file_key
│   ├── paths (所有文件定位)
│   ├── api.swagger_files
│   ├── features[] (快速索引)
│   └── dependency_index
│       ├── api_to_features         /chat/rewrite_message → [F02]
│       ├── figma_to_features       "119:370" → [F02]
│       └── feature_to_backend      F02 → [B01]
│
├── prd/
│   ├── README.md ────────────────── 结构化 PRD 索引
│   └── *.pdf ────────────────────── PRD 原文
│
├── features/
│   ├── F01-xxx.yaml ─────────────── What + Constraint
│   ├── F02-xxx.yaml                  id, name, module, epic
│   ├── ...                           description, requirements
│   └── F{nn}-xxx.yaml               acceptance_criteria
│                                     ui_contract ← Figma 驱动
│                                     delivery_contract ← 技术栈约束
│                                     state_matrix ← 状态场景
│                                     figma.pages[] ← 设计资源
│                                     api[] ← 接口定义
│                                     analytics[] ← 埋点
│                                     i18n_keys[] ← 国际化
│                                     platform_tasks ← T/B 映射
│                                     dependencies ← 功能间依赖
│
├── tasks/
│   ├── shared.md ────────────────── S1-S3 前置 + API 模式 + 错误码
│   ├── backend.md ───────────────── B01-B{nn} 后端 API 详情
│   ├── ios.md ───────────────────── T01-T{nn} 唯一状态源 (iOS)
│   └── android.md ───────────────── T01-T{nn} 唯一状态源 (Android)
│
├── i18n/
│   └── strings.md ───────────────── key | zh | ja | en
│
├── figma-index.md ───────────────── Section → Page → Node ID
│
├── CHANGELOG.md ─────────────────── CR 变更日志 + checklist
│
├── DASHBOARD.md ─────────────────── 进度看板 (聚合生成)
│
└── implementation/ ──────────────── How + Why
    ├── overview.md                   版本总设计概览
    ├── ios/tech-plan.md              iOS 端综合技术方案
    ├── android/tech-plan.md          Android 端综合技术方案
    └── F{nn}-{name}/
        ├── design.md                 通用方案 (双端共享)
        ├── ios.md                    iOS 平台细化
        └── android.md               Android 平台细化
```

---

## 4. 数据流

### 4.1 生成时数据流（spec-init）

```
PRD ──┬── Epic/Feature 提取 ──→ features/F{nn}.yaml
      ├── 埋点表提取 ─────────→ features/F{nn}.yaml → analytics[]
      ├── 依赖表提取 ─────────→ tasks/backend.md (B{nn})
      └── 中文文案提取 ───────→ i18n/strings.md

Figma ─── Section/Page 查询 ──→ figma-index.md
      └── Page→Feature 映射 ──→ features/F{nn}.yaml → figma.pages[]

Swagger ── 端点提取 ──────────→ features/F{nn}.yaml → api[]
       └── 参数/响应提取 ─────→ tasks/backend.md (详情)

以上汇总 ─── 反向索引 ────────→ config.yaml → dependency_index
         └── Task 散射 ───────→ tasks/{ios,android}.md
```

### 4.2 执行时数据流（spec-drive + spec-next）

```
config.yaml ───────────────→ spec-drive: 版本配置
tasks/{platform}.md ───────→ spec-drive: 依赖图 + 波次规划
                           → spec-next:  任务定位 + 状态读写

features/F{nn}.yaml ───────→ Worker Step 4: 上下文收集
                           → Worker Step 6: 方案设计输入
                           → Worker Step 7: API Verify 基准

figma-index.md ────────────→ Worker Step 7: Figma 截图下载
i18n/strings.md ───────────→ Worker Step 7: i18n 文件写入
tasks/backend.md ──────────→ Worker Step 7: API Contract Verify

implementation/*.md ───────→ Worker Step 6: 读取/生成方案
                           → Worker Step 7: 按方案实现
```

### 4.3 变更时数据流（spec-drive change + propagate）

```
变更发生
  │
  ▼
/spec-drive change api /path "desc"
  │
  ├── config.yaml dependency_index ──→ 影响范围 (Features → Tasks)
  ├── CHANGELOG.md ──→ 新增 CR-{nnn} + checklist
  └── features/F{nn}.yaml ──→ revisions[] 记录
  │
  ▼
人工更新 specs 文件 (YAML + Task)
  │
  ▼
/spec-drive propagate CR-{nnn}
  │
  ├── 创建 worktree (CR{nnn}-T{nn}-xxx)
  ├── Worker: 仅应用 CR 变更 → build → review
  ├── merge → feat/v{version}
  └── CHANGELOG checklist [x] → 全部完成 → ✅
```

---

## 5. Feature YAML 与 implementation/ 分工

```
Feature YAML = What + Constraint         implementation/ = How + Why
(做什么、UI 契约、数据契约、状态矩阵)     (怎么做、为什么、模块交互)

┌─────────────────────────┐              ┌──────────────────────────┐
│ F06-self-settings.yaml  │              │ F06-self-settings/       │
│                         │              │                          │
│ description: 自我设定... │  ──生成──→   │ design.md                │
│ requirements: R01-R04   │              │   影响分析、数据流设计     │
│ acceptance_criteria     │              │   API 调用方案、关键决策   │
│ ui_contract             │              │                          │
│ delivery_contract       │  ──细化──→   │ ios.md                   │
│ state_matrix            │              │   现有代码分析            │
│ api[]                   │              │   文件变更清单            │
│ i18n_keys[]             │              │   平台技术选型            │
│ analytics[]             │              │                          │
└─────────────────────────┘              │ android.md               │
                                         │   (同上，Android 视角)    │
 spec-init 生成                           └──────────────────────────┘
 + 人工补充                                Worker Step 6 生成
```

**生成时机**:

| 文档 | 生成时机 | 生成者 |
|------|---------|--------|
| Feature YAML | `/spec-init` | spec-init + 人工补充 |
| overview.md | 版本首次执行 | 首个 Worker |
| {platform}/tech-plan.md | 版本首次执行 | 首个 Worker |
| F{nn}/design.md | Feature 首个任务 | Worker (双端共享) |
| F{nn}/{platform}.md | 每个 Worker | Worker (各端独立) |

---

## 6. 状态生命周期

```
🔴 待开始
    │
    │  Worker Step 5: Lock
    ▼
🟡 进行中
    │
    ├── build + review 通过 ──→ 🟢 已完成
    │                           │
    │                           └── CR 变更 → 🔵 需返工
    │                                          │
    │                                          │ propagate
    │                                          ▼
    │                                        🟡 → 🟢
    │
    └── 失败/阻塞
         │
         └── 🟡 阻塞 (保留 worktree)
              │
              └── /spec-drive reset → 🔴 → 重新执行
```

| 符号 | 含义 | 出现位置 |
|------|------|---------|
| 🔴 | 待开始 | tasks/{platform}.md |
| 🟡 | 进行中 | tasks/{platform}.md (Lock 后) |
| 🔵 | 需返工 | tasks/{platform}.md (CR 变更后) |
| 🟢 | 已完成 | tasks/{platform}.md (验证通过后) |
| ⚫ | 不适用 | DASHBOARD.md (无后端依赖) |

**唯一状态源**: `tasks/{platform}.md` — Worker 读写，DASHBOARD 由 status 聚合生成。

---

## 7. 分支与 Worktree 策略

```
master (or main)
  │
  └── feat/v1.3  ← 版本集成分支 (所有任务合并目标)
       │
       ├── feat/pixel_muse_ios/0306/T06-self-settings      ← 任务分支
       ├── feat/pixel_muse_ios/0306/T07-character-settings
       ├── feat/pixel_muse_android/0306/T06-self-settings
       └── feat/pixel_muse_android/0306/T07-character-settings
```

**Worktree 生命周期**:

```
创建 → wt.sh new T06-xxx feat/v1.3
     → wt/{project}/{MMDD}/T06-xxx/ + tmux window + symlinks

使用 → Worker 在 worktree 中开发 (Step 6-8)

合并 → git merge --no-ff → feat/v{version}

清理 → wt.sh -f rm T06-xxx → 删除 worktree + 分支 + tmux window
```

---

## 8. 智能分析 — 执行波次

从 tasks/{platform}.md 依赖列构建依赖图，规划并行执行批次:

```
示例 (v1.2):

T01 ─┬→ T02 ──→ (等 B01)
     ├→ T03 ──→ (等 B02)
     ├→ T04 ──→ (等 B03)
     └→ T05

T06 (独立) ──→ (等 B04)
T07 (独立) ──→ (等 B05)

T08 → T09 ──→ (等 B06)
       └→ T10 ──→ (等 B07)

T11 (独立)
T12 (独立)

Wave 1: T01, T06, T07, T08, T11, T12    ← 无依赖，可并行
Wave 2: T05, T09                          ← 依赖 Wave 1
Wave 3: T10                               ← 依赖 T09
Blocked: T02, T03, T04                    ← 等后端 B01-B03
```

---

## 9. 变更管理

```
CHANGELOG.md              dependency_index            Feature YAML
(变更记录)                (影响分析)                   (变更追踪)
     │                        │                           │
     │  /spec-drive change    │                           │
     │  ────────────────→     │                           │
     │  自动生成 CR-{nnn}      │ api_to_features          │ revisions[]
     │  + checklist           │ figma_to_features        │ [CR-{nnn}] 标注
     │                        │ feature_to_backend       │
     ▼                        ▼                           ▼
  CR-003                   F06 → T06 iOS               F06.yaml
  🔴 待传播               F06 → T06 Android            + [CR-003] 行
  checklist: 6 项          F06 → B04                   + revisions 记录
     │
     │  /spec-drive propagate CR-003
     │  ────────────────────────→
     │
     ▼
  Worker: worktree → 仅应用变更 → build → review → merge
  CHANGELOG: [ ] → [x]
  全部 [x] → CR-003 ✅
```

---

## 10. 权威文件索引

| 文件 | 角色 | 写入者 | 读取者 |
|------|------|--------|--------|
| `.claude/commands/spec-init.md` | 生成协议 | - | spec-init |
| `.claude/commands/spec-drive.md` | 编排协议 | - | spec-drive |
| `{platform}/.claude/commands/spec-next.md` | 执行协议 | - | Worker |
| `moox/{version}/config.yaml` | 版本配置 | spec-init | 所有 |
| `moox/{version}/features/*.yaml` | 需求规格 | spec-init + 人工 | Worker |
| `moox/{version}/tasks/{platform}.md` | **唯一状态源** | Worker + spec-drive | 所有 |
| `moox/{version}/tasks/backend.md` | 后端 API | spec-init + 人工 | Worker |
| `moox/{version}/implementation/*.md` | 实现方案 | Worker | Worker |
| `moox/{version}/CHANGELOG.md` | 变更追踪 | spec-drive change | propagate |
| `moox/{version}/DASHBOARD.md` | 进度看板 | spec-drive status | 人工查看 |
| `moox/{version}/figma-index.md` | Figma 索引 | spec-init | Worker |
| `moox/{version}/i18n/strings.md` | 国际化 | spec-init | Worker |
| `_scripts/SPEC-DRIVE-GUIDE.md` | 操作指南 | - | 人工参考 |
| `_scripts/SPEC-ARCHITECTURE.md` | 架构文档 | - | 人工参考 |
| `_templates/*.yaml|md` | 文件模板 | - | spec-init |

---

## 11. 典型工作流

### 新版本全量开发

```bash
# 1. 准备素材
#    放置 PRD 到 moox/1.3/prd/

# 2. 生成 spec
/spec-init 1.3                    # PRD + Figma + API → 完整 spec

# 3. 补充人工字段 (可选，不阻塞执行)
#    ui_contract, delivery_contract, state_matrix.figma_node

# 4. 初始化
/spec-drive setup                 # 检查 spec 完整性 → 创建版本分支

# 5. 执行
/spec-drive next                  # 自动分析 → 双端并行启动
#    iOS:     T01 → T05 → T06 → T07 → ... → ⏸ (等后端)
#    Android: T01 → T05 → T06 → T07 → ... → ⏸ (等后端)

# 6. 监控
/spec-drive status                # 实时双端进度

# 7. 变更处理
/spec-drive change api /path "新增字段"
/spec-drive propagate CR-001      # 自动返工

# 8. 完成
/spec-drive verify                # 编译验证
/spec-drive done                  # 版本总结
```

### PRD 变更后增量更新

```bash
/spec-init 1.3 refresh            # 补充新功能，不覆盖已有
/spec-drive next                  # 自动检测新任务
```

### 仅校验

```bash
/spec-init 1.3 validate           # 输出通过/失败/警告报告
```
