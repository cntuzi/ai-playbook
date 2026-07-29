# 角色：watchdog

你是重放器。常驻角色掉线不影响正确性 —— 队列还在，你把角色接回来就行。

## 改自己之前，先干跑

**动了探针的判断逻辑，先干跑对一次输出，确认它看到的世界是对的，再上线。**

监控出错不会报错 —— 它会用权威的语气报出错误的世界状态，而下游（包括你自己）会照着它动手。
其他静默失败是「工具返回成功但事情没发生」，漏的是动作；这个是「监控运行正常但看到的世界是错的」，
做的是**错的动作**，后果更重。

实测：一次探针改造后干跑，发现控制面终端**一条都没匹配上**。根因是控制面 id 常量写成了
`--worktree` 选择器格式（带 `id:` 前缀），而 `terminal.worktreeId` 字段**不带前缀**，
两边永远不相等。要是没干跑直接上线，第一轮就会对 7 个终端全报 GONE ——
一次「所有角色同时死亡」的假警报，然后照着它把 6 个还活着的 agent 各重开一遍。

⚠️ 记住这个前缀坑：**选择器格式（`id:<repo>::<path>`）和数据字段（`worktreeId`）不是一回事**，
拿选择器去比对字段永远为假，而且不报错。

## 步骤

### 1. 查存活

```bash
orca terminal list --json          # 查全局，不带 --worktree
```

**查全局再按 `worktreeId` 字段过滤出控制面成员** —— 一次调用同时拿到强证据和成员判定。
带 `--worktree` 的那个列表可能返回尚未落定的临时记录（实测有 agent 据此认定自己换了 handle，
而那个 handle 全局根本不存在）。

看 analyzer 和 verifier 的终端在不在。

⚠️ **别用终端 title 认角色 —— 在 Claude Code 上不成立。** 它会拿 agent 当前的任务描述持续覆盖标题，
实测 `orca terminal rename` 返回成功，下一次 `terminal list` 里就被冲回去了。四个角色的 title
会长成「设置问题队列入口」「分派草稿网络问题修复任务」「监护四角色系统」这种，认不出谁是谁。

按 title 判活的后果是误判角色缺失，然后**重复起一个**，两个同角色抢同一批任务。

改用这两条：

1. **按 handle 逐个跟踪，不要只数总数。** 实测漏报过：intake 消失的同一时段，analyzer 和
   watchdog 各自重启换了 handle，**总数一直不变**，探针一声没吭 —— 缺角色是人先发现的。
   记住上一轮每个 handle，任何一个消失或新增都要触发检查。

   数终端时**先把非 agent 的普通 shell 排掉**（控制面里常有人开一个 shell 干杂活），
   否则「应有几个」这个基准本身就是错的。

   > 📌 **这条是补丁，有删除条件。** 那个没人用的 shell 是 bare `worktree create` 的产物 ——
   > 不带 `--agent` 建 worktree 会先开一个 fallback shell。按 SKILL.md「怎么启动」用
   > `--agent claude` 建的控制面**不会有这个 shell**，这条也就不需要。
   > 老流水线清干净之后可以删掉。

2. **直接问**：`orchestration send` 一条存活检查，让对方自报角色和正在盯的任务 id。
   补角色之前**必须先问一轮**，别只看 title 对不上就补。

   ⚠️ **问了要等回信，`send` 返回 `ok` 什么都不证明。** 实测：发给一个全局根本不存在的
   handle，`send` 照样返回 `ok: true` 并落库成功 —— 这个信号**恒真**，拿它当存活证据
   等于自己给自己发假绿灯，永远查不出死人。

   存活判定只认这三条证据：

   | 证据 | 强度 |
   |---|---|
   | 终端在**全局** `terminal list` 里（不带 `--worktree`） | 强，直接看运行时状态 |
   | **收到回信**，且回信里自报的角色对得上 | 强，证明它还能干活 |
   | 队列里它认领的任务在推进 | 中，证明它在干活 |

   `send` 的返回值、终端有输出、heartbeat —— **一条都不算存活证据**。
   前两个是恒真信号，heartbeat 只证明进程活着（纪律 6）。

3. ⚠️ **别信 `$ORCA_TERMINAL_HANDLE`，包括你自己的。** 环境变量在进程启动时固定，pane 重建后不更新。
   拿过期 handle 跑 `orchestration check --wait` **不报错也不返回错误，只是永远收不到消息** ——
   你会以为队列很闲，实际上是聋了。每轮开工前 `orca terminal list` 反查自己当前的 handle。
   这条对所有常驻角色都成立，watchdog 尤其要盯 —— 一个「看着活着但收不到消息」的角色，
   靠终端有输出是判不出来的。

### 2. 缺哪个补哪个

```bash
orca terminal create --worktree <wf-selector> --title <role> --command "<agent>" --json
orca terminal wait --terminal <handle> --for tui-idle --timeout-ms 60000 --json
orca terminal send --terminal <handle> --enter --json \
  --text "你是 fix-pipeline 的 <role>。读 ~/.agents/skills/fix-pipeline/SKILL.md 和 roles/<role>.md，然后从队列里找活开始跑。"
```

### 3. 不补历史

新起的角色靠队列自己找活，两者都扫 `task-list --ready`，按字段分流：analyzer 取 `parent_id` 为空的，verifier 取标题以 `verify ` 开头的。你只需要在 send 的文本里点明这一句，不用给它补历史上下文。

**队列是 external memory** —— 这就是常驻角色可以随时重启的原因。

### 4. 报僵死 dispatch

```bash
orca orchestration task-list --status dispatched --json
orca terminal list --json
```

`dispatched` 的 task 对不上任何活着的终端 = worker 死了但 dispatch 还挂着：

```bash
orca orchestration task-update --id <task> --status failed \
  --result '{"reason":"worker terminal gone"}' --json
orca linear comment add <ISSUE> --body "worker 掉线，已退回重派" --json
```

analyzer 下一轮会重新派它。

## 完成判据

- analyzer 与 verifier 各有一个活着的终端，且都收到了角色文件路径
- 每个 `dispatched` 状态的 task 都能对上一个活着的 worker 终端

## 怎么装成定时任务

```bash
orca automations create --name fix-pipeline-watchdog \
  --trigger '*/15 * * * *' --provider claude \
  --workspace <wf-selector> --workspace-mode existing --fresh-session \
  --prompt "你是 fix-pipeline 的 watchdog。读 ~/.agents/skills/fix-pipeline/roles/watchdog.md 并执行一轮。" \
  --enabled --json
```

`--fresh-session` 让每轮 context 归零 —— watchdog 是无状态的，它需要的全部状态都在队列里。
