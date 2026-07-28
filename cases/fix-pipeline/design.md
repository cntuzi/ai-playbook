# Fix Pipeline 设计

[返回案例](./README.md)

> 依赖：Orca CLI v1.4.159 + 一个 Linear team（下文记作 `<TEAM>`）
> 原语真源：`orca skills get orchestration`。本文只写工作流层，不复述原语用法。
> 标注「⚠️ 未验证」的假设不得当作事实使用。

---

## 一、两层循环

### 小循环（单元级，agent 内部）

```
改 ──→ 自验 ──→ 改 ──→ 自验 ...  直到自验通过
```

活在**单个修复 agent 内部**，外部不可见。对外只暴露一个终态信号 `worker_done`。

### 大循环（队列级，跨角色）

```
[pending] → [dispatched] → [fix completed] → [待复验] → [待人验收] → [completed]
    ▲                                              │              │
    └──────────── 复验不过 / 人打回 ────────────────┴──────────────┘
                              回边
```

**大循环 ≠ 小循环 + 验收。** 两者是嵌套关系：小循环是 `dispatched → fix completed` 这一段的内部实现。

### 三证链

| 层 | 谁证 | 能证明什么 |
|---|---|---|
| **自证** | 修复 agent（小循环内） | 「按我的理解改完了」 |
| **他证** | verifier 派的独立只读 agent | 「换个 agent 看，确实修好了、没引入回归」 |
| **人证** | 人在看板上验收 | 「这就是我要的」——唯一有权关单 |

不分层就会出现「agent 自己点绿灯」的假通过。

---

## 二、角色

| 角色 | 形态 | 职责 | 循环驱动 |
|---|---|---|---|
| **intake** | 常驻 TUI 会话 | 接问题输入 → 归一化去重 → 写队列 | 人在终端里敲字 |
| **analyzer** | 常驻 TUI agent（控制面 worktree） | 按 touched-files 分桶 → 建任务 → 起 worker 派活 | rolling `check --wait` + `task-list --ready` |
| **fixer** | TUI agent（桶专属位置），可复用 | 桶内串行修复，跑小循环 | 被 `dispatch --inject` 唤起 |
| **verifier** | 常驻 TUI agent（控制面 worktree） | 拉待验证任务 → 派他证 → 请人验收 → 回读关单 | rolling `check --wait` + `task-list --ready` |
| **watchdog** | 定时 automation | 常驻角色存活检查，掉了重建 | cron |

intake 之所以是常驻 TUI 而非程序化监听器：**它是用户坐在前面敲字的那个窗口**，常驻成本是人机界面的固有成本，不是「agent 烧 context 等 IO」。

---

## 三、数据模型

| 概念 | 载体 | 粒度 | 角色 |
|---|---|---|---|
| **问题** | orchestration task（parent） | 单个问题 | **机器唯一真源** |
| 修复任务 | orchestration task（`--parent`） | 单个桶 | 机器 |
| 验证任务 | orchestration task（`--deps=[fix]`） | 单个桶 | 机器 |
| **桶** | 一个隔离的执行位置（worktree 或独立终端） | 一组文件邻接的问题 | 执行隔离单元 |
| **人看的问题** | 看板 issue | 单个问题 | 人看的投影 + 唯一人工输入点 |

依赖链深度 2–3 层，符合官方「不要深于 3–4 层」的建议。

### 关键约束：status 固定六值

```
pending / ready / dispatched / completed / failed / blocked
```

「待验证」「待验收」没法直接建模。绕法（都是官方原生模式）：

- **「待验证」→ 依赖表达**：验证任务 `--deps=[修复任务]`，修复 `completed` 后自动可领，`task-list --ready` 就是待领集合。
- **「待验收」→ gate 表达**：`gate-create` 卡住 parent task。官方明确 `gate-create` 用于 coordinator 管理的 DAG 决策 —— 人工验收正是这类决策。
  （worker 反过来要问 coordinator 用 `ask`，产生 `decision_gate` 消息，coordinator 用 `reply` 回答。两条路不要混。）

---

## 四、状态映射与真源纪律

| 生命周期 | `task.status`（机器真源） | 看板 state | 谁写 |
|---|---|---|---|
| 入队 | `ready`（无依赖，建出来就是） | `Todo` | intake |
| 已分桶已派活 | 问题 task → `dispatched` | `In Progress` | **analyzer 显式置** |
| 修复完成待复验 | fix `completed`（**worker_done 自动置**），verify 任务转 `ready` | `In Progress` | fixer |
| 复验通过待人验收 | 问题 task → `blocked` | **`In Review`** ← 需新建 | verifier（`gate-create` 自动置） |
| 人验收通过 | `gate-resolve` 回 `ready` → **再显式 `completed`** | `Done` | **人拖卡** → verifier 回读 |
| 人打回 | verify task `failed` + 新建顶层问题 task（`ready`） | `Todo` + 评论写原因 | **人** → verifier 回读 |
| 机器复验不通过 | 同上 | `In Progress` + 评论留证据 | verifier |

**有效的 `worker_done`（带 `taskId` + `dispatchId`）会自动把 task 和 dispatch 置 `completed`。不要再手动 `task-update`** —— 手动更新只留给显式恢复/覆盖。

### 实测的 status 语义（与直觉不同）

- 新建**无依赖**的 task → 直接是 **`ready`**，不经过 `pending`
- **`pending` = 「依赖未满足」**，不是「刚入队」。扫新问题必须用 `--ready`；扫 `--status pending` 永远拿到空
- `gate-resolve` 只把 task 从 `blocked` 放回 **`ready`**，不关单

因此 analyzer 和 verifier **都扫 `--ready`**，靠字段分流：

| 角色 | 筛选条件 |
|---|---|
| analyzer | `parent_id` 为空（intake 建的问题 task） |
| verifier | 标题以 `verify ` 开头（analyzer 建的验证任务） |

由此产生三个连带约束，缺一条流水线就断：

1. **analyzer 分完桶必须把问题 task 显式置 `dispatched`** —— 否则它还在 `--ready` 里，下一轮被重复分桶、重复派 worker。
2. **verifier 打回时新建的重试 task 不能挂 `--parent`** —— 挂了 `parent_id` 非空，analyzer 的筛选会漏掉它，问题永久卡死在队列里。
3. **`gate-resolve` 之后必须紧接 `task-update --status completed`** —— 停在 `ready` 且 `parent_id` 为空的 task 会被 analyzer 当成新问题重新领走。

### 三套状态存储的单向纪律

- orchestration `task.status` = **唯一机器真源**，所有调度决策只信它
- 看板 issue state = **人看的投影 + 唯一人工输入点**，人只写「验收通过 / 打回」
- worktree 的 `workspaceStatus` = **桶级进度投影，纯展示，任何决策都不许读它**

```
task ──推进度──▶ 看板
task ◀──仅回读验收结论── 看板
task ──推桶级进度──▶ workspaceStatus（只写不读）
```

**背景**：踩过「改了看板，编排层卡片状态没动」的坑（两套独立存储不联动）。不写死方向，同一个坑会按问题数量放大。

### 回读

```bash
orca linear list-issues --team <TEAM> --state Done --updated-at 1h --json
```

`--updated-at` 接 duration，增量扫描，不用全量拉。

---

## 五、正确的派活姿势

`worktree create --agent --prompt` 那条路**不挂** `taskId` / `dispatchId`，worker 没有 lifecycle 权限，发不出有效 `worker_done`，等于放弃编排 provenance。

正确的四步：

```bash
# 1. 起 worker（仅当多桶并行改同一 checkout 才建 worktree）
orca worktree create --name <bucket> --agent codex --no-parent --json
#    worker handle = 响应里的 startupTerminal.handle

# 2. 等 TUI 就绪，否则 prompt 被吞
orca terminal wait --terminal <handle> --for tui-idle --timeout-ms 60000 --json

# 3. 建任务
orca orchestration task-create --spec "<桶内问题清单 + 验收标准>" --parent <problem_task> --json

# 4. 注入 preamble 派活 —— 这一步才产生 lifecycle 权限
orca orchestration dispatch --task <task_id> --to <handle> --inject --json
```

单桶、且不与他人并行改同一 checkout 时，同 worktree 起新终端即可。

**worker 可复用**：发完 `worker_done` 回到 idle，用新的 `dispatch --inject` 再唤起。

---

## 六、七条纪律

### 1. 常驻 agent 是路由器，不是工人

只碰 task id、标题、文件清单、report 路径；读内容的活一律派一次性子 agent。每轮 context 增量是常数级而非 KB 级。**这条破了，常驻方案两天内撑爆。**

### 2. 报告写盘，只传路径

`worker_done` 的 payload 支持 `reportPath`。正文落文件，消息只带路径。纪律 1 靠它落地。

### 3. 他证换 agent 且只读

复验 agent 必须与修复 agent 不同，且只读。换视角（能否复现 / 是否引入回归 / 是否改错了地方）比派 N 个同质复验有效。

### 4. 队列是 external memory，消息只是唤醒信号

- lifecycle 权限来自 payload 的 `taskId` + `dispatchId`，**不是 terminal handle** —— pane 重启就换 handle，永远不要靠比对 handle 判断归属。
- `worker_done` / `heartbeat` 必须**从 worker 自己的终端**发、发给 **preamble 里的具体 coordinator handle**。广播进度用 `status` 类型。
- coordinator 重启会让在途 `worker_done` 落空。**兜底是 `task-list --ready`** —— 官方就把它称为 coordinator 的 external memory。
- `check --wait` **一次只返回一条消息**。N 个 worker 同时完成就循环 N 次。
- `check --wait` 超时或 `{count:0}` 是**检查点，不是失败**。真实编码任务 15–60 分钟；heartbeat 只证明活着。

### 5. 桶按 touched-files 聚类

- 桶间文件不重叠 → 并行 merge 零冲突
- 桶内同模块串行改 → agent 拿到完整上下文
- worktree 数 = **桶数**，不是问题数

**worktree 的正当性要明说**：官方立场是「并行执行、方便、任务独立都不构成隔离需求，只有真实的 checkout / 文件系统冲突才算」。本设计的正当理由是：**多个桶并行修改同一 checkout 会撞 git index 和构建产物，这是真实冲突**。

分类信息不浪费，它决定**派谁**：崩溃类给强模型，文案类给便宜模型。

### 6. `workspaceStatus` 纯展示

自动化逻辑读它做判断，等于把展示层当真源。

### 7. 假阳性在入口卡

扇出找问题的产出里相当比例是幻觉或不值得改。每个假问题穿过入口就要烧一个修复 agent + 一次他证 + 一次人工验收。**入口多花一轮判断，比下游三次浪费便宜。**

### 附：工具边界

用编排就必须用 `task-create` + `dispatch --inject`（或 `orchestration run`）建运行时状态。各 agent 自带的 subagent 工具、通用 spawn API、聊天式并行 worker **替代不了** —— 不产生 task/dispatch provenance、不注入 lifecycle preamble、没有 `worker_done` 权限、没有 decision gate。

声称「已编排」之前先验：

```bash
orca orchestration task-list --json
orca orchestration dispatch-show --task <task_id> --json
```

---

## 七、落地前置条件

1. **启用 orchestration**：Settings > Experimental（实验特性，不开则所有 `orchestration` 命令不可用）。
2. **看板加 `In Review` 状态**（`In Progress` 与 `Done` 之间）。Linear 默认六态是 `Backlog / Todo / In Progress / Done / Canceled / Duplicate`，缺「机器复验通过、等人验收」这一态；用 `Done` 表示待验收会污染 Done 的语义。
   ⚠️ CLI 只能读工作流状态，**建状态只能在看板 UI 手动做** —— 全套设计里唯一 CLI 干不了的动作。
3. **建控制面 worktree**，只放编排脚本和报告目录，不放业务代码。
4. **建 watchdog automation**，`--workspace-mode existing --fresh-session`。
5. **定义分类标签集**（打在 issue 上，供 analyzer 选模型）。

---

## 八、假设验证结果

用一次性探针 task 实测（探针已清理，队列无残留）。

| 假设 | 结果 |
|---|---|
| `task-list --ready` 严格按 `deps` 满足过滤 | ✅ **成立**。deps 未满足的 task 不出现；base 置 `completed` 后立刻出现 |
| `gate-create` 把 task 置为 `blocked` | ✅ **成立**。`ready` → `blocked` |
| `gate-resolve` 之后 task 的状态 | ⚠️ **回 `ready`，不关单**。必须紧接一次 `task-update --status completed` |
| 新建无依赖 task 的初始状态 | ⚠️ **是 `ready` 不是 `pending`**。`pending` = 依赖未满足 |
| `@worktree:<id>` 组地址跨终端重建仍可寻址 | ⏸ **未测**。探针在非 Orca worktree 下跑，取不到 worktree id |

**这次测试的价值**：`pending` 语义那条推翻了设计里的一行，而且是致命的 —— skill 里 analyzer 第一步原本写的是 `task-list --status pending`，照着跑会**永远拿到空列表，整条流水线一动不动**。连带暴露另外两个断点（问题 task 分桶后不出队会被重复领取；打回时挂 `--parent` 会让重试 task 永久卡死）。三处都已修，见第四节。

**由官方文档解答（原为待验证）**：`check --unread --inject` 只为**运行它的那个终端**渲染邮件，**不能远程唤醒别的终端**。送 tracked task 用 `dispatch --inject`，给已有 agent 自由 prompt 用 `terminal send`。因此常驻角色的循环是它自己跑 rolling `check --wait`，不是被别人推醒。

---

## 九、已否决方案及理由

> 否决不落盘 = 负空间脏数据，会反复重现。

| 被否方案 | 否决理由 |
|---|---|
| `worktree create --agent --prompt` 派活 | 不挂 `taskId`/`dispatchId`，worker 无 lifecycle 权限。改用 `--agent` → `terminal wait --tui-idle` → `dispatch --inject` |
| worker_done 之后再手动 `task-update --status completed` | 有效 worker_done 自动关单，手动更新只留给恢复/覆盖 |
| 靠比对 terminal handle 判断 lifecycle 归属 | handle 是路由元数据，pane 重启即变。权限来自 `taskId` + `dispatchId` |
| 靠 `check --inject` 远程唤醒常驻角色 | 它只为运行它的终端渲染邮件。常驻循环靠自己 rolling `check --wait` |
| 统一用组地址寻址所有消息 | `worker_done` / `heartbeat` 必须指向具体 coordinator handle，组地址只给 `status` 类广播 |
| intake 做成程序化消息监听器 | intake 是**人机界面**，TUI 本就该常驻 |
| 定时 tick 无状态 worker（automation 当 worker） | 选了常驻 TUI 形态（实时性 + 跨轮记忆）。automation 改作 watchdog |
| 单 coordinator 兼 analyzer + verifier | 两角色挤一个 context；且被内建循环语义框住，定制空间小 |
| 自定义 task 状态表示「待验证 / 待验收」 | status 固定六值。改用 `--deps` + `gate`，更干净且是原生模式 |
| 按问题分类（崩溃 / UI / 性能）分桶 | 分类与 merge 冲突无关，决定冲突的是 touched files。分类改作**选模型**依据 |
| 一问题一 worktree | worktree 数应等于桶数：省 setup 与磁盘，且同模块问题本就该一起改 |
| 一个 worktree 内起多个并行 fix agent | 共享文件系统会互相踩（git index、构建产物） |
| 自渲染 HTML 看板 / 纯 CLI 通知作为验收视图 | 选了现成看板：粒度对得上单个问题、有 UI、有评论区让验收理由落地、可编程同步 |
| 用 `workspaceStatus` 做调度决策 | 展示层投影，读它做判断 = 把展示当真源 |
| 用各 agent 自带 subagent 工具替代 dispatch | 不产生 provenance、无 lifecycle preamble、无 `worker_done` 权限、无 gate |

---

## 十、已知风险

| 风险 | 缓解 |
|---|---|
| 假阳性问题淹没队列 | 纪律 7：入口卡 |
| 同一 task 反复 dispatch 失败 | **原生 circuit breaker**：连续 3 次失败自动标 `failed` |
| 人反复打回，大循环不收敛 | 原生断路器只管 dispatch 失败，**人工打回要自己计数** —— parent 设打回上限，超限用 `gate-create --options` 转人工接管 |
| 三套状态漂移 | 第四节单向纪律 |
| 常驻 agent context 撑爆 | 纪律 1 + 2 |
| coordinator 重启导致在途 `worker_done` 落空 | 纪律 4：`task-list --ready` 兜底 |
| 误杀还在干活的 worker | 纪律 4：超时/`{count:0}` 是检查点 |
| 问题粒度看板编排层原生没有 | 用外部看板补齐 |

---

## 十一、能不能推广到非 bug 的工作项

能，但分界线不是「问题 vs 任务」。骨架（队列、桶、回边、三证链、状态机、七条纪律）全都与工作项类型无关。

真正的不变量是两条：

1. **每个队列项可独立验收** —— bug 天然满足；epic 不满足，必须先拆。
2. **每个队列项自带可执行的验收判据** —— 这条才是关键。

第 2 条解释了 bug 为什么天然适配：**bug 的复现路径就是判据**，客观、可执行，他证 agent 拿着就能跑。feature 任务不天然带判据，「做个筛选功能」不是判据。判据缺失的后果不是慢一点，是**他证退化成主观评价，三证链断成两证**。

所以准确的定义是：**可独立验收、且自带可执行判据的工作项驱动的工作流**。「问题驱动」是判据天然存在的那个特例。

泛化只需要动三处（其余全通用）：

| 组件 | 是否按类型分化 |
|---|---|
| 队列 / 桶 / 回边 / 状态机 / 看板契约 / 七条纪律 | 不动 |
| **入队 spec 模板** | bug 是「现象/复现/期望/影响线索/证据」；task 是「需求/验收标准/影响范围/依赖」 |
| **分桶依据** | bug 靠存量 touched-files；新功能文件还不存在，桶边界改成**模块所有权** |
| **他证判据来源** | bug 是「复现路径不再复现 + 无回归」；task 是「验收标准逐条满足」 |
