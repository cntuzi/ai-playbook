# Agent 对话问题追踪：现有机制核验

核验日期：2026-09-15。范围：官方文档与代码；未安装、运行或比较产品效果。链接中的 `main` 指核验当天的代码，后续可能变化。

## 结论

已有可用实现覆盖三个环节：从对话提取应保留的信息、在后台整理记忆、把未完成工作持久化为带状态的条目。它们提供了构建问题追踪的材料，但官方材料不能证明任一项能完整捕获自由对话中的全部关键问题。

**本笔记的设计推断**：对这次需求，应以“问题台账”为保存对象，以“观察者”为更新者，以宿主运行时事件为触发器。单独增加总结或后台反思，仍缺少问题如何关闭、如何找回以及新问题如何关联原问题的约定。

## 1. Mastra Observational Memory：观察与提取

**已实现行为**：Observer 将历史压缩为观察日志；Reflector 定期重写、合并日志。当前文档支持后台缓冲；`bufferOnIdle` 可在回合结束空闲时观察短对话，默认关闭。自定义 Extractor 可按 schema 持久化信息；默认跨次提供上次提取值。[官方文档：Buffer on idle、Extractors、Reflections](https://mastra.ai/docs/memory/observational-memory)

**最贴近问题追踪的代码**：`current-task` 提取指令显式区分主要工作与其他待处理工作，并允许标记等待用户；观察和反思都可组合这些提取器，continuation hints 默认启用。[官方源码：built-in-extractors.ts](https://github.com/mastra-ai/mastra/blob/main/packages/memory/src/processors/observational-memory/built-in-extractors.ts)

**差距与成熟度**：文档标注自 `@mastra/memory@1.1.0` 加入，需要支持的存储适配器。当前任务字段仍是字符串；没有由这段代码保证的稳定问题 ID、关闭证据或完整性校验。可扩展成台账是推断；提取与压缩仍由模型判断，不能把“有字段”当成“不会遗漏”。[官方文档](https://mastra.ai/docs/memory/observational-memory)、[字段定义源码](https://github.com/mastra-ai/mastra/blob/main/packages/memory/src/processors/observational-memory/built-in-extractors.ts)

## 2. Letta sleep-time / Dreaming：异步整理

**当前行为**：旧 sleep-time agents 文档已重定向到 Memory & dreaming。当前后台子代理回看近期对话、整理经验并更新记忆，可按完成的 agent steps 数或上下文压缩触发；可加第二个后台会话审阅修改。[当前官方文档](https://docs.letta.com/configuration/memory)

MemFS 以 Git 管理记忆；后台记忆代理通过 worktree 并发更新。`system/` 文件每轮加载，其余文件按需读取。多代理共享仓库需要提交、推送和拉取；旧 shared memory blocks API 仍支持，但官方建议迁移，不能混称为即时同步。[MemFS](https://docs.letta.com/concepts/memfs)、[Shared memory](https://docs.letta.com/concepts/shared-memory)

**差距与成熟度**：这是已有产品机制，且官方接口已发生演进。默认目标是整理可长期保留的信息，并未规定疑问的状态模型或未完成项必须保留。异步整理适合减轻主对话负担，是设计推断；它不能保证下一轮之前已完成更新，也不能单凭“记忆共享”保证恢复正确的问题。

## 3. Beads：显式问题与工作台账

**已实现行为**：持久化 issue，支持优先级、类型、依赖与状态；`bd ready` 列出无未完成阻塞项的工作，`bd update --claim` 进入处理中，`bd close` 关闭，`bd show` 查看详情与审计记录。[官方仓库 README](https://github.com/gastownhall/beads)

特别相关的是 `discovered-from`：官方例子在处理已有工作时创建新发现问题，并关联来源。它直接覆盖“聊 A 时发现 B，先留住 B 与 A 的关系”的一部分。[官方文档：Core Concepts / For AI Agents](https://github.com/gastownhall/beads/blob/main/docs/index.md)

**差距与成熟度**：文档按 1.1.0 发布版说明，已有 CLI 和多种 Agent 集成；当前后端是 Dolt，旧地址 `steveyegge/beads` 重定向至 `gastownhall/beads`。它适配工程工作项；仍需 Agent 主动建单或外部观察器抽取，并不能自动判断一个自由讨论的疑问是否已充分回答。对话疑问是否都应变成执行任务，需要另行定义。[官方文档](https://github.com/gastownhall/beads/blob/main/docs/index.md)、[当前 README](https://github.com/gastownhall/beads)

## 4. Pi / oh-my-pi：规则与触发的区别

Pi skill 按需加载，不能据此保证每轮调用。Extension 提供 `input`、`turn_end`、`agent_settled` 等事件与 `appendEntry`；其中 `turn_end` 是一个模型响应及其工具调用，`agent_settled` 才对应没有自动重试、压缩或后续继续的稳定点。[Pi skills](https://pi.dev/docs/latest/skills)、[Pi extensions](https://pi.dev/docs/latest/extensions)

oh-my-pi Advisor Watchdog 已有增量后台审阅、去重与低噪声建议机制，但默认提示只聚焦具体技术风险和执行失败，限制用户意图或流程建议。可借触发与审阅机制，不能称其默认就是问题追踪器。[机制文档](https://github.com/can1357/oh-my-pi/blob/main/docs/advisor-watchdog.md)、[默认提示源码](https://github.com/can1357/oh-my-pi/blob/main/packages/coding-agent/src/prompts/advisor/system.md)

## 5. 对这次需求的组合建议（推断）

保留一个轻量问题台账：`id / 问题 / 来自哪段对话 / 与哪个问题相关 / 状态 / 最近结论 / 下一步`。先区分待讨论、讨论中、待验证、暂放、已解决；避免把一句回答自动记为解决，也避免把每个新想法自动升级成执行任务。

每轮结束可以做增量识别：新增了什么、哪项有进展、哪项有明确解决证据。话题切换、压缩前和会话恢复时，再检查仍未收束的条目。触发由运行时确保执行，语义判断由模型完成；两者可靠性应分别验证。

可以借鉴 Mastra 的观察/提取、Letta 的后台整理以及 Beads 的显式状态与来源关联；不意味着需要同时安装三套框架。一个只有规则的 skill 可以先验证分类是否合用，正式方案还要明确触发、持久化与恢复机制。

验证时优先看真实对话中“关键未完成问题的召回、错误关闭、重复建项、恢复成本与额外延迟”，不以长期记忆问答基准代替本任务的效果评估。

## 后续交付

2026-09-16：提供 [conversation-ledger Skill](../skills/conversation-ledger/README.md)，先用可安装的规则和模板验证记录、回看、续聊流程。[Obsidian 与跨 Agent 的完整设计](./obsidian-agent-question-tracking-design.zh-CN.md)另行记录运行时扩展；本调研保留上述核验日期与能力边界。
