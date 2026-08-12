---
name: owt
description: Orca 子工作空间（Orca WorkTree）：把一段任务描述变成 Orca 子工作空间并直接起 agent 跑（full handoff：建 checkout → 起 codex / claude / omp / 任一已装 TUI agent → 投喂简报 → 报地址 → 停）。当用户输入 /owt、$owt、/skill:owt，或说「丢到子空间做」「开个子工作空间跑这个」「交给另一个 agent 去做」时使用。`wt` 是 tmux + 裸 git worktree 的那一套，本 skill 是 Orca 版。
argument-hint: "<一段任务描述> | ls | done [<选择器>]"
---

# owt — 一句话开 Orca 子工作空间

Orca CLI 已经把「建 checkout、建分支、起 agent、投喂 prompt」全包在一条
`orca worktree create` 里。这个 skill 不写脚本，只负责命令之外的判断：
命名、上下文简报、卡片标注、闸门，然后闭嘴。

## 定位：full handoff，不是监督

建完 → 报地址 → **停**。不轮询子 agent、不建 `orchestration task-create`、
不 `dispatch --inject`（那些是 coordinator 的状态，用了就变成监督模式）。

| 其实想做的 | 该用什么 |
|---|---|
| 当前空间里再开一个 agent（不要新 checkout） | `orca terminal create --worktree active --command codex` |
| 要盯进度 / 任务 DAG / 决策 gate | `orchestration` skill |
| 非 Orca 管理的仓库、要 tmux 三 pane | `wt` skill |
| 只要一份交接文档，不要新空间 | `handoff` 类 skill（装了才有） |

## Usage

调用方式随宿主 agent 变，行为一致：

| 宿主 | 触发 |
|---|---|
| Claude Code | `/owt <一段话>` |
| Codex CLI | `$owt <一段话>` |
| omp (Oh My Pi) | `/skill:owt <一段话>` |
| 其他 | 直接说「用 owt 把这个丢到子空间」 |

```
owt <一段话>    建子工作空间并起 agent
owt ls          列出当前空间的子工作空间及状态
owt done [<选择器>]  验干净 → 标 completed → 回收空间
```

前置：`orca` CLI 在 PATH 里，且当前目录属于某个 Orca 管理的 worktree。

## create：七步

### 1. 读上下文（并发跑）

```bash
orca worktree current --json     # repoId / 分支 / path / linkedLinearIssue
git status --porcelain           # 脏状态闸门用
git log --oneline -5
df -g / | tail -1                # 磁盘闸门用
```

Orca 没起就 `orca open --json`。磁盘剩余 < 2G 直接停下报告，别造半残空间。
一个空 checkout 通常几百 M；带依赖安装的项目（CocoaPods / node_modules / venv）
单空间可能到 1G 量级，按项目实际算。

### 2. 判定（能自己定的别问用户）

- **agent 选型**：用户点名了就用点名的（`codex` / `claude` / `omp` / `gemini` / `droid` …，见下节清单）；
  没点名时：任务带截图 → 选一个能吃图片的（如 `claude`）；其余 → `codex`
- **要换掉默认模型档位或加 agent 专属参数** → 走下面的两步式，否则别用
- **name**：`<动作>-<slug>-<8位hex>`，动作前缀 `fix-` / `add-` / `refactor-` / `investigate-`，
  hex 用 `openssl rand -hex 4`。例：`fix-chat-crash-a1b2c3d4`
  → Orca 的 `--name` 同时决定路径（`~/orca/workspaces/<project>/<name>`）和分支名（扁平，无 `feat/` 前缀）
- **display-name**：人读标签，如「修复聊天崩溃」（create 不吃这个 flag，建完再 `worktree set`）
- **comment**：一句话说在干什么，看板卡片直接显示
- **linear**：父卡片 `linkedLinearIssue` 非 null 就继承 `--linear-issue <identifier>`

### 3. 脏状态闸门（唯一必须停下问的地方）

子工作空间从 HEAD 切，**未提交的改动不会跟过去**。

父工作区脏 **且** 任务命中那些改动文件 → 停下问用户：先提交 / 忽略照建。
父工作区干净、或改动与任务无关 → 不问，直接建。

（宿主有结构化提问工具就用，没有就直接在回复里问，别自己替用户决定。）

### 4. 建 + 起 agent（一条命令，然后补人读标签）

```bash
orca worktree create \
  --name fix-chat-crash-a1b2c3d4 \
  --comment "定位首屏崩溃并修复" \
  --base-branch <当前分支全名> \
  --parent-worktree active \
  --agent codex --prompt "<七段简报>" \
  --setup run --json

orca worktree set --worktree id:<repoId>::<newPath> --display-name "修复聊天崩溃" --json
```

`--base-branch` **必须显式传当前分支**：省略时的实际行为与官方文档说的「用 repo 默认基线」
不一致（实测子空间落在当前分支 HEAD 上），别赌。

`worktree create` 的合法 flag 只有这些，别照 `worktree set` 猜：
`activate / agent / base-branch / comment / environment / host / issue / json / linear-issue /
name / no-parent / parent-worktree / project / project-host-setup / prompt / repo / run-hooks / setup`。
`--display-name` **不在里面**，只能建完补。

两步式（只在要**换**模型档位、或要给 agent 加专属参数时用；`--agent <id>` 走的是 Orca
Agents 设置里配好的启动命令，绝大多数情况不需要换）：

```bash
orca worktree create --name <name> --comment "..." \
  --base-branch <当前分支> --parent-worktree active --setup run --json
orca terminal create --worktree id:<repoId>::<newPath> --title <name> \
  --command 'codex --model <model> -c model_reasoning_effort="xhigh"' --json
orca terminal wait --terminal <handle> --for tui-idle --timeout-ms 60000 --json
orca terminal send --terminal <handle> --text "<七段简报>" --enter --json
```

两步式有两个额外代价：TUI 没就绪时 `send` 的输入会被吞（所以必须先 `wait --for tui-idle`），
且不带 `--agent` 的 create 会多开一个 fallback shell——只在 `terminal list` 确认它是空 shell 后才关。

### 5. 抓 handle

create 响应里有 `startupTerminal.handle` 和 `agentTerminalHandle`（同一个值），
**当场用，不缓存**——handle 会在进程完全没重启的情况下被换掉。
之后要再找它：全量 `orca terminal list --json`，按 `worktreePath` + `title` 语义反查。

### 6. 确认它真开跑了（策略按 agent 的注入方式分流）

```bash
orca terminal wait --terminal <handle> --for tui-idle --timeout-ms 90000 --json
orca terminal read --terminal <handle> --limit 60 --json   # result.terminal.tail 是行数组
```

- **argv 类**（prompt 是命令行参数）：**吞不掉**，读一次纯属确认
- **stdin-after-start 类**（prompt 在 TUI 启动后写进去）：有就绪竞态 ——
  必须读到简报内容才算成功，读不到就 `terminal send` 重发一次
- 两步式（自己 `terminal create` + `terminal send`）一律按后者处理

哪个 agent 属于哪类，用下面的探测脚本查 `promptInjectionMode`。

### 7. 报告并停

给：worktree 路径、分支、handle、切过去的命令（`orca terminal switch --terminal <handle>`）。
之后不再读子终端，不转述它的内部往返。

## 简报模板（这是真正的产出物）

0. **先确认引导跑过**：读项目根目录的 `AGENTS.md` / `CLAUDE.md`，按里面写的引导步骤
   把新 checkout 跑通（依赖安装、软链修复等）。Orca 的 setup hook 配好时这步是空转复核；
   hook 失效或跨项目时它是唯一保障。依赖没装齐，后面的构建验证必挂，别跳过
1. **任务**：用户原话 + 归一化后的目标（做成什么样才算完）
2. **你在哪**：repo / 分支 / base / 父工作区绝对路径（父空间只读参考，不许改）
3. **先读**：项目的 agent 入口文档（`AGENTS.md` / `CLAUDE.md` / `ai/*.md` 之类）
   \+ 任务相关的具体文件路径
4. **怎么验**：项目的构建/测试命令和期望输出，从项目文档里抄，别编
5. **边界**：范围上限、别碰哪些文件、别提交到主干、别改父工作区
6. **收尾协议**：checkpoint 更 `orca worktree set --worktree current --comment "..."`；
   完事 `--workspace-status completed` + 项目自己的任务状态同步（见项目 agent 入口文档）
   + Linear（有链接才动）。**标 completed 之前先把活提交掉**——工作区脏着标完成，
   父空间回收时就得停下来问人，等于没收尾。新加的资源文件别漏 `git add`
7. **没人盯着你**：自己收尾，结论写进 comment，别等指令

别把父会话的上下文整段复述进去——给路径和文件名，让它自己读。

## 支持哪些 agent

`--agent <id>` 认 Orca 内置注册表里的 id（实测一个版本里有 34 个：`aider / amp / ante /
antigravity / aug / autohand / claude / claude-agent-teams / cline / codebuff / codex /
command-code / continue / copilot / crush / cursor / devin / droid / gemini / goose / grok /
hermes / kilo / kimi / kiro / mimo-code / mistral-vibe / omp / openclaude / openclaw /
opencode / pi / qwen-code / rovo`；名单随 Orca 版本变，以探测脚本为准）。
id 不合法会在**创建之前**报 `invalid_argument: Unknown TUI agent "..."`，不留残留 worktree（实测）。
`--prompt` 必须配 `--agent`，单独给会报 `--prompt requires --agent`。

id 本身合法 ≠ 本机装了。真源是 Orca 自带的注册表，查本机实际可用的：

```bash
python3 -c "
import re,shutil
p='/Applications/Orca.app/Contents/Resources/app.asar.unpacked/out/shared/tui-agent-config.js'
s=open(p).read()
b=re.split(r\"\n    '?([a-zA-Z][a-zA-Z0-9_.-]*)'?: \{\", s)
for i in range(1,len(b),2):
    d=re.search(r\"detectCmd: '([^']+)'\",b[i+1].split('\n    },')[0])
    m=re.search(r\"promptInjectionMode: '([^']+)'\",b[i+1].split('\n    },')[0])
    if d and shutil.which(d.group(1)): print(b[i], m.group(1) if m else '')
"
```

输出的第二列就是 `promptInjectionMode`，决定第 6 步怎么确认。

**别假设 launchCmd**：注册表里的 launchCmd 只是默认值，Orca 的 Agents 设置里可以整条覆盖
（例如把 `codex` 换成带代理和免审批参数的自定义命令）。要换档位/加参数就走两步式，自己写全 argv。

## ls

```bash
orca worktree ps --json
```

按 `parentWorktreeId == 当前 worktree id` 过滤，输出 displayName / comment /
workspaceStatus / 分支 / 路径。

## done：验干净再回收

**`completed` 不等于可以删。** 子 agent 自己标的状态只说明它认为活干完了，不证明
活真的落地了——实测出现过标着 `completed`、工作区里躺着 3700 行未提交改动的空间。
所以 done 是三道闸，任一不过就停下报告，**别删**：

```bash
W=<worktree 路径>; B=<worktree 分支>; TARGET=<父分支全名>

git -C "$W" status --porcelain                  # 闸 1：工作区干净？
git -C "$W" rev-list --count "$TARGET..$B"      # 闸 2：分支已并？期望 0
git -C "$W" stash list                          # 闸 3：有没有藏着的 stash
```

- **闸 1 有输出** → 列出改了什么，问用户：提交 / 丢弃 / 先不删。
  过滤掉 gitignore 的构建产物（`Pods/`、`node_modules/`、`.build/` 之类）再判断，
  但 `??` 的**源码和资源文件**要算进去——子 agent 新加的资源最容易漏。
- **闸 2 非 0** → 报告差几个 commit，问用户：合过去 / 先不删。
- 三道全过 → 标状态并回收：

```bash
orca worktree set --worktree id:<repoId>::<path> --workspace-status completed --json
orca worktree rm  --worktree id:<repoId>::<path> --force --json
```

`rm` 会同时删掉 Orca 卡片、git worktree 注册、目录和分支。
不带选择器的 `owt done` 指当前空间；带一段文字就按 `name:` / `branch:` 语义匹配。

删完扫一眼父目录：目录残留见下面的 Xcode 坑。

## 硬约束（都踩过）

- `--display-name` 不在 create 的 flag 列表里，建完补
- `--base-branch` 显式传，不吃默认值
- 未提交改动不跟过去，脏状态闸门不能省
- handle 不可缓存，语义反查（worktreePath + title）是唯一可靠定位
- 卡片状态不自动流转：建时即 `in-progress`，收尾必须显式改
- **新空间缺的通常只有包管理器装的依赖**。git 跟踪的软链随 checkout 就位；
  实测部分 gitignore 的软链也会跟过来（机制未知，别编）。所以引导的真内容一般就是
  「跑一次依赖安装」，由简报第 0 段让子 agent 自己跑，**不依赖 Orca hook**
- 别用 `terminal create --command <script>` + `wait --for exit` 等引导完成：命令跑在交互 shell 里，
  命令结束后终端仍是 `running`，`wait --for exit` 拿不到信号（实测 `result: null`）。
  要在终端里等就自己发 sentinel（`...; echo DONE=$?`）轮读
- 建 worktree 前确认磁盘剩余 > 2G
- `worktree rm --force` 会同时删掉卡片、git worktree 注册、目录和分支，本身干净
- **删完目录又冒出来，多半不是 orca 没删干净，是 IDE 事后重建的**。IDE 还开着那个
  已删除的 workspace 时，autosave 会 `mkdir -p` 把整条路径写回来，留一个十几 K 的空壳
  （Xcode 的 `*.xcworkspace/xcuserdata/*/UserInterfaceState.xcuserstate` 就是这样）。
  判据是 birth time：**壳里的文件比目录还新** = 事后重建，删除残留不可能比容器新。
  确认方法是 `orca worktree ps` / `git worktree list` / `git branch` 里都查无此项。
  处理：先关掉 IDE 里那个窗口，再 `rm -rf` 空壳，否则删了还会长回来
- **`completed` 是子 agent 的自述，不是验收**。回收前必须自己验工作区和分支，见 done 一节

## 引导交给 Orca worktree hook

Orca 可以在新 worktree 建好、agent 启动**之前**跑一段 setup 脚本，这是最省事的引导方式。
**前提是该脚本已提交到目标分支**——新 worktree 从 base 分支的 HEAD 切，脚本不在 HEAD 里 hook 就跑空。

配置位置：Orca 设置（⌘,）→ 侧栏 `PROJECTS` → 项目 → `Worktree Hooks`，
关键字段是 Setup Script、When to run（设 `run-by-default`）、Wait for setup（开）。
脚本里可用 `$ORCA_ROOT_PATH` / `$ORCA_WORKTREE_PATH` / `$ORCA_WORKSPACE_NAME`。
CLI 改不了这些字段（`project setup-update` 没有 hookSettings 参数），只有 UI。

hook 有两个源，由 `commandSourcePolicy` 决定谁生效，只有三个值：
`local-only`（用 UI 填的本地脚本，忽略仓库里的 `orca.yaml`）、`shared-only`（用 `orca.yaml`）、
`run-both`。未设置时按「有本地脚本→local-only，否则→shared-only」解析。
给队友/新机器铺路就在仓库根提交 `orca.yaml`（`scripts.setup: ./scripts/xxx.sh`），
他们的 policy 通常未设置 → 解析成 shared-only，开箱生效；shared 源另有按内容 hash 的信任门，
脚本改一次要重新确认一次。

引导脚本本身要**幂等**：依赖已就位时秒退，因为它会被 hook 和简报第 0 段各跑一次。
