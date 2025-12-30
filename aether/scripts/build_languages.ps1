<#
.SYNOPSIS
    Build tree-sitter language binaries for Windows.

.DESCRIPTION
    This script handles tree-sitter language compilation for Windows.
    NOTE: tree-sitter-languages package comes with pre-compiled binaries.
    This script is for custom language support or manual rebuilding.

.NOTES
    Requirements:
    - Visual Studio Build Tools 2019+ OR Visual Studio 2019+
    - Python 3.10+
    - Node.js (optional, for tree-sitter CLI)

.EXAMPLE
    .\build_languages.ps1
    .\build_languages.ps1 -Language python
#>

[CmdletBinding()]
param(
    [string]$Language,
    [switch]$Force,
    [switch]$Clean
)

$ErrorActionPreference = "Stop"

# Configuration
$ScriptDir = $PSScriptRoot
$AetherRoot = Split-Path $ScriptDir -Parent
$LanguagesDir = Join-Path $AetherRoot "languages"
$VenvPath = Join-Path $AetherRoot "venv"

# Colors
function Write-Info { Write-Host "[INFO] $args" -ForegroundColor Cyan }
function Write-Warn { Write-Host "[WARN] $args" -ForegroundColor Yellow }
function Write-Err { Write-Host "[ERROR] $args" -ForegroundColor Red }
function Write-Ok { Write-Host "[OK] $args" -ForegroundColor Green }

# =============================================================================
# PREREQUISITES CHECK
# =============================================================================

function Test-Prerequisites {
    Write-Info "Checking prerequisites..."

    # Python
    $python = Get-Command python -ErrorAction SilentlyContinue
    if (-not $python) {
        Write-Err "Python not found. Please install Python 3.10+."
        return $false
    }
    Write-Ok "Python found: $($python.Source)"

    # Visual Studio Build Tools
    $vsWhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
    if (Test-Path $vsWhere) {
        $vsPath = & $vsWhere -latest -property installationPath 2>$null
        if ($vsPath) {
            Write-Ok "Visual Studio found: $vsPath"
        }
    } else {
        Write-Warn "Visual Studio Build Tools not detected."
        Write-Warn "You may need to install Visual Studio Build Tools for compilation."
        Write-Info "Download from: https://visualstudio.microsoft.com/visual-cpp-build-tools/"
    }

    # pip/tree-sitter
    $treeSitter = python -c "import tree_sitter; print('OK')" 2>&1
    if ($treeSitter -ne "OK") {
        Write-Warn "tree-sitter not installed. Installing..."
        python -m pip install tree-sitter --quiet
    }

    return $true
}

# =============================================================================
# SETUP VIRTUAL ENVIRONMENT
# =============================================================================

function Initialize-Venv {
    if (-not (Test-Path $VenvPath)) {
        Write-Info "Creating virtual environment..."
        python -m venv $VenvPath
    }

    # Activate venv
    $activateScript = Join-Path $VenvPath "Scripts\Activate.ps1"
    if (Test-Path $activateScript) {
        . $activateScript
        Write-Ok "Virtual environment activated."
    }
}

# =============================================================================
# INSTALL PRE-BUILT LANGUAGES
# =============================================================================

function Install-TreeSitterLanguages {
    Write-Info "Installing tree-sitter-languages package..."

    # This package includes pre-compiled binaries for many languages
    pip install tree-sitter-languages --upgrade --quiet

    if ($LASTEXITCODE -eq 0) {
        Write-Ok "tree-sitter-languages installed successfully!"

        # List available languages
        $available = python -c @"
import tree_sitter_languages
langs = tree_sitter_languages.LANGUAGES
print('Available languages:')
for lang in sorted(langs):
    print(f'  - {lang}')
"@ 2>&1

        Write-Host $available -ForegroundColor Gray
        return $true
    } else {
        Write-Err "Failed to install tree-sitter-languages."
        return $false
    }
}

# =============================================================================
# BUILD CUSTOM LANGUAGE (Advanced)
# =============================================================================

function Build-CustomLanguage {
    param([string]$LanguageName, [string]$RepoUrl)

    Write-Info "Building custom language: $LanguageName"

    $langDir = Join-Path $LanguagesDir $LanguageName

    # Clone or update repo
    if (-not (Test-Path $langDir)) {
        Write-Info "Cloning $LanguageName grammar..."
        git clone $RepoUrl $langDir --depth 1
    } elseif ($Force) {
        Write-Info "Updating $LanguageName grammar..."
        Push-Location $langDir
        git pull
        Pop-Location
    }

    # Build with tree-sitter
    Write-Info "Compiling $LanguageName..."

    $buildScript = @"
import tree_sitter
import os

lang_path = r'$langDir'
output_path = os.path.join(r'$LanguagesDir', '${LanguageName}.so')

tree_sitter.Language.build_library(
    output_path,
    [lang_path]
)
print(f'Built: {output_path}')
"@

    $result = python -c $buildScript 2>&1

    if ($LASTEXITCODE -eq 0) {
        Write-Ok "Built $LanguageName successfully!"
        Write-Host $result -ForegroundColor Gray
        return $true
    } else {
        Write-Err "Failed to build $LanguageName"
        Write-Host $result -ForegroundColor Red
        return $false
    }
}

# =============================================================================
# CLEAN
# =============================================================================

function Clear-BuildArtifacts {
    Write-Info "Cleaning build artifacts..."

    if (Test-Path $LanguagesDir) {
        Remove-Item $LanguagesDir -Recurse -Force
        Write-Ok "Removed languages directory."
    }

    # Remove __pycache__
    Get-ChildItem $AetherRoot -Recurse -Directory -Filter "__pycache__" |
        Remove-Item -Recurse -Force

    Write-Ok "Cleaned build artifacts."
}

# =============================================================================
# MAIN
# =============================================================================

function Main {
    Write-Host @"

  ___        _   _                 ____        _ _     _
 / _ \      | | | |               |  _ \      (_) |   | |
/ /_\ \ ___ | |_| |__   ___ _ __  | |_) |_   _ _| | __| |
|  _  |/ _ \| __| '_ \ / _ \ '__| |  _ <| | | | | |/ _  |
| | | |  __/| |_| | | |  __/ |    | |_) | |_| | | | (_| |
\_| |_/\___| \__|_| |_|\___|_|    |____/ \__,_|_|_|\__,_|

  Tree-sitter Language Builder for Windows

"@ -ForegroundColor Cyan

    if ($Clean) {
        Clear-BuildArtifacts
        return
    }

    # Create languages directory
    if (-not (Test-Path $LanguagesDir)) {
        New-Item -ItemType Directory -Path $LanguagesDir -Force | Out-Null
    }

    # Check prerequisites
    if (-not (Test-Prerequisites)) {
        exit 1
    }

    # Initialize venv
    Initialize-Venv

    # Install pre-built languages (recommended)
    if (-not $Language) {
        Install-TreeSitterLanguages
    } else {
        # Build specific language (advanced)
        $knownLanguages = @{
            "python" = "https://github.com/tree-sitter/tree-sitter-python"
            "javascript" = "https://github.com/tree-sitter/tree-sitter-javascript"
            "typescript" = "https://github.com/tree-sitter/tree-sitter-typescript"
            "go" = "https://github.com/tree-sitter/tree-sitter-go"
            "rust" = "https://github.com/tree-sitter/tree-sitter-rust"
            "c" = "https://github.com/tree-sitter/tree-sitter-c"
            "cpp" = "https://github.com/tree-sitter/tree-sitter-cpp"
            "java" = "https://github.com/tree-sitter/tree-sitter-java"
            "ruby" = "https://github.com/tree-sitter/tree-sitter-ruby"
            "php" = "https://github.com/tree-sitter/tree-sitter-php"
        }

        if ($knownLanguages.ContainsKey($Language)) {
            Build-CustomLanguage -LanguageName $Language -RepoUrl $knownLanguages[$Language]
        } else {
            Write-Err "Unknown language: $Language"
            Write-Info "Known languages: $($knownLanguages.Keys -join ', ')"
            Write-Info "Or use tree-sitter-languages package which includes 100+ languages."
        }
    }

    Write-Host ""
    Write-Ok "Build complete!"
    Write-Info "Run 'pip install tree-sitter-languages' for pre-built support."
}

Main
