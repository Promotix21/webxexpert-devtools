<#
.SYNOPSIS
    Aether - Cross-platform Code Intelligence Tool (PowerShell Interface)

.DESCRIPTION
    PowerShell wrapper for the Aether Python engine.
    Provides IDE-like symbol navigation, code modification, and AI-assisted workflows.

.NOTES
    Author: Aether Project
    Requires: Python 3.10+, tree-sitter-languages

.EXAMPLE
    .\Aether.ps1 list-symbols
    .\Aether.ps1 read-symbol ProcessUserData
    .\Aether.ps1 find-refs ProcessUserData
    .\Aether.ps1 replace-symbol MyFunc -Code "def MyFunc(): pass" -DryRun
#>

[CmdletBinding()]
param()

# =============================================================================
# CONFIGURATION
# =============================================================================

$script:AetherRoot = $PSScriptRoot
$script:EnginePath = Join-Path $AetherRoot "aether_engine.py"
$script:VenvPath = Join-Path $AetherRoot "venv"
$script:PythonExe = $null

# UTF-8 Configuration
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONUTF8 = "1"
chcp 65001 | Out-Null

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

function Write-AetherLog {
    param(
        [string]$Message,
        [ValidateSet("INFO", "WARN", "ERROR", "DEBUG")]
        [string]$Level = "INFO"
    )

    $color = switch ($Level) {
        "INFO"  { "Cyan" }
        "WARN"  { "Yellow" }
        "ERROR" { "Red" }
        "DEBUG" { "Gray" }
    }

    Write-Host "[AETHER:$Level] $Message" -ForegroundColor $color
}

function Find-Python {
    # Check for venv first
    $venvPython = Join-Path $script:VenvPath "Scripts\python.exe"
    if (Test-Path $venvPython) {
        return $venvPython
    }

    # Check common Python locations
    $pythonPaths = @(
        "python",
        "python3",
        "py -3",
        "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python310\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
        "C:\Python311\python.exe",
        "C:\Python310\python.exe"
    )

    foreach ($path in $pythonPaths) {
        try {
            $result = & $path --version 2>&1
            if ($LASTEXITCODE -eq 0) {
                return $path
            }
        } catch {
            continue
        }
    }

    return $null
}

function Initialize-Aether {
    # Find Python
    $script:PythonExe = Find-Python

    if (-not $script:PythonExe) {
        Write-AetherLog "Python 3.10+ not found. Please install Python." "ERROR"
        Write-AetherLog "Download from: https://www.python.org/downloads/" "INFO"
        return $false
    }

    # Check if engine exists
    if (-not (Test-Path $script:EnginePath)) {
        Write-AetherLog "Engine not found at: $script:EnginePath" "ERROR"
        return $false
    }

    # Check for tree-sitter-languages
    $checkCmd = "import tree_sitter_languages; print('OK')"
    $result = & $script:PythonExe -c $checkCmd 2>&1

    if ($result -ne "OK") {
        Write-AetherLog "tree-sitter-languages not installed." "WARN"
        Write-AetherLog "Installing dependencies..." "INFO"

        & $script:PythonExe -m pip install -r (Join-Path $script:AetherRoot "requirements.txt") --quiet

        if ($LASTEXITCODE -ne 0) {
            Write-AetherLog "Failed to install dependencies." "ERROR"
            return $false
        }
    }

    return $true
}

function Invoke-AetherEngine {
    param(
        [Parameter(Mandatory)]
        [string[]]$Arguments,
        [string]$ProjectPath = "."
    )

    if (-not $script:PythonExe) {
        if (-not (Initialize-Aether)) {
            return $null
        }
    }

    $fullArgs = @($script:EnginePath, "--project", $ProjectPath) + $Arguments

    try {
        $result = & $script:PythonExe @fullArgs 2>&1
        return $result | Out-String
    } catch {
        Write-AetherLog "Engine error: $_" "ERROR"
        return $null
    }
}

function Format-AetherOutput {
    param(
        [string]$JsonOutput,
        [switch]$Raw
    )

    if ($Raw) {
        return $JsonOutput
    }

    try {
        $data = $JsonOutput | ConvertFrom-Json
        return $data
    } catch {
        return $JsonOutput
    }
}

# =============================================================================
# PUBLIC FUNCTIONS
# =============================================================================

function Get-AetherSymbols {
    <#
    .SYNOPSIS
        List all symbols in the project.
    .PARAMETER Type
        Filter by symbol type (function, class, method, etc.)
    .PARAMETER File
        Filter by file path (partial match)
    .PARAMETER Name
        Filter by symbol name (partial match)
    .PARAMETER Project
        Project root directory (default: current directory)
    #>
    [CmdletBinding()]
    param(
        [string]$Type,
        [string]$File,
        [string]$Name,
        [string]$Project = "."
    )

    $args = @("list_symbols")
    if ($Type) { $args += @("--type", $Type) }
    if ($File) { $args += @("--file", $File) }
    if ($Name) { $args += @("--name", $Name) }

    $result = Invoke-AetherEngine -Arguments $args -ProjectPath $Project
    Format-AetherOutput $result
}

function Get-AetherSymbol {
    <#
    .SYNOPSIS
        Read the code of a specific symbol.
    .PARAMETER Name
        Symbol name or full ID (e.g., "ProcessUserData" or "src/auth.ts::AuthService::login")
    .PARAMETER Project
        Project root directory
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Name,
        [string]$Project = "."
    )

    $result = Invoke-AetherEngine -Arguments @("read_symbol", $Name) -ProjectPath $Project
    $data = Format-AetherOutput $result

    if ($data.success) {
        Write-Host "`n=== $($data.symbol.name) ($($data.symbol.type)) ===" -ForegroundColor Green
        Write-Host "File: $($data.symbol.file):$($data.symbol.start_line)-$($data.symbol.end_line)" -ForegroundColor Gray
        Write-Host ""
        Write-Host $data.code
        Write-Host ""
    } else {
        Write-AetherLog $data.message "ERROR"
        if ($data.matches) {
            Write-Host "Did you mean one of these?" -ForegroundColor Yellow
            $data.matches | ForEach-Object {
                Write-Host "  - $($_.id)" -ForegroundColor Cyan
            }
        }
    }

    return $data
}

function Find-AetherRefs {
    <#
    .SYNOPSIS
        Find all references to a symbol.
    .PARAMETER Name
        Symbol name to search for
    .PARAMETER Project
        Project root directory
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Name,
        [string]$Project = "."
    )

    $result = Invoke-AetherEngine -Arguments @("find_references", $Name) -ProjectPath $Project
    $data = Format-AetherOutput $result

    if ($data.success) {
        Write-Host "`nFound $($data.total_references) references to '$Name':" -ForegroundColor Green
        Write-Host ""

        $data.references | ForEach-Object {
            $prefix = if ($_.is_definition) { "[DEF]" } elseif ($_.is_import) { "[IMP]" } else { "     " }
            $color = if ($_.is_definition) { "Yellow" } elseif ($_.is_import) { "Cyan" } else { "White" }
            Write-Host "$prefix $($_.file):$($_.line)" -ForegroundColor $color -NoNewline
            Write-Host " | $($_.context)" -ForegroundColor Gray
        }
        Write-Host ""
    }

    return $data
}

function Edit-AetherSymbol {
    <#
    .SYNOPSIS
        Replace a symbol's code.
    .PARAMETER Name
        Symbol name or ID to replace
    .PARAMETER NewCode
        New code to replace with
    .PARAMETER DryRun
        Preview changes without applying (default: true)
    .PARAMETER Project
        Project root directory
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Name,
        [Parameter(Mandatory)]
        [string]$NewCode,
        [switch]$Apply,
        [string]$Project = "."
    )

    $args = @("replace_symbol", $Name, "--code", $NewCode)
    if ($Apply) { $args += "--apply" }

    $result = Invoke-AetherEngine -Arguments $args -ProjectPath $Project
    $data = Format-AetherOutput $result

    if ($data.success) {
        Write-Host "`n=== Diff Preview ===" -ForegroundColor Yellow
        Write-Host $data.diff
        Write-Host ""

        if (-not $Apply) {
            Write-Host "This is a DRY RUN. Use -Apply to make changes." -ForegroundColor Cyan

            $confirm = Read-Host "Apply changes? (y/N)"
            if ($confirm -eq "y" -or $confirm -eq "Y") {
                $args += "--apply"
                $result = Invoke-AetherEngine -Arguments $args -ProjectPath $Project
                $data = Format-AetherOutput $result
                Write-Host $data.message -ForegroundColor Green
            }
        } else {
            Write-Host $data.message -ForegroundColor Green
        }
    } else {
        Write-AetherLog $data.message "ERROR"
    }

    return $data
}

function Add-AetherCodeBefore {
    <#
    .SYNOPSIS
        Insert code before a symbol.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Symbol,
        [Parameter(Mandatory)]
        [string]$Code,
        [switch]$Apply,
        [string]$Project = "."
    )

    $args = @("insert_before", $Symbol, "--code", $Code)
    if ($Apply) { $args += "--apply" }

    $result = Invoke-AetherEngine -Arguments $args -ProjectPath $Project
    Format-AetherOutput $result
}

function Add-AetherCodeAfter {
    <#
    .SYNOPSIS
        Insert code after a symbol.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Symbol,
        [Parameter(Mandatory)]
        [string]$Code,
        [switch]$Apply,
        [string]$Project = "."
    )

    $args = @("insert_after", $Symbol, "--code", $Code)
    if ($Apply) { $args += "--apply" }

    $result = Invoke-AetherEngine -Arguments $args -ProjectPath $Project
    Format-AetherOutput $result
}

function Rename-AetherSymbol {
    <#
    .SYNOPSIS
        Rename a symbol across the entire codebase.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$OldName,
        [Parameter(Mandatory)]
        [string]$NewName,
        [switch]$Apply,
        [string]$Project = "."
    )

    $args = @("rename_symbol", $OldName, $NewName)
    if ($Apply) { $args += "--apply" }

    $result = Invoke-AetherEngine -Arguments $args -ProjectPath $Project
    $data = Format-AetherOutput $result

    if ($data.success) {
        Write-Host "`nRename '$OldName' -> '$NewName'" -ForegroundColor Green
        Write-Host "Files affected: $($data.files_affected)" -ForegroundColor Cyan
        Write-Host "Total replacements: $($data.total_replacements)" -ForegroundColor Cyan

        if ($data.changes) {
            $data.changes | ForEach-Object {
                Write-Host "`n--- $($_.file) ($($_.replacements) changes) ---" -ForegroundColor Yellow
                Write-Host $_.diff -ForegroundColor Gray
            }
        }

        if (-not $Apply) {
            Write-Host "`nThis is a DRY RUN. Use -Apply to make changes." -ForegroundColor Cyan
        }
    }

    return $data
}

function Get-AetherOverview {
    <#
    .SYNOPSIS
        Get symbol overview for a file.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$File,
        [string]$Project = "."
    )

    $result = Invoke-AetherEngine -Arguments @("symbols_overview", $File) -ProjectPath $Project
    Format-AetherOutput $result
}

function Search-Aether {
    <#
    .SYNOPSIS
        Search for a pattern across the codebase.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Pattern,
        [switch]$Literal,
        [switch]$IgnoreCase,
        [int]$MaxResults = 100,
        [string]$Project = "."
    )

    $args = @("search", $Pattern, "--max-results", $MaxResults)
    if ($Literal) { $args += "--no-regex" }
    if ($IgnoreCase) { $args += "--ignore-case" }

    $result = Invoke-AetherEngine -Arguments $args -ProjectPath $Project
    $data = Format-AetherOutput $result

    if ($data.success -and $data.results) {
        Write-Host "`nFound $($data.total_matches) matches for '$Pattern':" -ForegroundColor Green
        if ($data.truncated) {
            Write-Host "(Results truncated to $MaxResults)" -ForegroundColor Yellow
        }
        Write-Host ""

        $data.results | ForEach-Object {
            Write-Host "$($_.file):$($_.line):$($_.column)" -ForegroundColor Cyan -NoNewline
            Write-Host " | $($_.context)" -ForegroundColor Gray
        }
    }

    return $data
}

# Memory Functions
function Write-AetherMemory {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Name,
        [Parameter(Mandatory)]
        [string]$Content,
        [string[]]$Tags = @(),
        [string]$Project = "."
    )

    $args = @("write_memory", $Name, "--content", $Content)
    if ($Tags.Count -gt 0) { $args += @("--tags", ($Tags -join ",")) }

    $result = Invoke-AetherEngine -Arguments $args -ProjectPath $Project
    Format-AetherOutput $result
}

function Read-AetherMemory {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Name,
        [string]$Project = "."
    )

    $result = Invoke-AetherEngine -Arguments @("read_memory", $Name) -ProjectPath $Project
    Format-AetherOutput $result
}

function Get-AetherMemories {
    [CmdletBinding()]
    param(
        [string]$Tag,
        [string]$Project = "."
    )

    $args = @("list_memories")
    if ($Tag) { $args += $Tag }

    $result = Invoke-AetherEngine -Arguments $args -ProjectPath $Project
    Format-AetherOutput $result
}

function Remove-AetherMemory {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Name,
        [string]$Project = "."
    )

    $result = Invoke-AetherEngine -Arguments @("delete_memory", $Name) -ProjectPath $Project
    Format-AetherOutput $result
}

# Project Functions
function Initialize-AetherProject {
    <#
    .SYNOPSIS
        Onboard/analyze a project.
    #>
    [CmdletBinding()]
    param(
        [switch]$Force,
        [string]$Project = "."
    )

    $args = @("onboard")
    if ($Force) { $args += "--force" }

    $result = Invoke-AetherEngine -Arguments $args -ProjectPath $Project
    $data = Format-AetherOutput $result

    if ($data.success) {
        $info = $data.project_info
        Write-Host "`n=== Project: $($info.name) ===" -ForegroundColor Green
        Write-Host "Languages: $($info.languages -join ', ')" -ForegroundColor Cyan
        Write-Host "Frameworks: $($info.frameworks -join ', ')" -ForegroundColor Cyan
        Write-Host "Total Files: $($info.total_files)" -ForegroundColor Gray

        if ($info.build_commands) {
            Write-Host "`nBuild Commands:" -ForegroundColor Yellow
            $info.build_commands.PSObject.Properties | ForEach-Object {
                Write-Host "  $($_.Name): $($_.Value)" -ForegroundColor Gray
            }
        }
    }

    return $data
}

function Get-AetherProjectStatus {
    [CmdletBinding()]
    param([string]$Project = ".")

    $result = Invoke-AetherEngine -Arguments @("check_onboarding") -ProjectPath $Project
    Format-AetherOutput $result
}

function Update-AetherIndex {
    <#
    .SYNOPSIS
        Re-index the project.
    #>
    [CmdletBinding()]
    param([string]$Project = ".")

    Write-AetherLog "Indexing project..." "INFO"
    $result = Invoke-AetherEngine -Arguments @("index") -ProjectPath $Project
    $data = Format-AetherOutput $result

    if ($data.success) {
        Write-Host "`nIndexing complete!" -ForegroundColor Green
        Write-Host "Files processed: $($data.files_processed)" -ForegroundColor Cyan
        Write-Host "Total symbols: $($data.total_symbols)" -ForegroundColor Cyan

        if ($data.languages) {
            Write-Host "Languages:" -ForegroundColor Yellow
            $data.languages.PSObject.Properties | ForEach-Object {
                Write-Host "  $($_.Name): $($_.Value) files" -ForegroundColor Gray
            }
        }
    }

    return $data
}

# =============================================================================
# CLI INTERFACE
# =============================================================================

function Show-AetherHelp {
    Write-Host @"

  ___        _   _
 / _ \      | | | |
/ /_\ \ ___ | |_| |__   ___ _ __
|  _  |/ _ \| __| '_ \ / _ \ '__|
| | | |  __/| |_| | | |  __/ |
\_| |_/\___| \__|_| |_|\___|_|

Aether - AST-based Code Intelligence

COMMANDS:
  Get-AetherSymbols         List all symbols
  Get-AetherSymbol          Read a symbol's code
  Get-AetherOverview        Get file symbol overview
  Find-AetherRefs           Find all references
  Search-Aether             Search with regex/literal

  Edit-AetherSymbol         Replace symbol code
  Add-AetherCodeBefore      Insert before symbol
  Add-AetherCodeAfter       Insert after symbol
  Rename-AetherSymbol       Rename across codebase

  Write-AetherMemory        Save a memory
  Read-AetherMemory         Read a memory
  Get-AetherMemories        List memories
  Remove-AetherMemory       Delete a memory

  Initialize-AetherProject  Onboard project
  Update-AetherIndex        Re-index project
  Get-AetherProjectStatus   Check onboarding

EXAMPLES:
  Get-AetherSymbols -Type function
  Get-AetherSymbol ProcessUserData
  Find-AetherRefs "MyClass"
  Edit-AetherSymbol MyFunc -NewCode "def MyFunc(): pass" -Apply
  Rename-AetherSymbol oldName newName -Apply
  Search-Aether "TODO|FIXME"

"@ -ForegroundColor Cyan
}

# Export functions
Export-ModuleMember -Function @(
    'Get-AetherSymbols',
    'Get-AetherSymbol',
    'Get-AetherOverview',
    'Find-AetherRefs',
    'Search-Aether',
    'Edit-AetherSymbol',
    'Add-AetherCodeBefore',
    'Add-AetherCodeAfter',
    'Rename-AetherSymbol',
    'Write-AetherMemory',
    'Read-AetherMemory',
    'Get-AetherMemories',
    'Remove-AetherMemory',
    'Initialize-AetherProject',
    'Update-AetherIndex',
    'Get-AetherProjectStatus',
    'Show-AetherHelp'
)

# Show help if run directly
if ($MyInvocation.InvocationName -ne '.') {
    Show-AetherHelp
}
