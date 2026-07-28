# Skill 实物

[← 回到五条原则](../README.md)

自己写的 skill 原文，未删减。原则是从这些东西里抽出来的，不是反过来。

| Skill | 体量 | 脚本 | 干什么 |
|---|---|---|---|
| [`codex`](./codex/) | 7.2k | `codex.py` (322 行) | 把 Codex CLI 变成可委托的子能力，支持 `@` 文件引用、结构化 JSON 输出、会话 resume |
| [`gemini`](./gemini/) | 4.0k | `gemini.py` (160 行) | 同上，Gemini CLI |
| [`wt`](./wt/) | 6.7k | `wt.sh` (356 行) | git worktree + 分支 + tmux 窗口管理，支持自然语言描述创建 |
| [`weekly`](./weekly/) | 6.4k | `weekly.sh` (168 行) | 分析 git 数据生成周迭代报告，带上周对比 |
| [`decision-hygiene`](./decision-hygiene/) | 6.0k | 无 | 决策卫生：落盘前合理性自检、决策与否决都落盘、决策后级联清理 |
| [`dirty-data-governance`](./dirty-data-governance/) | 6.9k | 无 | 脏数据治理：建真实源契约 + 一次全量核对，替代「发现一个清一个」 |
| [`fix-pipeline`](../../fix-pipeline/skill/) | 8.4k | `roles/` × 5 | 队列驱动的多 agent 修复闭环，见 [fix-pipeline 案例](../../fix-pipeline/) |

## 怎么用

放到 agent 的 skill 目录即可。我的布局是把实体文件放在跨工具的中立目录，再软链到各 agent 的
skill 目录：

```bash
~/.agents/skills/<name>/SKILL.md          # 实体，跨工具中立
~/.claude/skills/<name> -> ../../.agents/skills/<name>   # Claude Code 自动发现
```

其他 agent（Codex / Gemini / omp）不扫这个目录，所以走两条路之一：

- 在它的全局指令文件里加一行指针（例如 `~/.codex/AGENTS.md`）
- 派活时把绝对路径注进 prompt —— 这条更可靠，零配置，任何能读文件的 agent 都吃

## 关于 `taste-skill`

第五个形态「品味约束」在[五条原则](../README.md)里引用了 `taste-skill`（1206 行前端设计规则），
但**没有收录进来** —— 它的目录名和 frontmatter 里的 name 对不上，全文没有来源标注，也不在
skill 安装器的 lock 文件里。来源存疑，在确认之前不当作自己的东西发布。
