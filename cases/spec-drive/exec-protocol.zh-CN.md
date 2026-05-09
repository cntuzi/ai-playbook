[English](./exec-protocol.md) | [中文](./exec-protocol.zh-CN.md)

# 任务执行协议

> AI Agent 执行任务时的标准流程。
> 基于 v1.2 实践经验更新，包含 Lock 步骤和 API Contract Verify。

---

## 触发方式

```
用户: 执行 F01
用户: 执行 T01
用户: 执行 ios/T01
用户: 执行 D1
```

---

## 执行流程 — 7 步

### Step 1: Parse — 解析目标

```yaml
步骤:
  解析输入:
    - F{nn} → 读取 {version}/features/F{nn}-*.yaml → 获取平台任务 ID
    - T{nn} → 读取 {version}/tasks/{platform}.md#T{nn}
    - ios/T{nn} → 读取 {version}/tasks/ios.md#T{nn}
    - D{n} → 查找所有 day=D{n} 的任务，按依赖顺序排列

  预检:
    - 状态 🟢 → 提示 "T{nn} 已完成，是否重新执行？"
    - 状态 🟡 → 提示 "T{nn} 进行中，是否继续？" → 搜索已有代码上下文

输出:
  - 目标任务 ID 及详情
  - 关联 Feature YAML 路径
```

### Step 2: Check — 检查依赖

```yaml
步骤:
  1. 共享依赖:
     - 读取 {version}/tasks/shared.md 检查 S1-S3 状态
     - 任一为 🔴 → 报告阻塞原因

  2. 后端依赖:
     - 读取 {version}/tasks/backend.md 检查对应 B{nn} 状态
     - 状态为 🔴 → 报告阻塞原因

  3. 功能间依赖:
     - 检查 Feature YAML 的 dependencies 字段
     - 检查任务详情中的依赖列表
     - 依赖任务未完成 → 报告阻塞原因

  4. API Contract Verify (有后端依赖时必须执行):
     a. 从任务详情 API 表获取端点列表
     b. 区分接口来源:
        - Swagger 接口 (/chatbot/*, /post/*)
          → 从 api-doc/{service}_swagger.json 提取 schema
        - 私信中台接口 (/chat/*)
          → 从 {version}/tasks/backend.md 获取参数表和信令定义
     c. 可用性检查:
        - ❌ Swagger 文件不存在 → 提示 "后端可能尚未提供接口文档"
        - ❌ 端点未定义 → 提示 "{endpoint} 未在 Swagger 中定义"
        - 不阻塞执行，但将缺失信息写入任务技术要点 (❌ 标记)
     d. 逐项校验:
        - 请求参数: tasks/*.md 中字段名是否与 Swagger/backend.md 一致
        - 响应字段: 任务逻辑依赖的字段是否存在
        - 枚举值: 引用的状态枚举是否有定义
     e. 差异处理:
        - 发现不一致 → 输出差异报告 (⚠️ 标记)
        - 将差异写入 tasks/*.md 对应任务技术要点
        - 开发时以 Swagger/backend.md 为准，不以 specs 假设为准

输出:
  - 可执行 / 阻塞（附原因）
  - API 校验报告（如有差异）
```

### Step 3: Lock — 锁定任务

```yaml
步骤:
  1. 更新 {version}/tasks/{platform}.md:
     - 任务概览表: 状态列 🔴→🟡
     - 统计行: 更新计数
     - 任务详情: 状态行 🔴→🟡
  2. git commit: "chore: mark T{nn} as in-progress"
  3. 此步必须在 Collect/Execute 之前完成

目的:
  - 防止其他 session 重复领取同一任务
  - 在 git 中留下明确的开始时间点
```

### Step 4: Collect — 收集上下文

```yaml
步骤:
  a. PRD 详情:
     - 读取 {version}/prd/README.md 对应功能段落
     - 如需查看原始 PRD，读取 {version}/prd/ 下 PDF

  b. Figma 设计:
     - 从 Feature YAML figma.pages 获取 node_id 列表（主要来源）
     - 从 {version}/figma-index.md 交叉检查对应 section（补齐来源）:
       - figma-index 中存在但 YAML 未引用 → 识别为遗漏页面
       - 自动追加到 Feature YAML，标注 source: figma-index
       - 输出补齐日志: "+ F02: 新增 119:797 自由对话_重写中"
     - 从 {version}/config.yaml 获取 figma.file_key
     - 调用 Figma MCP 下载截图到 .claude/cache/{version}/figma/

  c. API 接口:
     - 从 Feature YAML api 字段获取端点
     - 区分来源:
       - Swagger 接口 → 从 api-doc/{service}_swagger.json 提取完整定义
       - 私信中台接口 → 从 {version}/tasks/backend.md 获取参数表、信令、错误码
       - 参考截图: {version}/tasks/refs/ 下相关文件

  d. i18n 文案:
     - 从 {version}/i18n/strings.md 获取对应功能文案
     - 注意平台格式差异 (%s → iOS %@)

  e. 埋点:
     - 从 Feature YAML analytics 字段获取埋点定义

  f. 现有代码:
     - 搜索项目代码找到相关模块现有实现
     - 识别可复用的组件/模式
     - 确定需要修改的文件

输出:
  - Figma 截图路径
  - API 定义文本 (区分 Swagger 来源 vs 私信中台来源)
  - i18n 文案列表
  - 相关代码文件列表
```

### Step 5: Execute — 执行开发

```yaml
步骤:
  1. 创建/修改源文件实现功能
  2. 同步添加 i18n 文案到平台国际化文件
  3. 同步添加埋点代码
  4. 遵循平台代码规范 (ai/{platform}.md)
  5. API 参数以 Swagger/backend.md 为准，不以 Feature YAML 假设为准
```

### Step 6: Verify — 编译验证

```yaml
步骤:
  iOS:    ./scripts/build.sh → 期望 BUILD SUCCEEDED
  Android: ./scripts/build.sh → 期望 BUILD SUCCESSFUL

  编译失败处理:
    1. 分析错误日志，定位问题源文件
    2. 修复编译错误（优先修复本次变更引入的问题）
    3. 重新编译验证
    4. 连续失败 3 次 → 暂停，提示用户介入
```

### Step 7: Update — 更新状态

```yaml
编译通过:
  1. 更新 {version}/tasks/{platform}.md 状态 🟡→🟢
     - 任务概览表 + 统计行 + 任务详情状态行
  2. 更新 {version}/DASHBOARD.md 功能进度
  3. git commit: "feat: complete T{nn} - {task_name}"

编译失败/中断:
  1. 状态保持 🟡（进行中）
  2. 在任务详情中追加阻塞原因
  3. 不更新 DASHBOARD.md（仅编译通过才更新）
```

---

## 状态机

```
                    依赖就绪 + Check 通过
┌──────────┐ ─────────────────────────────▶ ┌──────────────┐
│ 🔴 待开始 │                                │ 🟡 进行中     │
│ pending  │                                │ in_progress  │
└──────────┘                                └──────┬───────┘
     ▲                                             │
     │                                    ┌────────┴────────┐
     │                                    │                 │
     │ 依赖未完成                    验证通过           验证失败/中断
     │                                    │                 │
     │                                    ▼                 ▼
┌──────────┐                        ┌───────────┐   ┌───────────┐
│ blocked  │◀───────────────────────│ 🟢 已完成  │   │ 🟡 阻塞中  │
└──────────┘    外部依赖变更         │ completed │   │ (附原因)   │
                                    └───────────┘   └───────────┘

Lock 时: 🔴→🟡 + git commit
Update 时: 🟡→🟢 + git commit (成功) 或 🟡 保持 (失败)
```

---

## 快捷命令

| 命令 | 含义 |
|-----|------|
| `执行 F01` | 执行功能（自动选择当前平台） |
| `执行 T01` | 执行当前平台任务 |
| `执行 ios/T01` | 执行指定平台任务 |
| `执行 D1` | 执行指定天的所有任务 |
| `状态` | 显示当前版本进度 |
| `阻塞` | 显示所有阻塞项 |
| `下一个` | 执行下一个可执行任务 |

---

## 示例执行

```
用户: 执行 F02

Claude Code:
┌─────────────────────────────────────────────────────────────────────┐
│ Step 1: Parse — 解析目标                                            │
│    F02 → AI 回复重写 → iOS 任务 T02                                 │
│    状态: 🔴 待开始                                                   │
├─────────────────────────────────────────────────────────────────────┤
│ Step 2: Check — 检查依赖                                            │
│    • S1 PRD确认: ✅                                                 │
│    • S2 设计评审: ✅                                                │
│    • S3 API定义: ✅                                                 │
│    • T01 长按菜单: ✅ 已完成                                        │
│    • B01 后端API: 🟡 进行中                                         │
│                                                                     │
│    API Contract Verify:                                             │
│    • POST /chat/rewrite_message                                     │
│      来源: 私信中台 (backend.md#B01)                                │
│      参数: ✅ session_id, session_type, msgid, content, mid         │
│      信令: ✅ MESSAGE_TYPE_CMD_MESSAGE_RECALL 已定义                │
│    • stream_chat (SSE)                                              │
│      来源: 私信中台                                                  │
│      ✅ 复用现有 SSE 流式接收逻辑                                    │
├─────────────────────────────────────────────────────────────────────┤
│ Step 3: Lock — 锁定任务                                             │
│    • tasks/ios.md T02: 🔴→🟡                                        │
│    • git commit: "chore: mark T02 as in-progress"                   │
├─────────────────────────────────────────────────────────────────────┤
│ Step 4: Collect — 收集上下文                                        │
│    • Figma: 下载 4 页截图 (119:370, 119:462, 119:555, 119:649)     │
│    • API: 从 backend.md#B01 提取私信中台接口定义                     │
│    • i18n: 从 strings.md 提取 5 条文案                              │
│    • 代码: 搜索 RewriteModal, MessageStream 相关文件                │
├─────────────────────────────────────────────────────────────────────┤
│ Step 5: Execute — 执行开发                                          │
│    [实现代码...]                                                     │
├─────────────────────────────────────────────────────────────────────┤
│ Step 6: Verify — 编译验证                                           │
│    • ./scripts/build.sh → BUILD SUCCEEDED                           │
├─────────────────────────────────────────────────────────────────────┤
│ Step 7: Update — 更新状态                                           │
│    • tasks/ios.md T02: 🟡→🟢                                        │
│    • DASHBOARD.md: F02 iOS 已完成                                   │
│    • git commit: "feat: complete T02 - AI回复重写"                   │
└─────────────────────────────────────────────────────────────────────┘
```
