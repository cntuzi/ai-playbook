# Skill 架构 —— 从八个手写 skill 里抽出的五条原则

[English](./README.md)

我装了 72 个 agent skill，其中 8 个是自己写的。这篇讲这 8 个的共性 —— **是事后从产物里抽出来的**，
不是先立了规范再照着写。这些 skill 是几个月里各自独立写的。

这一点很关键：其中三条原则出现在彼此毫无关系的 skill 里。**独立重复发现**，才是它们是真原则、
而不是个人审美偏好的证据。

---

## 一、决策归模型，执行归脚本

`wt`（git worktree + 分支 + tmux 管理）自己的 overview 里就写着：

> 脚本是无状态的薄封装，**路径策略由 Claude Code 决定**。

所以 `wt.sh` 从不决定 worktree 放哪、分支叫什么。它接一个名字，做确定性的文件系统和 tmux 操作。
agent 读到「修复聊天崩溃」，判断出 `fix-chat-crash`，再交给脚本。

`codex`、`gemini`、`weekly` 是同一个形态，只是没明说：`SKILL.md` 装**何时委托、传什么上下文**，
脚本装**怎么调**。脚本里没有判断，skill 里没有 CLI 语法。

判据：**如果你的脚本里有一个关于「意图」的 `if`，它站错了半边。**

## 二、权威版和便携投影是两份文档

`decision-hygiene` 和 `dirty-data-governance` 开头都有一句版本声明，大意是：带案例和模板的权威
完整版在团队方法论库，**本文件是跨项目个人便携版，更新时与权威源同步**。

`fix-pipeline` 独立走到了同一个分法 —— 命令语法归厂商自带的 guide（`orca skills get
orchestration`），skill 刻意不复述，这样它不会跟你装的那个 CLI 版本漂移。

同一条规则出现在三个不相关的 skill 里：**便携副本必须点名自己的权威源，并声明自己是投影。**
否则副本会悄悄变成第二个真源，两边分叉了都没人察觉。

## 三、纪律型 skill 改的是默认行为，不等触发词

`decision-hygiene` 和 `dirty-data-governance` 都写着：**每次总结、复盘、重大产出时把它当默认
检查项**。

这跟工具型 skill 是两种契约。工具型靠触发词点火，干一件事。纪律型必须在**没人想到要调用它的
那些回合**里改变行为 —— 它的价值恰恰在你没想起来要用它的场合。这意味着它的 description 不能只
列触发词，得点名那个反复出现的**情境**。

## 四、规则必须 contextual，不能全开

`taste-skill` 是 1206 行前端设计规则，它的第二行就是：

> 下面每条规则都是**上下文相关**的，没有一条自动生效。先读 brief，再只取合适的。

1206 行无条件全开，产出的正好是这个 skill 要防的模板味。所以它的第 0 节是 brief inference ——
先读懂场子，**再**选规则。

`fix-pipeline` 用结构解同一个问题：共享契约放 `SKILL.md`，每个角色一个文件，扮演 verifier 的
agent 永远不会加载 analyzer 的步骤。两者是同一个动作 —— **量大没问题，无条件生效才是问题。**

## 五、相邻 skill 必须显式划界

`decision-hygiene` 的 description 里明写：*配合 `dirty-data-governance`（清理方法）使用；本
skill 管「何时触发 + 决策层脏数据 + 预防」。*

两个覆盖相邻领域的 skill，如果没有一方明说边界在哪，就会抢同一个触发。**最便宜的修法 ——
description 里加一个从句**，一对含糊的 skill 就变成了一个路由。

---

## 八个 skill 的谱系

| 形态 | Skill | 结构 |
|---|---|---|
| **委托给另一个 AI CLI** | `codex`、`gemini` | `SKILL.md`（何时委托、怎么传上下文）+ `scripts/*.py`（调用、JSON 解析、会话恢复） |
| **工程流程自动化** | `wt`、`weekly` | `SKILL.md`（策略）+ `scripts/*.sh`（确定性执行） |
| **方法论纪律** | `decision-hygiene`、`dirty-data-governance` | 只有 `SKILL.md`，无脚本、无触发词 —— 它们改的是默认行为 |
| **品味约束** | `taste-skill`（1206 行） | 一大坨 reference，由 brief inference 把门 |
| **多角色编排** | [`fix-pipeline`](../fix-pipeline/) | `SKILL.md`（共享契约）+ `roles/*.md`（一角色一分支） |

注意这个相关性：**skill 越是关于判断，脚本就越少。** 两个方法论 skill 一行脚本都没有；
两个 CLI 封装几乎全是脚本。

---

## 什么装、什么自己写

72 个里有 64 个是从上游装的，不是我的东西，也不该由我转发：

| 来源 | Skill |
|---|---|
| [mattpocock/skills](https://github.com/mattpocock/skills) | `ask-matt`、`code-review`、`codebase-design`、`domain-modeling`、`implement`、`tdd`、`teach`、`writing-*` 等 |
| 飞书 / Lark 官方 skill 集 | `lark-*`（约 25 个） |
| Orca CLI 自带 | `orca-cli`、`orca-linear`、`orchestration`、`computer-use` |
| 其他 | `stitch-*`、`obsidian-vault`、`prototype`、`research`… |

我用的分界线是：**凡是沉淀通用手艺的，装；只有沉淀我自己环境、我自己判断的，才自己写。**
测试纪律、代码评审、领域建模 —— 已经有人比我想得更透。worktree 怎么摆、周报什么格式、在我的
项目里什么算脏数据 —— 这些没人能替我写。

## 动手写之前值得知道的成本

- **model-invoked skill 的 description 每一轮都占着上下文窗口。** 这是「能被自动调用」的常驻
  成本。只有你自己会按名字调的 skill，就该声明成 user-invoked，一分不花。
- **拆 skill 花的是两种预算之一**：上下文（多一条常驻 description）或记忆（多一个你得记住它存在
  的东西）。两种都不免费，所以拆分必须挣得回来 —— 要么是真正独立的触发，要么是一个分支携带了
  别的分支不该加载的内容。
- **模型本来就会遵守的那行字，是花 token 说了句废话。**「要仔细」不改变任何行为。修法是换一个
  更锋利的词，不是加更多的词。
