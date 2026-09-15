# AI Native 生产系统讨论稿

> 状态：讨论快照
>
> 来源：`ai-production-os/owner/生产系统.md`
>
> 收录说明：保留原始讨论的论证过程与对话痕迹，用于连接业务演进方法论和 AI Native 生产系统；它不是当前系统实现或协议的事实源。

你说得对。上一版最大的问题是：**它还在“系统搭积木”层面思考**，把 Context、Spec、Agent、Skill、Governance 摆出来了，但没有回答更深的几个问题：

**为什么 AI Native 生产系统必然会出现？它到底在重构什么生产关系？它的最小不可再分单元是什么？它如何对抗 AI 的不确定性？它和传统软件工程、DevOps、低代码、知识库、Agent 平台到底有什么本质不同？**

我重新来。

---

# 一、AI Native 生产系统的真正问题：不是“效率”，而是“可控的不确定性”

上一版说“AI Native 生产系统是上下文驱动、Agent 执行、规则治理、结果可验证”，这句话还太表层。

更本质的定义应该是：

> **AI Native 生产系统，是一套把人类组织中的模糊意图、隐性经验、历史上下文、业务判断和工程动作，转化为 AI 可执行、可验证、可追责、可持续进化的状态系统。**

这里的关键词不是 Agent，也不是自动化，而是：

> **状态系统。**

传统软件工程依赖的是人脑保持状态。

产品经理记得需求背景。
设计师记得交互取舍。
研发记得代码历史。
测试记得历史 bug。
运营记得用户反馈。
老板记得战略优先级。
某个老员工记得“这个地方以前踩过坑”。

但 AI 进来以后，最大的问题是：

> **AI 没有天然继承组织状态。**

它每次都像一个极聪明但刚入职的人。它可以做得很快，但它不知道：

* 哪些历史坑不能再踩；
* 哪些业务判断是已经被验证过的；
* 哪些文档已经过期；
* 哪些指标是核心指标；
* 哪些代码不能轻易动；
* 哪些体验是产品灵魂；
* 哪些改动会触发审核风险；
* 哪些地方需要人类确认；
* 哪些上下文该相信，哪些该丢弃。

所以 AI Native 生产系统要解决的根本问题不是“怎么让 AI 更快干活”，而是：

> **如何把组织状态外化、结构化、机器可读化，并在 AI 执行过程中持续保持一致。**

这就是和普通 AI Coding 的根本区别。

普通 AI Coding 是：

```text
人保持状态 → AI 执行局部任务
```

AI Native 生产系统是：

```text
系统保持状态 → AI 在状态约束下执行 → 系统验证结果 → 系统更新状态
```

这是范式变化。

---

# 二、行业正在走向这个方向，但还没有把它讲透

现在行业里的几个方向，其实都在逼近这个问题。

OpenAI 对 Agents SDK 的定义已经不只是“聊天机器人”，而是能 planning、calling tools、collaborating across specialists，并保持足够 state 来完成多步任务；OpenAI 也明确把 orchestration、tool execution、approvals、state 这些放到了 agent 应用需要拥有的部分里。([OpenAI Developers][1])

OpenAI Agents SDK 的 tracing 也很关键：它记录 LLM generations、tool calls、handoffs、guardrails 和自定义事件，用于开发和生产环境中的 debugging、visualizing、monitoring。这个事实说明，真正进入生产之后，Agent 不再只是“输出答案”，而必须变成可观测、可追踪的执行系统。([OpenAI GitHub][2])

MCP 的价值也不只是“接工具”。它标准化了 AI 应用和外部上下文、工具、工作流之间的连接，把 Resources、Prompts、Tools 作为基础能力，同时也强调用户授权、数据隐私、工具安全，因为工具调用本质上可能进入任意数据访问和代码执行路径。([Model Context Protocol][3])

Anthropic 的 Agent Skills 更进一步，把技能定义为包含 instructions、scripts、resources 的目录，让 Agent 动态加载专门任务能力。它的深层意义不是“多了一个技能包”，而是把组织里的 procedural knowledge 变成可组合、可分发、可复用的生产能力。([Anthropic][4])

Google Gemini Enterprise / Agent Platform 最近强调的也是类似方向：Agent Registry、Gateway、Policy Enforcement、Identity、Observability、Audit Logging、metrics、traces、logs、agent dependency visualization。这说明企业级 Agent 的瓶颈已经从“能不能生成”转向“能不能治理、观测、审计、授权、评估”。([Google Cloud Documentation][5])

但这些行业方案大多还停留在平台组件层面。它们回答的是：

> Agent 平台需要什么能力？

你真正要思考的是更底层的问题：

> 一个 AI Native 的产品团队，应该如何重新组织“生产”本身？

---

# 三、AI Native 生产系统的第一性原理：把隐性生产经验变成显性机器状态

传统团队真正的生产力，不在 Jira、不在 Git、不在 Figma、不在 Notion。

真正的生产力藏在：

```text
人脑里的判断
历史里的坑
团队里的默契
业务里的取舍
产品里的审美
代码里的约定
用户里的反馈
上线后的教训
```

AI Native 生产系统的核心工作，就是把这些东西变成可运行的系统对象。

也就是从：

```text
隐性经验
```

变成：

```text
Context
Spec
Policy
Rule
Skill
Evaluator
Memory
Gate
Trace
```

这不是简单文档化。

文档化只是“写下来”。

AI Native 化是：

> **让它能被 Agent 调用、被系统验证、被流程触发、被权限约束、被复盘更新。**

比如“Android 历史上经常弱于 iOS，发布前要重点检查”这句话，如果只是写在复盘里，没有意义。

它必须变成：

```text
规则：涉及双端 UI/交互/文案/埋点改动时，必须触发 Mobile Parity Gate
输入：iOS 截图、Android 截图、Spec、diff、埋点表
动作：对比功能状态、文案、布局、空态、错误态、付费入口、埋点
输出：Parity Evidence Report
失败：阻断发布或进入人工确认
```

这才叫 AI Native 生产系统。

---

# 四、上一版缺的核心：AI Native 生产系统不是 Workflow，而是 Work State Machine

上一版讲了很多“流程层级”，但流程不是本质。

**本质是状态机。**

一个需求不应该被看成“一张任务卡”，而应该被看成一个不断变形的生产对象：

```text
Raw Signal
→ Framed Problem
→ Product Hypothesis
→ Compiled Spec
→ Executable Plan
→ Bounded Execution
→ Evidence Package
→ Release Candidate
→ Observed Outcome
→ Learned Rule
```

这不是线性流程，而是一个可回退、可分叉、可验证、可审计的状态机。

每一个状态都必须回答四个问题：

```text
当前我们知道什么？
当前我们不知道什么？
当前谁/什么 Agent 可以行动？
当前进入下一状态的证据是什么？
```

这就是深层区别。

传统 workflow 关心：

```text
下一步谁做？
```

AI Native state machine 关心：

```text
当前状态是否足够清晰，允许 Agent 采取不可逆行动？
```

比如：

* 允许 Agent 读代码，是一个权限状态；
* 允许 Agent 改代码，是另一个权限状态；
* 允许 Agent 开 PR，是另一个状态；
* 允许 Agent 合并，是另一个状态；
* 允许 Agent 发版，是更高风险状态；
* 允许 Agent 修改线上配置、模型 prompt、推荐策略、付费逻辑，则是最高风险状态。

所以 AI Native 生产系统不是“把流程自动化”。

它是：

> **把每个生产状态的进入条件、退出条件、权限、证据和责任定义清楚。**

---

# 五、AI Native 生产系统的最小原子：不是 Agent，而是 9 个生产原语

如果继续说“Agent、Skill、Context”，还是不够底层。

我会把 AI Native 生产系统拆成 9 个最小原语。

---

## 1. Intent：意图

人类输入的通常不是需求，而是意图。

例如：

```text
我们要提升角色 Profile 页的消费体验
```

这不是需求。它只是一个方向。

AI Native 系统必须先判断：

```text
这是增长问题？
留存问题？
内容消费问题？
角色信任问题？
创作者供给问题？
付费转化问题？
```

意图不能直接进入执行。
意图必须先被澄清、约束、编译。

---

## 2. Problem：问题框定

很多团队失败不是因为执行慢，而是因为问题定义错。

例如：

```text
Android 留存低
```

这不是问题定义，只是现象。

问题框定应该变成：

```text
Android 新用户在首次进入角色聊天前的流失高于 iOS，
可能原因包括加载慢、UI 误导、角色推荐弱、设备性能、文案不清晰、注册路径摩擦。
当前需要验证具体流失节点，而不是直接改聊天体验。
```

AI Native 系统必须在这里阻止“过早执行”。

否则 AI 会非常勤奋地做错事。

---

## 3. Context：上下文

Context 不是“把所有文档丢给 AI”。

真正的 Context 必须是结构化对象：

```text
Context Object
- source：来源
- owner：责任人/责任系统
- version：版本
- freshness：新鲜度
- authority：权威级别
- relevance：与当前任务的相关性
- conflict：是否与其他上下文冲突
- permission：谁/哪个 Agent 可访问
- expiry：何时过期
- evidence：支持它的证据
```

没有这些字段，所谓知识库只会变成污染源。

AI Native 系统最危险的问题之一，就是 AI 拿到“看起来合理但已经过期”的上下文，然后自信执行。

所以 Context Fabric 的核心不是存储，而是：

> **上下文可信度治理。**

---

## 4. Spec：意图编译结果

Spec 不是文档。

Spec 是把模糊意图编译成多种 contract。

一个成熟 Spec 至少应该包含：

```text
Product Contract：产品目标、用户场景、边界
UX Contract：状态、交互、空态、错误态、加载态
Data Contract：数据源、字段、埋点、指标
API Contract：接口、错误码、兼容策略
Engineering Contract：模块、依赖、技术风险
QA Contract：测试用例、回归范围、验收标准
Release Contract：灰度、回滚、监控、报警
Policy Contract：审核、安全、隐私、权限
Learning Contract：上线后如何复盘、如何沉淀规则
```

这才是 AI Native 的 Spec。

它不是“给人看的 PRD”，而是：

> **给 Agent 执行、给系统验证、给组织追责的生产契约。**

---

## 5. Plan：可执行计划

计划不是任务拆解。

传统任务拆解是：

```text
前端开发
后端开发
测试
上线
```

AI Native 的 Plan 必须带有执行边界：

```text
Step
- goal
- allowed actions
- forbidden actions
- required context
- required skill
- expected artifact
- verifier
- rollback condition
- escalation condition
```

也就是说，Agent 不是“拿到任务就干”。

Agent 必须在边界内干。

---

## 6. Action：受控行动

AI 的行动分风险等级。

```text
L0：只读分析
L1：生成建议
L2：生成草稿
L3：修改本地文件
L4：创建 PR
L5：修改配置
L6：影响线上用户
L7：影响付费、安全、隐私、审核、模型行为
```

不同等级需要不同审批和验证。

AI Native 系统必须有一个非常清楚的动作权限模型。

否则“Agent 自动化”最后一定会变成事故自动化。

---

## 7. Evidence：证据

这是上一版几乎没讲够的地方。

AI Native 生产系统里，**交付物不只是代码，而是证据包**。

每次 Agent 执行后，不应该只返回：

```text
我完成了
```

而应该返回：

```text
Evidence Package
- 我改了什么
- 为什么这么改
- 对应哪个 Spec 条款
- 涉及哪些文件/接口/状态
- 跑了哪些测试
- 哪些测试没跑
- 哪些假设仍未验证
- 截图/日志/trace/metrics 证据
- 风险点
- 需要人类确认的点
```

这是 AI Native 生产系统和“让 AI 写代码”的分水岭。

没有 Evidence，AI 输出再漂亮也不可生产化。

---

## 8. Evaluation：验证

验证不是“另一个 Agent 看一下”。

验证必须分层：

```text
Deterministic Checks：类型检查、单测、lint、schema、权限规则
Scenario Checks：用户路径、边界状态、回归用例
Cross-platform Checks：iOS/Android/Web 一致性
Model Behavior Checks：AI 回复质量、角色一致性、安全性
Business Checks：指标、漏斗、转化、留存
Human Judgment Checks：审美、策略、品牌、风险
Production Checks：灰度、监控、报警、回滚
```

AI 生成带来的是不确定性。

验证层的作用是把不确定性压回可接受范围。

所以系统的核心能力不是“生成能力”，而是：

> **不确定性消解能力。**

---

## 9. Memory：可治理记忆

Memory 不是聊天记录，不是向量库，不是“存得越多越好”。

Memory 是系统对历史经验的结构化沉淀。

真正能进入 Memory 的东西，必须经过审核：

```text
Memory Write Protocol
- 这条经验来自哪个事件？
- 有没有证据？
- 是否仍然有效？
- 适用范围是什么？
- 触发条件是什么？
- 过期条件是什么？
- 会影响哪些 Spec / Skill / Gate？
- 谁负责维护？
```

否则 Memory 会腐烂。

AI Native 系统最危险的长期问题不是“记不住”，而是：

> **记住了错误的东西，并在未来自动放大。**

---

# 六、最关键的洞察：AI Native 生产系统是一个“熵管理系统”

再往下看，AI Native 生产系统其实是在管理熵。

人类输入是高熵的：

```text
想法模糊
目标摇摆
上下文冲突
历史知识分散
业务边界不清
代码状态复杂
用户反馈噪声大
```

AI 生成也是高熵的：

```text
可能正确
可能幻觉
可能遗漏边界
可能改坏旧逻辑
可能过度自信
可能局部最优
```

所以生产系统要做的是不断降熵。

对应关系是：

```text
Spec：把意图降熵
Context：把信息降熵
Policy：把行为降熵
Skill：把执行降熵
Evaluation：把结果降熵
Trace：把过程降熵
Memory：把历史降熵
```

这句话非常重要：

> **AI Native 生产系统的本质，是把 AI 带来的生成熵，转化为可验证、可追责、可复用的生产秩序。**

这比“提高效率”深得多。

效率只是副产品。

---

# 七、AI Native 生产系统不是一条链，而是两个闭环叠在一起

尤其对 MooX 这种 AI 产品来说，必须再往下一层。

你不是普通 SaaS。

你是在用 AI 生产一个 AI Native 产品。

所以你面对的是双层系统：

```text
第一层：用 AI 改进产品生产
第二层：产品本身也由 AI 行为驱动
```

这意味着你有两个闭环。

---

## 闭环一：Build Loop，研发生产闭环

```text
需求
→ Spec
→ 代码/配置/内容/Prompt
→ 测试
→ 发布
→ 数据
→ 复盘
→ 规则沉淀
```

这是常规 AI Native 生产系统。

---

## 闭环二：Runtime AI Loop，产品行为闭环

```text
用户输入
→ 角色设定
→ 模型回复
→ 内容安全
→ 情绪体验
→ 留存/消费/转化
→ 用户反馈
→ Prompt/角色/策略/模型调整
```

这个闭环更难。

因为 MooX 的产品体验不是固定 UI，而是由模型行为动态生成的。

这意味着传统测试不够。

你需要测试：

```text
角色是否稳定？
语气是否一致？
日文表达是否自然？
是否过度迎合？
是否破坏人设？
是否有安全风险？
是否影响付费体验？
是否在长对话中退化？
是否在不同模型版本下漂移？
```

所以 MooX 的 AI Native 生产系统，不能只覆盖代码生产。

它必须覆盖：

```text
Code Production
Prompt Production
Character Production
Content Production
Policy Production
Evaluation Production
```

这才是你真正的复杂度。

---

# 八、MooX 的核心不是“移动端 App”，而是“可治理的角色体验生产系统”

如果继续把 MooX 理解成：

```text
AI 角色聊天 + 社区 + 创作者工具
```

还是不够。

更深的理解应该是：

> **MooX 是一个角色体验生产与消费系统。**

角色不是一段 prompt。
角色是一个可消费对象。

它包含：

```text
人设
背景
语言风格
边界
互动节奏
情绪张力
记忆关系
视觉呈现
社区传播
创作者意图
用户期待
模型行为
安全约束
商业转化
```

所以 AI Native 生产系统在 MooX 里不只是服务研发，而是服务整个“角色体验供应链”。

这条供应链是：

```text
角色创作
→ 角色审核
→ 角色展示
→ 角色发现
→ 角色互动
→ 角色消费
→ 角色反馈
→ 角色迭代
→ 创作者激励
```

每一环都可以 AI Native 化。

---

# 九、所以 MooX 需要的不是通用 Agent，而是“体验合同系统”

例如，一个角色 Profile 页的 Spec 不应该只是：

```text
展示头像、名称、简介、开始聊天按钮
```

它应该被编译成多份合同。

---

## 1. Product Contract

```text
目标：
让用户在进入聊天前建立角色兴趣、信任和互动欲望。

核心问题：
用户是否理解这个角色是谁？
用户是否知道可以如何互动？
用户是否有足够动机开始聊天？
创作者是否能通过 Profile 表达角色魅力？
```

---

## 2. Experience Contract

```text
必须表达：
- 角色身份
- 角色关系感
- 互动入口
- 内容吸引力
- 创作者信息
- 社区信号

必须避免：
- 信息堆叠
- 角色风格被平台 UI 稀释
- 开始聊天按钮不明显
- 日文文案机械
```

---

## 3. Character Contract

```text
Profile 展示的信息必须和聊天中的人设一致。
如果 Profile 写的是温柔治愈型角色，聊天首轮不能表现出攻击性或冷漠。
如果角色有特定说话风格，Profile 文案和对话样例必须一致。
```

---

## 4. Mobile Contract

```text
iOS / Android 必须一致：
- 页面结构
- 按钮位置
- 文案
- Loading
- Error
- Empty
- 付费入口
- 分享入口
- 埋点
```

---

## 5. Data Contract

```text
必须埋点：
- profile_view
- start_chat_click
- creator_profile_click
- share_click
- report_click
- follow/favorite
- profile_to_chat_conversion
```

---

## 6. AI Behavior Contract

```text
从 Profile 进入 Chat 后，模型首轮回复必须继承：
- 角色身份
- 用户入口上下文
- 语言环境
- 用户选择的互动意图
```

---

## 7. Review Contract

```text
发布前必须检查：
- 双端截图
- 日文溢出
- 低端 Android 布局
- 空态
- 错误态
- 网络失败
- 角色不一致
- 安全/举报入口
- App Store / Google Play 风险
```

这才是 AI Native Spec。

它不是写给某个人的文档。

它是给整个生产系统的合同。

---

# 十、真正的系统架构应该长这样：不是八层，而是五个平面

上一版用“层”来讲，还是太像传统架构图。

我现在更倾向于五个平面。

---

## Plane 1：State Plane，状态平面

负责记录每个生产对象现在处于什么状态。

```text
Signal State
Problem State
Spec State
Plan State
Execution State
Verification State
Release State
Learning State
```

它回答：

```text
现在进行到哪了？
是否允许进入下一步？
缺什么证据？
谁能批准？
风险等级是多少？
```

这是系统核心。

没有 State Plane，所有 Agent 都是在聊天。

---

## Plane 2：Context Plane，上下文平面

负责管理 AI 能知道什么。

```text
Product Context
Engineering Context
Design Context
Data Context
User Context
Market Context
Policy Context
Incident Context
Memory Context
```

它回答：

```text
这次任务该加载哪些上下文？
哪些上下文可信？
哪些上下文冲突？
哪些上下文过期？
哪些上下文不能给某个 Agent？
```

Context Plane 不是知识库，而是上下文调度系统。

---

## Plane 3：Execution Plane，执行平面

负责让 Agent 和 Skill 行动。

```text
Agent Runtime
Skill Registry
Tool Gateway
MCP Connectors
Sandbox
Task Orchestrator
Permission Boundary
```

它回答：

```text
谁来做？
能调用什么工具？
能访问什么数据？
能执行到什么风险等级？
失败时如何回退？
```

---

## Plane 4：Verification Plane，验证平面

负责证明结果是否可信。

```text
Static Checks
Unit Tests
Integration Tests
UI Tests
Mobile Parity
I18n QA
AI Behavior Eval
Security Review
Release Gate
Human Review
Production Monitoring
```

它回答：

```text
怎么知道它真的对？
证据在哪里？
哪些风险仍未覆盖？
是否可以上线？
```

---

## Plane 5：Learning Plane，学习平面

负责让系统变聪明。

```text
Postmortem
Rule Extraction
Skill Update
Spec Template Update
Regression Test Update
Memory Write
Policy Update
Gate Update
```

它回答：

```text
这次经验如何进入系统？
下次如何自动避免？
哪些规则需要升级？
哪些 Skill 需要改？
哪些 Memory 应该过期？
```

这五个平面比“八层架构”更准确。

因为 AI Native 生产系统不是从上到下调用，而是所有平面同时约束一个生产对象。

---

# 十一、Agent 在这个系统里到底是什么？

上一版还是把 Agent 说得太像“虚拟员工”。

这个比喻有帮助，但也有误导。

更准确地说：

> **Agent 是在特定状态、特定上下文、特定权限、特定目标下运行的非确定性执行进程。**

所以一个 Agent 的定义不能只是：

```text
你是一个 QA Agent
```

而应该是：

```text
Agent Contract
- role：负责什么
- scope：不负责什么
- input schema：输入必须是什么结构
- context policy：可读取哪些上下文
- tool policy：可调用哪些工具
- action level：最高行动等级
- output schema：必须输出什么证据
- evaluator：谁/什么系统验证它
- escalation：什么时候必须交给人
- memory policy：能否写入记忆
```

也就是说，Agent 不是“人设”。

Agent 是一个受控生产进程。

这点非常关键。

否则多 Agent 系统最后一定会变成：

```text
多个会说话的黑箱互相甩锅
```

---

# 十二、Skill 在这个系统里到底是什么？

Skill 也不是提示词。

真正的 Skill 应该是：

> **可复用的生产能力封装。**

一个 Skill 至少包含：

```text
Skill Contract
- name
- purpose
- trigger condition
- input schema
- required context
- procedure
- tools/scripts
- output artifact
- evidence requirement
- common failure modes
- verifier
- update owner
```

例如 `/check-mobile-parity` 不应该只是让 AI 看两张图。

它应该是：

```text
输入：
- Spec
- iOS screenshot
- Android screenshot
- diff
- i18n keys
- analytics plan

过程：
- 对比页面结构
- 对比文案
- 对比按钮状态
- 对比 loading/error/empty
- 对比埋点
- 对比付费入口
- 检查 Android 小屏/低端机风险

输出：
- parity report
- blocking issues
- non-blocking issues
- screenshot evidence
- required fixes
- confidence
```

这才叫 Skill。

一个团队真正的护城河，不是用了哪个模型，而是沉淀了多少这种高质量 Skill。

---

# 十三、Verification 才是 AI Native 生产系统的瓶颈

这点要非常明确：

> **AI Native 的瓶颈不是生成，而是验证。**

生成会越来越便宜。
执行会越来越快。
代码、文案、设计方案、测试用例都会越来越容易生成。

但问题是：

```text
谁证明它是对的？
谁证明它没有破坏旧逻辑？
谁证明它符合业务目标？
谁证明它没有安全问题？
谁证明它不会伤害用户体验？
谁证明它上线后能被监控和回滚？
```

所以 AI Native 生产系统应该从一开始就 Evidence-first，而不是 Output-first。

传统流程是：

```text
产出 → 人看 → 觉得差不多 → 上线
```

AI Native 应该是：

```text
产出 → 证据包 → 自动验证 → 人类判断 → 灰度观测 → 规则沉淀
```

这才是生产级。

---

# 十四、这里还有一个更深的矛盾：AI 会放大“局部正确”

AI 特别擅长做局部正确的事情。

它可以：

* 很快写出一个组件；
* 很快修一个 bug；
* 很快补一个接口；
* 很快生成一堆测试；
* 很快写一个漂亮 PRD。

但产品失败往往不是局部不正确，而是整体方向错了。

比如：

```text
它把 Profile 页做得更复杂，但用户其实需要更快进入聊天。
它优化了角色信息展示，但真正问题是推荐质量。
它提升了聊天首轮回复，但真正问题是角色发现弱。
它修了 Android UI，但真正问题是 Android 用户设备性能导致体验差。
```

所以 AI Native 生产系统必须有一个“问题框定层”。

否则系统越自动化，越可能高速驶向错误方向。

这就是为什么 Strategy Layer 不能只是“高层判断”。

它必须进入生产系统。

每个需求进入执行前，都要有：

```text
Problem Statement
Hypothesis
Success Metric
Non-goal
Risk
Validation Plan
```

没有这个，AI 越强，浪费越大。

---

# 十五、AI Native 生产系统需要四本账

如果现在落地，不要先做大平台。

先建立四本账。

---

## 1. Context Ledger：上下文账本

记录所有重要上下文。

```text
这个信息从哪里来？
谁负责？
是否过期？
影响哪些模块？
被哪些任务引用过？
是否和其他信息冲突？
```

目标是避免 AI 使用错误上下文。

---

## 2. Work State Ledger：任务状态账本

每个需求都不是一张卡，而是一组状态。

```text
当前状态
输入
输出
证据
风险等级
阻塞项
批准人
下一状态条件
```

目标是让 AI 执行不是散的。

---

## 3. Evidence Ledger：证据账本

每次改动都必须留下证据。

```text
改了什么
测了什么
没测什么
截图在哪里
日志在哪里
指标在哪里
谁确认过
哪些风险接受了
```

目标是让交付可追责。

---

## 4. Rule Ledger：规则账本

所有事故、复盘、经验都要变成规则。

```text
触发条件
检查动作
阻断条件
适用范围
例外情况
维护人
过期时间
```

目标是让系统越用越稳。

这四本账比“上来做多 Agent 平台”重要得多。

---

# 十六、MooX 最应该先做的不是“全自动研发”，而是“高风险环节门禁化”

结合 MooX，我会把优先级排成这样。

---

## 第一优先级：Mobile Parity Gate

因为你们有 iOS / Android 双端，而且 Android 历史上容易出稳定性、布局、文案、体验降级问题。

门禁应该覆盖：

```text
功能一致性
UI 状态一致性
文案一致性
埋点一致性
付费入口一致性
异常态一致性
低端机表现
截图证据
```

这会立刻产生价值。

---

## 第二优先级：I18n / Japanese Experience Gate

MooX 面向日本市场，日文不是翻译问题，而是体验问题。

要检查：

```text
日文自然度
语气是否符合角色消费
按钮是否溢出
敬语/亲密语是否合适
角色设定和文案是否一致
iOS/Android key 是否一致
```

这不是普通 i18n。

这是角色体验的一部分。

---

## 第三优先级：AI Behavior Regression Gate

这是 MooX 作为 AI 产品最特殊的地方。

每次改：

```text
模型
prompt
角色设定
安全策略
上下文注入
记忆逻辑
推荐策略
```

都可能改变用户体验。

所以要有 AI 行为回归测试：

```text
固定角色
固定用户输入
固定语言环境
固定场景
检查输出是否保持人设
检查是否安全
检查是否日文自然
检查是否符合互动目标
检查是否有体验退化
```

这个 Gate 很可能是 MooX 的核心资产。

---

## 第四优先级：Postmortem-to-Rule

任何线上问题都必须进入规则账本。

格式应该是：

```text
事故
→ 根因
→ 遗漏点
→ 新规则
→ 新测试
→ 新 Skill
→ 新 Gate
→ 新 Memory
```

不做这一步，复盘就是情绪释放。

做了这一步，复盘才是系统进化。

---

# 十七、真正的组织变化：从“管人”到“管生产系统”

上一版提到组织变化，但还不够狠。

AI Native 之后，工程管理的对象会变。

过去 Leader 管：

```text
人力
排期
任务
风险
质量
沟通
```

以后 Leader 管：

```text
上下文质量
Spec 编译质量
Agent 行动边界
Skill 资产
验证覆盖率
规则更新率
证据完整度
状态流转效率
系统学习能力
```

也就是说，管理对象从“人”转成“生产系统”。

团队里会出现一些新的核心角色。

---

## AI Production Architect

负责设计整个 AI Native 生产系统：

```text
状态机
权限
Agent contract
Skill contract
Verification
Learning loop
```

---

## Context Curator

负责上下文质量：

```text
文档是否过期
历史决策是否可追踪
代码/设计/API 是否一致
哪些 Memory 应该失效
哪些信息可以被 Agent 使用
```

---

## Evaluation Engineer

负责验证系统：

```text
测试集
模型行为评估
业务指标评估
体验评估
灰度验证
自动门禁
```

---

## Skill Maintainer

负责沉淀和维护 Skill：

```text
/check-i18n
/check-mobile-parity
/review-spec
/review-release-risk
/postmortem-to-rule
```

---

## Release Governor

负责发布治理：

```text
风险分级
证据检查
灰度
回滚
监控
人工批准点
```

这些角色可能不一定是独立岗位，但这些职责一定会出现。

---

# 十八、AI Native 生产系统的成熟度模型

我会把它分成 6 个阶段。

---

## Level 0：AI Assistant

```text
人问，AI 答。
```

特点：

```text
无状态
无验证
无沉淀
无治理
```

这是大多数团队的当前状态。

---

## Level 1：AI Coding

```text
AI 帮人写代码、改 bug、生成文档。
```

特点：

```text
局部提效
上下文依赖人
质量依赖人 review
```

---

## Level 2：Spec-driven AI Workflow

```text
通过 Spec 约束 AI 执行。
```

特点：

```text
开始有结构化输入
但验证和学习仍然弱
```

---

## Level 3：Skill-based Production

```text
沉淀可复用 Skill。
```

特点：

```text
不是每次重新 prompt
而是有标准能力包
```

---

## Level 4：Evidence-based Agentic Production

```text
Agent 执行必须产出证据包，并通过门禁。
```

特点：

```text
可验证
可追踪
可审计
可灰度
```

---

## Level 5：Self-improving Production Fabric

```text
每次交付、事故、复盘都会更新规则、Skill、Spec、Memory、Gate。
```

特点：

```text
系统越用越强
组织经验机器化
AI 执行稳定化
```

你真正要追的是 Level 5。

但落地时要从 Level 2.5 / Level 3 开始。

---

# 十九、判断一个系统是否真的 AI Native，看 10 个指标

不要看“用了多少 Agent”。

要看这些指标。

```text
1. Spec Ambiguity Rate
需求进入执行前，仍然模糊的比例是多少？

2. Context Hit Rate
Agent 是否拿到了正确上下文？

3. Context Conflict Rate
系统是否发现上下文冲突？

4. Evidence Completeness
每次交付是否有完整证据包？

5. Verification Coverage
自动验证覆盖了多少关键风险？

6. Human Intervention Quality
人类介入是在做判断，还是在帮 AI 擦屁股？

7. Regression Escape Rate
历史问题是否重复发生？

8. Rule Conversion Rate
复盘中有多少结论转成了规则/测试/Skill/Gate？

9. Skill Reuse Rate
团队是否在复用能力，而不是重复 prompt？

10. State Traceability
任何一次发布，能否追溯到意图、Spec、执行、证据、验证和复盘？
```

这些才是 AI Native 生产系统的 KPI。

---

# 二十、最深的结论：AI Native 不是自动化，而是生产权力结构变化

传统生产中，权力分布在人的经验里。

谁知道历史，谁有权判断。
谁熟悉代码，谁有权改。
谁经历过事故，谁能识别风险。
谁懂业务，谁能决定优先级。

AI Native 生产系统会把这些权力重新编码到系统里：

```text
经验 → Rule
判断 → Policy
能力 → Skill
上下文 → Context Fabric
执行 → Agent Runtime
信任 → Evidence
质量 → Evaluation
责任 → Trace
学习 → Memory
```

这就是生产关系的变化。

不是“AI 替代人”。

而是：

> **人的经验从个人脑中迁移到生产系统里；人的价值从亲自执行，转向定义系统、约束系统、训练系统、验证系统。**

这才是 AI Native 的本质。

---

# 二十一、最终重定义

我会把 AI Native 生产系统重新定义为：

> **AI Native 生产系统，是一个以状态为核心、以上下文为原料、以 Spec 为编译器、以 Agent 为执行进程、以 Skill 为能力封装、以 Evidence 为交付凭证、以 Evaluation 为质量边界、以 Policy 为治理机制、以 Memory 为学习结构的智能生产系统。**

更压缩一点：

> **AI Native 生产系统不是让 AI 参与生产，而是把生产过程改造成 AI 可理解、可行动、可验证、可追责、可自我进化的状态机器。**

再狠一点：

> **它的目标不是提高人的效率，而是把组织经验变成可运行的软件。**

这才是底层。

[1]: https://developers.openai.com/api/docs/guides/agents "Agents SDK | OpenAI API"
[2]: https://openai.github.io/openai-agents-python/tracing/ "Tracing - OpenAI Agents SDK"
[3]: https://modelcontextprotocol.io/specification/2025-11-25 "Specification - Model Context Protocol"
[4]: https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills "Equipping agents for the real world with Agent Skills \ Anthropic"
[5]: https://docs.cloud.google.com/gemini-enterprise-agent-platform/agents/overview "Agents overview  |  Gemini Enterprise Agent Platform  |  Google Cloud Documentation"
