---
name: weekly
description: Generate weekly iteration progress reports with git analysis and historical comparison.
---

# Weekly 周迭代报告生成

## Overview

自动分析 Git 数据，生成标准化的周迭代进度报告，支持与上周对比。

## When to Use

- 每周五/周末生成周报
- 需要回顾本周开发进度
- 需要与上周数据对比分析

## Usage

```
/weekly                    生成本周报告
/weekly W05                生成指定周报告
/weekly preview            预览数据（不生成文件）
/weekly compare W04 W05    对比两周数据
```

## 处理流程

### 生成周报：`/weekly [周号]`

**步骤**：

1. **确定周期**：
   - 无参数：使用当前周 (ISO week)
   - 有参数：使用指定周号 (如 W05)

2. **收集 Git 数据**：
   ```bash
   ~/.claude/skills/weekly/scripts/weekly.sh data <week>
   ```
   输出 JSON 格式的统计数据

3. **获取上周数据**（用于对比）：
   - 读取上周报告文件
   - 或运行脚本获取上周 git 数据

4. **分析项目上下文**：
   - 读取项目的版本阶段（从 README 或 CLAUDE.md）
   - 确定当前 Epic/模块状态
   - 识别里程碑目标

5. **生成报告**：
   - 使用标准模板
   - 填充本周数据
   - 添加与上周对比
   - 生成分析总结

6. **保存文件**：
   ```
   Docs/progress/project/2026-W{周号}-迭代进度报告.md
   ```

## 报告模板结构

```markdown
# {项目} {版本} 周迭代报告 - 2026-W{周号}

> 报告周期 / 版本阶段 / 目标日期

## 📊 本周概览（与上周对比）
## 📈 整体进度（进度条）
## 🔄 模块进度流程图
## 📋 模块详细进度（W上周→W本周对比）
## 📉 燃尽图
## 🔥 下周计划（P0/P1/P2）
## ⚠️ 风险看板
## 📝 功能类型分布（与上周对比）
## 🔥 每日提交分布
## 🚀 本周重点成果
## 📋 里程碑（历史+当前）
## 📝 周总结
```

### 模块进度流程图格式

使用扁平列式布局，避免 ASCII box drawing（中英文混排对不齐）：

```
                      {版本} {阶段}    Overall: W上周% -> W本周% (+N%)

 模块1名称        模块2名称        模块3名称        ...
 W上周% -> W本周%  W上周% -> W本周%  W上周% -> W本周%
 (+N%)            (+N%)            (+N%)
 ─────────────── ─────────────── ───────────────
 * 本周要点1      * 本周要点1      * 本周要点1
 * 本周要点2      * 本周要点2      * 本周要点2
 * 本周要点3      * 本周要点3      * 本周要点3
```

### 模块详细进度表编写规则

- **从产品业务角度描述功能**，不写实现细节（SDK、Manager、Config 等）
- 每行是一个用户可感知的产品功能点
- **使用积极正面的措辞**，禁止出现「修复」「fix」等负面词汇，改用「优化」「完善」「适配」「增强」「精简」「扩展」等积极表述
  - 错误示例：`会话列表排序修复`、`广场分页加载修复`、`diffIdentifier 修复`
  - 正确示例：`会话列表排序优化`、`广场分页加载优化`、`列表标识唯一化`
- 错误示例：`AppLovin MAX SDK`、`AdManager 管理器`、`跳过确认弹窗`、`线上验收`
- 正确示例：`激励视频观看`、`观看奖励发放`、`能量恢复提示`、`广告任务入口`

### 燃尽图时间轴标注

时间轴上的关键日期用内联 `[标注]` 标记，不使用箭头对齐（中英文等宽问题）：

```
     └──01/24──01/30──02/02──02/06[今日]──02/10[提审]──
```

### 风险看板格式

使用 markdown 表格，禁止 ASCII box drawing。按状态分组排列（已解决 → 进行中 → 需关注）：

```markdown
| 风险项 | 状态 | 说明 |
|-------|------|------|
| xxx | 🟢 已解决 | - |
| xxx | 🟡 进行中 | 需xxx配合 |
| xxx | 🟠 需关注 | 缓解措施说明 |
```

## 数据收集

脚本 `weekly.sh` 收集以下数据：

| 数据 | 命令 | 说明 |
|-----|------|------|
| 提交数 | `git log --oneline` | 非 merge 提交 |
| 文件变更 | `git log --shortstat` | 变更文件数 |
| 代码增删 | `git log --shortstat` | +/- 行数 |
| 每日分布 | `git log --format="%ad"` | 按日期统计 |
| 类型分布 | grep commit message | feat/fix/chore 等 |
| 活跃作者 | `git log --format="%an"` | 贡献者统计 |

## 项目配置

在项目根目录创建 `.weekly.yml`（可选）：

```yaml
# 版本信息
version: "1.1"
stage: "增长闭环"

# 模块/Epic 定义
tracking_mode: epic  # module | epic

epics:
  - name: "基础分享"
    id: epic1
    priority: P0
  - name: "对话拦截"
    id: epic2
    priority: P0

# 里程碑
milestones:
  - name: "开发完成"
    date: "2026-02-04"
  - name: "提审"
    date: "2026-02-10"

# 报告目录
output_dir: "Docs/progress/project"
```

## Claude Code 职责

1. **智能分析**：根据 commit message 分析工作内容
2. **进度评估**：根据代码变化评估各模块进度
3. **风险识别**：识别延迟、阻塞等风险
4. **总结生成**：生成有洞察的周总结

## Examples

**生成本周报告**：
```
用户: /weekly
Claude:
  → 确定周期: W05 (01-24 ~ 01-30)
  → 收集数据: 39 commits, +26244/-30716 lines
  → 读取上周: W04 报告存在
  → 分析对比: feat 占比提升，fix 显著下降
  → 生成报告: Docs/progress/project/2026-W05-迭代进度报告.md
  → 完成
```

**预览数据**：
```
用户: /weekly preview
Claude:
  → 本周: W05 (01-24 ~ 01-30)
  → 提交: 39 个 (上周 65 个, -40%)
  → 代码: +26244 -30716 (净 -4472)
  → 类型: feat 44%, refactor 15%, chore 15%
  → 每日: 01-27(22), 01-28(4), 01-29(10), 01-30(3)
```

## 底层脚本

**位置**：`~/.claude/skills/weekly/scripts/weekly.sh`

**命令**：
```bash
# 获取指定周的数据
~/.claude/skills/weekly/scripts/weekly.sh data W05

# 获取日期范围
~/.claude/skills/weekly/scripts/weekly.sh range W05

# 列出可用周报
~/.claude/skills/weekly/scripts/weekly.sh list
```

## 注意事项

- 脚本只收集原始数据，分析由 Claude Code 完成
- Epic/模块进度需要 Claude Code 根据 commit 分析评估
- 首次使用需要手动创建初始进度基线
- 周报生成后建议人工审核补充细节
