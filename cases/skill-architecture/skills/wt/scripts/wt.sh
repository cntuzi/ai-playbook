#!/bin/bash
# Worktree + Branch + Tmux 管理工具
# ===================================
# 底层工具脚本，由 Claude Code /wt skill 调度
#
# name 即路径：调用者决定目录结构，脚本不强加任何前缀
#   wt new 0316/fix-chat        → wt/<project>/0316/fix-chat
#   wt new cc-100.0             → wt/<project>/cc-100.0
#   wt new cc-100.0/T07         → wt/<project>/cc-100.0/T07
#
# 用法:
#   wt new <name> [base]        创建 worktree + 新分支 + tmux 窗口
#   wt attach <branch> [name]   为已有分支创建 worktree + tmux 窗口
#   wt done [pattern]           合并分支并询问清理
#   wt rm <pattern>             删除匹配的 worktree/分支/窗口
#   wt ls [pattern]             列出所有
#   wt -f <cmd> ...             强制执行（无确认）

set -e

# ========== 配置 ==========
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
    echo "错误: 当前目录不在 git 仓库中"
    exit 1
}
WT_ROOT="$(dirname "$REPO_ROOT")/wt"

PROJECT_NAME="${WT_PROJECT:-$(basename "$REPO_ROOT")}"
WT_BASE="${WT_ROOT}/${PROJECT_NAME}"
TMUX_SESSION="${TMUX:+$(tmux display-message -p '#S' 2>/dev/null)}"
DATE_PREFIX=$(date +%m%d)

# 颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_ok() { echo -e "${GREEN}✓${NC} $1"; }
log_warn() { echo -e "${YELLOW}!${NC} $1"; }
log_err() { echo -e "${RED}✗${NC} $1"; }
log_info() { echo -e "${BLUE}→${NC} $1"; }

# 从 name 提取 tmux 窗口名（最后一段）
tmux_window_name() {
    echo "$1" | sed 's|.*/||'
}

# ========== 项目钩子 ==========
run_project_hooks() {
    local wt_path="$1"

    local setup_script="$wt_path/scripts/setup-worktree-links.sh"
    if [[ -x "$setup_script" ]]; then
        log_info "执行项目钩子: setup-worktree-links.sh"
        (cd "$wt_path" && ./scripts/setup-worktree-links.sh) && \
            log_ok "项目钩子执行完成" || \
            log_warn "项目钩子执行失败（非致命）"
    fi
}

# ========== 创建 tmux 窗口 ==========
create_tmux_window() {
    local win_name="$1"
    local wt_path="$2"

    if [[ -z "$TMUX_SESSION" ]] || ! tmux has-session -t "$TMUX_SESSION" 2>/dev/null; then
        log_warn "Tmux session 未检测到"
        return
    fi

    if tmux list-windows -t "$TMUX_SESSION" -F '#{window_name}' | grep -q "^${win_name}$"; then
        log_warn "Tmux 窗口已存在: $win_name"
        return
    fi

    # 三 pane 布局：左上、左下、右侧
    tmux new-window -t "$TMUX_SESSION" -n "$win_name" -c "$wt_path"
    tmux split-window -h -c "$wt_path" -p 50
    tmux select-pane -L
    tmux split-window -v -c "$wt_path" -p 50
    tmux select-pane -U
    log_ok "Tmux: $win_name (3 panes)"
}

# ========== 创建工作空间 ==========
cmd_new() {
    local name="$1"
    local base="${2:-$(git branch --show-current)}"

    if [[ -z "$name" ]]; then
        echo "用法: wt new <name> [base-branch]"
        echo ""
        echo "name 即路径，调用者决定结构："
        echo "  wt new 0316/fix-chat        日常开发（日期/任务）"
        echo "  wt new cc-100.0             spec 版本"
        echo "  wt new cc-100.0/T07         spec 版本下的子任务"
        exit 1
    fi

    # 验证：允许英文、数字、连字符、下划线、点号、斜杠
    if [[ ! "$name" =~ ^[a-zA-Z0-9_./-]+$ ]]; then
        log_err "名称只能包含英文、数字、连字符、下划线、点号、斜杠: $name"
        exit 1
    fi

    # 去掉尾部斜杠
    name="${name%/}"

    local branch="feat/${PROJECT_NAME}/${name}"
    local wt_path="${WT_BASE}/${name}"
    local win_name
    win_name=$(tmux_window_name "$name")

    # 检查是否已存在
    if git show-ref --verify --quiet "refs/heads/$branch" 2>/dev/null; then
        log_err "分支已存在: $branch"
        exit 1
    fi

    if [[ -d "$wt_path" ]]; then
        log_err "目录已存在: $wt_path"
        exit 1
    fi

    # 创建 worktree + 分支
    cd "$REPO_ROOT"
    mkdir -p "$(dirname "$wt_path")"
    git worktree add -b "$branch" "$wt_path" "$base"
    log_ok "Worktree: $wt_path"
    log_ok "Branch: $branch (based on $base)"

    create_tmux_window "$win_name" "$wt_path"
    run_project_hooks "$wt_path"

    echo ""
    echo -e "${CYAN}cd $wt_path${NC}"

    echo ""
    echo "---JSON---"
    echo "{\"branch\": \"$branch\", \"path\": \"$wt_path\", \"base\": \"$base\", \"name\": \"$name\"}"
}

# ========== 附加到已有分支 ==========
cmd_attach() {
    local branch="$1"
    local name="${2:-$(echo "$branch" | sed 's|.*/||')}"

    if [[ -z "$branch" ]]; then
        echo "用法: wt attach <branch> [name]"
        echo "  branch: 已存在的分支名"
        echo "  name:   worktree 子路径（默认取分支最后一段）"
        exit 1
    fi

    cd "$REPO_ROOT"

    # 验证分支是否存在
    if ! git show-ref --verify --quiet "refs/heads/$branch" 2>/dev/null; then
        if git show-ref --verify --quiet "refs/remotes/origin/$branch" 2>/dev/null; then
            log_info "从远程检出分支: $branch"
            git checkout -b "$branch" "origin/$branch"
            git checkout - 2>/dev/null || true
        else
            log_err "分支不存在: $branch"
            exit 1
        fi
    fi

    # 去掉尾部斜杠
    name="${name%/}"

    local wt_path="${WT_BASE}/${name}"
    local win_name
    win_name=$(tmux_window_name "$name")

    # 检查 worktree 是否已存在
    if git worktree list | grep -q "$wt_path"; then
        log_warn "Worktree 已存在: $wt_path"
    elif [[ -d "$wt_path" ]]; then
        log_err "目录已存在但非 worktree: $wt_path"
        exit 1
    else
        mkdir -p "$(dirname "$wt_path")"
        git worktree add "$wt_path" "$branch"
        log_ok "Worktree: $wt_path"
    fi

    log_ok "Branch: $branch"

    create_tmux_window "$win_name" "$wt_path"
    run_project_hooks "$wt_path"

    echo ""
    echo -e "${CYAN}cd $wt_path${NC}"

    echo ""
    echo "---JSON---"
    echo "{\"branch\": \"$branch\", \"path\": \"$wt_path\", \"name\": \"$name\"}"
}

# ========== 删除工作空间 ==========
cmd_rm() {
    local pattern="$1"

    if [[ -z "$pattern" ]]; then
        echo "用法: wt rm <name|pattern>"
        exit 1
    fi

    # "." 匹配今天创建的 worktree
    [[ "$pattern" == "." ]] && pattern="$DATE_PREFIX"

    cd "$REPO_ROOT"

    # 精确匹配：按相对路径（从 WT_ROOT 起算），跳过主仓库
    local worktrees=""
    while IFS= read -r wt_path; do
        [[ "$wt_path" == "$REPO_ROOT" ]] && continue
        local rel="${wt_path#$WT_BASE/}"
        # 精确匹配 name 或 prefix/name（如 "0318" 匹配 "0318/xxx"）
        if [[ "$rel" == "$pattern" || "$rel" == "$pattern/"* ]]; then
            [[ -n "$worktrees" ]] && worktrees+=$'\n'
            worktrees+="$wt_path"
        fi
    done < <(git worktree list --porcelain | grep "^worktree " | sed 's/worktree //')

    if [[ -z "$worktrees" ]]; then
        log_warn "没有找到精确匹配 '$pattern' 的 worktree"
        exit 0
    fi

    echo "将删除以下 worktree:"
    echo "$worktrees" | while read wt; do
        local branch=$(git worktree list --porcelain | grep -A2 "^worktree $wt$" | grep "^branch" | sed 's|branch refs/heads/||')
        echo "  - $wt"
        [[ -n "$branch" ]] && echo "    └─ branch: $branch"
    done
    echo ""

    # 确认删除（-f 跳过）
    if [[ "${FORCE:-}" != "1" ]]; then
        read -p "确认删除? [y/N] " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "已取消"
            exit 0
        fi
    fi

    echo "$worktrees" | while read wt_path; do
        local name=$(basename "$wt_path")
        local branch=$(git worktree list --porcelain | grep -A2 "^worktree $wt_path$" | grep "^branch" | sed 's|branch refs/heads/||')

        if [[ -n "$TMUX_SESSION" ]] && tmux has-session -t "$TMUX_SESSION" 2>/dev/null; then
            tmux kill-window -t "$TMUX_SESSION:$name" 2>/dev/null && log_ok "Tmux: $name" || true
        fi

        git worktree remove --force "$wt_path" 2>/dev/null && log_ok "Worktree: $wt_path" || log_warn "Worktree: $wt_path (已不存在)"

        if [[ -n "$branch" ]]; then
            git branch -d "$branch" 2>/dev/null && log_ok "Branch: $branch" || \
            git branch -D "$branch" 2>/dev/null && log_ok "Branch: $branch (force)" || true
        fi
    done

    find "$WT_ROOT" -type d -empty -delete 2>/dev/null || true
}

# ========== 列出工作空间 ==========
cmd_ls() {
    local pattern="${1:-}"
    cd "$REPO_ROOT"

    echo -e "${BLUE}=== Worktrees ===${NC}"
    git worktree list | grep -E "${pattern}" || echo "  (none)"

    echo ""
    echo -e "${BLUE}=== Branches (feat/) ===${NC}"
    git branch | grep "feat/" | grep -E "${pattern}" || echo "  (none)"

    echo ""
    echo -e "${BLUE}=== 配置 ===${NC}"
    echo "  Project: $PROJECT_NAME"
    echo "  WT_BASE:  $WT_BASE"
    echo "  Tmux:     ${TMUX_SESSION:-<未在 tmux 中>}"
}

# ========== 完成工作（由 Claude Code 工作流处理） ==========
cmd_done() {
    log_warn "wt done 已改为 Claude Code 工作流"
    echo ""
    echo "请使用 /wt done <关键字> 让 Claude Code 智能处理："
    echo "  - 分析当前 worktree 状态"
    echo "  - 合并代码到目标分支"
    echo "  - 清理 worktree + tmux + 分支"
    echo ""
    echo "或手动执行："
    echo "  1. git merge <branch>      # 合并"
    echo "  2. wt rm <pattern>         # 清理"
    exit 0
}

# ========== 帮助 ==========
cmd_help() {
    cat << EOF
${BLUE}Worktree 管理工具${NC}

${YELLOW}用法:${NC}
  wt new <name> [base]       创建 worktree + 新分支 + tmux
  wt attach <branch> [name]  为已有分支创建 worktree + tmux
  wt done [pattern]          合并分支并清理（worktree + tmux + 分支）
  wt rm <pattern>            删除（不合并）
  wt ls [pattern]            列出
  wt -f <cmd> ...            强制执行

${YELLOW}name 即路径（调用者决定结构）:${NC}
  wt new 0316/fix-chat          日常开发 → feat/${PROJECT_NAME}/0316/fix-chat
  wt new cc-100.0               spec 版本 → feat/${PROJECT_NAME}/cc-100.0
  wt new cc-100.0/T07           子任务   → feat/${PROJECT_NAME}/cc-100.0/T07
  wt attach release-1.1_dev     已有分支 → wt/${PROJECT_NAME}/release-1.1_dev

${YELLOW}Tmux 布局:${NC}
  ┌─────────┬─────────┐
  │  左上   │         │
  ├─────────┤  右侧   │
  │  左下   │         │
  └─────────┴─────────┘

${YELLOW}配置:${NC}
  Project:  ${CYAN}$PROJECT_NAME${NC}
  WT_BASE:  ${CYAN}$WT_BASE${NC}
  Tmux:     ${CYAN}${TMUX_SESSION:-<未在 tmux 中>}${NC}
EOF
}

# ========== 主入口 ==========
main() {
    local cmd="${1:-}"

    case "$cmd" in
        new|n)      shift; cmd_new "$@" ;;
        attach|a)   shift; cmd_attach "$@" ;;
        done|d)     shift; cmd_done "$@" ;;
        rm|r)       shift; cmd_rm "$@" ;;
        ls|l)       shift; cmd_ls "$@" ;;
        help|h|-h|--help) cmd_help ;;
        -f|--force) FORCE=1; shift; main "$@" ;;
        "") cmd_help ;;
        *) log_err "未知命令: $cmd"; cmd_help; exit 1 ;;
    esac
}

[[ "${BASH_SOURCE[0]}" == "${0}" ]] && main "$@"
