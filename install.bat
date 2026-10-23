@echo off
setlocal enabledelayedexpansion
title Nemos Installer v4.2.0

echo.
echo ============================================================
echo   Nemos v4.2.0 - Final Release
echo   Transparent Orchestration Layer for Coding Agents
echo ============================================================
echo.

set NEMOS_BIN=%~dp0nemos\bin\nemos.js

echo [1/8] Checking Node.js...
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js not found. Install from https://nodejs.org
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do echo   Node.js %%v

echo.
echo [2/8] Checking npm...
where npm >nul 2>nul
if errorlevel 1 (
    echo [ERROR] npm not found
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('npm -v') do echo   npm %%v

echo.
echo [3/8] Verifying installation file...
if not exist "%NEMOS_BIN%" (
    echo [ERROR] Cannot find: %NEMOS_BIN%
    echo The extraction was incomplete. Please:
    echo   1. Delete C:\nemos-project folder completely
    echo   2. Re-extract the v4.2.0 archive
    echo   3. Run install.bat again
    pause
    exit /b 1
)
echo   Found: %NEMOS_BIN%

echo.
echo [4/8] Installing dependencies...
pushd "%~dp0nemos"
call npm install --omit=dev
if errorlevel 1 (
    echo [ERROR] npm install failed
    popd
    pause
    exit /b 1
)
popd
echo   Dependencies installed

echo.
echo [5/8] Setting up Nemos home directory...
set NEMONS_HOME=%USERPROFILE%\.nemos
if not exist "%NEMONS_HOME%\config" mkdir "%NEMONS_HOME%\config"
if not exist "%NEMONS_HOME%\logs" mkdir "%NEMONS_HOME%\logs"
if not exist "%NEMONS_HOME%\experiences" mkdir "%NEMONS_HOME%\experiences"
if not exist "%NEMONS_HOME%\evidence" mkdir "%NEMONS_HOME%\evidence"
if not exist "%NEMONS_HOME%\run" mkdir "%NEMONS_HOME%\run"
if not exist "%NEMONS_HOME%\audit" mkdir "%NEMONS_HOME%\audit"
if not exist "%NEMONS_HOME%\context-packs" mkdir "%NEMONS_HOME%\context-packs"
if not exist "%NEMONS_HOME%\plugins" mkdir "%NEMONS_HOME%\plugins"
if exist "%~dp0config\daemon.yml" copy /y "%~dp0config\daemon.yml" "%NEMONS_HOME%\config\" >nul
if exist "%~dp0governance\governance-rules.yml" copy /y "%~dp0governance\governance-rules.yml" "%NEMONS_HOME%\config\" >nul
echo   Home: %NEMONS_HOME%

echo.
echo [6/8] Linking CLI globally (optional)...
pushd "%~dp0nemos"
call npm link 2>nul
popd
echo   Done (you can also use node directly)

echo.
echo [7/8] Starting daemon...
set NEMONS_HOME=%NEMONS_HOME%
echo   Running: node "%NEMOS_BIN%" daemon start
node "%NEMOS_BIN%" daemon start

echo.
echo [8/8] Verifying installation...
timeout /t 3 >nul
node "%NEMOS_BIN%" health

echo.
echo ============================================================
echo   Installation Complete!
echo ============================================================
echo.
echo   Dashboard:  http://localhost:3456
echo   Home:        %NEMONS_HOME%
echo   Binary:      %NEMOS_BIN%
echo.
echo   Quick commands (double-click these .bat files):
echo     start.bat       - Start daemon + open dashboard
echo     stop.bat        - Stop daemon
echo     verify.bat      - Run tests
echo     dashboard.bat   - Open dashboard
echo     plugin-install.bat - Install plugin for OpenCode
echo.
echo   Or from any CMD:
echo     node "%NEMOS_BIN%" daemon start
echo     node "%NEMOS_BIN%" health
echo     node "%NEMOS_BIN%" verify
echo     node "%NEMOS_BIN%" plugin install --agent opencode
echo.
echo Press any key to open dashboard...
pause >nul
start http://localhost:3456
