---
name: wt
description: Worktree workspace management with natural language support. Create, complete, list, and remove git worktrees with tmux integration.
---

# Worktree 工作空间管理

## Overview

管理 Git worktree + 分支 + Tmux 窗口，支持自然语言描述创建工作空间。

脚本是无状态的薄封装，**路径策略由 Claude Code 决定**。

## When to Use

- 创建新的工作空间进行功能开发
- 完成工作后合并分支
- 管理多个并行开发任务

## Usage

```
/wt <描述>                创建工作空间（自然语言）
/wt attach <branch>       为已有分支创建 worktree + tmux
/wt done [关键字]         完成工作，合并分支
/wt ls [关键字]           列出工作空间
/wt rm <关键字>           删除工作空间
```

## 路径策略（核心）

`name` 参数即 `wt/<project>/` 下的完整子路径。脚本不强加任何前缀。

Claude Code 根据上下文选择合适的路径模式：

| 场景 | name 示例 | 路径 | 分支 |
|------|-----------|------|------|
| 日常开发 | `0316/fix-chat` | `wt/<project>/0316/fix-chat` | `feat/<project>/0316/fix-chat` |
| spec 版本 | `cc-100.0` | `wt/<project>/cc-100.0` | `feat/<project>/cc-100.0` |
| spec 子任务 | `cc-100.0/T07` | `wt/<project>/cc-100.0/T07` | `feat/<project>/cc-100.0/T07` |
| 热修复 | `hotfix-login` | `wt/<project>/hotfix-login` | `feat/<project>/hotfix-login` |

**选择规则**：
- 用户提到 spec 版本 / 迭代号 → 用版本号作为路径（如 `cc-100.0`）
- 用户描述具体功能/bug → 用 `MMDD/<name>` 日期分组
- 用户明确指定路径 → 直接使用

## 处理流程

### 创建工作空间：`/wt <描述>`

**步骤**：
1. **理解意图**：分析用户描述，理解要做什么
2. **确定路径策略**：根据上下文选择路径模式（见上表）
3. **生成名称**：转换为英文 kebab-case 格式
   - 修复聊天页面崩溃 → `0316/fix-chat-crash`
   - 开始 cc-100.0 版本开发 → `cc-100.0`
   - cc-100.0 下做 T07 → `cc-100.0/T07`
4. **确认执行**：向用户展示路径和分支名，确认后执行
5. **调用脚本**：
   ```bash
   ~/.claude/skills/wt/scripts/wt.sh new <name> [base]
   ```
6. **返回结果**：报告创建的分支、路径、tmux 窗口

**名称规则**：
- 允许：小写英文、数字、连字符、下划线、点号、斜杠
- 动作前缀（日常开发用）：fix- / add- / update- / improve- / refactor- / remove-

### 附加已有分支：`/wt attach <branch> [name]`

为已存在的分支创建 worktree + tmux 窗口。

**步骤**：
1. **识别分支**：用户指定已存在的分支名
2. **确认名称**：默认使用分支最后一段作为目录名，也可指定完整子路径
3. **调用脚本**：
   ```bash
   ~/.claude/skills/wt/scripts/wt.sh attach <branch> [name]
   ```
4. **返回结果**：报告 worktree 路径和 tmux 窗口

**示例**：
```
用户: /wt attach release-1.1_dev
Claude:
  → 执行: wt.sh attach release-1.1_dev
  → 结果: worktree 在 wt/<project>/release-1.1_dev

用户: /wt attach feat/vcc-100.0 cc-100.0
Claude:
  → 执行: wt.sh attach feat/vcc-100.0 cc-100.0
  → 结果: worktree 在 wt/<project>/cc-100.0
```

### 完成工作：`/wt done [关键字]`（Claude Code 工作流）

**这是 Claude Code 智能工作流，不是简单的脚本调用。**

**步骤**：

1. **分析上下文**：
   ```bash
   git worktree list
   ```

2. **检查状态**：
   ```bash
   cd <worktree_path> && git status --porcelain
   cd <repo_root> && git status --porcelain
   ```

3. **分析合并**：
   ```bash
   git rev-list --count <current>..<target_branch>
   git log --oneline <current>..<target_branch>
   ```

4. **确认合并**：向用户展示将要合并的内容，等待确认

5. **执行合并**：
   ```bash
   git merge <target_branch> --no-edit
   ```

6. **确认清理**：向用户确认是否清理

7. **执行清理**：
   ```bash
   ~/.claude/skills/wt/scripts/wt.sh -f rm <name>
   ```

**确认交互**：
- 使用 `AskUserQuestion` 工具进行确认（需先通过 `ToolSearch` 加载）
- 在执行第一个确认步骤前，调用 `ToolSearch("select:AskUserQuestion")` 加载工具
- 合并确认和清理确认均使用 `AskUserQuestion`

**关键点**：
- Claude Code 理解自然语言，智能匹配目标
- 每个步骤都有确认，避免误操作
- 合并失败时保留现场，不自动清理

### 列出状态：`/wt ls`

```bash
~/.claude/skills/wt/scripts/wt.sh ls [pattern]
```

### 删除：`/wt rm <关键字>`

```bash
~/.claude/skills/wt/scripts/wt.sh rm <pattern>
```

- `wt rm .` → 匹配今天日期的 worktree
- `wt rm cc-100.0` → 匹配 cc-100.0 相关的 worktree

## Examples

**日常开发**：
```
用户: /wt 修复聊天崩溃
Claude:
  → 路径策略: 日常开发 → MMDD/name
  → 名称: 0316/fix-chat-crash
  → 分支: feat/<project>/0316/fix-chat-crash
  → 确认后执行: wt.sh new 0316/fix-chat-crash
```

**spec 版本开发**：
```
用户: /wt 开一个 cc-100.0 的工作空间
Claude:
  → 路径策略: spec 版本 → 版本号
  → 名称: cc-100.0
  → 分支: feat/<project>/cc-100.0
  → 确认后执行: wt.sh new cc-100.0 master
```

**完成工作**：
```
用户: /wt done cc-100.0
Claude:
  → 找到 worktree cc-100.0
  → 检查: 无未提交更改 ✓
  → 合并: feat/<project>/cc-100.0 → master (+12 commits)
  → 确认合并? [用户确认]
  → 执行合并
  → 确认清理? [用户确认]
  → 清理完成
```

**完成今天所有工作**：
```
用户: /wt done .
Claude:
  → 找到今天的 worktree (0316)
  → [逐个处理每个 worktree]
```

## Tmux 窗口布局

```
┌─────────┬─────────┐
│  左上   │         │
├─────────┤  右侧   │
│  左下   │         │
└─────────┴─────────┘
```

窗口名取 name 的最后一段（如 `cc-100.0/T07` → 窗口名 `T07`）。

## 底层脚本

**位置**：`~/.claude/skills/wt/scripts/wt.sh`（全局可用）

**调用方式**：
```bash
~/.claude/skills/wt/scripts/wt.sh <command> [args]
```

**注意**：脚本只接收明确的命令和路径，路径策略由 Claude Code 完成。

## 目录结构

```
wt/
└── <project>/           # 项目名
    ├── 0316/            # 日期分组（日常开发）
    │   ├── fix-chat/
    │   └── add-feature/
    ├── cc-100.0/        # 版本分组（spec 开发）
    │   ├── T07/         # 子任务（可选）
    │   └── ...
    └── hotfix-login/    # 扁平（紧急修复）
```
