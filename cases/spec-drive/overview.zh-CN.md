[English](./overview.md) | [中文](./overview.zh-CN.md)

# Specs 自动化工具链

> 项目驱动研发的自动化支持

---

## 工具概览

| 命令 | 功能 | 状态 |
|-----|------|------|
| `specs-cli parse-prd` | PRD → 功能定义 | 🔴 规划 |
| `specs-cli gen-tasks` | 功能定义 → 平台任务 | 🔴 规划 |
| `specs-cli status` | 更新全局看板 | 🔴 规划 |
| `specs-cli exec` | 执行任务（上下文组合） | 🔴 规划 |
| `specs-cli new-version` | 创建新版本 | 🔴 规划 |
| `specs-cli verify-api` | API Contract Verify | 🔴 规划 |

---

## 数据流

```
┌─────────────────────────────────────────────────────────────────────┐
│  Phase 0: 输入物料                                                   │
│  PRD (PDF/文档) + Figma + Swagger + 后端文档                        │
│       │                                                             │
│       ▼ Phase 2: specs-cli parse-prd                                │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  {version}/features/F01-xxx.yaml                            │   │
│  │  • 功能描述 + 需求 + 验收标准                                │   │
│  │  • UI 合同 + 状态矩阵（ui_contract/state_matrix）            │   │
│  │  • Figma 页面 (source: figma-index)                         │   │
│  │  • API 端点 (source: swagger/backend.md, verified: bool)    │   │
│  │  • i18n + analytics                                         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│       │                                                             │
│       ▼ Phase 3: 接口对齐 (验证门禁) ★★★                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Feature YAML × Swagger × backend.md 三方校验               │   │
│  │  • 端点路径一致                                              │   │
│  │  • 请求参数字段名一致                                        │   │
│  │  • 响应字段满足需求                                          │   │
│  │  • 通过 → verified: true | 不通过 → ⚠️/❌ 标记              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│       │                                                             │
│       ▼ Phase 5: specs-cli gen-tasks                                │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  {version}/tasks/ios.md                                     │   │
│  │  {version}/tasks/android.md                                 │   │
│  │  {version}/tasks/backend.md                                 │   │
│  └─────────────────────────────────────────────────────────────┘   │
│       │                                                             │
│       ▼ specs-cli exec T01 --platform ios                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  7 步执行流程 (详见 EXEC-PROTOCOL.md):                       │   │
│  │  1. Parse   — 解析目标                                       │   │
│  │  2. Check   — 检查依赖 + API Contract Verify                │   │
│  │  3. Lock    — 锁定任务 🔴→🟡 + git commit                    │   │
│  │  4. Collect — 收集上下文 (Figma交叉检查 + API来源区分)       │   │
│  │  5. Execute — 执行开发                                       │   │
│  │  6. Verify  — 编译验证                                       │   │
│  │  7. Update  — 更新状态 🟡→🟢 + git commit                    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│       │                                                             │
│       ▼ specs-cli status                                            │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  {version}/DASHBOARD.md                                     │   │
│  │  • 全局进度                                                  │   │
│  │  • 阻塞项                                                    │   │
│  │  • 依赖关系                                                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

> Phase 3 接口对齐是 v1.2 踩坑最多的环节，必须在生成任务前完成。
> 视觉对齐同样是高风险环节，执行阶段必须走 `specs/workflows/ui-contract.md` 的阻断规则。
> 完整生成流程见 [SPEC-GENERATION.md](./SPEC-GENERATION.md)。

---

## 实现方式

### 当前阶段：AI 驱动

工具链由 AI Agent（Claude Code/Codex）解释执行：

```
用户: 执行 F01

Claude Code:
1. Parse   — 读取 {version}/features/F01-*.yaml
2. Check   — 检查依赖 + API Contract Verify
3. Lock    — 标记 🔴→🟡 + git commit
4. Collect — 下载 Figma + 提取 API (Swagger vs backend.md)
5. Execute — 实现代码
6. Verify  — 编译验证
7. Update  — 标记 🟡→🟢 + git commit
```

### 未来阶段：脚本自动化

```bash
# Python/Node.js 实现
specs-cli exec F01 --platform ios
```

---

## 功能定义格式 (YAML)

```yaml
id: F01
name: 功能名称
module: 模块
priority: P0/P1/P2

description: |
  功能描述

requirements:
  - id: R01
    desc: 需求描述

acceptance_criteria:
  - id: AC01
    type: ui/api/interaction/deeplink
    desc: 验收描述
    check: screenshot_diff/api_test/manual

ui_contract:
  required:
    - 自定义弹窗
  forbidden:
    - UIAlertController(.alert/.actionSheet)
  key_tokens:
    modal_size: "267x334"

state_matrix:
  - id: S01
    figma_node: "119:370#119:448"
    trigger: 长按后点击重写
    expected: 中央弹窗出现

figma:
  file_key: xxx
  pages:
    - name: 页面名
      node_id: "123:456"
      source: figma-index  # 来源: figma-index / 手动补充

api:
  - endpoint: /chat/rewrite_message
    method: POST
    source: backend.md#B01  # 来源: swagger / backend.md / 待确认
    verified: true           # 是否已与实际接口校验
    params:
      - name: session_id
        type: uint64
        required: true
      - name: content
        type: string
        required: false
    response_fields:
      - name: ret
        type: int
      - name: data
        type: object

i18n:
  keys:
    - key: chat.rewrite.modal.title
      default: 重写剧情
  source: strings.md  # 或 "待翻译"

analytics:
  events:
    - action: click
      scene: story
      object: rewrite

platform_tasks:
  ios: T01
  android: T01
  web: null
  backend: B01

dependencies:
  - F00  # 依赖的功能 ID

status: pending/in_progress/completed
```

> `source` 和 `verified` 是关键字段：强制标注每个数据的来源，而非凭记忆填写。
> `params` 和 `response_fields` 用于 API Contract Verify 自动校验。

---

## 任务执行协议

详见 [EXEC-PROTOCOL.md](./EXEC-PROTOCOL.md)。

### 执行命令格式

```
执行 <功能ID|任务ID> [--platform <ios|android|web|backend>]
```

### 执行流程 (7 步)

1. **Parse** — 解析目标 (F{nn} / T{nn} / D{n})
2. **Check** — 检查依赖 + API Contract Verify (Swagger vs backend.md)
3. **Lock** — 锁定任务 🔴→🟡 + git commit
4. **Collect** — 收集上下文 (Figma 交叉检查 + API 来源区分)
5. **Execute** — 执行开发
6. **Verify** — 编译验证
7. **Update** — 更新状态 🟡→🟢 + git commit

---

## 状态同步规则

| 场景 | 触发 | 动作 |
|-----|------|------|
| 任务锁定 | Step 3 Lock | 更新 tasks/{platform}.md 🔴→🟡 + git commit |
| 任务完成 | Step 7 Update | 更新 tasks/{platform}.md 🟡→🟢 + git commit |
| 所有平台任务完成 | 自动检测 | 功能标记完成 |
| 依赖功能完成 | 自动检测 | 解除后续功能阻塞 |
| 任何状态变更 | 自动 | 刷新 DASHBOARD.md |

---

## 目录结构约定

版本文件直接放在 `moox/{version}/` 下，不使用 `versions/` 子目录：

```
moox/{version}/
├── config.yaml          # 版本配置 (Figma key, 路径映射)
├── summary.md           # 版本概述
├── WORKFLOW.md          # 执行工作流
├── DASHBOARD.md         # 进度看板
├── prd/                 # PRD 文档
├── features/            # Feature YAML
├── figma-index.md       # Figma 页面索引
├── i18n/                # 国际化文案
└── tasks/               # 任务计划
    ├── shared.md
    ├── backend.md       # 含校验状态列
    ├── ios.md
    ├── android.md
    └── refs/            # 接口文档截图等参考资料
```

---

## 文档索引

| 文档 | 用途 | 建议阅读顺序 |
|------|------|-------------|
| [TUTORIAL.md](./TUTORIAL.md) | **新手教程** — 从零理解 spec 系统 | 1 (起点) |
| [GLOSSARY.md](./GLOSSARY.md) | 术语表 — 所有核心名词的定义与关系 | 2 |
| [SPEC-ARCHITECTURE.md](./SPEC-ARCHITECTURE.md) | 架构文档 — 三层架构 + 数据流 + 分支策略 | 3 |
| [SPEC-GENERATION.md](./SPEC-GENERATION.md) | 生成流程 — 完整 spec 生成协议 | 按需 |
| [SPEC-DRIVE-GUIDE.md](./SPEC-DRIVE-GUIDE.md) | 编排指南 — spec-drive 操作手册 | 按需 |
| [EXEC-PROTOCOL.md](./EXEC-PROTOCOL.md) | 执行协议 — Worker 7 步循环 | 按需 |
| [SPEC-INIT.md](./SPEC-INIT.md) | 初始化指南 — spec-init 使用说明 | 按需 |

## 下一步实现

1. [ ] PRD 解析（AI 辅助，人工确认）
2. [ ] API Contract Verify 自动化（Feature YAML × Swagger 自动比对）
3. [ ] 任务生成（从功能定义自动生成）
4. [ ] 状态同步脚本
5. [ ] 执行引擎（上下文自动组合）
6. [ ] 验收自动化（截图对比、API 测试）
