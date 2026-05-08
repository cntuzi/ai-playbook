# Agent 管理台总结

更新时间：2026-04-30

## 定位

Agent 管理台是一个本地运行的 Agent 管理平台，用来管理多个 Agent 的运行状态、工作会话和任务反馈。

页面面向平台操作者，不再使用外部消息平台的品牌词作为主要文案。界面统一使用平台内语义：

- Agent
- Agent 列表
- 运行管理
- Agent 工作会话
- Agent 工作内容
- 任务消息
- 任务反馈

内部实现仍然通过本地 CLI、tmux 和消息事件流完成桥接，但这些细节只保留在代码、日志和详情弹窗里，不作为主页面定位。

## 当前能力

### 1. Agent 管理

管理台会读取本地已配置的 Agent profiles，并展示每个 Agent 的名称、头像和运行状态。

支持多个 Agent 同时运行。启动某个 Agent 时，只会重启该 Agent 对应的后台 worker，不会停止其他 Agent。

当前运行信息包括：

- Agent 是否运行中
- Agent 绑定的工作会话
- 最近是否收到任务消息
- 详情弹窗中的运行会话、启动时间和消息预览

### 2. 工作会话绑定

每个 Agent 可以绑定到一个 tmux pane，也就是一个 Agent 工作会话。

当任务消息进入时，后台 worker 会把消息注入到该工作会话，让当前 Agent session 直接处理。

注入时会先 paste 完整消息，再短暂等待后发送提交键。这个等待用于避开 Codex TUI 处理 bracketed paste 的窗口，避免出现消息已经进入输入框但没有执行的状态。

主页面只显示适合操作的工作会话名称，例如：

- `bot-dev · assistant:1.1 · 活跃`
- `ai-native · assistant:4.1 · 活跃`

工作会话名称优先使用 tmux window name，方便操作者对应底部状态栏里的窗口。后台系统会话不会出现在工作会话下拉里。更技术性的内容，例如进程名、session 名称等，收敛到详情弹窗。

### 3. Agent 工作内容

主页面提供 `Agent 工作内容` 区域，用来查看所选工作会话当前可见内容。

行为规则：

- 初次展示某个工作会话时，自动滚动到底部。
- 切换到另一个工作会话后，第一次展示时自动滚动到底部。
- 后续自动同步不会持续抢滚动条，操作者可以停留在历史内容位置阅读。
- 内容会经过脱敏处理后再返回给页面。

脱敏覆盖：

- app secret / token 类字段
- 长随机串
- 常见外部消息平台对象 ID

### 4. 任务反馈

后台 worker 会在收到任务消息后启动进度监听。

处理流程：

1. 收到任务消息。
2. 将消息注入 Agent 工作会话。
3. 自动发送一条“已收到，开始处理”的进度反馈。
4. 持续观察工作会话中新出现的 Agent 输出。
5. 将明显的处理进度过滤、脱敏后回复到原任务消息。
6. 最终结果需要显式通过 result 反馈命令发送。

显式反馈脚本：

```bash
node ~/.agents/skills/lark-agent-bridge/scripts/feedback.mjs \
  --profile <profile> \
  --kind result \
  --text "任务结果"
```

也可以指定消息目标：

```bash
node ~/.agents/skills/lark-agent-bridge/scripts/feedback.mjs \
  --profile <profile> \
  --message-id <message-id> \
  --kind progress \
  --text "处理进度"
```

页面中的手动任务反馈已移动到 `详情` 弹窗，避免主页面被低频操作占用。

### 5. 连接健康

事件消费是长连接。长时间运行后，尤其经过本地网络代理时，可能出现进程仍然存在但不再收到任务消息的状态。

为降低这类断联风险：

- worker 默认每 360 分钟主动轮换一次事件连接。
- manager 启动 worker 时使用后台重启循环。
- 事件消费进程退出或轮换后，worker 会退出为可重启状态，manager 会在约 5 秒后重新拉起。
- 手动在管理台重启某个 Agent，也会刷新该 Agent 的事件连接。

## 页面结构

### 左侧：Agent 列表

展示所有已配置 Agent：

- 名称
- 头像
- 运行状态
- 是否最近收到任务消息

点击 Agent 后，右侧显示该 Agent 的运行管理和工作内容。

### 右侧上方：运行管理

主操作区，只保留高频管理动作：

- 查看状态
- 选择 Agent 工作会话
- 启动 / 重启 Agent
- 停止 Agent
- 打开详情弹窗

### 右侧下方：Agent 工作内容

展示所选 Agent 工作会话的当前内容。

该区域不是调试终端定位，而是平台视角下的“Agent 正在做什么”。

### 弹窗：Agent 管理详情

低频信息和低频操作放在详情弹窗：

- Agent 配置标识的脱敏展示
- 运行状态
- 工作会话
- 执行进程
- 运行会话
- 启动时间
- 最近消息时间
- 最近消息预览
- 手动任务反馈

## 本地服务

管理台默认运行在：

```text
http://127.0.0.1:17654/
```

启动命令：

```bash
node ~/.agents/skills/lark-agent-bridge/scripts/manager.mjs --port 17654
```

当前使用 tmux 后台 session 承载：

```text
lark-agent-bridge-ui
```

## 关键脚本

### manager.mjs

管理台 HTTP 服务。

职责：

- 提供 Web UI
- 查询 Agent profile 列表
- 查询 tmux 工作会话
- 启动 / 停止 Agent worker
- 返回脱敏后的 Agent 工作内容
- 发送手动任务反馈

关键接口：

- `GET /`
- `GET /api/status`
- `GET /api/bots`
- `GET /api/panes`
- `GET /api/pane-content?target=<pane>&lines=160`
- `POST /api/start`
- `POST /api/stop`
- `POST /api/feedback`

### tmux-pane-bridge.mjs

后台 worker。

职责：

- 监听任务消息事件
- 定期轮换事件长连接，避免连接 stale 后进程仍存活但不再收消息
- 过滤自身回声消息
- 注入消息到目标 tmux pane
- 记录最近任务消息
- 自动监听 Agent 输出并发送进度反馈
- 在注入消息时提示 Agent 用 result 命令发送最终结果

### feedback.mjs

任务反馈发送脚本。

职责：

- 向最近任务消息发送进度或结果
- 支持显式指定 message id 或 chat id
- 对错误输出做脱敏
- 用 idempotency key 避免重复发送

## 状态文件

运行状态保存在：

```text
~/.agents/run/lark-agent-bridge/manager-state.json
```

主要内容：

- 当前已启动的 Agent worker
- 每个 Agent 的目标工作会话
- 最近任务消息元数据

状态文件可能包含内部运行标识，不应直接展示到主页面。

## 安全约束

1. 页面不展示 secret、token、完整 open id、完整 app id 或日志路径。
2. `Agent 工作内容` 返回前必须脱敏。
3. 自动进度回传不能发送完整终端内容。
4. 最终结果必须显式发送，避免误把未完成的推理过程当作结论。
5. 后台日志可以保留技术细节，但页面文案保持平台化。
6. 多 Agent 同时运行时，启动一个 Agent 不得停止其他 Agent。

## 已完成的关键调整

- 建立 Agent 管理台页面。
- Agent 列表展示名称和运行状态。
- 支持从页面选择 Agent 工作会话。
- 支持多个 Agent 同时运行。
- 增加 Agent 工作内容预览。
- 工作内容只在初次展示或切换会话时自动滚动到底部。
- 页面文案去除外部平台品牌词，改为平台内语义。
- Agent 详情和手动反馈收敛到弹窗。
- 增加任务反馈脚本。
- 增加自动进度监听和回传。
- 增加内容脱敏。

## 后续可优化

- 为每个 Agent 增加更清晰的任务队列状态。
- 将自动进度回传做成可配置开关。
- 增加任务历史记录页面。
- 增加 Agent 与工作会话的一键重新绑定。
- 增加更稳定的“任务完成”检测，自动触发 result 提醒。
- 将运行状态改为 WebSocket 或 SSE，减少轮询。
