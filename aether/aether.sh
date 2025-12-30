#!/usr/bin/env bash
# =============================================================================
# Aether - Cross-platform Code Intelligence Tool (Bash Interface)
# =============================================================================
#
# SYNOPSIS:
#   ./aether.sh <command> [args...]
#
# DESCRIPTION:
#   Bash wrapper for the Aether Python engine.
#   Provides IDE-like symbol navigation, code modification, and AI-assisted workflows.
#
# REQUIREMENTS:
#   - Python 3.10+
#   - tree-sitter-languages (pip install tree-sitter-languages)
#
# EXAMPLES:
#   ./aether.sh list-symbols
#   ./aether.sh read-symbol ProcessUserData
#   ./aether.sh find-refs ProcessUserData
#   ./aether.sh replace-symbol MyFunc --code "def MyFunc(): pass"
#
# =============================================================================

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENGINE_PATH="$SCRIPT_DIR/aether_engine.py"
VENV_PATH="$SCRIPT_DIR/venv"
PYTHON_EXE=""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

# UTF-8
export LANG="${LANG:-en_US.UTF-8}"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"
export PYTHONUTF8=1

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

log_info() {
    echo -e "${CYAN}[AETHER:INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[AETHER:WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[AETHER:ERROR]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[AETHER:OK]${NC} $1"
}

find_python() {
    # Check venv first
    if [[ -f "$VENV_PATH/bin/python" ]]; then
        echo "$VENV_PATH/bin/python"
        return 0
    fi

    # Check common Python executables
    for cmd in python3 python; do
        if command -v "$cmd" &> /dev/null; then
            local version
            version=$("$cmd" --version 2>&1 | grep -oP '\d+\.\d+' | head -1)
            local major minor
            major=$(echo "$version" | cut -d. -f1)
            minor=$(echo "$version" | cut -d. -f2)

            if [[ "$major" -ge 3 ]] && [[ "$minor" -ge 10 ]]; then
                echo "$cmd"
                return 0
            fi
        fi
    done

    return 1
}

initialize() {
    PYTHON_EXE=$(find_python) || {
        log_error "Python 3.10+ not found. Please install Python."
        exit 1
    }

    if [[ ! -f "$ENGINE_PATH" ]]; then
        log_error "Engine not found at: $ENGINE_PATH"
        exit 1
    }

    # Check dependencies
    if ! "$PYTHON_EXE" -c "import tree_sitter_languages" &> /dev/null; then
        log_warn "tree-sitter-languages not installed."
        log_info "Installing dependencies..."
        "$PYTHON_EXE" -m pip install -r "$SCRIPT_DIR/requirements.txt" --quiet || {
            log_error "Failed to install dependencies."
            exit 1
        }
        log_success "Dependencies installed."
    fi
}

invoke_engine() {
    local project="${PROJECT_PATH:-.}"
    "$PYTHON_EXE" "$ENGINE_PATH" --project "$project" "$@"
}

# =============================================================================
# COMMANDS
# =============================================================================

cmd_list_symbols() {
    local type="" file="" name=""

    while [[ $# -gt 0 ]]; do
        case $1 in
            --type|-t) type="$2"; shift 2 ;;
            --file|-f) file="$2"; shift 2 ;;
            --name|-n) name="$2"; shift 2 ;;
            *) shift ;;
        esac
    done

    local args=("list_symbols")
    [[ -n "$type" ]] && args+=("--type" "$type")
    [[ -n "$file" ]] && args+=("--file" "$file")
    [[ -n "$name" ]] && args+=("--name" "$name")

    invoke_engine "${args[@]}"
}

cmd_read_symbol() {
    local symbol="${1:-}"

    if [[ -z "$symbol" ]]; then
        log_error "Usage: aether.sh read-symbol <symbol_name_or_id>"
        exit 1
    fi

    invoke_engine read_symbol "$symbol"
}

cmd_find_refs() {
    local symbol="${1:-}"

    if [[ -z "$symbol" ]]; then
        log_error "Usage: aether.sh find-refs <symbol_name>"
        exit 1
    fi

    invoke_engine find_references "$symbol"
}

cmd_replace_symbol() {
    local symbol="${1:-}"
    shift || true

    local code="" apply=""

    while [[ $# -gt 0 ]]; do
        case $1 in
            --code|-c) code="$2"; shift 2 ;;
            --apply) apply="--apply"; shift ;;
            *) shift ;;
        esac
    done

    if [[ -z "$symbol" ]] || [[ -z "$code" ]]; then
        log_error "Usage: aether.sh replace-symbol <symbol> --code '<new_code>' [--apply]"
        exit 1
    fi

    invoke_engine replace_symbol "$symbol" --code "$code" $apply
}

cmd_insert_before() {
    local symbol="${1:-}"
    shift || true

    local code="" apply=""

    while [[ $# -gt 0 ]]; do
        case $1 in
            --code|-c) code="$2"; shift 2 ;;
            --apply) apply="--apply"; shift ;;
            *) shift ;;
        esac
    done

    if [[ -z "$symbol" ]] || [[ -z "$code" ]]; then
        log_error "Usage: aether.sh insert-before <symbol> --code '<code>' [--apply]"
        exit 1
    fi

    invoke_engine insert_before "$symbol" --code "$code" $apply
}

cmd_insert_after() {
    local symbol="${1:-}"
    shift || true

    local code="" apply=""

    while [[ $# -gt 0 ]]; do
        case $1 in
            --code|-c) code="$2"; shift 2 ;;
            --apply) apply="--apply"; shift ;;
            *) shift ;;
        esac
    done

    if [[ -z "$symbol" ]] || [[ -z "$code" ]]; then
        log_error "Usage: aether.sh insert-after <symbol> --code '<code>' [--apply]"
        exit 1
    fi

    invoke_engine insert_after "$symbol" --code "$code" $apply
}

cmd_rename() {
    local old_name="${1:-}"
    local new_name="${2:-}"
    shift 2 || true

    local apply=""

    while [[ $# -gt 0 ]]; do
        case $1 in
            --apply) apply="--apply"; shift ;;
            *) shift ;;
        esac
    done

    if [[ -z "$old_name" ]] || [[ -z "$new_name" ]]; then
        log_error "Usage: aether.sh rename <old_name> <new_name> [--apply]"
        exit 1
    fi

    invoke_engine rename_symbol "$old_name" "$new_name" $apply
}

cmd_delete_lines() {
    local file="${1:-}"
    local start="${2:-}"
    local end="${3:-}"
    shift 3 || true

    local apply=""
    [[ "${1:-}" == "--apply" ]] && apply="--apply"

    if [[ -z "$file" ]] || [[ -z "$start" ]] || [[ -z "$end" ]]; then
        log_error "Usage: aether.sh delete-lines <file> <start_line> <end_line> [--apply]"
        exit 1
    fi

    invoke_engine delete_lines "$file" "$start" --end-line "$end" $apply
}

cmd_insert_at() {
    local file="${1:-}"
    local line="${2:-}"
    shift 2 || true

    local code="" apply=""

    while [[ $# -gt 0 ]]; do
        case $1 in
            --code|-c) code="$2"; shift 2 ;;
            --apply) apply="--apply"; shift ;;
            *) shift ;;
        esac
    done

    if [[ -z "$file" ]] || [[ -z "$line" ]] || [[ -z "$code" ]]; then
        log_error "Usage: aether.sh insert-at <file> <line> --code '<code>' [--apply]"
        exit 1
    fi

    invoke_engine insert_at_line "$file" "$line" --code "$code" $apply
}

cmd_replace_lines() {
    local file="${1:-}"
    local start="${2:-}"
    local end="${3:-}"
    shift 3 || true

    local code="" apply=""

    while [[ $# -gt 0 ]]; do
        case $1 in
            --code|-c) code="$2"; shift 2 ;;
            --apply) apply="--apply"; shift ;;
            *) shift ;;
        esac
    done

    if [[ -z "$file" ]] || [[ -z "$start" ]] || [[ -z "$end" ]] || [[ -z "$code" ]]; then
        log_error "Usage: aether.sh replace-lines <file> <start> <end> --code '<code>' [--apply]"
        exit 1
    fi

    invoke_engine replace_lines "$file" "$start" --end-line "$end" --code "$code" $apply
}

cmd_search() {
    local pattern="${1:-}"
    shift || true

    local no_regex="" ignore_case="" max_results="100"

    while [[ $# -gt 0 ]]; do
        case $1 in
            --literal|--no-regex) no_regex="--no-regex"; shift ;;
            --ignore-case|-i) ignore_case="--ignore-case"; shift ;;
            --max-results) max_results="$2"; shift 2 ;;
            *) shift ;;
        esac
    done

    if [[ -z "$pattern" ]]; then
        log_error "Usage: aether.sh search <pattern> [--literal] [--ignore-case]"
        exit 1
    fi

    invoke_engine search "$pattern" $no_regex $ignore_case --max-results "$max_results"
}

cmd_overview() {
    local file="${1:-}"

    if [[ -z "$file" ]]; then
        log_error "Usage: aether.sh overview <file_path>"
        exit 1
    fi

    invoke_engine symbols_overview "$file"
}

# Memory commands
cmd_write_memory() {
    local name="${1:-}"
    shift || true

    local content="" tags=""

    while [[ $# -gt 0 ]]; do
        case $1 in
            --content) content="$2"; shift 2 ;;
            --tags) tags="$2"; shift 2 ;;
            *) shift ;;
        esac
    done

    if [[ -z "$name" ]] || [[ -z "$content" ]]; then
        log_error "Usage: aether.sh write-memory <name> --content '<content>' [--tags 'tag1,tag2']"
        exit 1
    fi

    local args=("write_memory" "$name" "--content" "$content")
    [[ -n "$tags" ]] && args+=("--tags" "$tags")

    invoke_engine "${args[@]}"
}

cmd_read_memory() {
    local name="${1:-}"

    if [[ -z "$name" ]]; then
        log_error "Usage: aether.sh read-memory <name>"
        exit 1
    fi

    invoke_engine read_memory "$name"
}

cmd_list_memories() {
    local tag="${1:-}"

    if [[ -n "$tag" ]]; then
        invoke_engine list_memories "$tag"
    else
        invoke_engine list_memories
    fi
}

cmd_delete_memory() {
    local name="${1:-}"

    if [[ -z "$name" ]]; then
        log_error "Usage: aether.sh delete-memory <name>"
        exit 1
    fi

    invoke_engine delete_memory "$name"
}

# Project commands
cmd_onboard() {
    local force=""
    [[ "${1:-}" == "--force" ]] && force="--force"

    invoke_engine onboard $force
}

cmd_status() {
    invoke_engine check_onboarding
}

cmd_index() {
    invoke_engine index
}

cmd_help() {
    cat << 'EOF'

    ___        _   _
   / _ \      | | | |
  / /_\ \ ___ | |_| |__   ___ _ __
  |  _  |/ _ \| __| '_ \ / _ \ '__|
  | | | |  __/| |_| | | |  __/ |
  \_| |_/\___| \__|_| |_|\___|_|

  Aether - AST-based Code Intelligence

USAGE:
  ./aether.sh <command> [args...]

SYMBOL COMMANDS:
  list-symbols [--type <type>] [--file <path>] [--name <name>]
  read-symbol <symbol_name_or_id>
  overview <file_path>
  find-refs <symbol_name>
  search <pattern> [--literal] [--ignore-case]

MODIFICATION COMMANDS:
  replace-symbol <symbol> --code '<code>' [--apply]
  insert-before <symbol> --code '<code>' [--apply]
  insert-after <symbol> --code '<code>' [--apply]
  rename <old_name> <new_name> [--apply]
  delete-lines <file> <start> <end> [--apply]
  insert-at <file> <line> --code '<code>' [--apply]
  replace-lines <file> <start> <end> --code '<code>' [--apply]

MEMORY COMMANDS:
  write-memory <name> --content '<content>' [--tags 'tag1,tag2']
  read-memory <name>
  list-memories [tag]
  delete-memory <name>

PROJECT COMMANDS:
  onboard [--force]
  status
  index

ENVIRONMENT:
  PROJECT_PATH    Set project root (default: current directory)

EXAMPLES:
  ./aether.sh list-symbols --type function
  ./aether.sh read-symbol ProcessUserData
  ./aether.sh find-refs MyClass
  ./aether.sh replace-symbol MyFunc --code "def MyFunc(): pass" --apply
  ./aether.sh rename oldName newName --apply
  ./aether.sh search "TODO|FIXME"
  ./aether.sh write-memory "notes" --content "Important info"

  # Set project path
  PROJECT_PATH=/path/to/project ./aether.sh list-symbols

EOF
}

# =============================================================================
# MAIN
# =============================================================================

main() {
    local command="${1:-help}"
    shift || true

    # Initialize Python
    initialize

    case "$command" in
        # Symbol commands
        list-symbols|ls)       cmd_list_symbols "$@" ;;
        read-symbol|read|rs)   cmd_read_symbol "$@" ;;
        overview|ov)           cmd_overview "$@" ;;
        find-refs|refs|fr)     cmd_find_refs "$@" ;;
        search|s|grep)         cmd_search "$@" ;;

        # Modification commands
        replace-symbol|replace|rep)  cmd_replace_symbol "$@" ;;
        insert-before|ib)            cmd_insert_before "$@" ;;
        insert-after|ia)             cmd_insert_after "$@" ;;
        rename|rn|mv)                cmd_rename "$@" ;;
        delete-lines|dl)             cmd_delete_lines "$@" ;;
        insert-at|ins)               cmd_insert_at "$@" ;;
        replace-lines|rl)            cmd_replace_lines "$@" ;;

        # Memory commands
        write-memory|wm)       cmd_write_memory "$@" ;;
        read-memory|rm)        cmd_read_memory "$@" ;;
        list-memories|lm)      cmd_list_memories "$@" ;;
        delete-memory|dm)      cmd_delete_memory "$@" ;;

        # Project commands
        onboard|ob)            cmd_onboard "$@" ;;
        status|st)             cmd_status "$@" ;;
        index|idx)             cmd_index "$@" ;;

        # Help
        help|-h|--help)        cmd_help ;;

        *)
            log_error "Unknown command: $command"
            cmd_help
            exit 1
            ;;
    esac
}

main "$@"
