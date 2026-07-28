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
- **回边** —— 复验不过、人打回，问题回 `pending`。这条边让它成为循环而不是流水线。

跨 agent 通用：claude / codex / omp / gemini / grok 都能扮演任一角色。执行底座是 Orca orchestration。

## 先确认再动手

```bash
orca status --json                      # runtime 必须 ready
orca orchestration task-list --brief --json   # 队列现状 = 你的 external memory
```

`orchestration` 是 Orca 实验特性，需在 Settings > Experimental 启用。命令报「未启用」就停下告诉用户，不要绕道用别的 spawn 工具替代（见「工具边界」）。

## 你是哪个角色

读你自己那一份，不要读全部：

| 角色 | 干什么 | 步骤文件 |
|---|---|---|
| **intake** | 接问题输入 → 归一化去重 → 写队列 | `~/.agents/skills/fix-pipeline/roles/intake.md` |
| **analyzer** | 按 touched-files 分桶 → 建任务 → 起 worker 派活 | `~/.agents/skills/fix-pipeline/roles/analyzer.md` |
| **fixer** | 桶内串行修复，跑自证小循环 | `~/.agents/skills/fix-pipeline/roles/fixer.md` |
| **verifier** | 批量拉待验证 → 派他证 → 请人验收 → 回读关单 | `~/.agents/skills/fix-pipeline/roles/verifier.md` |
| **watchdog** | 常驻角色存活检查 + 按队列重放 | `~/.agents/skills/fix-pipeline/roles/watchdog.md` |

角色没指定时，从队列状态推断该干什么：有 `pending` 就是 analyzer 的活，有 ready 的验证任务就是 verifier 的活。

## 状态映射

| 生命周期 | `task.status` | Linear state | 谁写 |
|---|---|---|---|
| 入队 | `pending` | `Todo` | intake |
| 已分桶已派活 | `dispatched` | `In Progress` | analyzer（`dispatch` 自动置） |
| 修复完成待复验 | fix `completed`，verify 转 ready | `In Progress` | fixer（`worker_done` 自动置） |
| 复验通过待人验收 | `blocked`（gate） | `In Review` | verifier |
| 人验收通过 | `completed` | `Done` | 人拖卡 → verifier 回读 |
| 人打回 | `failed` → 派生新 `pending` | `Todo` + 评论 | 人 → verifier 回读 |
| 他证不过 | `failed` → 回 `pending` | `In Progress` + 评论 | verifier |

`task.status` 只有这六个值：`pending / ready / dispatched / completed / failed / blocked`。业务态用结构表达，不用新状态：**「待验证」靠 `--deps`**（验证任务依赖修复任务，修复完成即自动可领），**「待验收」靠 `gate`**。

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

## 七条纪律

1. **常驻 agent 是路由器，不是工人。** 只碰 task id、标题、文件清单、report 路径。要读内容（diff、代码、报告正文）就派一次性子 agent。这条守住，每轮 context 增量是常数级；破了，两天撑爆。
2. **报告写盘，只传路径。** `worker_done` payload 用 `reportPath` 带路径，正文落文件。纪律 1 靠它落地。
3. **他证换 agent 且只读。** 复验 agent 必须与修复 agent 不同，且只读。换视角（能否复现 / 是否引入回归 / 是否改错了地方）比派 N 个同质复验有效。
4. **队列是 external memory。** lifecycle 权限来自 payload 的 `taskId` + `dispatchId`，handle 只是路由元数据（pane 重启就换）。`worker_done` / `heartbeat` 从 worker 自己终端发给 preamble 里那个具体 coordinator handle；广播进度用 `status` 类型。coordinator 重启会让在途 `worker_done` 落空，靠 `task-list --ready` 找回该干的活。
5. **桶按 touched-files 聚类。** 桶间文件不重叠 → 并行 merge 零冲突；桶内同模块串行改 → agent 拿到完整上下文。问题分类（崩溃 / UI / 性能）不用来分桶，用来**选模型**。
6. **rolling wait 是常态。** `check --wait` 一次只返回一条消息，N 个 worker 可能同时完成就循环 N 次。超时或 `{count:0}` 是检查点，真实编码任务 15–60 分钟；heartbeat 和终端活动只证明活着。worker 还在产出就继续等。
7. **假阳性在入口卡。** 扇出找问题的产出里相当比例是幻觉或不值得改。每个假问题穿过入口就要烧一个修复 agent + 一次复验 + 一次人工验收。入口多花一轮判断，比下游三次浪费便宜。

## 派活的四步

`worktree create --prompt` 那条路**不挂** `taskId` / `dispatchId`，worker 拿不到 lifecycle 权限、发不出有效 `worker_done`。派活走这四步：

```bash
# 1. 起 worker。仅当多桶并行改同一 checkout（撞 git index 与构建产物）才建 worktree
orca worktree create --name <bucket> --agent codex --no-parent --json
#    worker handle = 响应里的 startupTerminal.handle
#    单桶不并行时：orca terminal create --worktree active --title <bucket> --command "codex" --json

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

`../design.md`

改这条流水线的结构之前先读那份的「已否决方案」和「待验证假设」两节 —— 已经否掉的方案不必重新讨论，未验证的假设不要当事实用。
