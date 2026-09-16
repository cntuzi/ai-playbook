# Conversation Ledger / 对话问题台账

[中文](#中文) · [English](#english)

## 中文

把多话题对话中的问题、进展、依据和下次继续的入口保存为 Markdown。换一个 Agent 后，只要能读取同一份记录，就可以接着讨论。

这是可安装的 Skill，附问题模板、会话模板、可选 Obsidian Bases 视图，以及本地事件采集运行时。手动记录依赖 Agent 的文件工具；启用自动采集后，Hooks 会独立保存支持的消息。不需要 Obsidian 插件或额外的模型 API Key。

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

### 启用自动采集

安装 Skill 后对 Agent 说：

```text
使用 conversation-ledger，为当前项目启用自动采集，接入 Codex、Claude Code、Pi。
```

Agent 会调用随 Skill 提供的安装器。也可以用以下两条命令完成项目级安装和启用：

```bash
npx --yes skills add cntuzi/ai-playbook --skill conversation-ledger -a codex claude-code pi -y
node .agents/skills/conversation-ledger/scripts/ledger.mjs install --agents codex,claude-code,pi
```

运行时安装器要求 macOS/Linux、Node.js 22+。可在第二条命令添加 `--root /实际Vault路径/Agent`，否则沿用已配置位置或项目内的本地台账。它合并项目 Hooks、备份原配置，并复制独立的运行时代码。更新 Skill 后，再运行一次 `install` 部署新代码。

**Codex 需要在 `/hooks` 中信任新配置，项目本身也须受信任；Pi 项目扩展同样受项目信任控制。**按宿主要求重载或重启。安装器不会绕过这些要求。用 `status` 查看各宿主最后收到的事件，确认真实采集是否发生。[Codex Hooks](https://learn.chatgpt.com/docs/hooks)、[Pi Extensions](https://pi.dev/docs/latest/extensions)

自动流程是：**收到事件 → 本地持久化 → 导出 Markdown 来源 → 下一轮引导 Agent 整理 → 有记录后确认批次。**最后一条回复会先保存原文，语义整理可能等到下一轮或显式检查点；不会为了整理而强制 Agent 不停续跑。

```bash
node .agents/skills/conversation-ledger/scripts/ledger.mjs status
node .agents/skills/conversation-ledger/scripts/ledger.mjs disable
node .agents/skills/conversation-ledger/scripts/ledger.mjs uninstall
```

`disable` 暂停采集，`uninstall` 移除本工具的 Hooks 并保留数据及其他配置。完整操作见 [运行时说明](./references/runtime.md)。

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
  Sessions/S-<hash>/E-<id>.md # 运行时自动保存的消息来源
  questions.base         # 可选 Obsidian 视图
```

状态包括 `open / exploring / waiting / parked / resolved / dropped`。用户提出的次要问题也应保留；已有回答不会自动等同于解决。手工批注和用户设置的状态优先。

跨 Agent 续聊依靠共同的笔记路径和问题 ID。技能安装目录只放规则和模板；问题数据保存在另一个目录。

### 能力边界

- **已提供**：记录、查看、续聊工作流，模板，三宿主采集适配，断点补导出，以及待整理批次的确认机制。
- **语义判断**：问题识别与收束由主 Agent 按 Skill 执行；运行时分别记录“已采集、待导出、待整理”，不把触发成功视为整理完成。
- **后续设计**：独立后台观察者、MCP 服务和共享问题写入服务。
- **并发边界**：自动事件各写独立文件；问题笔记仍要求一个写入者。同时手工编辑或跨设备同步不具有完整并发保证。
- **可见性边界**：采集用户/助手文本及部分生命周期事件，不覆盖所有工具输出、图片、历史消息或中断场景。没有原生消息 ID 时保留每次投递，宿主重试可能形成重复来源；导出重放不会重复创建同一个来源文件。

语义准确性还需真实对话验证；安装成功和模板校验不能证明不会漏掉关键问题。

### 发布校验

仓库测试可用 `node --test tests/conversation-ledger.test.mjs` 运行。覆盖安装/卸载保留其他配置、原生 ID 重放、同轮多次输入、离线补写、并发采集、路径转义、来源修改保护、批次确认和非阻塞 Hook 输出。

2026-09-16：14 项自动测试通过，覆盖 Git worktree 的 Hook 发现位置、记录隔离、重装迁移和卸载保留；通过本机 Pi 0.85.1 的 SDK 加载实际生成的扩展，并触发测试回调验证落盘。Codex/Claude Code 使用 Hook 输入样例和生成的真实命令验证，通过 Codex 0.154.0 原生 `hooks/list` 验证 worktree 的 5 个 Hooks 已被发现；未替用户信任或启用正在使用的会话。

在 Git worktree 中，Codex 的配置会合并到主工作区对应的 `.codex/hooks.json`；命令按当前工作区过滤事件，记录和运行时代码仍保存在当前 worktree。卸载会移除自己拥有的命令。删除 worktree 前先卸载，避免留下指向已删除脚本的命令。

验证区分安装、事件机制和模型效果：CLI 安装与事件测试通过不代表问题识别已经达到某个召回率。完整真实对话和 Obsidian 界面仍需使用验证。

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

### Automatic capture

Ask the installed skill to enable automatic capture for the current workspace, or use a project installation:

```bash
npx --yes skills add cntuzi/ai-playbook --skill conversation-ledger -a codex claude-code pi -y
node .agents/skills/conversation-ledger/scripts/ledger.mjs install --agents codex,claude-code,pi
```

The installer supports macOS/Linux and Node.js 22+. It preserves existing hook settings, deploys a self-contained runtime, and supports status, disable, and uninstall. Add `--root /path/to/vault/Agent` to select a ledger. Codex requires trusting new definitions through `/hooks`; project trust and host reload still apply. Rerun the installer after updating the skill.

Callbacks persist supported text/lifecycle events and export immutable source notes. Next-turn guidance asks the main Agent to checkpoint pending batches. Final-response classification may wait until the next turn or an explicit checkpoint; Stop hooks never force continuation. There is no independent model observer or MCP server in this version.

Raw events support concurrent callbacks; question-note edits still require one writer. Capture coverage, unreviewed records, and user edits remain explicit. See [runtime operations](./references/runtime.md) for review receipts and limitations.
