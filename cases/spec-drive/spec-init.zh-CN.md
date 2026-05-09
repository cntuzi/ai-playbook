[English](./spec-init.md) | [中文](./spec-init.zh-CN.md)

# /spec-init — 版本 Spec 自动化生成

> PRD + Figma + Swagger → 完整 spec 骨架，一条命令搞定。

**协议文件**: `.claude/commands/spec-init.md`
**关联文档**: [SPEC-ARCHITECTURE.md](./SPEC-ARCHITECTURE.md) · [SPEC-DRIVE-GUIDE.md](./SPEC-DRIVE-GUIDE.md)

---

## 1. 定位

spec-init 是 spec 系统的**生成层**，解决从 PRD 到 spec 的断链问题：

```
PRD + Figma + Swagger         ← 用户提供
        │
   /spec-init                 ← 生成层（本命令）
        │
   moox/{version}/            ← config + features + tasks + i18n + ...
        │
   /spec-drive setup          ← 编排层（接管执行）
```

**设计原则**:
- **一次性**：每个版本只跑一次 generate，后续用 refresh 增量
- **骨架优先**：能自动填的填，不能的标 `⚠️ TODO`，不阻塞后续流程
- **可校验**：内置 7 项交叉校验，确保产物完整性

---

## 2. 命令格式

```
/spec-init                     # 读取 config.yaml version.current
/spec-init 1.3                 # 指定版本，全量生成
/spec-init 1.3 refresh         # 增量更新（PRD 变更后新增功能）
/spec-init 1.3 validate        # 仅校验，不修改文件
```

### 三种模式

| 模式 | 前提 | 行为 | 典型场景 |
|------|------|------|---------|
| **generate** | 版本目录不存在 | 全量创建 23+ 文件 | 新版本启动 |
| **refresh** | 版本目录已存在 | 补充缺失，不覆盖已有 | PRD 追加功能 |
| **validate** | 版本目录已存在 | 仅运行校验，零修改 | CI 检查 / 人工复核 |

---

## 3. 输入素材

| 素材 | 必须 | 来源 | 用途 |
|------|------|------|------|
| **PRD** | 必须 | `moox/{version}/prd/README.md` 或 `.pdf` | 功能提取、需求、埋点 |
| **Figma** | 推荐 | file_key（如 `jaVhFJr7WwAQ8QQY97KvvJ`） | 页面索引、UI 映射 |
| **Swagger** | 推荐 | `api-doc/*_swagger.json` | API 参数、响应、端点 |
| **i18n 种子** | 可选 | 已有翻译文件 | 文案初始化 |

**缺失处理**：PRD 缺失则中止；其余标 `⚠️ 待补` 继续生成。

---

## 4. 执行流程

### 全景

```
Step 1 ─── 解析参数          → version, mode
Step 2 ─── 环境准备          → 创建目录, 收集素材路径
Step 3 ─── PRD 解析          → 功能映射表 (F01-F{N})
Step 4 ─── Figma 索引        → figma-index.md + Page→Feature 映射
Step 5 ─── API 解析          → Feature.api[] + backend.md 骨架
Step 6 ─── 全量生成          → 12 类文件一次性产出
Step 7 ─── 校验 + 报告       → 7 项交叉校验 + 生成统计
```

### Step 3: PRD 解析（核心）

从 PRD 提取：

```
PRD
 ├── 版本元信息 (版本号/代号/周期/提测日期)
 ├── Epic 结构
 │    ├── Epic 1: 聊天增强
 │    │    ├── F01: 消息长按菜单
 │    │    ├── F02: AI 回复重写
 │    │    └── ...
 │    ├── Epic 2: 设定功能
 │    └── ...
 ├── 埋点需求 → analytics[]
 └── 关键依赖 → backend B{nn}
```

**模块推导规则**：

| Epic 内容关键词 | 模块 |
|----------------|------|
| 聊天/消息/对话 | `chat` |
| 设定/自我/角色 | `settings` |
| 故事/编辑/审核 | `story` |
| 埋点/统计 | `analytics` |
| 交互/优化 | `interaction` |

### Step 4: Figma 索引

```
Figma file_key
    │
    ▼
mcp__figma-developer__get_figma_data(fileKey, depth=2)
    │
    ▼
┌──────────────────────────────────────┐
│  figma-index.md                       │
│                                       │
│  Section 1: 重写 (119:264)            │
│    Page 1: 故事互动_长按操作  119:265  │
│    Page 2: 故事互动_重写_未输入 119:370 │
│    ...                                │
│  Section 2: 回溯 (119:1665)           │
│    ...                                │
└──────────────────────────────────────┘
    │
    ▼
Feature.figma.pages[] ← Page→Feature 模糊匹配 + PRD 链接提取
```

### Step 5: API 解析

```
Swagger JSON                    PRD 依赖表
    │                              │
    ├── 提取 endpoints             ├── 功能→接口映射
    ├── 提取 params/response       │
    └── 匹配 Feature ──────────────┘
                │
                ▼
    Feature.api[] (endpoint, params, verified:false)
    backend.md B{nn} (详细参数表)
```

### Step 6: 全量生成（12 类文件）

按依赖顺序生成：

| 序号 | 文件 | 依赖 | 说明 |
|------|------|------|------|
| 6.1 | `prd/README.md` | - | PRD 来自 PDF 时生成索引 |
| 6.2 | `config.yaml` | Step 3-5 | 版本配置 + dependency_index |
| 6.3 | `features/F{nn}-*.yaml` × N | Step 3-5 | 每功能一个 YAML |
| 6.4 | `tasks/shared.md` | Step 5 | S1-S3 + API 模式 |
| 6.5 | `tasks/backend.md` | Step 5 | B{nn} 接口详情 |
| 6.6 | `tasks/ios.md` | 6.3 | T{nn} 任务详情 (iOS) |
| 6.7 | `tasks/android.md` | 6.6 | 镜像 iOS，平台替换 |
| 6.8 | `i18n/strings.md` | 6.3 | key + zh，en/ja 待翻译 |
| 6.9 | `CHANGELOG.md` | - | 空模板 |
| 6.10 | `figma-index.md` | Step 4 | 已提前生成 |
| 6.11 | `implementation/` | - | 目录骨架 (.gitkeep) |
| 6.12 | `.claude/config.yaml` 更新 | - | version.current |

---

## 5. 输出产物

以 `cc-100.0` 验证版本为例（12 功能，7 后端 API）：

```
moox/cc-100.0/
├── config.yaml                     ← 版本配置 + dependency_index
├── prd/
│   └── README.md                   ← 结构化 PRD 索引
├── features/
│   ├── F01-message-longpress-menu.yaml
│   ├── F02-ai-rewrite.yaml
│   ├── F03-restart-conversation.yaml
│   ├── F04-message-backtrack.yaml
│   ├── F05-message-copy.yaml
│   ├── F06-self-settings.yaml
│   ├── F07-character-settings.yaml
│   ├── F08-story-edit-entry.yaml
│   ├── F09-story-edit-page.yaml
│   ├── F10-review-state-machine.yaml
│   ├── F11-rating-dialog-analytics.yaml
│   └── F12-create-page-keyboard.yaml
├── tasks/
│   ├── shared.md                   ← S1-S3 + API 交互模式
│   ├── backend.md                  ← B01-B07 接口详情
│   ├── ios.md                      ← T01-T12 任务详情 (iOS)
│   └── android.md                  ← T01-T12 任务详情 (Android)
├── i18n/
│   └── strings.md                  ← 46 keys (zh + en)
├── figma-index.md                  ← 43 页面 × 8 Section
├── CHANGELOG.md                    ← 空模板
└── implementation/
    ├── ios/.gitkeep
    └── android/.gitkeep
```

**产出统计**：

| 类型 | 数量 |
|------|------|
| Feature YAML | 12 |
| 平台任务 | iOS 12 + Android 12 |
| 后端 API | 7 |
| i18n Keys | 46 |
| Figma Pages | 43 |

---

## 6. Feature YAML 完整 Schema

每个 Feature YAML 是功能的**唯一规格定义**（What + Constraint）。

```yaml
# ── 基本信息 ──
id: F02
name: AI 回复重写
module: chat                    # 模块归属
epic: 1                         # Epic 编号
priority: P0
prd_ref: "prd/README.md#1.1"   # PRD 章节引用
day: D1-D2                      # 排期

# ── 需求描述 ──
description: |
  长按角色消息 → 重写弹窗 → 100字输入框 → 流式输出替换。

requirements:
  - id: R01
    desc: 长按菜单 + 最新一条角色消息底部菜单均可触发重写

# ── 验收标准 ──
acceptance_criteria:
  - id: AC01
    type: ui                    # ui / interaction / api / data
    desc: 重写弹窗样式与 Figma 一致

# ── 契约（⚠️ TODO 待人工填充）──
ui_contract: {}                 # source_nodes / required / forbidden
delivery_contract: {}           # stack_baseline / data_contract

# ── 状态矩阵 ──
state_matrix:
  - id: S01
    name: 未输入
    figma_node: "⚠️ TODO"      # 待映射 Figma 节点
    trigger: 打开重写弹窗
    expected: 空输入框 + 确认按钮可点击

# ── Figma 设计资源 ──
figma:
  file_key: jaVhFJr7WwAQ8QQY97KvvJ
  pages:
    - name: 故事互动_重写剧情_未输入
      node_id: "119:370"
      usage: 重写弹窗空状态
      source: figma-index

# ── API 接口 ──
api:
  - endpoint: /chat/rewrite_message
    method: POST
    source: "backend.md#B01"
    verified: false              # 待逐字段校验
    params:
      - name: session_id
        type: uint64
        required: true

# ── 埋点 ──
analytics:
  - type: click
    stype: story/chat
    frominfo: rewrite
    trigger: 点击消息菜单重写按钮

# ── 国际化 ──
i18n_keys:
  - key: chat.rewrite.modal.title
    zh: 重写剧情

# ── 平台映射 ──
platform_tasks:
  ios: T02
  android: T02
  backend: B01                  # null = 无后端依赖

# ── 依赖 ──
dependencies: [F01]

# ── 状态 ──
status: pending
```

---

## 7. ID 命名规范

### F{nn} → T{nn} → B{nn} 映射

```
F01 → T01 (iOS + Android)    backend: null       ← 无后端依赖
F02 → T02 (iOS + Android)    backend: B01        ← 有后端依赖
F03 → T03 (iOS + Android)    backend: B02
F04 → T04 (iOS + Android)    backend: B03
F05 → T05 (iOS + Android)    backend: null
F06 → T06 (iOS + Android)    backend: B04
...
```

**规则**：
- **F{nn} 与 T{nn} 一一对应**，编号一致
- **B{nn} 按需分配**，仅有后端依赖的功能才有
- B{nn} 编号独立递增，不与 F/T 绑定

### 文件命名

```
F{nn}-{kebab-name}.yaml

kebab-name 从中文名推导:
  消息长按菜单系统增强  → message-longpress-menu
  AI 回复重写          → ai-rewrite
  自我设定页面         → self-settings
  审核状态机           → review-state-machine
```

---

## 8. 自动填充 vs 人工补充

| 字段 | spec-init 自动 | 人工补充 | 阻塞执行？ |
|------|:-------------:|:-------:|:---------:|
| id / name / module / epic | ✅ | - | - |
| description / requirements | ✅ 从 PRD | - | - |
| acceptance_criteria | ✅ 推导 | 确认 | 否 |
| figma.pages[] | ✅ 索引映射 | 确认 | 否 |
| api[] | ✅ Swagger | ✅ 逐字段校验 | 否 |
| analytics[] | ✅ PRD 埋点表 | - | - |
| i18n_keys[] | ✅ PRD 文案 | ✅ 翻译 | 否 |
| **ui_contract** | ⚠️ 空骨架 | **✅ Figma 填充** | 否* |
| **delivery_contract** | ⚠️ 空骨架 | **✅ 技术栈分析** | 否* |
| **state_matrix.figma_node** | ⚠️ TODO | **✅ 手动映射** | 否* |
| **pixel_baseline** | ⚠️ TODO | **✅ Figma 测量** | 否* |

> *不阻塞 spec-drive 执行，但影响 Worker 方案设计质量。建议在首批任务执行前补充。

---

## 9. dependency_index（反向索引）

config.yaml 中的 `dependency_index` 是变更管理的核心数据结构：

```yaml
dependency_index:
  # API 变更 → 哪些 Feature 受影响？
  api_to_features:
    /chat/rewrite_message: [F02]
    /chatbot/user_self_setting/save: [F06]
    /post/edit_story: [F09, F10]

  # Figma 节点变更 → 哪些 Feature 受影响？
  figma_to_features:
    "119:370": [F02]
    "140:330": [F06]
    "152:75": [F08, F10]

  # Feature → 依赖哪些后端 API？
  feature_to_backend:
    F02: [B01]
    F06: [B04]
    F09: [B06]
```

**用途**：
- `/spec-drive change api /path "desc"` → 查 `api_to_features` → 定位受影响 Feature → 生成 CR
- `/spec-drive change figma "nodeId" "desc"` → 查 `figma_to_features` → 同上

---

## 10. 交叉校验（7 项）

Step 7 自动执行：

| # | 检查项 | 失败 = 阻断？ | 说明 |
|---|--------|:------------:|------|
| 1 | Feature ID 连续性 | 阻断 | F01-F{N} 无间断 |
| 2 | Task ID 一致性 | 阻断 | 每个 F{nn} 在 ios.md + android.md 都有 T{nn} |
| 3 | Backend 映射 | 阻断 | Feature.platform_tasks.backend ↔ backend.md B{nn} |
| 4 | i18n 完整性 | 阻断 | Feature.i18n_keys[] 全部出现在 strings.md |
| 5 | Figma 引用 | 警告 | Feature.figma.pages[].node_id 出现在 figma-index.md |
| 6 | dependency_index 覆盖 | 阻断 | 所有 API/Figma/Backend 映射完整 |
| 7 | 依赖无环 | 阻断 | Feature.dependencies 不形成循环 |

---

## 11. refresh 模式

已有版本的增量更新：

```
/spec-init 1.3 refresh

1. 扫描现有文件
2. 重新解析 PRD
   ├── 新功能 → 创建 YAML + 追加 Task
   └── 已有功能 → 跳过（不覆盖）
3. 补充缺失文件（config / figma-index / tasks / i18n / CHANGELOG）
4. 已有 YAML 缺失字段 → 补充（不覆盖已填内容）
5. dependency_index 全量重算
6. 运行校验
7. 输出 diff 报告:

   | 操作 | 文件 | 说明 |
   |------|------|------|
   | 新建 | features/F13-xxx.yaml | PRD 新增功能 |
   | 更新 | config.yaml | dependency_index 重建 |
   | 跳过 | features/F01-xxx.yaml | 已存在 |
```

---

## 12. 与 spec-drive 衔接

```
/spec-init {version}                    ← 生成 spec 骨架
    │
    ├── (可选) 人工补充 ⚠️ 字段
    │
    ▼
/spec-drive setup                       ← 检查 spec 完整性 → 创建版本分支
    │
    ▼
/spec-drive next                        ← 分析依赖 → 创建 worktree → 派发 Worker
```

**spec-drive setup 完整性检查**（Step 0）：

```
✅ moox/{version}/ 目录存在
✅ moox/{version}/config.yaml 存在
✅ moox/{version}/features/ 至少有 1 个 .yaml
✅ moox/{version}/tasks/ios.md 存在
✅ moox/{version}/tasks/android.md 存在

全部通过 → 继续 setup
任一失败 → ❌ "请先执行 /spec-init {version}"
```

---

## 13. Task 详情散射

Task 文件 (ios.md / android.md) 的每个任务详情从 Feature YAML 散射而来：

```
Feature YAML                          tasks/ios.md T{nn}
────────────                          ────────────────
description         ───→              #### 需求描述
figma.pages[]       ───→              #### Figma 表
ui_contract         ───→              #### UI 合同（阻断项）
delivery_contract   ───→              #### 交付门禁（阻断项）
api[]               ───→              #### API 表
i18n_keys[]         ───→              #### i18n 表
analytics[]         ───→              #### 埋点
acceptance_criteria ───→              #### 验收标准
state_matrix        ───→              #### 视觉验收
verification_evidence ──→             #### 验收证据
dependencies        ───→              #### 依赖
                    ───→              #### L1-L4 分层执行 checklist
```

**每个任务的 L1-L4 分层执行**：
```
- [ ] L1-结构层: 布局、组件层级、数据绑定
- [ ] L2-视觉层: 颜色、字体、间距、圆角
- [ ] L3-交互状态层: 手势、动画、状态切换、异常处理
- [ ] L4-验收证据层: 截图/录屏对比 Figma
```

---

## 14. 实战示例

### cc-100.0 验证运行

```bash
# 执行
/spec-init cc-100.0

# 输入素材
#   PRD:     moox/1.2/prd/README.md (复用)
#   Figma:   jaVhFJr7WwAQ8QQY97KvvJ
#   Swagger: api-doc/chatbot_swagger.json + post_swagger.json

# 输出
#   12 Feature YAML, 24 Tasks (iOS 12 + Android 12)
#   7 Backend API, 46 i18n keys, 43 Figma pages
#   交叉校验: 7/7 通过
```

### 生成的 config.yaml dependency_index

```yaml
dependency_index:
  api_to_features:
    /chat/rewrite_message: [F02]
    /chat/reset_session: [F03]
    /chat/retrieve_messages: [F04]
    /chatbot/user_self_setting/save: [F06]
    /chatbot/user_self_setting/get: [F06]
    /chatbot/user_character_setting/save: [F07]
    /chatbot/user_character_setting/get: [F07]
    /post/edit_story: [F09, F10]
    /post/get_story_detail: [F08, F09, F10]

  figma_to_features:
    "119:265": [F01]
    "119:370": [F02]
    "119:2695": [F03]
    "119:1771": [F04]
    "119:2349": [F05]
    "140:330": [F06]
    "140:1373": [F07]
    "152:75": [F08, F10]
    "229:606": [F09, F10]

  feature_to_backend:
    F02: [B01]
    F03: [B02]
    F04: [B03]
    F06: [B04]
    F07: [B05]
    F09: [B06]
    F10: [B07]
```

### 生成的 Feature YAML 示例（F02-ai-rewrite.yaml）

```yaml
id: F02
name: AI 回复重写
module: chat
epic: 1
priority: P0
day: D1-D2

description: |
  长按角色消息 → 重写弹窗 → 100字输入框 → 流式输出替换。

requirements:
  - id: R01
    desc: 长按菜单 + 最新一条角色消息底部菜单均可触发重写
  - id: R02
    desc: Modal 弹窗 + 100字输入框，可选输入重写指令
  - id: R03
    desc: 弹窗关闭后原消息气泡显示 Loading，流式输出替换
  - id: R04
    desc: 点击输入框拉起键盘，弹窗避让

figma:
  pages:
    - name: 故事互动_重写剧情_未输入
      node_id: "119:370"
    - name: 故事互动_重写剧情_已输入
      node_id: "119:462"
    - name: 故事互动_重写剧情_超限
      node_id: "119:555"
    - name: 故事互动_重写中
      node_id: "119:649"

api:
  - endpoint: /chat/rewrite_message
    method: POST
    source: "backend.md#B01"
    verified: false
    params: [session_id, session_type, msgid, content, mid]

i18n_keys:
  - key: chat.rewrite.modal.title
    zh: 重写剧情
  - key: chat.rewrite.modal.placeholder
    zh: 可以输入你希望AI按照的剧情方向来进行修改（可选）

platform_tasks:
  ios: T02
  android: T02
  backend: B01

dependencies: [F01]
status: pending
```

---

## 15. FAQ

### Q: ⚠️ TODO 字段不填会怎样？

不阻塞 spec-drive 执行。Worker 在 Step 6 (Analyze+Design) 会读取 Feature YAML，空字段意味着 Worker 需要自行分析，方案质量可能降低。建议至少在首批任务执行前补充 `ui_contract` 和 `delivery_contract`。

### Q: refresh 会覆盖已有内容吗？

不会。已有 Feature YAML 完全跳过，只新增缺失功能。已有文件中缺失的字段会补充，但已填写的字段不会被覆盖。

### Q: validate 失败了怎么办？

阻断项（Feature ID 间断、Task 缺失等）需手动修复后重新 validate。警告项（Figma 引用缺失等）不阻塞 spec-drive 执行。

### Q: 可以跳过 spec-init 直接手写 spec 吗？

可以。只要满足 spec-drive setup 的完整性检查（目录 + config + features + tasks），spec-drive 就能接管。spec-init 只是自动化工具，不是强制前置。

### Q: PRD 变更后怎么处理？

```bash
# 1. 更新 PRD 文件
# 2. refresh 增量更新
/spec-init 1.3 refresh

# 3. 如果变更影响已完成任务
/spec-drive change prd "scope" "desc"     # 记录 CR
/spec-drive propagate CR-{nnn}            # 自动返工
```
