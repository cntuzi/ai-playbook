---
name: fix-pipeline
description: >-
  用问题修复流水线把一批问题跑成队列驱动的闭环：队列是真源、按 touched-files 分桶隔离修复、
  三证链（自证/他证/人证）收口、Linear 作为人的验收看板。Use when 用户要批量处理或批量修复
  一批问题、要接入 intake/analyzer/verifier/fixer 任一角色、要把独立复验或人工验收接进
  自动化、要查问题在流水线里跑到哪了，或说「走流水线」「fix-pipeline」。
---

# 问题修复流水线

一批问题、多个 agent、一条闭环。四个词撑起全部行为：

- **队列是真源** —— `orca orchestration task` 是唯一机器真源。消息只是唤醒信号，丢了不影响正确性；队列丢了就全乱。
- **桶** —— 隔离单元。一个桶 = 一组 touched-files 互不重叠的问题 + 一个 agent + 一个执行位置。桶数决定并发度，问题数不决定。
- **三证链** —— 自证（修复 agent 说改完了）→ 他证（换一个只读 agent 复验）→ 人证（人在 Linear 验收）。少一环就是假绿灯。
- **回边** —— 复验不过、人打回，问题重新入队等人领。这条边让它成为循环而不是流水线。

跨 agent 通用：claude / codex / omp / gemini / grok 都能扮演任一角色。执行底座是 Orca orchestration。

## 先确认再动手

```bash
orca status --json                      # runtime 必须 ready
orca orchestration task-list --brief --json   # 队列现状 = 你的 external memory
```

`orchestration` 是 Orca 实验特性，需在 Settings > Experimental 启用。命令报「未启用」就停下告诉用户，不要绕道用别的 spawn 工具替代（见「工具边界」）。

**控制面 worktree 要独占**：`@worktree:<id>` 广播会送到该 worktree 里**每一个**活终端。控制面里混进别的工作终端，每条广播都会打扰无关 agent。

## 怎么启动

用户在**项目 worktree** 里说「启动 fix-pipeline」时，你执行这一节。不需要脚本。

**这一节只负责把角色拉起来。角色怎么干活，全在它自己那份 `roles/*.md` 里。**
守住这条，以后加角色只要加一个 roles 文件 + 在下面的列表里加一行，启动逻辑不用改。

### 1. 先问一个参数

**Linear team**：`orca linear team list --json`。只有一个就直接用，**多个必须问用户** ——
串台的代价是把问题建到别人的看板上。

基线分支不用问，取当前分支。

### 2. 建控制面 worktree

```bash
orca worktree create --name fix-pipeline \
  --parent-worktree active --base-branch <当前分支> \
  --agent claude --setup skip --json
```

⚠️ **`--base-branch` 必须是当前分支，不是仓库默认分支。** 踩过：要修的代码只存在于特性分支上，
从 master 切出来，fixer 在基线上找不到要改的东西 —— 而且它会找到同名的老实现改完自证通过，
不报错（见「工具边界」下的软着陆）。这是本流水线少数几个该 stacked 而非独立建 worktree 的场合。

⚠️ **用 `--agent claude` 而不是 bare create + 后补 `terminal create --command claude`。**
bare create 会先开一个 fallback shell，那个 shell 会一直留在控制面里，
让「控制面应该有几个终端」这个基准算不准（`roles/watchdog.md` 里那条「数终端先排掉普通 shell」
就是为它写的）。agent-first 建法直接把第一个角色放进第一个终端，没有多余 shell。

### 3. 拉起常驻角色

第一个角色已经由 `--agent` 起好了。**剩下的每个走三步，顺序不能少** ——
TUI 没就绪时 `send` 会被吞，prompt 石沉大海：

```bash
orca terminal create --worktree id:<控制面 id> --title <role> --command claude --json
orca terminal wait --terminal <handle> --for tui-idle --timeout-ms 90000 --json
orca terminal send --terminal <handle> --enter --text "<启动 prompt>"
```

常驻角色四个：**intake / analyzer / verifier / console**。
fixer 不在这里 —— 它是按需起在桶里的，由 analyzer 派活时创建。

### 4. watchdog 装成定时任务，不起终端

```bash
orca automations list --json     # 先查，同名的别重复建
```

没有再建，命令见 `roles/watchdog.md` 最后一节。

**为什么不给它开终端**：它的职责是发现别人挂了。做成常驻终端，它自己挂了没有任何机制发现 ——
这是个自相矛盾的形态。定时任务 + `--fresh-session` 才对：挂了下个周期自动回来，
它无状态，全部状态都在队列里。

### 5. 启动 prompt

**不要在 prompt 里重复任何手册内容**，否则启动语和手册会各自漂移 —— 改了手册，
启动时还在灌旧规则，而且没人会发现。

```
你是 fix-pipeline 的 <role>。
读 ~/.agents/skills/fix-pipeline/SKILL.md 和 roles/<role>.md，按它执行。

【本次运行的项目上下文】
控制面 worktree  <id>
项目 worktree    <path>
基线分支         <branch>
Linear team      <team>

【找同伴】控制面里应有 4 个角色终端。别用 title 认角色（会被任务描述持续覆盖），
用 orca terminal list 全局查 + orchestration send 直接问。
```

给 intake / analyzer / verifier 的末尾加一句「**进循环不要停**」。
**console 不要加** —— 它是响应式的，不跑循环，只在人开口时回答（见 `roles/console.md`）。

### 6. 收尾

报告控制面 worktree id 和各角色 handle，然后告诉用户一句：
**以后在 console 那个终端说话。**

启动完自查：控制面终端数 = 角色数（没有多余的 fallback shell）、`automations list` 里有 watchdog、
每个角色都回过一条自报角色的消息。

## 拓扑：用 worktree 父子关系统筹

流水线的能力是跨项目的，但**每次运行绑定一个项目上下文** —— 在哪个项目下启动，就服务哪个项目。这个绑定用 Orca 的 worktree lineage 表达：

```
<项目 worktree>                    ← 在这里启动 fix-pipeline
 └── fix-pipeline                  控制面（child，带项目代码）
      │  ├─ 终端 intake
      │  ├─ 终端 analyzer
      │  ├─ 终端 verifier
      │  ├─ 终端 watchdog
      │  └─ 终端 console          人机接口（人只在这里说话）
      ├── <bucket-a>               桶（控制面的 child）
      │     ├─ 终端 fixer
      │     └─ 终端 他证 agent（只读，同 worktree）
      └── <bucket-b>
```

每层为什么这样：

| 层 | 理由 |
|---|---|
| **控制面挂在项目下，且带项目代码** | analyzer 要读项目文件才能按 touched-files 分桶。控制面没有代码，analyzer 干不了活 —— 这是踩过的坑，不是理论 |
| **控制面是独立 worktree，不复用项目 worktree** | 广播域隔离：项目 worktree 里通常有用户自己的多个终端 |
| **桶是控制面的 child** | 表达「这个桶属于这条流水线」，而不是散落在项目下面 |
| **他证不另开 worktree** | 在被验的那个桶里开第二个终端就够，只读。省一份 checkout，而且它要读的就是那个桶的改动 |

### lineage 就是通信拓扑

**任何时候要找谁，从 lineage 重新解析，不要存 handle。**

```bash
# worker 找派它活的那个角色（见下方「coordinator 不是角色」）
orca worktree show --worktree current --json   # → parentWorktreeId
orca terminal list --json                      # 查全局，再按 worktreeId 字段过滤出控制面成员
orca orchestration send --to <候选> --type status ...   # 直接问它是谁

# 派活方找它管的桶
orca worktree show --worktree current --json   # → childWorktreeIds

# 广播只打到流水线内部
orca orchestration send --to "@worktree:<控制面 id>" --type status ...
```

⚠️ **两处曾经写错，别改回去**：①「找 title 为 coordinator 的终端」——
Claude Code 会用当前任务描述持续覆盖 title，没有终端会一直叫 coordinator，认角色只能直接问
（见 `roles/watchdog.md`）。②`terminal list --worktree <id>` ——
带 worktree 过滤的列表返回过全局不存在的临时记录，查全局再按 `worktreeId` 字段过滤才对。

这解决了纪律 4 里那个悬着的问题：**terminal handle 随重启变化，父子关系不变**。派活方重启后 handle 失效，worker 依然能从 lineage 重新解析出当前的派活方，比只靠 `task-list --ready` 兜底强。

## 你是哪个角色

读你自己那一份，不要读全部：

| 角色 | 干什么 | 步骤文件 |
|---|---|---|
| **intake** | 接问题输入 → 归一化去重 → 写队列 | `~/.agents/skills/fix-pipeline/roles/intake.md` |
| **analyzer** | 按 touched-files 分桶 → 建任务 → 起 worker 派活 | `~/.agents/skills/fix-pipeline/roles/analyzer.md` |
| **fixer** | 桶内串行修复，跑自证小循环 | `~/.agents/skills/fix-pipeline/roles/fixer.md` |
| **verifier** | 批量拉待验证 → 派他证 → 请人验收 → 回读关单 | `~/.agents/skills/fix-pipeline/roles/verifier.md` |
| **watchdog** | 常驻角色存活检查 + 按队列重放 | `~/.agents/skills/fix-pipeline/roles/watchdog.md` |
| **console** | 人的唯一入口：答人的提问、维护手册；不领队列任务 | `~/.agents/skills/fix-pipeline/roles/console.md` |

角色没指定时，从 `task-list --ready` 推断该干什么：**`parent_id` 为空**的是待分桶的问题（analyzer 的活），**标题以 `verify ` 开头**的是待复验的桶（verifier 的活）。

### coordinator 不是角色，是关系位置

手册里出现 `coordinator` 的地方（`roles/fixer.md` 的 `worker_done` 收件方、纪律 4 的路由说明），
指的都是**那次 dispatch 的发起方** —— 派修复任务的是 analyzer，派他证的是 verifier。
**谁 dispatch，谁就是那次 dispatch 的 coordinator**，下一次换人派就换人。

所以**没有 `roles/coordinator.md`，也不要设一个专职 coordinator 终端**。
`worker_done` 只发给 preamble 里那个具体 handle，一个没派过活的终端永远收不到它，只会空转；
要是它派了活，那它干的就是 analyzer / verifier 的活，重复设岗。

（这条是从 dispatch 原语推出来的，没有实测反例，也没有实测正例。真要设这个终端，先验一次再写进来。）

## 状态映射

| 生命周期 | `task.status` | Linear state | 谁写 |
|---|---|---|---|
| 入队 | `ready`（无依赖，建出来就是） | `Todo` | intake |
| 已分桶已派活 | 问题 task → `dispatched` | `In Progress` | **analyzer 显式置**（否则下一轮重复领取） |
| 修复完成待复验 | fix `completed`，verify 任务转 `ready` | `In Progress` | fixer（`worker_done` 自动置） |
| 复验通过待人验收 | 问题 task → `blocked` | 团队的 Review 类状态（见下） | verifier（`gate-create` 自动置） |
| 卡住等人拿主意 | 问题 task → `blocked` | 团队的 Blocked 类状态（见下） | 谁卡住谁写 |
| 人验收通过 | `gate-resolve` 回 `ready` → **再显式置 `completed`** | `Done` | 人拖卡 → verifier 回读 |
| 人打回 | verify task `failed` + 新建问题 task（`ready`） | `Todo` + 评论 | 人 → verifier 回读 |
| 他证不过 | 同上 | `In Progress` + 评论 | verifier |

`task.status` 只有这六个值：`pending / ready / dispatched / completed / failed / blocked`。

**「等人」有两种，Linear 上必须分开，机器侧都是 `blocked`**：

| | 人要做什么 |
|---|---|
| 等验收 | 扫一眼结论，拖 `Done` 放行 / 拖 `Todo` 打回 |
| 等决策 | 动脑做判断：方向对不对、要不要扩范围、两个方案选哪个 |

混用的代价：人扫看板分不出哪张要点头、哪张要动脑，两种卡堆在一起就都不想碰。

**状态名先查再用，不要照抄本手册**：`orca linear team states --team <TEAM> --json`。
各团队命名不统一（这个项目叫 `Review` / `Blocked`，别处可能是 `In Review`），
名字对不上 `status set` 直接失败。两者**可能都是 `started` 类型**，靠 `type` 区分不了，只能靠语义。
团队两个都没有时才退 `In Progress` + 评论说明，并且**必须**用 Orca 看板卡片兜底。

**实测的状态语义（与直觉不同，照这个来）**：

- 新建**无依赖**的 task → 直接是 **`ready`**，不经过 `pending`
- **`pending` 的意思是「依赖未满足」**，不是「刚入队」。所以扫新问题要用 `--ready`，扫 `--status pending` 会永远拿到空
- `gate-resolve` 只把 task 从 `blocked` 放回 **`ready`**，不会关单 —— 必须紧接一次 `task-update --status completed`，否则它会被 analyzer 当成新问题重新领走

业务态用结构表达，不用新状态：**「待验证」靠 `--deps`**（验证任务依赖修复任务，修复完成即自动可领），**「待验收」靠 `gate`**。

## 真源纪律

三套状态存储，方向严格单向：

```
orchestration task ──推进度──▶ Linear issue        （人看的投影）
orchestration task ◀──仅回读验收结论── Linear issue  （人唯一的写权限）
orchestration task ──推桶级进度──▶ worktree.workspaceStatus（只写不读）
```

- `task.status` 是**唯一机器真源**，所有调度决策只读它。
- Linear 是**人看的投影 + 人唯一的输入点**：人只写「验收通过 / 打回」。
- `workspaceStatus` 是**展示投影**，给人在 Orca 看板上看桶级进度用；自动化逻辑读它做判断，等于把展示层当真源。

### 不是真源的东西，一个都别当状态用

终端 preview 里的一行字、别人转述的进度、自己上下文里的记忆、`send` 返回的 `ok` —— **都不是**。
要断言某件事的状态，去查上面那三套存储。

一轮之内实测撞了三次：

- 有角色读另一个终端 preview 里的一行字，判定它「正在处理 ISSUE-3」
- 有角色报出「已立条目、已领走分桶」，而队列里 0 个 `ready`、0 个 `dispatched` —— 两件事都没发生
- 有角色拿记忆里的 handle 判定两个 agent 死亡，实际都活着

**「队列是真源」这条坏就坏在它太容易被「看起来像」绕过去** —— 那三样东西都长得很像状态，
而且查它们比查队列便宜。便宜正是它们危险的原因。

### 给人的信息走看板，不走消息

**凡是要让人知道的事，一律落 Linear 评论或 Orca 看板卡片。任何角色都不要把它当消息发给终端。**
包括「发现故障要通知人」这种看着很紧急的情况 —— 越紧急越该落卡，因为卡不会被刷走。

理由是机制层面的：agent 之间的消息会被 hook **原文注入**到收信终端的对话里。发给人机接口终端，
人看到的就是一整屏 `--- Orchestration Messages ---` 加内部黑话，而人机接口 agent
拦不住也改不了。实测人的反馈是「这些消息在追着我跑」。

正确形状：

| 你想干什么 | 怎么做 |
|---|---|
| 让人知道某件事 | 写 Linear 评论 / 看板 comment，人自己去看 |
| 让人做决定 | 卡片改 `Review` 或 `Blocked` + 评论写清选项和默认方案 |
| 让人机接口 agent 知道某件事（它要用来答人的提问） | 可以发消息，但写清「这是背景，不要转发原文给人」 |

人机接口终端**不复述 agent 之间的往返，也不做进度播报**。
但**人正要基于错误信息动手时，可以主动提示一句**，并指向已经落好的卡 ——
落卡是投递保障，主动提示是时效保障，两者不冲突。

（曾经写成「人机接口终端只在人主动开口时回答」，是错的：人烦的那一屏原文注入，
是**别的角色发消息给它**触发的，跟它说不说话无关。禁它开口，那屏照样出现一次不少，
还指错了责任方。真正治病的是上面那条「任何角色都不要把给人的信息当消息发给终端」。）

## 十条纪律

1. **常驻 agent 是路由器，不是工人。** 只碰 task id、标题、文件清单、report 路径。要读内容（diff、代码、报告正文）就派一次性子 agent。这条守住，每轮 context 增量是常数级；破了，两天撑爆。
2. **报告写盘，只传路径。** `worker_done` payload 用 `reportPath` 带路径，正文落文件。纪律 1 靠它落地。
3. **他证换 agent 且只读。** 复验 agent 必须与修复 agent 不同，且只读。换视角（能否复现 / 是否引入回归 / 是否改错了地方）比派 N 个同质复验有效。
4. **队列是 external memory。** lifecycle 权限来自 payload 的 `taskId` + `dispatchId`，handle 只是路由元数据（pane 重启就换）。`worker_done` / `heartbeat` 从 worker 自己终端发给 preamble 里那个具体 coordinator handle；广播进度用 `status` 类型。coordinator 重启会让在途 `worker_done` 落空，靠 `task-list --ready` 找回该干的活。 更好的办法是从 lineage 重新解析出当前 coordinator（见「拓扑」一节）—— handle 会变，父子关系不会。

   **收消息有两条独立通道，标识不同，坏起来只坏一条**：

   | | 标识 | 怎么工作 | pane 重建后 |
   |---|---|---|---|
   | **hook 注入**（被动收） | `$ORCA_PANE_KEY` | agent 的生命周期事件触发 `~/.orca/agent-hooks/<agent>-hook.sh`，把 payload POST 给本地 runtime，runtime 在响应里回注入内容 | ✅ 照常 —— hook 每次是新起的进程，现读 env |
   | **`check --wait`**（主动拉） | `$ORCA_TERMINAL_HANDLE` | 你自己调命令去查 | ❌ 聋掉 —— 用的是 agent 进程**启动时固定**的那份 env |

   ⚠️ **所以「收得到消息」不等于「handle 有效」。** 别信 `$ORCA_TERMINAL_HANDLE`，包括你自己的 ——
   拿过期 handle 跑 `check --wait`，**命令不报错、不返回错误，只是永远返回空** —— 你会以为
   「队列很闲」，实际上是聋了。实测：watchdog 的注入通道一直好着（还在正常收发消息、终端有输出、
   从外面看完全健康），唯独它主动拉的那条永远拿不到东西。

   ⚠️ **发消息同样静默失败，而且更阴险：`ok: true` 不代表送达。**
   `--to` 不校验目标是否存在，`--from` 也不校验发件人是否存在。两个都有可复现的探针：

   ```bash
   # --from 不校验：用一个当场确认全局不在列的 handle 当发件人
   orca orchestration send --to <自己> --from term_deadbeef-0000-0000-0000-000000000000 ...
   # → ok:true，且 check --peek 能在收件箱里看到它，from_handle 原样存着那个假值

   # --to 不校验：发给一个已消失的 handle
   # → ok:true，落库成功，送不到任何人
   ```

   实测代价：一次广播四条，三条发给了换代前的旧 handle，全部返回「成功」，实际打空。

   四条静默失败，全都不报错：

   | | 表现 | 你会误以为 |
   |---|---|---|
   | 收不到 | `check --wait` 不报错、只返回空 | 队列很闲 |
   | 发不出 | `send` 不报错、返回 `ok: true` | 消息已送达 |
   | 查不出 | 拿 `send` 的 `ok` 当存活证据 —— 它**恒真** | 对方还活着 |
   | 内容坏 | 正文经过 shell，反引号被执行、`$` 被展开，命令照样返回成功 | 发出去的是你写的那段 |

   四条都有解药，全部当场可查：

   | 故障 | 解药 |
   |---|---|
   | 收不到 | `check --terminal <当场反查的自己> --peek --json` —— 显式传 handle 不读 env，`--peek` 不标已读。env 聋了不必重建 pane |
   | 发不出 | `check --terminal <对方> --all --json` —— 查对方收件箱确认投递，`--all` 不标已读、不干扰对方 |
   | 查不出 | 存活只认三条证据：全局 `terminal list` 在列 / 收到回信 / 队列里它认领的任务在推进 |
   | 内容坏 | `--body '单引号包住'`，或写文件后 `--body "$(cat 文件)"` |

   ⚠️ **`--body-file` 不通用，它只在部分子命令上存在**（两条都实测敲过 `--help`）：

   | 命令 | `--body-file` |
   |---|---|
   | `orca linear comment add` | ✅ 有，`<path\|->`，`-` 读 stdin。发长评论用它最干净 |
   | `orca orchestration send` | ❌ 没有，只能 `--body`。照做会拿到 `Unknown flag --body-file` |

   本手册曾把它写成 `send` 的解药，传了整整一轮 —— **而写它的人并没有凭空编：
   那个人真在用 `--body-file`，用了十几次全成功，只是用在 `linear comment add` 上。**
   错的是把「在 A 子命令上成立」泛化成「在这个 CLI 上成立」。

   **同一个 CLI 的子命令各有各的 flag 表，敲一次 `--help` 比推断便宜。**

   两种写法**都实测过，特殊字符完整保留**（反引号、`$HOME`、`$(date)`、`\n`、多行）：

   ```bash
   orca orchestration send ... --body '正文里有 `反引号` 和 $HOME 都没事'
   cat > /tmp/body.txt <<'EOF'      # 定界符必须加引号才关插值，写成 <<EOF 一样会展开
   长正文，可含任意特殊字符
   EOF
   orca orchestration send ... --body "$(cat /tmp/body.txt)"
   ```

   `"$(cat 文件)"` 安全的原因：命令替换的结果作为**字符串**传给参数，不会被二次解析。
   危险的只有一种 —— **双引号里直接写正文**：反引号会被执行、`$` 会被展开成（多半是空的）变量。
   损坏的是内容不是命令，报错在另一条流里，极易漏掉。实测有 agent 因此发出两段被替换成空字符串的正文。

   > 📌 这条本身是个教训，而且比「手册里的命令要么跑过要么标注未验」更进一层：
   >
   > **「我用过」不等于「这里能用」—— 经验的适用边界要和经验本身一起记。**
   >
   > 凭空编的东西还有人会怀疑；**从真实成功经验里错误泛化出来的，最难查** ——
   > 写的人手上有十几次成功做背书，自己重读一遍也只会想起「我用过啊」然后跳过。
   > 这条只能靠去敲一次拆开，推理拆不开。

   ⚠️ **`reply --id` 不免疫。** 直觉上它按消息 id 路由、不碰 handle，似乎更安全 ——
   实测证伪：`reply` 把目标解析成**那条历史消息里记录的发件人 handle**，而历史消息里的
   handle 只会越来越旧。对一条发件人已死的消息 `reply`，照样返回 `ok: true` 并落库，送不到任何人。
   它比 `send` 更危险，因为给人一种「我没碰 handle 所以安全」的错觉。

   所以 **handle 不能当身份凭据**，任何基于发件人字段的权限或路由判断都是空的。

   **第三条推出一条硬结论：用消息做存活检查是无效的。** `send` 成功不证明对方活着，
   只有**收到回信**才证明。存活判定的证据链只有三条能用 ——
   **终端在全局 `terminal list` 里 / 有回信 / 队列里它认领的任务在推进**。`send` 的返回值一条都不算。

   **收口成一条，比逐个防某种失效模式管用**：

   > **任何单一来源的 handle 都不可信，包括自己反查出来的。**
   > 要用一个 handle 之前，当场用全局 `terminal list`（不带 `--worktree`）确认它在列 ——
   > 不用几分钟前查到的，也不用消息里带来的。
   > **handle 是「使用那一刻」的事实，不是可缓存的属性。**

   这条覆盖换代、笔误、伪造 `--from`，以及那些还解释不清的情况：当场命中就能用，不命中就不能用。
   不必去给每种失效编一个机制名 —— 编出来的名字会被当成已知机制传下去，比不解释更糟。

   **投递和处理是两件事，各有各的证据，别混着用**：

   | 你想确认 | 怎么查 | 证明了什么 |
   |---|---|---|
   | **投递**成功 | `orca orchestration check --terminal <对方 handle> --all --json` | 消息在对方收件箱里。`--all` 不标已读，不干扰对方 |
   | **处理**开始 | 收到回执 | 有人接手了 |

   收件箱里有，只证明送到了，证明不了对方读了、更证明不了它会处理。

   所以重要消息发完**先查一次投递**，再按回执等处理：

   - 消息在 → 投递没问题。对方安静 = 它收到了没回（注意力问题，不是投递问题）
   - 消息不在 → 确定打空了。当场反查 handle 重发，不用等、不用猜

   没有第一步时，「安静」把两种失败混在一起分不开 —— 有了它，投递问题当场就能摘干净。

   **消息不会蒸发，它落在一个永远不会有人去查的收件箱里。** 这对补救有实际意义：
   发现发错了 handle，内容还在，读回来重发即可，不会丢。

   反过来也别过度反应：注入通道不受影响，不需要为 handle 过期做重连逻辑。

   hook 是 **Orca 对每个 agent 都提供的**，不是 claude 专有 —— `~/.orca/agent-hooks/` 下
   claude / codex / gemini / grok / cursor / copilot / devin / droid / kimi 等各有一份，
   按各家 hook 接口分别适配。所以这套消息机制在换 agent 扮演角色时是通的。

   **组地址的实测语义**：`@worktree:<id>` 在**发送时**按当时的活终端列表展开成 N 条点对点消息（共享一个 `thread_id`）。所以跨终端重建天然稳定 —— 不必维护 handle 表，重建后的新终端会自动进入下一次广播。代价是**广播域 = 整个 worktree 的所有活终端**：实测一条测试广播被一个正在干无关工作的 agent 收到并回复了。因此**控制面 worktree 必须独占**，只放流水线角色的终端。
5. **桶按 touched-files 聚类。** 桶间文件不重叠 → 并行 merge 零冲突；桶内同模块串行改 → agent 拿到完整上下文。问题分类（崩溃 / UI / 性能）不用来分桶，用来**选模型**。
6. **rolling wait 是常态。** `check --wait` 一次只返回一条消息，N 个 worker 可能同时完成就循环 N 次。超时或 `{count:0}` 是检查点，真实编码任务 15–60 分钟；heartbeat 和终端活动只证明活着。worker 还在产出就继续等。
7. **假阳性在入口卡。** 扇出找问题的产出里相当比例是幻觉或不值得改。每个假问题穿过入口就要烧一个修复 agent + 一次复验 + 一次人工验收。入口多花一轮判断，比下游三次浪费便宜。
8. **报告带可独立验证的锚点，别只报结论。** 跨 agent 的每一条报告都要给出收信方能自己去查的东西：commit sha、文件路径、task id、分支名、报告路径。只写「已合并、已清理、验证通过」，收信方除了信任你别无选择，而且它转述出去就成了下一个未经核实的传闻。

   实测：一条落地报告给了三个 sha + 分支名 + 合并方式，收信方用 `git log` 两分钟逐条复核完，还查出其中一条判断是错的。这条对流水线的价值比多派一个复验 agent 大。

   **涉及第三方的断言要带出处。** 说「某个坑是 X 踩的」「Y 报过什么」时，带上哪条消息、哪个终端、什么时候说的 —— 被说的那方不在场，没法自辩，收信方只有拿到出处才能自己验。实测：handle 过期那个坑的归属被记到了 verifier 头上，实际是 watchdog 踩的，因为原报告只写结论没写出处。

   **数字要带口径。** 同一批文件，一个角色报 21、另一个报 22，差的是口径（目录下 vs 文件名匹配）不是分歧 —— 只报数字会让复核方去追一个不存在的错。

9. **断言当前状态之前先重查，不要从自己的上下文里转述。** 上下文里的事实带着写入那一刻的时间戳，消息发出去却不带 —— 收信方会当成此刻的状态。实测：一条状态同步比它描述的事实晚了两分钟发出，发出时已经是错的。

   开口之前先问一句：**这个事实我是刚查的，还是记忆里的？** 记忆里的就重查一次再说。实测被拦下的三条错误结论里，两条是记忆当事实用。

   ⚠️ **角色存活最容易错，因为 handle 不是身份。**

   **已验**：同一个 pane 的 handle 会在**进程完全没动**的情况下被重新分配。证据是探针日志相邻两轮 —— 同一个 `incarnationId`（`eea5fdcb…`）对应的 handle 从 `term_e8fb5056…` 变成 `term_141728ff…`，而 `ptyId`（`…@@be34ded4`）一字未改；日志里只有一行 CHANGED，**没有 GONE + NEW**（真死加新建会是那个形态）。

   所以 **handle 消失不能判死，它只是此刻的投递地址**。实测连着误报过两次「verifier 和 watchdog 都挂了」，两次它们都活着 —— 误报的代价是触发没必要的重启，把正在干活的 agent 打断。

   **判活用 `incarnationId` 当主键**（`orca terminal list --json` 的字段），handle 存在值里：同一个 key 换了值 = 换址，agent 没动；key 消失才**可能**是死。

   ⚠️ **后半句还没验，别提前写成规则**：`incarnationId` 消失是否等价于进程死亡，目前无实测 —— 要等第一次 GONE 出现，并且用别的手段交叉确认（`ptyId` 是否也消失、该角色是否真的不再产出）。

   跨时间对照要靠机器写的日志，别靠谁的记忆：每轮追加一行 `{incarnationId: handle}` 全量快照的 JSONL，相邻两行自己就是证据。⚠️ 但它只能证实变化发生过，**给不出频率下界** —— 变化是簇发的，两次采样之间可能发生了完整的「变了再变回来」。别拿它算频率。

   ⚠️ **指控对方犯错之前，先看一眼对方最近一条消息说了什么。** 这不是客气，是机制 —— hook 注入有延迟，你写这条的那一刻，对方的更正可能已经发出但还没进你视野。实测：一条「你又错了」的指控，发出时对方的认错已经早它 38 秒发出，白烧一轮往返。成本是一次 `check`。

   **任务进度、分支状态、commit 有没有落，一律现查现说**。

10. **既有缺陷单开，验收判据只写这张卡报的现象。** 修完一个 bug 之后暴露出来的老毛病（基线上就有、被原 bug 掩盖着走不到），不算这轮的活 —— 单开一张卡，当前卡按它自己的判据收口。

   判据写宽的代价是实打实的：ISSUE-4 报的是「闪动 + 卡死」，写判据时多塞了一条「取消后要能退出创建流程」，而那是条基线既有缺陷（关闭回调从未赋值，以前页面锁死根本点不到取消，所以没暴露）。修复本身合格，他证严格照判据执行判了 FAIL —— 判据错，不是修复错，白跑一轮。

   写判据时自问：**这一条，是这张卡报的现象吗？** 不是就删掉，另开卡。

   **归属变更要写进 `result`，不要重建 task。** task 建完之后标题和 spec 都改不了，一旦活的归属换了卡，标题就永久误导下去。拆卡时把新归属写进 `result`（`{"linear":"ISSUE-n","note":"从 ISSUE-m 拆出的独立缺陷"}`），后续所有角色**以 `result` 的 linear 字段为准，不信标题**。重建 task 会打断挂在它上面的依赖链（正在跑的 verify 任务会失去 parent），代价远大于标题不准。

## 遇到解释不了的现象：先找不变量，别急着安机制名

**问「这些变化里有没有哪个字段没变」，不要问「这个现象该叫什么」。**

给现象安一个机制名，成本是零；而那个名字会被下一个人当成已知机制传下去，比不解释更糟 ——
它让所有人停止追查，因为看起来已经有解释了。

这条不是从道理推出来的，是**一轮之内四个角色各自栽了一次**才看出来的。同一个现象
（终端 handle 反复变化），四个独立的解释，没有一个去找不变量：

| 角色 | 编出来的机制名 | 毛病 |
|---|---|---|
| coordinator | 「Orca 会重用 handle」 | 无依据的实现猜测 |
| intake | 「转瞬即逝的未落定记录」 | 给观测噪声起了个正式名字 |
| console | 「换代 / 高频换代」 | 把「地址变了」读成「进程重启了」 |
| watchdog | 「incarnationId 是稳定标识」 | 拿一次横截面观测当纵向不变量 |

四种错法不同，性质一样：**把还没验的东西当验过的用。**

> 后续：第四条**前半句后来被证实了**（handle 会在进程不变时被重新分配，见纪律 9），
> 后半句（incarnation 消失 = 进程死亡）至今未验。
> 这不改变它当时是未验断言 —— **一个结论后来被证实，不等于当初拿它当结论是对的。**
> 留在清单里正是为了这句。

而不变量一直躺在 `orca terminal list --json` 的返回字段里，七个角色看了几十次都没去看它。

**带上这张失败清单，下一个人才认得出自己正在犯**。只给一句正确的方法论，他会点头，然后继续犯。

配套的做法：需要跨时间对照才能定论时，**把观测落成机器写的日志，别靠谁的记忆**。
实测的形态是每轮追加一行全量快照的 JSONL —— 相邻两行自己就是证据，不经任何人转述。
⚠️ 但它只能证实「变化发生过」，给不出频率下界：变化是簇发的，两次采样之间可能发生了
完整的「变了再变回来」，日志同样看不见。别拿它算频率。

## 派活的四步

`worktree create --prompt` 那条路**不挂** `taskId` / `dispatchId`，worker 拿不到 lifecycle 权限、发不出有效 `worker_done`。派活走这四步：

```bash
# 1. 起 worker。桶要挂在控制面下（见「拓扑」），并从 bug 所在分支切
orca worktree create --name <bucket> --agent codex \
  --parent-worktree id:<控制面 id> --base-branch <bug 所在分支> --setup skip --json
#    worker handle = 响应里的 startupTerminal.handle
#    父级挂错了可以事后改：orca worktree set --worktree id:<桶> --parent-worktree id:<控制面>

# 2. 等 TUI 就绪，否则 prompt 被吞
orca terminal wait --terminal <handle> --for tui-idle --timeout-ms 60000 --json

# 3. 建任务
orca orchestration task-create --spec "<桶内问题清单 + 验收标准>" --parent <problem_task> --json

# 4. 注入 preamble 派活 —— 这一步才产生 lifecycle 权限
orca orchestration dispatch --task <task_id> --to <handle> --inject --json
```

worker 发完 `worker_done` 回到 idle，用新的 `dispatch --inject` 可以再唤起它 —— worker 可复用。

## 工具边界

编排状态必须由 `task-create` + `dispatch --inject`（或 `orchestration run`）在 Orca runtime 里建。各 agent 自带的 subagent 工具、通用 spawn API、聊天式并行 worker 能干活，但不产生 task/dispatch provenance、不注入 lifecycle preamble、没有 `worker_done` 权限、也没有 decision gate。

说「已经编排好了」之前先验：

```bash
orca orchestration task-list --json
orca orchestration dispatch-show --task <task_id> --json
```

活儿不小心跑在 orchestration 之外了，直说，然后用新终端 + 注入 dispatch 重跑或复核来补 provenance。

## 原语真源

命令签名与规则一律回版本匹配的官方 guide 取，本 skill 不复述：

```bash
orca skills get orchestration    # 消息、任务、dispatch、gate、coordinator loop
orca skills get orca-cli         # worktree、terminal、automations
orca skills get orca-linear      # Linear 读写
orca skills get orca-emulator    # iOS 模拟器复验
```

## 设计背景

完整推演、状态机取舍、**已否决方案及理由**、待验证假设：

（作者的私有设计笔记，未公开）

改这条流水线的结构之前先读那份的「已否决方案」和「待验证假设」两节 —— 已经否掉的方案不必重新讨论，未验证的假设不要当事实用。
