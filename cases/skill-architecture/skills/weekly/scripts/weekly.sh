#!/bin/bash
# Weekly Report Data Collection Script
# Usage: weekly.sh <command> [args]

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Get current ISO week
get_current_week() {
    date +%V
}

# Get year
get_year() {
    date +%Y
}

# Calculate date range for a week
# Args: week_number (e.g., 05 or W05)
get_week_range() {
    local week=$1
    week=${week#W}  # Remove W prefix if present
    week=${week#0}  # Remove leading zero

    local year=$(get_year)

    # Calculate Monday of the week (ISO week starts on Monday)
    # Using Python for cross-platform compatibility
    python3 -c "
from datetime import datetime, timedelta
import sys

year = $year
week = $week

# Get the first day of the year
jan1 = datetime(year, 1, 1)
# Find the first Monday
days_to_monday = (7 - jan1.weekday()) % 7
if jan1.weekday() <= 3:  # Thu or earlier
    first_monday = jan1 - timedelta(days=jan1.weekday())
else:
    first_monday = jan1 + timedelta(days=7-jan1.weekday())

# Calculate target week's Monday
target_monday = first_monday + timedelta(weeks=week-1)
target_sunday = target_monday + timedelta(days=6)

print(f'{target_monday.strftime(\"%Y-%m-%d\")} {target_sunday.strftime(\"%Y-%m-%d\")}')
"
}

# Collect git statistics for a date range
# Args: start_date end_date
collect_git_stats() {
    local start=$1
    local end=$2
    local end_next=$(date -j -v+1d -f "%Y-%m-%d" "$end" "+%Y-%m-%d" 2>/dev/null || date -d "$end + 1 day" "+%Y-%m-%d")

    echo "{"

    # Commit count
    local commits=$(git log --since="$start" --until="$end_next" --no-merges --oneline 2>/dev/null | wc -l | tr -d ' ')
    echo "  \"commits\": $commits,"

    # Code stats
    local stats=$(git log --since="$start" --until="$end_next" --no-merges --shortstat 2>/dev/null | grep -E "files? changed" | awk '{
        files+=$1
        for(i=1;i<=NF;i++) {
            if($i ~ /insertion/) ins+=$(i-1)
            if($i ~ /deletion/) del+=$(i-1)
        }
    } END {
        print files, ins, del
    }')

    local files=$(echo $stats | awk '{print $1}')
    local insertions=$(echo $stats | awk '{print $2}')
    local deletions=$(echo $stats | awk '{print $3}')

    echo "  \"files_changed\": ${files:-0},"
    echo "  \"insertions\": ${insertions:-0},"
    echo "  \"deletions\": ${deletions:-0},"

    # Daily distribution
    echo "  \"daily\": {"
    git log --since="$start" --until="$end_next" --no-merges --format="%ad" --date=short 2>/dev/null | \
        sort | uniq -c | awk '{print "    \"" $2 "\": " $1 ","}' | sed '$ s/,$//'
    echo "  },"

    # Type distribution
    echo "  \"types\": {"
    git log --since="$start" --until="$end_next" --no-merges --oneline 2>/dev/null | \
        grep -oE "^[a-f0-9]+ (feat|fix|chore|docs|refactor|style|perf|test)" | \
        awk '{print $2}' | sort | uniq -c | sort -rn | \
        awk '{print "    \"" $2 "\": " $1 ","}' | sed '$ s/,$//'
    echo "  },"

    # Date range
    echo "  \"start_date\": \"$start\","
    echo "  \"end_date\": \"$end\""

    echo "}"
}

# List recent commits with details
list_commits() {
    local start=$1
    local end=$2
    local end_next=$(date -j -v+1d -f "%Y-%m-%d" "$end" "+%Y-%m-%d" 2>/dev/null || date -d "$end + 1 day" "+%Y-%m-%d")

    git log --since="$start" --until="$end_next" --no-merges \
        --format="%h %ad %s" --date=short 2>/dev/null
}

# List available weekly reports
list_reports() {
    local report_dir="Docs/progress/project"
    if [ -d "$report_dir" ]; then
        ls -1 "$report_dir"/*.md 2>/dev/null | grep -E "W[0-9]{2}" | sort -r
    else
        echo "No reports found in $report_dir"
    fi
}

# Main
case "${1:-help}" in
    data)
        week=${2:-W$(printf "%02d" $(get_current_week))}
        range=($(get_week_range $week))
        collect_git_stats ${range[0]} ${range[1]}
        ;;
    range)
        week=${2:-W$(printf "%02d" $(get_current_week))}
        range=($(get_week_range $week))
        echo "${range[0]} to ${range[1]}"
        ;;
    commits)
        week=${2:-W$(printf "%02d" $(get_current_week))}
        range=($(get_week_range $week))
        list_commits ${range[0]} ${range[1]}
        ;;
    list)
        list_reports
        ;;
    help|*)
        echo "Weekly Report Data Collection"
        echo ""
        echo "Usage: weekly.sh <command> [args]"
        echo ""
        echo "Commands:"
        echo "  data [week]     Collect git statistics (JSON)"
        echo "  range [week]    Show date range for week"
        echo "  commits [week]  List commits for week"
        echo "  list            List available reports"
        echo ""
        echo "Examples:"
        echo "  weekly.sh data W05"
        echo "  weekly.sh range 05"
        echo "  weekly.sh commits"
        ;;
esac
