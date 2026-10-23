#!/usr/bin/env pwsh
# ============================================================
# Nemons Installer for Windows (PowerShell)
# Requires: Windows 10/11, PowerShell 5.1+ or PowerShell 7+
# ============================================================
#Requires -Version 5.1

[CmdletBinding()]
param(
    [switch]$Npm,
    [switch]$Local,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

# ---------- Helper functions ----------
function Write-Step  { param($msg) Write-Host "[Nemons] $msg" -ForegroundColor Cyan }
function Write-Ok    { param($msg) Write-Host "  ✓ $msg" -ForegroundColor Green }
function Write-Warn  { param($msg) Write-Host "  ⚠ $msg" -ForegroundColor Yellow }
function Write-Err   { param($msg) Write-Host "  ✗ $msg" -ForegroundColor Red }

if ($Help) {
    Write-Host "Nemons Installer for Windows"
    Write-Host ""
    Write-Host "Usage: .\install.ps1 [-Npm] [-Local]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -Npm    Install CLI from npm registry (requires publishing)"
    Write-Host "  -Local  Install CLI from local directory (default)"
    Write-Host "  -Help   Show this help"
    exit 0
}

# Determine install source
if ($Npm) { $Source = "npm" } else { $Source = "local" }

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Nemons Installer for Windows" -ForegroundColor Cyan
Write-Host "  Source: $Source" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# ---------- 1. Pre-flight checks ----------
Write-Step "Step 1/8: Pre-flight checks..."

# Check PowerShell version
$PSVersion = $PSVersionTable.PSVersion.Major
if ($PSVersion -lt 5) {
    Write-Err "PowerShell 5.1+ required (found $PSVersion)"
    exit 1
}
Write-Ok "PowerShell $PSVersion"

# Check Node.js
try {
    $NodeVersion = (node --version) 2>$null
    if (-not $NodeVersion) { throw }
    $NodeMajor = [int]($NodeVersion -replace 'v(\d+).*', '$1')
    if ($NodeMajor -lt 18) {
        Write-Err "Node.js 18+ required (found $NodeVersion)"
        Write-Host "  Install from: https://nodejs.org"
        exit 1
    }
    Write-Ok "Node $NodeVersion"
} catch {
    Write-Err "Node.js not found"
    Write-Host "  Install from: https://nodejs.org"
    exit 1
}

# Check Git
try {
    $GitVersion = (git --version) 2>$null
    if ($GitVersion) {
        Write-Ok "Git $GitVersion"
    } else { throw }
} catch {
    Write-Warn "Git not found (optional, but recommended)"
}

# Check npm
try {
    $NpmVersion = (npm --version) 2>$null
    if ($NpmVersion) { Write-Ok "npm $NpmVersion" }
    else { throw }
} catch {
    Write-Err "npm not found"
    exit 1
}

# ---------- 2. Determine Nemons home directory ----------
Write-Step "Step 2/8: Setting up Nemons home directory..."

$NemonsHome = Join-Path $env:USERPROFILE ".nemons"
$ConfigDir = Join-Path $NemonsHome "config"
$LogsDir = Join-Path $NemonsHome "logs"
$ExperiencesDir = Join-Path $NemonsHome "experiences"
$EvidenceDir = Join-Path $NemonsHome "evidence"
$RunDir = Join-Path $NemonsHome "run"
$AuditDir = Join-Path $NemonsHome "audit"
$ContextPacksDir = Join-Path $NemonsHome "context-packs"
$PluginsDir = Join-Path $NemonsHome "plugins"

$Dirs = @($ConfigDir, $LogsDir, $ExperiencesDir, $EvidenceDir, $RunDir, $AuditDir, $ContextPacksDir, $PluginsDir)
foreach ($dir in $Dirs) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
}
Write-Ok "Home: $NemonsHome"

# ---------- 3. Copy configuration files ----------
Write-Step "Step 3/8: Copying configuration files..."

$ScriptRoot = Split-Path -Parent $PSCommandPath
$ProjectRoot = Split-Path -Parent $ScriptRoot

$ConfigFiles = @(
    @{ Src = "config\daemon.yml"; Dst = "$ConfigDir\daemon.yml" },
    @{ Src = "governance\governance-rules.yml"; Dst = "$ConfigDir\governance-rules.yml" }
)

foreach ($file in $ConfigFiles) {
    $srcPath = Join-Path $ProjectRoot $file.Src
    $dstPath = $file.Dst
    if (Test-Path $srcPath) {
        Copy-Item -Path $srcPath -Destination $dstPath -Force
        Write-Ok "Copied: $(Split-Path -Leaf $dstPath)"
    }
}

# ---------- 4. Install Nemons CLI ----------
Write-Step "Step 4/8: Installing Nemons CLI (source: $Source)..."

if ($Source -eq "npm") {
    # Install from npm
    try {
        npm install -g "@nemons/cli" 2>&1 | Out-Host
        Write-Ok "Installed from npm"
    } catch {
        Write-Err "npm install failed: $_"
        exit 1
    }
} else {
    # Install from local directory
    $CliDir = Join-Path $ProjectRoot "nemons"
    $PackageJson = Join-Path $CliDir "package.json"
    
    if (-not (Test-Path $PackageJson)) {
        Write-Err "CLI directory not found: $CliDir"
        Write-Host "  Make sure 'nemons/package.json' exists"
        exit 1
    }
    
    # Install dependencies
    Write-Host "  → Installing dependencies..."
    Push-Location $CliDir
    try {
        npm install --production 2>&1 | Out-Null
        Write-Ok "Dependencies installed"
    } catch {
        Write-Err "npm install failed: $_"
        exit 1
    } finally {
        Pop-Location
    }
    
    # Link globally
    Write-Host "  → Linking CLI globally..."
    Push-Location $CliDir
    try {
        npm link 2>&1 | Out-Null
        Write-Ok "CLI linked globally"
    } catch {
        Write-Warn "npm link failed (trying with admin)"
        Start-Process -FilePath "npm" -ArgumentList "link" -Verb RunAs -Wait
    } finally {
        Pop-Location
    }
}

# Verify CLI is accessible
$NemonsCmd = Get-Command nemons -ErrorAction SilentlyContinue
if (-not $NemonsCmd) {
    # Try npm global bin
    $NpmPrefix = (npm config get prefix 2>$null)
    $NemonsPath = Join-Path $NpmPrefix "nemons.cmd"
    if (Test-Path $NemonsPath) {
        # Add to PATH for current session
        $env:PATH = "$NpmPrefix;$env:PATH"
        Write-Ok "Nemons CLI accessible: $NemonsPath"
        Write-Warn "Add to PATH permanently: $NpmPrefix"
    } else {
        Write-Err "Cannot find 'nemons' command"
        exit 1
    }
} else {
    Write-Ok "Nemons CLI: $($NemonsCmd.Source)"
}

# ---------- 5. Start daemon ----------
Write-Step "Step 5/8: Starting Nemons daemon..."

$env:NEMONS_HOME = $NemonsHome
try {
    & nemons daemon start 2>&1 | Out-Host
    Write-Ok "Daemon started"
} catch {
    Write-Warn "Daemon start failed: $_"
    Write-Host "  Try manually: nemons daemon start"
}

# ---------- 6. Detect coding agents ----------
Write-Step "Step 6/8: Detecting installed coding agents..."

$Agents = @(
    @{ Cmd = "opencode"; Key = "opencode" },
    @{ Cmd = "claude"; Key = "claude-code" },
    @{ Cmd = "codex"; Key = "codex" },
    @{ Cmd = "kimi"; Key = "kimi" },
    @{ Cmd = "qodercli"; Key = "qoder" },
    @{ Cmd = "cline"; Key = "cline" }
)

$FoundAgents = @()
foreach ($agent in $Agents) {
    $cmd = Get-Command $agent.Cmd -ErrorAction SilentlyContinue
    if ($cmd) {
        $FoundAgents += $agent
        Write-Ok "Found: $($agent.Cmd)"
    }
}

if ($FoundAgents.Count -eq 0) {
    Write-Warn "No coding agents detected"
    Write-Host "  Install at least one: OpenCode, Claude Code, Codex, etc."
} else {
    Write-Ok "Detected $($FoundAgents.Count) agents"
}

# ---------- 7. Install plugins ----------
Write-Step "Step 7/8: Installing Nemons plugin in detected agents..."

foreach ($agent in $FoundAgents) {
    Write-Host "  → Installing plugin for $($agent.Key)..."
    try {
        & nemons plugin install --agent $agent.Key 2>&1 | Out-Null
        Write-Ok "Plugin installed: $($agent.Key)"
    } catch {
        Write-Warn "Failed for $($agent.Key): $_"
    }
}

# ---------- 8. Verify installation ----------
Write-Step "Step 8/8: End-to-end verification..."

try {
    & nemons verify 2>&1 | Out-Host
} catch {
    Write-Warn "Verification had issues"
}

# ---------- Schedule daemon to start on boot (optional) ----------
Write-Step "Optional: Setting up auto-start on login..."

$TaskName = "NemonsDaemon"
$TaskExists = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue

if (-not $TaskExists) {
    try {
        $Action = New-ScheduledTaskAction -Execute "nemons" -Argument "daemon start"
        $Trigger = New-ScheduledTaskTrigger -AtLogOn
        $Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
        Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description "Nemons daemon auto-start" -Force | Out-Null
        Write-Ok "Auto-start scheduled task created"
    } catch {
        Write-Warn "Could not create scheduled task (needs admin)"
        Write-Host "  Run PowerShell as Administrator to enable auto-start"
    }
} else {
    Write-Ok "Auto-start task already exists"
}

# ---------- Done ----------
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "✅ Nemons installation complete! (source: $Source)" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Open dashboard:    http://localhost:3456"
Write-Host "  2. Check logs:        Get-Content $LogsDir\daemon.log -Tail 20"
Write-Host "  3. List experiences:  nemons experiences list"
Write-Host "  4. Run verification:  nemons verify"
Write-Host ""

if ($FoundAgents.Count -gt 0) {
    Write-Host "Test transparent mode:" -ForegroundColor Cyan
    Write-Host "  cd your-project"
    Write-Host "  $($FoundAgents[0].Cmd)"
    Write-Host "  > implement a hello world function"
    Write-Host ""
    Write-Host "Nemons should auto-trigger on every prompt. 🎉" -ForegroundColor Green
} else {
    Write-Host "Install a coding agent (e.g. OpenCode) then run:" -ForegroundColor Cyan
    Write-Host "  nemons plugin install"
}
