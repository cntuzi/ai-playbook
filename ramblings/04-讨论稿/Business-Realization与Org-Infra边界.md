# Business Realization 与 Org Infra 的边界

> 状态：讨论稿，尚未收敛  
> 目的：修正独立 `Implementation Model` 带来的中台化倾向，探索如何在保持业务域语义中心的前提下，表达技术实现、组织基础设施、技能、Source、Environment 和外部依赖。

## 1. 问题来源

在 `Org → Business → Spec` 的讨论中，曾尝试补充一个独立的 `Implementation Model`，用于描述当前技术实现和运行状态。

但这一概念存在明显的不适感：

- 它看起来像 Org 提供的统一 Infra；
- 它容易把技术实现从业务域中抽离；
- 它容易形成独立的技术能力世界；
- 它与中台式的统一建设和集中治理具有相似倾向；
- Spec 可能绕开 Business，直接面对技术体系。

因此需要重新判断：当前缺少的是否真的是一个独立的 Implementation 层。

## 2. 阶段性结论

当前更合理的判断是：

> 不建立与 Org、Business 并列的独立 Implementation Model，而是在 Business 中建立业务对象到现实实现的 Realization 映射。

技术实现必须能够追溯到业务语义，但不一定被某个业务域独占。

这是两个不同要求：

```text
需要业务绑定
≠
要求一对一归属
```

现实中通常是多对多关系：

- 一个业务域由多个系统、客户端、数据任务和运营流程共同实现；
- 一个技术组件也可能同时支撑多个业务域；
- 一个业务契约可能由 API、事件、数据和补偿任务共同承载；
- 一个业务不变量可能由代码、数据库约束、对账和监控共同保证。

## 3. Business 的语义面与实现面

Business 的核心仍然是横向、纵向和时间：

```text
横向：业务场景如何跨领域形成价值闭环
纵向：领域如何拥有事实、规则和能力
时间：业务如何从一个有效状态演进到另一个有效状态
```

为了连接现实实现，可以将 Business 分成两个观察面。

### 3.1 业务语义面 Business Semantic

业务语义面表达：

- 领域；
- 能力；
- 场景；
- 契约；
- 不变量；
- 业务变化；
- 生效条件。

它回答：

> 业务是什么，为什么这样运行，什么必须保持正确？

### 3.2 业务实现面 Business Realization

业务实现面表达：

- 什么产品行为实现业务场景；
- 什么系统、服务或模块实现业务能力；
- 什么 API、事件或流程承载业务契约；
- 什么数据表达业务事实和状态；
- 什么技术机制保证业务不变量；
- 什么测试、监控和对账观察业务结果。

它回答：

> 业务对象在现实中由什么承载？

二者属于同一个 Business：

```text
Business
├── Semantic：业务是什么
└── Realization：业务在现实中由什么承载
```

Realization 不是新的业务本体，也不是一个中心化技术平台，而是业务对象与现实对象之间的关系。

## 4. Realization 是关系

业务实现关系可以表达为：

```text
业务能力
  --realized-by-->
产品、系统、服务或模块

业务契约
  --carried-by-->
API、事件、文件或调用链路

业务不变量
  --enforced-by-->
代码规则、唯一约束、对账和补偿

业务场景
  --executed-by-->
客户端、服务、运营流程和外部系统

业务结果
  --observed-by-->
测试、指标、监控、日志和 Dashboard
```

例如：

```text
CAP-ENTITLEMENT
  --realized-by-->
commerce-service

CTR-REVIVE-ENTITLEMENT
  --carried-by-->
revive-entitlement-api

INV-ENTITLEMENT-ONCE
  --enforced-by-->
idempotency-handler
  --enforced-by-->
order-id-unique-constraint
  --verified-by-->
entitlement-reconciliation-job
```

Business 保存的是关系和引用，不复制代码、Schema、接口和运行文档的完整内容。

## 5. 业务绑定不等于物理归属

不应建立这种强制映射：

```text
商业化领域 = commerce-service
用户领域 = user-service
```

这种一对一映射会在共享系统、遗留系统和跨领域数据中迅速失效。

更合理的是双向可查询关系：

```text
商业化领域
→ 查询哪些现实对象承载它

commerce-service
→ 查询它承载哪些领域能力和场景
```

因此：

- 业务域可以关联多个实现对象；
- 实现对象可以关联多个业务域；
- 细粒度关系优先建立在能力、契约、不变量和场景层；
- “业务域到技术域”的关系只是汇总视图，不是唯一源关系。

## 6. 与中台概念的区别

中台通常隐含以下假设：

```text
共享能力应该被集中建设
共享能力应该由统一团队拥有
业务域应该通过统一接口使用
```

Realization 映射不预设这些结论。

它只记录事实：

```text
哪些业务对象由哪些现实对象承载
```

当一个系统被多个业务域引用时，可以观察到它具有共享性，但不能自动推出：

- 必须抽成中台；
- 必须统一治理；
- 必须由独立团队维护；
- 所有业务必须使用；
- 必须继续扩大复用范围。

共享程度是关系映射的结果，不是方法论预先规定的架构目标。

## 7. Org 中的角色、技能与基础设施

Org 描述组织的行动主体和行动能力：

```text
Org
├── Functions
├── Roles
├── Actors
├── Skills
├── Tools
├── Infrastructure
└── Permissions
```

### 7.1 Role 与 Skill

“Go 研发工程师”混合了角色和技能，更稳定的表达是：

```text
角色：后端工程师
技能：Go 开发
技能：分布式系统
技能：服务端调试
技能：性能分析
```

“数据库工程师”也可以拆分为：

```text
角色：数据库工程师
职责：对数据库稳定性、治理和变更负责

技术知识领域：数据库工程
技能：Schema 设计、在线迁移、性能优化、备份与恢复
```

其中：

- Role 定义承担什么责任；
- Skill 定义如何完成某类工作；
- Actor 表示具体的人或智能体；
- Expertise 表达 Actor 对某个业务或技术领域的掌握关系。

“领域专家”不一定需要成为一个固定角色，更适合表达为：

```text
Actor
  --has-expertise-in-->
Business Domain / Technical Knowledge Domain
```

### 7.2 Skill 与执行主体分离

技能内容本身不属于某个具体的人。

例如“数据库在线迁移”可以包含：

- 适用条件；
- 操作步骤；
- 风险检查；
- 工具；
- 验证方式；
- 回滚方式；
- 历史经验。

Org 再维护：

```text
某角色需要某项 Skill
某个人掌握某项 Skill
某智能体可以执行某项 Skill
```

可以概括为：

```text
Skill 定义“如何做”
Org 定义“谁能做、谁可以做”
```

## 8. Org Infra 与 Business Realization

### 8.1 Org Infra

Org Infra 是组织为多个行动主体和业务提供的通用基础，例如：

- GitHub；
- CI/CD；
- 云环境；
- 容器平台；
- 数据库服务；
- 监控平台；
- 智能体运行平台；
- 开发工具。

它回答：

> 组织为行动和运行提供什么通用基础？

### 8.2 Business Realization

Business Realization 表达某个具体业务对象在现实中的承载，例如：

- 复活场景由哪些页面和服务完成；
- 权益能力由哪个模块实现；
- 复活权益保存在哪里；
- 哪个任务负责支付和权益对账；
- 哪些机制保证权益幂等消费。

它回答：

> 这个具体业务对象在现实中由什么实现？

二者可以建立依赖关系：

```text
commerce-service
  --runs-on-->
Org 提供的容器平台

entitlement-table
  --hosted-by-->
Org 提供的数据库服务
```

但不能把 Org Infra 与业务实现混成一个统一 Implementation 层。

## 9. Spec 如何进入现实实现

在当前调整下，Spec 不读取一个独立的 Implementation Model。

它从 Business Change 出发，沿 Business Realization 找到受影响业务对象的当前实现：

```text
Business Change
    ↓
受到影响的场景、能力、契约和不变量
    ↓
这些业务对象的 Realization
    ↓
代码、系统、数据、接口和测试
    ↓
形成 Requirements、Design、Tasks 和 Verification
```

可以概括为：

```text
Spec
= Business Change
+ Current Realization of Affected Business Objects
```

Spec 始终从 Business 进入实现，而不是先浏览一个脱离业务的统一技术世界。

这符合当前依赖原则：

> Spec 的业务依据和实现入口都来自 Business；Spec 不读取 Org。

## 10. Source 的位置

Source 可以作为 Business Realization 指向现实材料的入口，例如：

- 代码仓库和目录；
- 数据库 Schema；
- API 定义；
- 事件定义；
- 配置；
- 测试；
- Dashboard；
- 运行手册；
- 外部文档。

例如：

```text
CAP-ENTITLEMENT
  --realized-by-->
source://repo/commerce/entitlement

CTR-REVIVE-ENTITLEMENT
  --carried-by-->
source://api/revive-entitlement

INV-ENTITLEMENT-ONCE
  --enforced-by-->
source://db/entitlement/order-id-unique
```

Source 表示现实材料、知识或证据的来源，不应该成为容纳角色、技能、基础设施和所有外部环境的统一分类。

## 11. Environment 的位置

每一层、每个领域都存在自己的 Environment，但 Environment 不是固定的顶层内容分类。

Environment 应理解为：

> 相对于某个边界，位于边界之外但会影响它的对象、条件和约束。

可以表达为：

```text
Environment(X)
= 位于 X 边界之外
+ 与 X 存在影响关系的对象和条件
```

### 11.1 Org Environment

- 劳动力市场；
- 外部供应商；
- 组织政策；
- 预算环境；
- 人才和工具生态。

### 11.2 Business Environment

- 用户；
- 市场；
- 竞争对手；
- 监管；
- 合作伙伴；
- 外部支付渠道；
- 地区规则。

### 11.3 Domain Environment

例如商业化领域的 Environment 可以包括：

- 可玩内容领域；
- 增长领域；
- 安全领域；
- 支付渠道；
- 监管规则；
- 用户和运营主体。

同一个外部对象可以通过不同关系出现在多个 Environment 视图中，不需要复制多份对象定义。

## 12. Environment、Dependency 与 Source 的区别

### Environment

表达边界之外有哪些相关对象和条件。

### Dependency

表达某个对象依赖另一个对象才能成立，是一种有方向的关系：

```text
SCN-PAID-REVIVE
  --depends-on-->
外部支付渠道

commerce-service
  --runs-on-->
数据库服务
```

### Source

表达一项事实、判断、知识或实现材料来自哪里：

```text
业务规则
  --supported-by-->
业务访谈、监管文档、历史决策

技术实现映射
  --located-at-->
代码、数据库 Schema、运行配置

技能知识
  --derived-from-->
官方文档、故障复盘、实践经验
```

三者不能放入同一个模糊的内容集合。

## 13. 调整后的总体结构

当前可以形成以下结构：

```text
Org
├── Functions
├── Roles
├── Actors
├── Skills
├── Tools
└── Infrastructure

Business
├── Semantic
│   ├── Domains
│   ├── Capabilities
│   ├── Scenarios
│   ├── Contracts
│   └── Invariants
│
├── Changes
│   └── 横向、纵向和时间变化
│
└── Realization
    └── 业务对象到产品、系统、数据和 Source 的映射

Spec
└── 基于 Business Change 和当前 Realization 驱动 SDD
```

完整链路是：

```text
Org 操作和治理 Business
        ↓
Business 产生 Business Change
        ↓
Spec 从 Business Change 出发
        ↓
沿 Realization 找到当前实现
        ↓
形成开发 Spec 并改变现实
        ↓
证据反向验证 Business Change
```

## 14. 当前结论

独立 Implementation Model 的问题在于，它可能把技术实现从业务中抽离，形成一个独立、统一、中心化的技术能力世界。

当前更合适的方式是：

- 技术实现不作为独立顶层；
- Business 保留业务对象到现实实现的 Realization 关系；
- 共享技术可以被多个业务域引用；
- 不强制业务域与技术系统一对一归属；
- Org Infra 归 Org；
- 技术角色、技能和知识能力归 Org 的能力体系；
- Source 记录现实材料和知识来源；
- Environment 作为相对于边界的派生视图；
- Spec 从 Business Change 出发，通过 Realization 进入代码、数据和系统；
- 不预设中台、集中化或统一复用是正确目标。

因此，之前的“缺少 Implementation”应被修正为：

> 当前缺少的可能不是一个 Implementation 层，而是 Business 对现实实现的 Realization 映射，以及 Realization 与 Org Infra、Skill、Source、Environment 的清晰边界。

该结论仍需通过真实业务域与真实代码、数据和运行依赖的映射进行验证。

