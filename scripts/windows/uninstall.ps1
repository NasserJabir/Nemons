#!/usr/bin/env pwsl
# ============================================================
# Nemons Uninstaller for Windows (PowerShell)
# Removes Nemons CLI, daemon, config, and scheduled task
# ============================================================
#Requires -Version 5.1

[CmdletBinding()]
param(
    [switch]$RemoveData,
    [switch]$Force
)

$ErrorActionPreference = "Stop"

function Write-Step { param($msg) Write-Host "[Nemons] $msg" -ForegroundColor Cyan }
function Write-Ok   { param($msg) Write-Host "  ✓ $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "  ⚠ $msg" -ForegroundColor Yellow }
function Write-Err  { param($msg) Write-Host "  ✗ $msg" -ForegroundColor Red }

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Nemons Uninstaller for Windows" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# ---------- 1. Stop daemon ----------
Write-Step "Step 1/4: Stopping daemon..."

try {
    & nemons daemon stop 2>&1 | Out-Null
    Write-Ok "Daemon stopped"
} catch {
    Write-Warn "Daemon not running or already stopped"
}

# ---------- 2. Remove scheduled task ----------
Write-Step "Step 2/4: Removing scheduled task..."

$TaskName = "NemonsDaemon"
$Task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($Task) {
    try {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Ok "Scheduled task removed"
    } catch {
        Write-Warn "Could not remove scheduled task (needs admin)"
    }
} else {
    Write-Ok "No scheduled task found"
}

# ---------- 3. Unlink CLI ----------
Write-Step "Step 3/4: Unlinking CLI..."

$CliDir = Join-Path $PSScriptRoot "..\..\nemons"
$CliDir = Resolve-Path $CliDir -ErrorAction SilentlyContinue

if ($CliDir -and (Test-Path (Join-Path $CliDir "package.json"))) {
    Push-Location $CliDir.Path
    try {
        npm unlink -g 2>&1 | Out-Null
        Write-Ok "CLI unlinked"
    } catch {
        Write-Warn "Unlink failed: $_"
    } finally {
        Pop-Location
    }
} else {
    # Try npm global uninstall
    try {
        npm uninstall -g "@nemons/cli" 2>&1 | Out-Null
        Write-Ok "CLI uninstalled from npm"
    } catch {
        Write-Warn "Could not uninstall CLI"
    }
}

# ---------- 4. Remove data ----------
Write-Step "Step 4/4: Removing data directory..."

$NemonsHome = Join-Path $env:USERPROFILE ".nemons"

if ($RemoveData -or $Force) {
    if (Test-Path $NemonsHome) {
        try {
            Remove-Item -Path $NemonsHome -Recurse -Force
            Write-Ok "Removed: $NemonsHome"
        } catch {
            Write-Warn "Could not remove: $_"
        }
    } else {
        Write-Ok "Data directory already gone"
    }
} else {
    Write-Warn "Keeping data directory: $NemonsHome"
    Write-Host "  To remove data too, run: .\uninstall.ps1 -RemoveData"
}

# ---------- Done ----------
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "✅ Nemons uninstallation complete!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
