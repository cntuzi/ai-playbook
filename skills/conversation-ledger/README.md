# Conversation Ledger / 对话问题台账

[中文](#中文) · [English](#english)

## 中文

把多话题对话中的问题、进展、依据和下次继续的入口保存为 Markdown。换一个 Agent 后，只要能读取同一份记录，就可以接着讨论。

这是可安装的纯文件 Skill，附问题模板、会话模板和可选 Obsidian Bases 视图。执行依赖 Agent 的文件读写工具；不需要启动服务或安装 Obsidian 插件。

### 一条命令安装

使用支持当前 `skills` CLI 的 Node.js / npm。2026-09-16 核验的 `skills@1.5.26` 要求 Node.js ≥ 22.20.0。

```bash
npx --yes skills add cntuzi/ai-playbook --skill conversation-ledger -g -y
```

命令中的工具名是 **`skills`，复数**。`-g` 安装到用户级目录，`-y` 跳过安装确认；默认由 CLI 检测 Agent。也可以明确指定三个目标：

```bash
npx --yes skills add cntuzi/ai-playbook --skill conversation-ledger -g -a codex claude-code pi -y
```

安装到当前项目时去掉 `-g`。只查看可安装项：

```bash
npx --yes skills add cntuzi/ai-playbook --list
```

安装语法、目标 Agent 和链接方式由 [skills CLI](https://github.com/vercel-labs/skills) 提供；本仓库不需要发布 npm 包。安装完成后按宿主要求刷新技能列表或开启新会话。

### 怎么用

在支持 Skill 的 Agent 中直接说：

```text
使用 conversation-ledger，整理当前对话里值得保留的问题并保存。
```

默认写到当前项目的 `.conversation-ledger/data/`，第一次写入会报告路径。默认本地目录带 Git 忽略规则，避免普通提交顺带包含会话内容。

如果使用 Obsidian，首次指定实际存在的 Vault：

```text
使用 conversation-ledger，把问题记录到 /实际路径/我的笔记/Agent，
并在这个会话中持续跟踪值得保留的新问题。
```

Agent 会在当前项目的 `.conversation-ledger/location.json` 记录位置。其他项目或另一台机器需要指定各自可访问的路径。

后续可以说：

```text
使用 conversation-ledger，看看有哪些问题还没收束。
使用 conversation-ledger，继续讨论 Q-...。
使用 conversation-ledger，只生成 Q-... 的续聊简报。
使用 conversation-ledger，把 Q-... 暂放，保留原因和下次入口。
停止这个会话的持续记录。
```

Codex 也可显式使用 `$conversation-ledger`。按标题选择出现歧义时，Agent 会先列出候选。

### 保存什么

```text
Agent/
  Questions/Q-<uuid>.md   # 问题、进展、未解决点、证据、继续入口
  Sessions/S-<uuid>.md    # 会话来源、覆盖范围、候选与待同步内容
  questions.base         # 可选 Obsidian 视图
```

状态包括 `open / exploring / waiting / parked / resolved / dropped`。用户提出的次要问题也应保留；已有回答不会自动等同于解决。手工批注和用户设置的状态优先。

跨 Agent 续聊依靠共同的笔记路径和问题 ID。技能安装目录只放规则和模板；问题数据保存在另一个目录。

### 能力边界

- **已提供**：记录、查看、续聊工作流，Markdown 模板，Obsidian 视图模板，多宿主安装结构。
- **按需执行**：由宿主加载 Skill 后执行；“持续跟踪”是当前会话内尽力遵循的指令，可能受技能加载和上下文压缩影响。
- **后续设计**：严格每轮触发、后台观察者、MCP 服务和单一写入服务。这次安装不包含这些运行时组件。
- **首版单写入者**：多个 Agent 可以先后更新同一问题；同时编辑同一文件时只能检测部分冲突，不能保证并发安全。
- **可见性边界**：只处理 Agent 实际可见的对话。没有文件工具时返回待保存的 Markdown，不会宣称已落盘。

语义准确性还需真实对话验证；安装成功和模板校验不能证明不会漏掉关键问题。

### 发布校验

2026-09-16：Skill 格式校验通过；Markdown 相对链接、模板填充后的 YAML 和 Codex 界面元数据校验通过。在临时项目中使用 `skills` CLI 安装到 Codex、Claude Code、Pi，三个目录均能读取完整的 7 个发布文件，文件内容与源码一致。此校验未启动三个 Agent 执行真实对话，也未进行 Obsidian 界面验收。

### 分析与设计

- [现象：关键问题为什么会丢失](https://github.com/cntuzi/ai-playbook/blob/main/notes/agent-conversation-topic-loss.zh-CN.md)
- [调研：Advisor、观察记忆与问题台账](https://github.com/cntuzi/ai-playbook/blob/main/notes/agent-conversation-question-tracking-research.zh-CN.md)
- [设计：Obsidian 与跨 Agent 接入](https://github.com/cntuzi/ai-playbook/blob/main/notes/obsidian-agent-question-tracking-design.zh-CN.md)

## English

Save meaningful questions, progress, evidence, and continuation cues from branching conversations as Markdown. Agents that can read the same ledger can resume the same question across sessions.

### Install

```bash
npx --yes skills add cntuzi/ai-playbook --skill conversation-ledger -g -y
```

To select hosts explicitly, add `-a codex claude-code pi`. Remove `-g` for a project installation. The verified CLI version, `skills@1.5.26`, requires Node.js 22.20.0 or newer. Refresh your host's skill discovery or start a new session after installation.

### Use

```text
Use conversation-ledger to checkpoint the open questions in this conversation.
Use conversation-ledger to track this session in /path/to/vault/Agent.
Use conversation-ledger to list unresolved questions.
Use conversation-ledger to resume Q-... .
Use conversation-ledger to prepare a handoff for Q-... without executing it.
```

The default root is `.conversation-ledger/data/` in the workspace. A local `location.json` remembers a selected external root; default local records are ignored by Git. Obsidian is optional. The installed skill includes question and session templates and a Bases view template.

This release provides instructions and assets, with no daemon, hooks, MCP server, or automatic transcript subscription. Ongoing tracking is best effort while the host follows the skill. Use one writer at a time; a file reread is not a concurrency guarantee. Source coverage and user edits take precedence over inferred completeness.
