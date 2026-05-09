[English](./spec-generation.md) | [中文](./spec-generation.zh-CN.md)

# Spec 生成工作流

> 新版本需求落地为可执行 specs 的标准流程。
> 目标：一次生成质量足够高，减少执行阶段的补丁。

---

## 为什么需要这个流程

v1.2 的 specs 执行过程中发现了以下问题，全部可以在生成阶段避免：

| 问题类型 | v1.2 实例 | 根因 |
|---------|----------|------|
| 字段名不一致 | `self_setting` vs Swagger 的 `self_desc` | 从 PRD 推导字段名，没查 Swagger |
| 接口模型错误 | 写了 `IM say(MtypeRewrite)`，实际是 `POST /chat/rewrite_message` | 基于早期技术讨论，实际实现已变 |
| 响应字段缺失 | `get_story_detail` 没有 `creator_id` | 假设 API 会返回需要的字段 |
| 枚举未定义 | `status` 字段值含义不明 | 没确认 Swagger 或后端文档 |
| Figma 页面遗漏 | Feature YAML 未引用 figma-index 中的页面 | YAML 和 figma-index 各写各的 |
| 流程缺防御 | 无任务锁定、无 API 校验 | 假设 specs 完美 |

---

## 生成流程

### Phase 0: 输入物料清单

开始生成前，确认以下物料是否就绪：

```
□ PRD 文档 (PDF / Markdown)
□ Figma 设计稿 (file_key + 页面结构)
□ 后端技术方案 (如有)
□ Swagger / 接口文档 (如有)
□ 私信中台 / IM 接口文档 (如有)
□ 上一版本的 specs (参考结构)
```

**关键原则**：没有接口文档的功能，在 backend.md 中标记 `❓ 待确认`，而非自行假设。

### Phase 1: 结构搭建

创建版本目录结构：

```
moox/{version}/
├── config.yaml          # 版本配置 (Figma key, 路径映射)
├── summary.md           # 版本概述
├── WORKFLOW.md          # 执行工作流 (从上个版本复制+调整)
├── DASHBOARD.md         # 进度看板
├── prd/                 # PRD 文档
├── features/            # Feature YAML
├── figma-index.md       # Figma 页面索引
├── i18n/                # 国际化文案
└── tasks/               # 任务计划
    ├── shared.md
    ├── backend.md
    ├── ios.md
    ├── android.md
    └── refs/            # 接口文档截图等参考资料
```

### Phase 2: 需求拆解 → Feature YAML

从 PRD 拆解为 Feature YAML。

#### 2.1 PRD 段落 → Feature ID 映射

按以下规则将 PRD 中的功能段落映射为 Feature ID：

```
操作步骤:
1. 通读 PRD，识别所有独立功能点（一个功能 = 一个用户可感知的完整交互）
2. 按模块分组编号:
   - 聊天模块: F01-F05
   - 设定模块: F06-F07
   - 故事模块: F08-F10
   - ...
3. 为每个 Feature 确定:
   - module: 所属模块
   - priority: P0 (核心) / P1 (重要) / P2 (可延期)
   - dependencies: 依赖的其他 Feature ID
4. 一个 PRD 段落可能拆为多个 Feature (如 "聊天增强" 拆为 长按菜单 + 重写 + 回溯 + 复制)
5. 多个 PRD 段落可能合为一个 Feature (如 "故事编辑" 和 "编辑权限" 合为 F08)
```

#### 2.2 Figma 页面提取

Figma node_id **必须从 figma-index.md 提取**，不可从 PRD 推导：

```
操作步骤:
1. 读取 {version}/figma-index.md
2. 按 section 遍历每个页面:
   - 识别该页面属于哪个 Feature (根据页面名称 + 功能描述)
   - 提取 node_id
3. 写入 Feature YAML 的 figma.pages:
   - node_id: "119:265"
     name: 页面名称 (与 figma-index 一致)
     source: figma-index
4. figma-index 中无法映射到任何 Feature 的页面 → 记录为遗漏，新增 Feature 或扩展现有 Feature

注意: PRD 中可能提到 Figma 页面名称但不包含 node_id，不要用 PRD 中的名称代替
figma-index 中的 node_id。
```

#### 2.3 API 端点确定

API 信息的确定有严格的优先级顺序：

```
操作步骤:
1. 对每个 Feature，确定其需要的 API 端点
2. 按来源优先级查找:
   a. Swagger 文档 (api-doc/{service}_swagger.json):
      - /chatbot/* 端点 → chatbot_swagger.json
      - /post/* 端点 → post_swagger.json
      - 找到 → source: swagger, verified: true (如参数也匹配)
   b. 后端技术方案 / 私信中台文档:
      - /chat/* 端点 (私信中台，无 Swagger)
      - 找到 → source: backend.md#B{nn}, verified: true
   c. PRD 提到但文档中找不到:
      - source: 待确认, verified: false
      - 在 backend.md 中创建对应 B{nn} 条目，标注 ❓ 待确认
3. 绝对禁止: 从 PRD 描述推导字段名（如 PRD 写 "自我设定" → 不要假设字段名为 self_setting）

每个 api 条目必须包含:
  - endpoint: 完整路径
  - method: HTTP 方法
  - source: 来源标注
  - verified: 是否已校验
```

#### 2.4 Feature YAML 完整格式

**每个 Feature 必须包含：**

```yaml
id: F01
name: xxx
module: xxx
priority: P0
description: xxx

# === 以下字段必须有明确来源，不可假设 ===

figma:
  pages:
    - node_id: "119:265"
      name: 页面名称
      source: figma-index  # 来源标注：figma-index / 手动补充

api:
  - endpoint: /chat/rewrite_message
    method: POST
    source: backend.md#B01  # 来源标注：swagger / backend.md / 待确认
    verified: true           # 是否已校验参数
    params:
      - name: session_id
        type: uint64
        required: true
    response_fields:
      - name: ret
        type: int

i18n:
  keys: [...]
  source: strings.md  # 或 "待翻译"

analytics:
  events: [...]
```

**source 和 verified 字段是关键**：强制标注每个数据的来源，而非凭记忆填写。

### Phase 3: 接口对齐 — 三方校验

这是 v1.2 缺失的核心步骤。

```
┌────────────────┐    ┌──────────────────┐    ┌────────────────────┐
│  Feature YAML  │    │ Swagger / 接口文档 │    │ 后端技术方案 / IM 文档│
│  (期望的接口)   │    │  (实际的接口)      │    │  (交互流程)         │
└───────┬────────┘    └────────┬─────────┘    └─────────┬──────────┘
        │                      │                        │
        └──────────────┬───────┘────────────────────────┘
                       ▼
              ┌────────────────┐
              │  对齐检查清单   │
              └────────────────┘
```

#### 3.1 逐 Feature 校验清单

**对每个 Feature YAML 执行以下检查：**

```
For each Feature YAML:
  For each api entry:
    □ endpoint 路径存在于 Swagger 或 backend.md
      - Swagger 接口: 在 api-doc/{service}_swagger.json 中搜索该 path
      - 私信中台接口: 在 backend.md 中找到对应 B{nn} 条目
      - 找不到 → ❌ 标记，在 backend.md 创建 ❓ 待确认条目

    □ method 一致
      - Feature YAML method == Swagger/backend.md method
      - 不一致 → ⚠️ 修正 Feature YAML

    □ 所有 param names 匹配
      - 逐字段比对 Feature YAML params vs Swagger parameters
      - 字段名不同 (如 self_setting vs self_desc) → ⚠️ 以 Swagger 为准修正
      - Feature YAML 有但 Swagger 无 → ⚠️ 确认是否为可选参数或文档遗漏
      - Swagger 有 required 但 Feature YAML 无 → 补齐

    □ 所有 response fields (任务逻辑依赖的) 存在
      - 从任务的技术要点和验收标准中提取依赖的响应字段
      - 在 Swagger response schema 中确认存在
      - 不存在 → ❌ 标记 (如 get_story_detail 缺少 creator_id)

    □ 枚举值有定义
      - status、type 等字段有明确值映射
      - 无定义 → ⚠️ 标记待确认

    □ 交互模型正确
      - HTTP / SSE / WebSocket / 长连接信令
      - 模型错误 (如以为是 IM say 实际是 HTTP POST) → ⚠️ 修正

    □ 错误码已列出

    □ 长连接信令已定义 (如适用)

    校验通过 → verified: true
    校验有差异 → 修正 Feature YAML，标注 ⚠️
    校验缺失 → verified: false，标注 ❌
```

#### 3.2 执行方式

1. Swagger 接口 (`/chatbot/*`, `/post/*`): 将 Feature YAML 中的 api 字段与 Swagger JSON 自动比对
2. 私信中台接口 (`/chat/*`): 与后端文档/截图人工比对（这类接口无 Swagger）
3. 发现不一致 → 修正 Feature YAML 和 tasks/*.md，而非留到执行阶段

#### 3.3 输出物

在 backend.md 每个条目标注校验状态：

```markdown
| ID | API | 阻塞功能 | 状态 | 校验 |
|----|-----|---------|------|------|
| B01 | POST /chat/rewrite_message | F02 | 🟡 | ✅ 已校验 (2026-03-03) |
| B06 | POST /post/edit_story | F09 | 🟡 | ❓ 待校验 — Swagger 中 response 未确认 |
| B07 | POST /post/get_story_detail | F10 | 🟡 | ❌ status 枚举未定义 |
```

### Phase 4: Figma 对齐

#### 4.1 交叉检查流程

```
For each section in figma-index.md:
  1. 识别该 section 对应的 Feature ID
     - 根据 section 标题和页面名称判断
     - 例: "故事互动_长按操作" → F01 长按菜单

  2. 找到对应的 Feature YAML
     - 读取 {version}/features/F{nn}-*.yaml

  3. For each page in the section:
     □ page.node_id 存在于 Feature YAML figma.pages 中
       - 存在 → ✅
       - 不存在 → 遗漏，追加到 Feature YAML:
         - node_id: "{node_id}"
           name: "{page_name}"
           source: figma-index

  4. 反向检查: Feature YAML figma.pages 中的每个 node_id
     □ 在 figma-index.md 中有对应条目
       - 没有 → 该 node_id 可能无效或来自手动补充
       - 标注 source: 手动补充，待验证
```

#### 4.2 完整性检查

```
□ figma-index.md 中每个页面都被至少一个 Feature YAML 引用
□ Feature YAML 的 figma.pages 中每个 node_id 都在 figma-index 中有对应条目
□ 遗漏页面补齐后标注 source: figma-index
□ 无法映射到 Feature 的页面 → 记录为异常，确认是否需要新增 Feature
```

### Phase 5: 任务生成 → tasks/*.md

从 Feature YAML 生成平台任务文件。**生成规则：**

1. **任务概览表**: 包含 Feature 列和排期列
2. **API 表**: 从 Feature YAML 的 `api` 字段提取，包含完整端点路径、方法、来源列
3. **Figma 表**: 从 Feature YAML 的 `figma.pages` 提取，所有 node_id 来自 figma-index 校验
4. **i18n 表**: 从 Feature YAML 的 `i18n.keys` 提取
5. **埋点**: 从 Feature YAML 的 `analytics.events` 提取
6. **技术要点**: 包含所有 ⚠️/❌ 标记（来自 Phase 3 对齐检查）
7. **依赖**: 从 Feature YAML 的 `dependencies` 推导，含 backend.md 交叉引用

**tasks/backend.md 必须包含：**
- 每个接口的完整参数表（从 Swagger 或后端文档提取，非自行编写）
- 长连接信令定义（如适用）
- 错误码
- 校验状态和日期

### Phase 6: 验证门禁

在 specs 标记为"可执行"之前，通过以下检查：

```
=== Spec Readiness Checklist ===

结构完整性:
□ config.yaml 存在且 figma.file_key 有效
□ 所有 Feature YAML 存在
□ figma-index.md 存在
□ i18n/strings.md 存在
□ tasks/{ios,android,backend,shared}.md 存在
□ WORKFLOW.md 存在
□ DASHBOARD.md 存在

接口对齐:
□ 每个 Feature 的 api.verified == true，或标注 ❓ 待确认
□ backend.md 每个条目有校验状态列
□ 无未标注来源的字段名

Figma 覆盖:
□ figma-index 100% 被 Feature YAML 覆盖
□ Feature YAML 中无无效 node_id

任务一致性:
□ 每个 Feature 在对应平台 tasks/*.md 中有任务条目
□ 任务间依赖关系无环
□ 后端依赖在 backend.md 中有对应条目

流程完备:
□ WORKFLOW.md 包含 Lock 步骤
□ WORKFLOW.md 包含 API Contract Verify 步骤
□ /spec-next command 已部署到各平台项目
```

---

## 角色分工

| 角色 | 职责 |
|------|------|
| **PM** | 提供 PRD、Figma、确认业务规则 |
| **后端** | 提供 Swagger、技术方案、IM 接口文档 |
| **Spec 维护者** | 执行 Phase 1-6，确保对齐 |
| **AI Agent** | 执行阶段通过 API Contract Verify 兜底，发现遗漏写回 specs |

---

## 持续维护

specs 不是一次生成就结束的。在版本开发周期内：

1. **后端接口变更** → 更新 backend.md + Feature YAML + tasks/*.md
2. **设计稿变更** → 更新 figma-index + Feature YAML
3. **需求变更** → 更新 PRD + Feature YAML + tasks/*.md + DASHBOARD.md
4. **执行阶段发现差异** → API Contract Verify 自动写回 tasks/*.md 技术要点

每次变更必须同步所有引用方，不允许只改一处。

---

## 快速参考

```
新版本 Spec 生成:

Phase 0  物料清单   → 确认输入物齐全
Phase 1  结构搭建   → 创建目录和骨架文件
Phase 2  需求拆解   → PRD → Feature YAML (标注 source + verified)
  2.1 PRD 段落 → Feature ID 映射
  2.2 Figma 页面从 figma-index 提取 (不从 PRD 推导)
  2.3 API 端点: Swagger优先 → backend.md → 待确认
Phase 3  接口对齐   → Feature YAML × Swagger/文档 三方校验 ★★★
  3.1 逐 Feature 逐 API 校验清单
  3.2 Swagger(/chatbot,/post) vs 私信中台(/chat) 区分
  3.3 输出: backend.md 校验状态列
Phase 4  Figma 对齐 → figma-index × Feature YAML 交叉覆盖
  4.1 逐 section 逐 page 双向检查
  4.2 遗漏页面补齐 + source 标注
Phase 5  任务生成   → Feature YAML → tasks/*.md
Phase 6  验证门禁   → Readiness Checklist 全部通过
```

Phase 3 是 v1.2 踩坑最多的环节，必须重点执行。
