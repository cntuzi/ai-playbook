# owt —— 一份 skill，三个 agent，零副本

[English](./README.md) | [中文](./README.zh-CN.md)

一句话变成一个 [Orca](https://orca.computer) 子工作空间，里面的 coding agent
已经开跑了。同一份 `SKILL.md` 同时服务 Claude Code、Codex CLI 和 omp (Oh My Pi)。

本案例包含实现：[`skill/`](./skill/)

## 两个问题，一个案例

**问题一：派活比自己干还贵。** 给一个支线任务开独立工作空间意味着：建 checkout、
切对分支、装依赖、起 agent、再写一份好到不用你再管的简报。一句话的意图，六步仪式。

**问题二：每个 agent 都想要一份自己的 skill 副本。** Claude Code 读
`~/.claude/skills`，Codex 读 `~/.codex/skills`，omp 读 `~/.agents/skills`。
写一次，一个月后你维护着三份互相漂移的副本。

## 解法一：full handoff，不是监督

Orca CLI 已经把「建 checkout、建分支、起 agent、投喂 prompt」全包进一条
`orca worktree create`。所以这个 skill 不写脚本，只负责命令做不了的判断：
命名、简报、卡片标注、闸门。

真正定义它的是**不做什么**：

> 建完 → 报地址 → **停。**

不轮询子 agent、不建任务 DAG、不注入消息。一旦轮询就变成了监督，而监督是另一个
工具的事。full handoff 意味着子 agent 自己收尾，把结论写进 Orca 卡片的 comment。

另一半价值是**简报模板** —— 撒手之前父 agent 必须填满的七段：

| # | 段落 | 为什么存在 |
|---|---|---|
| 0 | 先确认引导跑过 | 新 checkout 缺的是包管理器装的依赖 |
| 1 | 任务 | 用户原话 + 做成什么样才算完 |
| 2 | 你在哪 | repo / 分支 / base / 父工作区路径（只读） |
| 3 | 先读 | 项目入口文档 + 任务相关的具体文件 |
| 4 | 怎么验 | 构建/测试命令从项目文档里抄，别编 |
| 5 | 边界 | 范围上限、别碰哪些文件、别提交到主干 |
| 6 | 收尾协议 | 卡片 comment、workspace 状态、项目任务状态同步 |
| 7 | 没人盯着你 | 自己收尾，别等指令 |

一条经验：别把父会话的上下文整段复述进简报。给路径和文件名，让它自己读。

### 「completed」是自述，不是验收

收尾这一半返工过一次。第一版止步于「子 agent 自己标 `workspace-status completed`」——
结果是干完的空间永远躺在盘上，一个约 1G，因为没有任何人回收它。

加上回收流程之后，真正的问题才露出来。一个卡片显示 `completed` 的空间，里面躺着
**3772 行未提交的改动**，横跨 27 个文件，外加两个 agent 忘了 `git add` 的资源目录。
卡片状态是子 agent 的自我报告，它不证明活落地了。

所以 `done` 是三道闸，任一不过就停下，不删：

```bash
git -C "$W" status --porcelain             # 闸 1：工作区干净？
git -C "$W" rev-list --count "$TARGET..$B" # 闸 2：分支已并？期望 0
git -C "$W" stash list                     # 闸 3：有没有藏着的 stash
```

闸 1 忽略 gitignore 的构建产物，但**未跟踪的源码和资源要算进去** —— 子 agent 的活
恰恰最容易从那儿漏掉。三道全过才标状态并 `orca worktree rm --force`。

可推广的版本：**自主 agent 报完成时，验产物，不验报告。**

## 解法二：单一真源，软链出去

分发问题的答案很无聊，但管用：

```
~/.agents/skills/owt/          <- 唯一的真实目录
├── SKILL.md
├── agents/openai.yaml         <- Codex 接口元数据
└── install.sh

~/.claude/skills/owt  -> ../../.agents/skills/owt
~/.codex/skills/owt   -> ../../.agents/skills/owt
```

`~/.agents/skills` 不是随便挑的 —— 它是 omp 的原生 skill 根目录，所以真源目录在
挂任何链接之前就已经对一个 agent 生效了。另外两个挂软链。

实测过，不是假设 —— 三个都能跟随软链读进去：

| Agent | 发现路径 | 调用方式 |
|---|---|---|
| omp (Oh My Pi) | `~/.agents/skills`（原生，`skills.enableAgentsUser`） | `/skill:owt` |
| Claude Code | `~/.claude/skills` | `/owt` |
| Codex CLI | `~/.codex/skills` | `$owt` |

确认 Codex 真的读到了 —— 这条命令渲染模型可见的 prompt，这里没有就是链接断了，
不是模型害羞：

```bash
codex debug prompt-input | grep owt
```

`install.sh` 负责挂链接：没装的 agent 直接跳过，目标路径上蹲着真实目录时拒绝覆盖。

## 通用化实际付出的代价

让一份文件服务三个 agent，主要是做减法：

- **宿主专属的工具名必须删。** 原版写的是「用 `AskUserQuestion` 问」—— 那是
  Claude Code 的工具，Codex 和 omp 没有。改成「问用户；宿主有结构化提问工具就用」。
- **一种调用式变成三种。** `/owt`、`$owt`、`/skill:owt`。
- **项目事实必须搬走。** 原版带着某个仓库的依赖体积、引导脚本路径、构建命令、
  hook 配置。那些是关于那个仓库的事实，不是关于 Orca 的 —— 该待在那个仓库的
  `AGENTS.md` 里。现在 skill 只说「读项目入口文档，验证命令从那儿抄，别编」。
- **本机快照必须变成探测。** 「本机现装（某年某月实测）」写下来的那一刻就开始过期。
  换成了一段运行时读 Orca 自带 agent 注册表的脚本。

最后一条可以推广：**可移植的 skill 写的是怎么查，不是曾经是什么。**

## 踩出来的坑

下面每一行都赔过一个工作空间。

- **`--base-branch` 必须显式传。** 文档说省略时用 repo 默认基线，实测子空间落在
  **当前**分支的 HEAD 上。两边都别赌，传就完了。
- **`--display-name` 不是 `create` 的 flag。** 它在 `worktree set` 上。先建后贴标签。
- **未提交的改动不会跟过去。** 子空间从 HEAD 切。父工作区脏 **且** 任务命中那些
  文件时，这是唯一值得停下来问用户的时刻。
- **终端 handle 不是身份。** 进程完全没重启的情况下 handle 也会被换掉。当场用，
  永不缓存；之后要再找它，全量列出来按 `worktreePath` + `title` 语义反查。
- **prompt 注入方式决定你怎么验证。** prompt 走 argv 参数的 agent 吞不掉它；
  prompt 在 TUI 启动后写进去的 agent 有就绪竞态 —— 后者必须读回终端确认简报落地，
  没落地就重发。
- **交互 shell 里跑的命令，`wait --for exit` 永远等不到。** 命令结束了，终端还是
  `running`。自己发 sentinel（`...; echo DONE=$?`）轮读输出。
- **合法的 agent id ≠ 装了那个 agent。** Orca 注册表认约 34 个 id，你本机有几个。
  选之前先探测。
- **卡片状态不会自己流转。** 建出来就是 `in-progress`，不显式改就一直是。这就是
  简报最后两段存在的理由。
- **删完又冒出来的目录，多半是你的 IDE，不是 CLI。** IDE 还开着那个已删除的
  workspace 时，下一次 autosave 会 `mkdir -p` 把整条路径写回来，留一个十几 K 的空壳。
  判据是 birth time：**壳里的文件比装它的目录还新**，删除残留不可能这样。先关掉
  IDE 那个窗口，否则删了还会长回来。
- **验删除要看「查无此项」，不是看磁盘。** `worktree rm` 之后，权威判据是工具自己的
  状态里没有了、`git worktree list` 里没有了、`git branch` 里没有了。磁盘残留可以
  比这三样都活得久，而且什么也不说明。

## 文件

| 路径 | 用途 |
|---|---|
| [`skill/SKILL.md`](./skill/SKILL.md) | skill 本体 —— 七步 create 流程、简报模板、硬约束 |
| [`skill/agents/openai.yaml`](./skill/agents/openai.yaml) | Codex CLI 接口元数据 |
| [`skill/install.sh`](./skill/install.sh) | 把 skill 挂给每个已装的 agent |

## 安装

```bash
mkdir -p ~/.agents/skills
cp -r cases/owt/skill ~/.agents/skills/owt
bash ~/.agents/skills/owt/install.sh
```

前置：`orca` CLI 在 PATH 里，且仓库由 Orca 管理。

## 相关

- [Spec 驱动开发](../spec-drive/) —— 这个 skill 的前身，tmux + 裸 `git worktree`
  的那一套，适用于 Orca 管不到的仓库
- [Lark Agent Bridge](../lark-agent-bridge/) —— 把聊天消息路由到**已有**的 agent
  会话，而不是新建
