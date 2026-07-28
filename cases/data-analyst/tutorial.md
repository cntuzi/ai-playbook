# 从零构建一个数据分析师：七步

> 目标产物：一套能自己查数仓、口径不会漂、结论可被审计的分析体系 + 一个可对话的分析 agent。
> 前置：一个事件数仓（Doris / ClickHouse / BigQuery 都行）、Python 3、一个支持自定义 subagent 的 AI 编码工具。

> ⚠️ 文中数字均为**示意值**。代码是真实结构的简化版，字段名按通用命名改写过。

**顺序很重要。** 这七步是依赖关系，不是并列清单。跳过第 1、2 步直接写脚本，就是[案例里第一代的下场](./README.md#第一代能查数给我建个数据看板)。

```
Step 1  埋点注册表        ← 事实源。没有它，后面全是猜
Step 2  口径语义文档      ← 共识。没有它，每个人算的都不一样
Step 3  指标框架          ← 业务。决定看什么、为什么看
Step 4  代码分层 L0/L1/L2 ← 唯一实现
Step 5  三道自检闸        ← 强制机制。没有它，前四步三周后就烂了
Step 6  agent 定义        ← 到这一步才写 prompt
Step 7  自动化 + 质量闸   ← 让它每天自己跑
```

---

## Step 1：埋点注册表（唯一事实源）

**要解决的问题：** 写 SQL 的人（和 AI）怎么知道某个行为有没有埋点、事件叫什么、带哪些字段？

不能靠翻代码，也不能靠猜。要有一份**唯一事实源**，用三个维度组织：

### 维度一：按功能模块列全部事件

```markdown
### 对话（模块：核心体验；轮级全链 trace）

每个事件带 trace_id（轮）、session_id（对话会话）、chat_mode、model_id

| 落库名 | 代码 action/otype | 触发时机 | 关键字段 | 版本 | 状态 |
|---|---|---|---|---|---|
| chat_chat_round_start   | chat_round_start / chat | 用户发出一轮消息 | is_new_chat, send_type | v0.1 | 线上 |
| chat_chat_stream_first_delta | ... | 首 token 返回 | 首响耗时 | v0.1 | 线上 |
| chat_input_focus        | input_focus / chat | 输入框聚焦（开聊意图） | session_id, chat_mode | v0.2 | 待发版 |
| dialogue_increment_round（服务端） | — | 每完成一轮 | — | 历史 | 线上 |

⚠️ 口径坑：dialogue_increment_round 是全平台服务端事件，
   任何单端归因必须带平台过滤，漏掉会让 cohort 虚胖数十倍。
```

三个细节决定这份表有没有用：

1. **落库名和代码名都要写。** 数仓里的事件名往往是网关拼出来的（`对象类型_动作名`），和你在代码里 grep 的字符串不一样。只写一个，另一半人查不到（[陷阱 5](./pitfalls.md#5-事件名不是你在代码里写的那个)）。
2. **"状态"列区分「线上 / 待发版」。** 分析师查不到数据时，第一件事是看这个事件上没上线，而不是怀疑数仓。
3. **口径坑就地标注。** 警告写在事件旁边，不写在另一个文档里——没人会为了查一个事件名去读三份文档。

### 维度二：指标 ← 事件的映射

按业务块列出"想看的指标 → 用哪些埋点 → 怎么算"：

```markdown
### C. 分发效率（首页/探索 → 内容详情）

| 指标 | 埋点 | 统计方法 |
|---|---|---|
| 区块/位次 CTR | home_impression + home_click | click ÷ impression，按 block/section/position 拆 |
| 区块到达率（滚动漏斗） | home_impression(block=section) | 各区块曝光设备 ÷ 首页 PV 设备，按版面顺序看衰减 |
| 首页→详情转化 | home_click + detail_page_view | 同 session_id 且 click.id = 详情 id 且时间递增 |
```

这一节的价值是**反向的**：写着写着你会发现某些想看的指标**没有埋点支撑**。这些就是埋点需求，比拍脑袋提需求准得多。

### 维度三：版本历史

```markdown
| 版本 | 日期 | 新增事件 | 备注 |
|---|---|---|---|
| 历史 | ~06-09 | 仅服务端接口日志 | 无前端埋点，PV/UV 不可信（爬虫灌水） |
| v0.1 | 06-10 | 会话、详情页、对话轮级、登录 | 首批前端埋点 |
| v0.2 | 06-12 | page_view、page_leave、曝光/点击、性能、报错 | ★ 数据有效基线从这天起 |
```

**版本表决定了你的数据从哪天开始可信**（也就是 [Step 4](#step-4代码分层l0--l1--l2) 里的 `FLOOR`）。没有它，分析师会拿埋点污染期的数据做趋势。

最后加一节**已知缺口**，按杠杆排序：

```markdown
1. 地理维度（依赖后端按 IP 落库）—— 海外市场拆分必需
2. 安装归因（需 App 侧接 deferred deep link）
3. A/B 实验维度（尚无实验框架，先预留 exp_* 参数约定）
4. 投放 UTM 规范（运营动作，非代码）—— 否则渠道归因无米下锅
```

明确写下"我们看不到什么"，比假装什么都能看更有用。

---

## Step 2：口径语义文档

**要解决的问题：** "到访"是什么？"新客"是什么？两个人算出不同的数时，以谁为准？

这份文档（叫它 `DATA_SEMANTICS.md`）是**共识的落盘**。核心是一张标准表，每一行带生效日期：

```markdown
## 指标标准 v1（2026-07-03 生效）

| 指标 | 标准定义 | 生效 |
|---|---|---|
| 到访设备 | session_start 事件的 clean 设备号去重 | 2026-07-03 |
| 活跃 UID | 在自动接口集合外有 ≥1 事件（实质行为）+ 非内部 | 2026-07-03 |
| 新增 UID | 活跃 UID 且全史首现日在窗口内 | 2026-07-03 |
| 对话 UID/轮 | 仅 dialogue_increment_round；剔 bot 行 | 2026-07-03 |
| 互动次留 | 当日对话 uid 次日仍对话；pooled；只计成熟日 | 2026-07-03 |
| 周对比窗口 | 本周/上周各 7 天不重叠 | 2026-07-03 |

⚠️ 与 2026-07-03 之前的报表数字不可直接环比（到访/活跃/次留口径均有变）。
```

那行 ⚠️ 是整张表最重要的一行。口径改了不标生效日期，两周后就会有人拿改口径前后的数字做趋势，得到一个纯粹由口径变更制造出来的"增长"。

然后展开四类硬规则：

```markdown
### 时间
- 报告日 = 业务时区的最后一个完整日
- 分桶：TO_DATE(@dt + INTERVAL 1 HOUR)
- 窗口：[00:00, 24:00) 左闭右开，同样加偏移
- 禁止用运行机器的本地日期

### 设备
- 唯一设备键 = @distinct_id
- clean 设备 = 非空 + 无 ssr-/dev- 前缀 + 非 Headless + 非测试黑名单
             + 非内部账号用过的设备（全史回溯）

### 身份 / UID
- 有效 UID 排除 0 / -1 / 负数占位 / null / 内部账号
- 设备数 > UID 数是正常的（匿名设备计入设备，不计入 UID）
- 绝不把 UID 数标成"到访"

### 留存
- 留存表的日期是【分母日】，不是回访日
- 06-20 行的 D1 = 06-20 首现、06-21 回访
- 未成熟格显示 —，不显示 0%
```

最后加两节，让这份文档能被执行：

**对账规则**（报表之间必须自洽的等式）：

```
新客设备 + 老客设备 = 设备数
分端拆分（PC + H5 + 未知）之和 = 总量
简报的「到访设备」= 详细报表的 clean 设备 UV
```

**变更 checklist**（改口径前逐条过）：

```
□ 确认目标粒度：device / uid / session
□ 确认时间规则：分桶 + 窗口都改了
□ 确认排除规则与目标粒度匹配
□ 验证跨报表同日对账
□ 口径确实不同的，标签必须改名（如「会话设备」vs「页面设备」）
□ 重跑至少一份当日报表，肉眼检查受影响的表
```

---

## Step 3：指标框架（决定看什么）

前两步是"数据能不能信"，这一步是"看什么才有用"。三件事：

### 1. 一个北极星，加两条护栏

```
北极星：滚动 7 日内累计互动轮次 > 7 的去重真人数

护栏 1（质量）：达标用户 ÷ 全部对话用户  —— 防止靠灌水做高
护栏 2（瓶颈）：达标用户 ÷ 到访          —— 指出当前真正的卡点
```

北极星只有配上护栏才有意义。单看绝对值，任何指标都能通过牺牲别的东西做上去。

⚠️ 如果公司层面已有一个长期北极星，**不要替换它**，而是明确写下两者关系：

```markdown
两层北极星并存，非替代：
- MACU：跨平台长期产品北极星（月度口径，远期目标）
- R7-ACU：当前小样本期的运营代理（滚动窗口，可日频看趋势）
量级起来后向 MACU 过渡。R7-ACU 不替代、不降级 MACU。
```

不写清楚这层关系，两个月后会有人拿两个北极星互相打架。

### 2. 维度树（保证不漏视角）

把业务拆成固定的块，每块都有指标和事件支撑：

```
A 流量规模    B 页面质量    C 分发效率    D 获客
E 激活登录    F 核心体验    G 变现        H 创作/供给
I 留存生命周期 J 渠道归因   K 技术质量    L 内容供需    M 流失点诊断
```

M（流失点）最容易被漏，也最有价值——它问的不是"多少人做到了"，而是"想做但没做成的人卡在哪"：

```
想说没说：input_focus 之后没有 round_start   → 开聊意图流失
登录放弃：登录弹窗曝光后关闭且未点渠道按钮   → 登录墙代价
点了没成：点了渠道按钮但无成功回执           → 按 error_code 聚类
滚动流失：各版面区块曝光设备数的衰减曲线      → 首页版面问题
```

### 3. 三口径 + 滚动窗口（小样本也能看趋势）

```python
D1 = 昨天  # 报告日，最后一个完整日

WINDOWS = {
    "day":    (D1,          D1 + 1d),   # 当日
    "roll7":  (D1 - 6d,     D1 + 1d),   # 滚动 7 日（主口径）
    "prev7":  (D1 - 13d,    D1 - 6d),   # 上个 7 日（环比基准，不重叠）
    "roll14": (D1 - 13d,    D1 + 1d),   # 滚动 14 日（趋势 / cohort）
}
FLOOR = "2026-06-12 00:00:00"           # 所有窗口起点 max(start, FLOOR)
```

每个核心指标输出统一格式：

```
<指标名> 当日 N（环比前日 ±x%）｜滚动 7 日 M（日均 m）｜趋势 ↑+y% vs 上个 7 日
```

**为什么值得强调这一点：** 日活很小的时候，"日报没意义、等量起来再说"是很自然的想法。这个判断是错的——

> 体制要按**目标量级**建、一次建成不返工。按今天的样本量缩水，量涨上来还得重构。
> 单日抖动大不是"日频不能看趋势"的理由，是"用滚动窗口化解"的理由。
> 低量期是这套逻辑的**压测期**——现在就全量跑，在日常使用中把口径 bug 压出来。

实践里，正是低量期的日常运行暴露了埋点漏报、字段缺失、口径打架。等到数据重要的时候再建，这些坑会集中爆发。

---

## Step 4：代码分层（L0 → L1 → L2）

到这一步才开始写代码。三层，加起来大约几百行。

### L0：事实常量（唯一允许声明字面量的地方）

```python
# facts.py —— 所有"事实"只在这里声明一次
JST_DT = "(`@dt` + INTERVAL 1 HOUR)"          # 业务时区偏移
FLOOR_D = date(2026, 6, 12)                    # 数据有效基线
HISTORY_START = "2026-01-21 00:00:00"          # 全史回溯起点（数仓起点）

INTERNAL_USER_IDS = [...]                      # 内部/测试账号
SSR_AUTO_API_EVENTS = [                        # 自动接口：出现 ≠ 真人
    "register_guest", "auth", "nonce", "get_feeds",
    "get_channel_list", "other_list", "search_...",
]

UID = "CASE WHEN ... THEN NULL ELSE uid END"   # 占位 id 归 NULL 的表达式

def bot_dev_cte(start, end) -> str:
    """爬虫/测试/内部设备集合 —— 唯一定义处。"""
    return """bot_dev AS (
      SELECT DISTINCT dev FROM (
        -- Headless UA 会话设备
        SELECT NULLIF(`@distinct_id`,'') AS dev FROM t_event
        WHERE ... AND user_agent LIKE '%HeadlessChrome%'
        UNION ALL SELECT '<已知测试设备 1>'
        UNION ALL SELECT '<已知测试设备 2>'
        UNION ALL
        -- 内部账号用过的设备（全史回溯）
        SELECT NULLIF(`@distinct_id`,'') AS dev FROM t_event
        WHERE `@dt` >= '{HISTORY_START}' AND uid IN ({INTERNAL_IDS})
      ) raw_bot
    )"""

CLEAN_DEV = ("NULLIF(t.`@distinct_id`,'') IS NOT NULL "
             "AND t.`@distinct_id` NOT LIKE 'ssr-%' AND bot_dev.dev IS NULL")
```

> 两个容易踩的实现细节：
> - 那个 `SELECT DISTINCT` 外层不是多余的。同一设备可能命中多个分支，不去重会让后续 `LEFT JOIN` 扇出，把 `SUM` 类指标放大。
> - 内部账号要**全史回溯**剔除，不能只在窗口内剔——内部同事上个月用过的设备，这个月的匿名访问仍然是内部流量。

### L1：指标定义层（唯一 SQL 实现）

每个共享指标一个函数，输入时间窗，输出数值或逐日序列。**函数体内是该指标在整个系统中的唯一 SQL。**

```python
"""指标定义层（L1）—— 所有共享指标的唯一 SQL 实现。

规则：
  - 报表脚本禁止内联以下指标的 SQL，一律调本模块函数
  - 改口径 = 改本模块 + 改契约注册行 + 改语义文档生效日期
"""

def daily_core(start: date, end: date) -> list[dict]:
    """核心量级逐日序列。

    到访设备 = session_start 的 clean 设备去重（含匿名）
    活跃 UID = 自动接口集合外有 ≥1 事件的有效 uid
    生效日期：2026-07-03
    """
    sql = f"""
    WITH {bot_dev_cte(start, end)},
    hum AS (  -- 有实质行为的 uid（排除只触发自动接口的爬虫身份）
      SELECT DISTINCT {UID} AS uid FROM t_event t
      LEFT JOIN bot_dev ON bot_dev.dev = t.`@distinct_id`
      WHERE {JST_DT} >= '{start}' AND {JST_DT} < '{end}'
        AND t.`@event_name` NOT IN ({auto_api_list})
        AND {UID} IS NOT NULL AND {NOT_BOT_ROW}
    )
    SELECT TO_DATE({JST_DT}) AS date,
      COUNT(DISTINCT CASE WHEN {CLEAN_DEV}
            AND t.`@event_name`='app_web_session_start'
            THEN t.`@distinct_id` END)                    AS visitors_dev,
      COUNT(DISTINCT CASE WHEN h.uid IS NOT NULL THEN {UID} END) AS active_uid,
      ...
    FROM t_event t
    LEFT JOIN bot_dev ON bot_dev.dev = t.`@distinct_id`
    LEFT JOIN hum h   ON h.uid = {UID}
    WHERE {JST_DT} >= '{start}' AND {JST_DT} < '{end}'
    GROUP BY 1 ORDER BY 1 DESC        -- 最新在顶
    """
    return run_sql(sql)


def pooled_d1(rows: list[dict]) -> float | None:
    """次留 pooled 聚合：Σ留存 / Σ分母，只计成熟日。"""
    mature = [r for r in rows if r["date"] <= mature_d1_end()]
    total = sum(r["total"] for r in mature)
    return sum(r["retained"] for r in mature) / total if total else None
```

三个约定，缺一不可：

- **docstring 写口径一句话 + 生效日期**——读函数的人不用去翻文档
- **逐日序列一律倒序**（最新在顶）
- **成熟度判断放在 L1**，不放报表层。否则每个报表都要自己记得排除未成熟日，而总有一个会忘

### L2：指标契约（粒度 + 聚合规则）

```python
class Grain(str, Enum):
    DEVICE = "device"; UID = "uid"; WEB_SESSION = "web_session"
    CHAT_SESSION = "chat_session"; EVENT = "event_count"

class Agg(str, Enum):
    DISTINCT_WINDOW = "distinct_window"  # 窗口内去重（周聚合 ≠ 日求和）
    SUM             = "sum"              # 事件计数，可跨日求和
    POOLED          = "pooled"           # 比率：合并分子分母，禁日率平均
    MEDIAN          = "median"

@dataclass(frozen=True)
class Metric:
    metric_id: str
    label: str
    grain: Grain
    source: str
    impl: str = ""          # L1 中的实现函数名（共享指标必填）
    agg: Agg | None = None
    effective: str = ""     # 生效日期，与语义文档对齐

METRICS = {
    "clean_devices": Metric("clean_devices", "到访设备", Grain.DEVICE,
        "session_start distinct clean 设备号",
        impl="daily_core: visitors_dev", agg=Agg.DISTINCT_WINDOW,
        effective="2026-07-03"),
    "dialogue_d1": Metric("dialogue_d1", "互动次留", Grain.UID,
        "当日对话 uid 次日仍对话；只计成熟日",
        impl="dialogue_retention_daily + pooled_d1", agg=Agg.POOLED,
        effective="2026-07-03"),
    ...
}

@dataclass(frozen=True)
class Ratio:
    ratio_id: str; label: str
    numerator: str; denominator: str
    kind: RatioKind                      # KPI | DIAGNOSTIC

    def validate(self):
        if (METRICS[self.numerator].grain != METRICS[self.denominator].grain
                and self.kind != RatioKind.DIAGNOSTIC):
            raise ValueError(f"{self.ratio_id} 混了粒度：标 DIAGNOSTIC 或修正口径")

for r in RATIOS.values():
    r.validate()        # import 时就炸，不等到出报表才发现
```

模块底部那两行循环是关键：**校验在 import 时执行**。混粒度的比率不会等到跑报表才暴露，写下来就跑不起来。

### L3：报表层（只做排版）

```python
core = metrics.daily_core(start, end)      # 调 L1
d1   = metrics.pooled_d1(metrics.dialogue_retention_daily(start, end))
render_table(core, d1)                      # 排版
```

报表脚本里**不应该出现任何 `COUNT(DISTINCT ...)`**。这条由下一步强制。

---

## Step 5：三道自检闸

没有强制机制的规范，寿命大约三周。写一个 `verify_metrics.py`，跑报表前置执行，任一失败非零退出。

```python
"""指标一致性自检。三道闸，任一失败 exit 非 0（宁可缺报，不出错报）。"""

REPORT_SCRIPTS = ["daily_brief.py", "daily_dashboard.py",
                  "weekly_brief.py", "analyst_daily.py"]

FORBIDDEN_ALIASES = ["visitors_dev", "active_uid", "new_uid",
                     "dialogue_uid", "dialogue_rounds", "session_dev"]

def check_static() -> list[str]:
    """闸 1：报表脚本内禁止内联共享指标 SQL。"""
    errors, pattern = [], re.compile(
        r"(COUNT\s*\(\s*DISTINCT|SUM\s*\(CASE)[^\n]*\n?[^\n]*AS\s+("
        + "|".join(FORBIDDEN_ALIASES) + r")\b", re.I)
    for name in REPORT_SCRIPTS:
        text = (BASE / name).read_text()
        for m in pattern.finditer(text):
            line_no = text[:m.start()].count("\n") + 1
            if "ssot-allow" in text.splitlines()[line_no - 1]:
                continue                      # 专项分析显式豁免，留痕
            errors.append(f"{name}:{line_no} 内联共享指标 SQL（{m.group(2)}）")
    return errors

def check_contract() -> list[str]:
    """闸 2：契约里注册的实现函数必须真实存在于 L1。"""
    return [f"契约 {m.metric_id} 声明的实现 {fn} 不存在"
            for m in METRICS.values() for fn in parse_impl(m.impl)
            if not hasattr(metrics_module, fn)]

def check_live() -> list[str]:
    """闸 3：对昨日数据断言结构不变式（不断言具体数值）。"""
    errors = []
    # 分端拆分对账封闭
    seg, win = metrics.pc_h5_split(start, day), metrics.window_core(start, day)
    for seg_key, core_key in {"devices": "visitors_dev", "users": "active_uid"}.items():
        if sum(r[seg_key] for r in seg) != win[core_key]:
            errors.append(f"分端对账破裂：{seg_key} 之和 ≠ {core_key}")
    # 集合包含关系
    for r in metrics.daily_core(start, day):
        if r["dialogue_uid"] > r["active_uid"]:
            errors.append(f"{r['date']}: 对话 uid > 活跃 uid，实质行为口径破了")
        if r["visitors_dev"] == 0:
            errors.append(f"{r['date']}: 到访设备 = 0，埋点断流或口径破了")
    # 留存分子 ≤ 分母
    for fn in (metrics.dialogue_retention_daily, metrics.device_retention_daily):
        for r in fn(start, day):
            if r["retained"] > r["total"]:
                errors.append(f"{fn.__name__} {r['date']}: 留存分子 > 分母")
    return errors
```

**闸 3 的设计原则值得单独强调：断言结构不变式，不断言具体数值。**

```
❌ 昨日到访应在 100~200 之间     → 业务一变就要改，改着改着就注释掉了
✅ 对话用户 ⊆ 活跃用户            → 无论业务怎么变都必须成立
✅ 分端拆分之和 = 总量            → 归因逻辑一破就报
✅ 留存分子 ≤ 分母                → 窗口/join 一错就报
```

配套一条铁律写进文档：

> **改口径 = 改 L1 一个函数 + 改 L2 一行契约 + 改语义文档一行生效日期。三处以外的口径变更即违规。**

---

## Step 6：写 agent 定义

前五步做完，agent 定义会短得出人意料。五个部分：

```markdown
---
name: data-analyst
description: 可对话数据分析师。随口抛一个数据问题 → 自己写 SQL 查数仓、
             套对口径、给证据结论的 on-demand 归因诊断
tools: Read, Write, Glob, Grep, Bash
---

## 定位

产出【原始数据 + 口径严谨的归因】，不做产品决策。

vs 战略 agent：战略消费报告做判断，你产出数据和归因。它用你的数据做分析。
vs 固定日报：日报是每天全量推的体检；你是随问随答，针对单个问题深度下钻。

### 你不做什么
- ❌ 不做产品决策（给数据，不给"砍掉/保留"的拍板）
- ❌ 不写生产代码（缺口出口径规格，交给编码 agent 实现）
- ❌ 不为"证明某个预设结论"找数据 —— 应是"分析后得结论"

## 必读文件（口径事实源，指向它们，不复制进结论）

1. EVENTS.md          —— 埋点注册表。写 SQL 前先查事件落库名和参数字典
2. REPORT_SPEC.md     —— 指标框架 SoT。北极星定义指向这里，不自己复制
3. DATA_SEMANTICS.md  —— 口径语义 + 生效史
4. metrics.py (L1)    —— 共享指标唯一实现。先复用，别手搓平行定义
5. metric_contract.py —— 粒度契约。判断比率是否混粒度时查它

## 工具链

预设查询（口径已封装，优先用）：
  query.py dau | funnel | retention | content | overlap
裸 SQL（灵活下钻）：
  query.py sql "SELECT ..." --json

能用预设就别手搓 SQL —— 少出口径错。

## 口径纪律（每次查询前逐条自检）

1. 时区：分桶和窗口都加业务时区偏移
2. 基线：窗口起点 clamp 到数据有效基线，早于此标"窗口不足"
3. 爬虫：设备级 + 身份级双判据剔除。自动接口出现 ≠ 真人
4. 内部：内部账号全史回溯剔除
5. 占位 id：0 / -1 / 负数当匿名，身份兜底到设备号
6. 方言：保留字别名加反引号；分位数函数；时间加减语法
7. 排序：逐日/时序表倒序，最新在顶
8. 粒度：device / uid / session / event 不能直接做比率；混的标 DIAGNOSTIC

## 输出格式（强制，每次都套）

1. 结论先行 —— 一句话回答问题
2. 证据表   —— 支撑结论的数字（分维度/分时序，倒序）
3. 口径声明 —— 用了哪个窗口/基线/时区/剔除规则
4. 弱信号   —— 小样本标"样本小看方向"，不夸大
5. 数据诚实 —— 断库说断库、跌了说跌了、异常主动标

## 失败处理

- 连库失败 → 报"断库"，提示刷新凭据，不编造数字
- 样本不足 → 标"累积中"，给方向不下死结论
- 预设与手搓结果对不上 → 升级给人校准，不强行选一个
- 被要求"证明某结论" → 拒绝，说明应是"分析后得结论"
- 需要新查询能力 → 出口径规格交编码 agent，不越界写生产脚本
```

三个设计决策，每个都有代价，但都值得：

| 决策 | 代价 | 收益 |
|---|---|---|
| 查数和决策分成两个 agent | 多一次对话 | 查数的不会为自己的结论找数据 |
| prompt 只指向文件，不复制定义 | 每次多几次文件读取 | prompt 不会过期；源文档改了立刻跟上 |
| 输出强制口径声明 | 结论更长 | 每个数字可被审计，而不是被相信 |

---

## Step 7：自动化 + 质量闸

最后一步：让它每天自己跑，并且**跑不好的时候不要跑**。

```
定时触发
   │
   ├─ 前置：verify_metrics.py（三道闸）—— 失败即终止，不产出
   │
   ├─ 跑报表脚本（禁推送模式）
   │     └─ 非零退出 → 终止，不生成假日报
   │
   ├─ 质量闸：统计"查询未就绪"的 section 数
   │     └─ 超阈值 → 拒绝发布
   │        （避免把断库/断字段包装成一份看起来正常的日报）
   │
   ├─ 渲染 HTML / 截图
   │
   └─ 推送（总闸默认关闭，需显式设环境变量才发）
```

四个都吃过亏才加上的细节：

1. **推送总闸默认关闭。** 手动跑报表脚本调试时，不会误推给全群。想推要显式 `PUSH=1`。
2. **单 section 失败降级，不让整刊崩。** 每个模块用 `guarded()` 包裹，失败的标"待数据"，其余照常输出。
3. **但大量 section 失败要拒绝发布。** 单个模块降级是韧性，一半模块降级还发出去就是伪装成日报的噪声。
4. **保存下来的产出是 QA 存档，不是事实源。** 验证当前指标必须实查数仓，不能读昨天存的 HTML——那里面的数字属于它生成的那一刻。

---

## 落地顺序建议

如果时间有限，按这个顺序砍：

| 优先级 | 做什么 | 不做的后果 |
|---|---|---|
| **必须** | Step 1 埋点注册表 | 所有查询都在猜，AI 会编字段名 |
| **必须** | Step 2 口径语义（哪怕只有一张标准表） | 每个人算出不同的数，且没人知道谁对 |
| **必须** | Step 4 的 L1 指标层 | 口径必然漂移，这是结构决定的 |
| **强烈建议** | Step 5 闸 1（静态红线，20 行正则） | 三周后又会出现第二个平行定义 |
| 建议 | Step 5 闸 3（结构不变式） | 口径破了没人知道，直到有人肉眼发现 |
| 建议 | Step 6 agent | 没有它只是少了个入口，数据仍然可信 |
| 可后置 | Step 3 完整维度树、Step 7 自动化 | 手动跑几周完全可以 |

**注意 agent 排在很后面。** 这就是那个反直觉的结论：所谓"构建一个数据分析师"，绝大部分工作是建事实源和强制机制，写 prompt 只是最后一小步。

先有可信的数，才谈得上让 AI 去解读它。

---

## 相关文档

- [案例总览](./README.md) —— 三代演进、架构、踩坑记录
- [数据口径陷阱手册](./pitfalls.md) —— 14 个真实的坑，可直接抄进 agent 定义
