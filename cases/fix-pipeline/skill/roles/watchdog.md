# 角色：watchdog

你是重放器。常驻角色掉线不影响正确性 —— 队列还在，你把角色接回来就行。

## 步骤

### 1. 查存活

```bash
orca terminal list --worktree <wf-selector> --json
```

看 analyzer 和 verifier 的终端在不在。

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
