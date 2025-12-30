#!/usr/bin/env bash
# =============================================================================
# Build tree-sitter language binaries for Linux/WSL
# =============================================================================
#
# DESCRIPTION:
#   This script handles tree-sitter language compilation for Linux/WSL.
#   NOTE: tree-sitter-languages package comes with pre-compiled binaries.
#   This script is for custom language support or manual rebuilding.
#
# REQUIREMENTS:
#   - GCC or Clang
#   - Python 3.10+
#   - Node.js (optional, for tree-sitter CLI)
#
# USAGE:
#   ./build_languages.sh              # Install pre-built languages
#   ./build_languages.sh python       # Build specific language
#   ./build_languages.sh --clean      # Clean build artifacts
#
# =============================================================================

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AETHER_ROOT="$(dirname "$SCRIPT_DIR")"
LANGUAGES_DIR="$AETHER_ROOT/languages"
VENV_PATH="$AETHER_ROOT/venv"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${CYAN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_ok() { echo -e "${GREEN}[OK]${NC} $1"; }

# =============================================================================
# PREREQUISITES CHECK
# =============================================================================

check_prerequisites() {
    log_info "Checking prerequisites..."

    # Python
    if command -v python3 &> /dev/null; then
        PYTHON_CMD="python3"
    elif command -v python &> /dev/null; then
        PYTHON_CMD="python"
    else
        log_error "Python not found. Please install Python 3.10+."
        exit 1
    fi

    local version
    version=$($PYTHON_CMD --version 2>&1 | grep -oP '\d+\.\d+' | head -1)
    log_ok "Python found: $PYTHON_CMD ($version)"

    # C Compiler
    if command -v gcc &> /dev/null; then
        log_ok "GCC found: $(gcc --version | head -1)"
    elif command -v clang &> /dev/null; then
        log_ok "Clang found: $(clang --version | head -1)"
    else
        log_warn "No C compiler found. You may need GCC or Clang for custom builds."
        log_info "Install with: sudo apt install build-essential"
    fi

    # pip/tree-sitter
    if ! $PYTHON_CMD -c "import tree_sitter" &> /dev/null; then
        log_warn "tree-sitter not installed. Installing..."
        $PYTHON_CMD -m pip install tree-sitter --quiet
    fi

    return 0
}

# =============================================================================
# SETUP VIRTUAL ENVIRONMENT
# =============================================================================

setup_venv() {
    if [[ ! -d "$VENV_PATH" ]]; then
        log_info "Creating virtual environment..."
        $PYTHON_CMD -m venv "$VENV_PATH"
    fi

    # Activate venv
    if [[ -f "$VENV_PATH/bin/activate" ]]; then
        # shellcheck disable=SC1091
        source "$VENV_PATH/bin/activate"
        log_ok "Virtual environment activated."
    fi
}

# =============================================================================
# INSTALL PRE-BUILT LANGUAGES
# =============================================================================

install_tree_sitter_languages() {
    log_info "Installing tree-sitter-languages package..."

    pip install tree-sitter-languages --upgrade --quiet

    if [[ $? -eq 0 ]]; then
        log_ok "tree-sitter-languages installed successfully!"

        # List available languages
        $PYTHON_CMD << 'PYEOF'
import tree_sitter_languages
langs = tree_sitter_languages.LANGUAGES
print('Available languages:')
for lang in sorted(langs):
    print(f'  - {lang}')
PYEOF
        return 0
    else
        log_error "Failed to install tree-sitter-languages."
        return 1
    fi
}

# =============================================================================
# BUILD CUSTOM LANGUAGE (Advanced)
# =============================================================================

build_custom_language() {
    local lang_name="$1"
    local repo_url="$2"

    log_info "Building custom language: $lang_name"

    local lang_dir="$LANGUAGES_DIR/$lang_name"

    # Clone or update repo
    if [[ ! -d "$lang_dir" ]]; then
        log_info "Cloning $lang_name grammar..."
        git clone "$repo_url" "$lang_dir" --depth 1
    elif [[ "${FORCE:-}" == "true" ]]; then
        log_info "Updating $lang_name grammar..."
        pushd "$lang_dir" > /dev/null
        git pull
        popd > /dev/null
    fi

    # Build with tree-sitter
    log_info "Compiling $lang_name..."

    $PYTHON_CMD << PYEOF
import tree_sitter
import os

lang_path = '$lang_dir'
output_path = os.path.join('$LANGUAGES_DIR', '${lang_name}.so')

tree_sitter.Language.build_library(
    output_path,
    [lang_path]
)
print(f'Built: {output_path}')
PYEOF

    if [[ $? -eq 0 ]]; then
        log_ok "Built $lang_name successfully!"
        return 0
    else
        log_error "Failed to build $lang_name"
        return 1
    fi
}

# =============================================================================
# CLEAN
# =============================================================================

clean_build_artifacts() {
    log_info "Cleaning build artifacts..."

    if [[ -d "$LANGUAGES_DIR" ]]; then
        rm -rf "$LANGUAGES_DIR"
        log_ok "Removed languages directory."
    fi

    # Remove __pycache__
    find "$AETHER_ROOT" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true

    log_ok "Cleaned build artifacts."
}

# =============================================================================
# HELP
# =============================================================================

show_help() {
    cat << 'EOF'

  ___        _   _                 ____        _ _     _
 / _ \      | | | |               |  _ \      (_) |   | |
/ /_\ \ ___ | |_| |__   ___ _ __  | |_) |_   _ _| | __| |
|  _  |/ _ \| __| '_ \ / _ \ '__| |  _ <| | | | | |/ _` |
| | | |  __/| |_| | | |  __/ |    | |_) | |_| | | | (_| |
\_| |_/\___| \__|_| |_|\___|_|    |____/ \__,_|_|_|\__,_|

  Tree-sitter Language Builder for Linux/WSL

USAGE:
  ./build_languages.sh              Install pre-built languages (recommended)
  ./build_languages.sh <language>   Build specific language from source
  ./build_languages.sh --clean      Clean build artifacts
  ./build_languages.sh --force      Force rebuild
  ./build_languages.sh --help       Show this help

AVAILABLE LANGUAGES FOR MANUAL BUILD:
  python, javascript, typescript, go, rust, c, cpp, java, ruby, php

NOTE:
  The tree-sitter-languages package includes 100+ pre-compiled languages.
  Manual building is only needed for custom or unsupported languages.

EXAMPLES:
  ./build_languages.sh                    # Install pre-built (recommended)
  ./build_languages.sh rust               # Build Rust parser from source
  ./build_languages.sh python --force     # Force rebuild Python parser

EOF
}

# =============================================================================
# MAIN
# =============================================================================

main() {
    local language=""
    local clean=false
    local force=false

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --clean|-c)
                clean=true
                shift
                ;;
            --force|-f)
                force=true
                export FORCE=true
                shift
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                language="$1"
                shift
                ;;
        esac
    done

    echo -e "${CYAN}"
    cat << 'BANNER'

  ___        _   _                 ____        _ _     _
 / _ \      | | | |               |  _ \      (_) |   | |
/ /_\ \ ___ | |_| |__   ___ _ __  | |_) |_   _ _| | __| |
|  _  |/ _ \| __| '_ \ / _ \ '__| |  _ <| | | | | |/ _` |
| | | |  __/| |_| | | |  __/ |    | |_) | |_| | | | (_| |
\_| |_/\___| \__|_| |_|\___|_|    |____/ \__,_|_|_|\__,_|

  Tree-sitter Language Builder for Linux/WSL

BANNER
    echo -e "${NC}"

    if $clean; then
        clean_build_artifacts
        exit 0
    fi

    # Create languages directory
    mkdir -p "$LANGUAGES_DIR"

    # Check prerequisites
    check_prerequisites

    # Setup venv
    setup_venv

    if [[ -z "$language" ]]; then
        # Install pre-built languages (recommended)
        install_tree_sitter_languages
    else
        # Build specific language
        declare -A known_languages=(
            ["python"]="https://github.com/tree-sitter/tree-sitter-python"
            ["javascript"]="https://github.com/tree-sitter/tree-sitter-javascript"
            ["typescript"]="https://github.com/tree-sitter/tree-sitter-typescript"
            ["go"]="https://github.com/tree-sitter/tree-sitter-go"
            ["rust"]="https://github.com/tree-sitter/tree-sitter-rust"
            ["c"]="https://github.com/tree-sitter/tree-sitter-c"
            ["cpp"]="https://github.com/tree-sitter/tree-sitter-cpp"
            ["java"]="https://github.com/tree-sitter/tree-sitter-java"
            ["ruby"]="https://github.com/tree-sitter/tree-sitter-ruby"
            ["php"]="https://github.com/tree-sitter/tree-sitter-php"
        )

        if [[ -n "${known_languages[$language]:-}" ]]; then
            build_custom_language "$language" "${known_languages[$language]}"
        else
            log_error "Unknown language: $language"
            log_info "Known languages: ${!known_languages[*]}"
            log_info "Or use tree-sitter-languages package which includes 100+ languages."
            exit 1
        fi
    fi

    echo ""
    log_ok "Build complete!"
    log_info "Run 'pip install tree-sitter-languages' for pre-built support."
}

main "$@"
