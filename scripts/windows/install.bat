@echo off
REM ============================================================
REM Nemons Installer for Windows (CMD batch fallback)
REM Use only if PowerShell is unavailable
REM ============================================================

echo ============================================================
echo   Nemons Installer for Windows (CMD fallback)
echo ============================================================
echo.

REM Check Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js not found. Install from https://nodejs.org
    exit /b 1
)
echo [OK] Node.js found
node --version

REM Check npm
where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] npm not found
    exit /b 1
)
echo [OK] npm found
call npm --version

REM Create home directory
set NEMONS_HOME=%USERPROFILE%\.nemons
echo [INFO] Nemons home: %NEMONS_HOME%

if not exist "%NEMONS_HOME%\config" mkdir "%NEMONS_HOME%\config"
if not exist "%NEMONS_HOME%\logs" mkdir "%NEMONS_HOME%\logs"
if not exist "%NEMONS_HOME%\experiences" mkdir "%NEMONS_HOME%\experiences"
if not exist "%NEMONS_HOME%\evidence" mkdir "%NEMONS_HOME%\evidence"
if not exist "%NEMONS_HOME%\run" mkdir "%NEMONS_HOME%\run"
if not exist "%NEMONS_HOME%\audit" mkdir "%NEMONS_HOME%\audit"
if not exist "%NEMONS_HOME%\context-packs" mkdir "%NEMONS_HOME%\context-packs"
if not exist "%NEMONS_HOME%\plugins" mkdir "%NEMONS_HOME%\plugins"

echo [OK] Directories created

REM Get script directory
set SCRIPT_DIR=%~dp0
set PROJECT_ROOT=%SCRIPT_DIR%..\..\

REM Copy config files
if exist "%PROJECT_ROOT%config\daemon.yml" (
    copy "%PROJECT_ROOT%config\daemon.yml" "%NEMONS_HOME%\config\daemon.yml" >nul
    echo [OK] Copied: daemon.yml
)
if exist "%PROJECT_ROOT%governance\governance-rules.yml" (
    copy "%PROJECT_ROOT%governance\governance-rules.yml" "%NEMONS_HOME%\config\governance-rules.yml" >nul
    echo [OK] Copied: governance-rules.yml
)

REM Install CLI from local directory
set CLI_DIR=%PROJECT_ROOT%nemons
if exist "%CLI_DIR%\package.json" (
    echo [INFO] Installing CLI dependencies...
    pushd "%CLI_DIR%"
    call npm install --production
    echo [INFO] Linking CLI globally...
    call npm link
    popd
    echo [OK] CLI installed
) else (
    echo [WARN] CLI directory not found: %CLI_DIR%
    echo [INFO] Trying npm install...
    call npm install -g "@nemons/cli"
)

REM Start daemon
echo [INFO] Starting daemon...
set NEMONS_HOME=%NEMONS_HOME%
call nemons daemon start

REM Verify
echo [INFO] Running verification...
call nemons verify

echo.
echo ============================================================
echo   Nemons installation complete!
echo ============================================================
echo.
echo Next steps:
echo   1. Open dashboard: http://localhost:3456
echo   2. Check logs:     type "%NEMONS_HOME%\logs\daemon.log"
echo   3. List experiences: nemons experiences list
echo.
pause
