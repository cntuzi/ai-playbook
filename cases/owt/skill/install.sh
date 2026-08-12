#!/usr/bin/env bash
# 把 owt skill 挂给各个 agent。
#
# 真源是本目录，各 agent 的 skills 目录只放软链，改一处所有 agent 生效。
#   omp (Oh My Pi)  原生读 ~/.agents/skills，本目录在那儿就零配置
#   Claude Code     读 ~/.claude/skills
#   Codex CLI       读 ~/.codex/skills
#
# 用法：bash install.sh        # 挂链接
#       bash install.sh --check # 只报告现状，不改动
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NAME="$(basename "$SRC")"
CHECK_ONLY=false
[[ "${1:-}" == "--check" ]] && CHECK_ONLY=true

# 把 $2/$NAME 指向 $SRC；$1 是 agent 名，仅用于输出
link_into() {
  local agent="$1"
  local dir="$2"
  local dest="$dir/$NAME"

  if [[ ! -d "$dir" ]]; then
    echo "skip  $agent  ($dir 不存在，该 agent 没装)"
    return
  fi
  if [[ "$(cd "$dir" && pwd -P)" == "$(dirname "$SRC")" ]]; then
    echo "ok    $agent  (真源就在这里)"
    return
  fi
  if [[ -L "$dest" && "$(cd "$(dirname "$dest")" && cd "$(readlink "$dest")" && pwd -P)" == "$SRC" ]]; then
    echo "ok    $agent  $dest"
    return
  fi
  if [[ -e "$dest" && ! -L "$dest" ]]; then
    echo "WARN  $agent  $dest 是真实目录，不动它。确认内容已并入真源后手动删除再重跑。"
    return
  fi
  if $CHECK_ONLY; then
    echo "todo  $agent  $dest -> $SRC"
    return
  fi
  ln -sfn "$SRC" "$dest"
  echo "link  $agent  $dest -> $SRC"
}

link_into "omp"         "$HOME/.agents/skills"
link_into "claude-code" "$HOME/.claude/skills"
link_into "codex"       "$HOME/.codex/skills"

echo
echo "验证：Claude Code 用 /owt，Codex 用 \$owt，omp 用 /skill:owt"
