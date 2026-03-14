#Requires -Version 5.1
<#
.SYNOPSIS
  Authensor Installer — The open-source safety stack for AI agents.
.DESCRIPTION
  Installs the Authensor CLI globally via npm and optionally installs SafeClaw.
  Usage: irm https://raw.githubusercontent.com/authensor/authensor/main/install.ps1 | iex
.PARAMETER NoInteractive
  Skip all prompts (CI mode).
.PARAMETER WithSafeClaw
  Also install SafeClaw agent gating.
#>
param(
    [switch]$NoInteractive,
    [switch]$WithSafeClaw
)

$ErrorActionPreference = 'Stop'
$MinNode = 18

# ── Color helpers ─────────────────────────────────────────────────
function Write-Info  { param([string]$Msg) Write-Host "[info]  $Msg" -ForegroundColor Cyan }
function Write-Ok    { param([string]$Msg) Write-Host "[ok]    $Msg" -ForegroundColor Green }
function Write-Warn  { param([string]$Msg) Write-Host "[warn]  $Msg" -ForegroundColor Yellow }
function Write-Fail  { param([string]$Msg) Write-Host "[error] $Msg" -ForegroundColor Red; exit 1 }

# ── Banner ────────────────────────────────────────────────────────
function Show-Banner {
    Write-Host ""
    Write-Host "    _         _   _                               " -ForegroundColor Cyan
    Write-Host "   / \  _   _| |_| |__   ___ _ __  ___  ___  _ __" -ForegroundColor Cyan
    Write-Host "  / _ \| | | | __| '_ \ / _ \ '_ \/ __|/ _ \| '__|" -ForegroundColor Cyan
    Write-Host " / ___ \ |_| | |_| | | |  __/ | | \__ \ (_) | |  " -ForegroundColor Cyan
    Write-Host "/_/   \_\__,_|\__|_| |_|\___|_| |_|___/\___/|_|  " -ForegroundColor Cyan
    Write-Host ""
}

# ── OS detection ──────────────────────────────────────────────────
function Get-Platform {
    if ($env:WSL_DISTRO_NAME) { return "WSL" }
    if ($IsLinux)   { return "Linux" }
    if ($IsMacOS)   { return "macOS" }
    return "Windows"
}

# ── Prerequisite checks ──────────────────────────────────────────
function Assert-Node {
    $nodePath = Get-Command node -ErrorAction SilentlyContinue
    if (-not $nodePath) {
        Write-Fail "Node.js is not installed. Install Node.js >= $MinNode from https://nodejs.org"
    }
    $ver = (node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
    if ([int]$ver -lt $MinNode) {
        Write-Fail "Node.js v$ver found, but >= $MinNode is required. Please upgrade: https://nodejs.org"
    }
    $fullVer = (node --version).TrimStart('v')
    Write-Ok "Node.js v$fullVer detected"
}

function Assert-Npm {
    $npmPath = Get-Command npm -ErrorAction SilentlyContinue
    if (-not $npmPath) {
        Write-Fail "npm is not installed. It should ship with Node.js — try reinstalling Node."
    }
    $npmVer = npm --version
    Write-Ok "npm v$npmVer detected"
}

# ── Prompt helper ─────────────────────────────────────────────────
function Ask-Yes {
    param([string]$Question)
    if ($NoInteractive) { return $false }
    $answer = Read-Host "$Question [y/N]"
    return ($answer -match '^[yY](es)?$')
}

# ── Install packages ─────────────────────────────────────────────
function Install-AuthensorCLI {
    Write-Info "Installing authensor CLI globally..."
    try {
        npm install -g authensor
        Write-Ok "authensor CLI installed"
    } catch {
        Write-Fail "npm install failed: $_`nIf you see EACCES, see https://docs.npmjs.com/resolving-eacces-permissions-errors"
    }
}

function Install-SafeClaw {
    Write-Info "Installing @authensor/safeclaw globally..."
    try {
        npm install -g @authensor/safeclaw
        Write-Ok "SafeClaw installed"
    } catch {
        Write-Warn "SafeClaw install failed — you can retry later with: npm install -g @authensor/safeclaw"
    }
}

# ── Project init ──────────────────────────────────────────────────
function Invoke-AuthensorInit {
    $authCmd = Get-Command authensor -ErrorAction SilentlyContinue
    if ($authCmd) {
        Write-Info "Running authensor init..."
        try {
            authensor init
        } catch {
            Write-Warn "authensor init exited with an error — you can run it again manually"
        }
    } else {
        Write-Warn "authensor not found in PATH — open a new terminal and run 'authensor init'"
    }
}

# ── Next steps ────────────────────────────────────────────────────
function Show-NextSteps {
    Write-Host ""
    Write-Host "-- Next steps -----------------------------------------------" -ForegroundColor White
    Write-Host "  1. " -NoNewline; Write-Host "authensor init" -ForegroundColor Green -NoNewline; Write-Host "        Create a policy in the current project"
    Write-Host "  2. " -NoNewline; Write-Host "authensor dev" -ForegroundColor Green -NoNewline; Write-Host "         Start the local control plane"
    Write-Host "  3. " -NoNewline; Write-Host "authensor status" -ForegroundColor Green -NoNewline; Write-Host "      Verify everything is running"
    if ($WithSafeClaw -or $script:installedSafeClaw) {
        Write-Host "  4. " -NoNewline; Write-Host "safeclaw" -ForegroundColor Green -NoNewline; Write-Host "              Launch the gated agent"
    }
    Write-Host ""
    Write-Host "  Docs:    https://github.com/authensor/authensor"
    Write-Host "  Discord: https://discord.gg/authensor"
    Write-Host ""
}

# ── Main ──────────────────────────────────────────────────────────
$script:installedSafeClaw = $false

Show-Banner

$platform = Get-Platform
Write-Info "Detected OS: $platform"

Assert-Node
Assert-Npm

Install-AuthensorCLI

if ($WithSafeClaw) {
    Install-SafeClaw
    $script:installedSafeClaw = $true
} elseif (-not $NoInteractive) {
    if (Ask-Yes "Also install SafeClaw (local agent gating)?") {
        Install-SafeClaw
        $script:installedSafeClaw = $true
    }
}

if (-not $NoInteractive) {
    if (Ask-Yes "Run 'authensor init' now to set up this project?") {
        Invoke-AuthensorInit
    }
}

Show-NextSteps
Write-Ok "Installation complete."
