# Nemons Installation Guide

Complete installation guide for **all operating systems**.

## 📋 Quick Reference

| OS | Installer | Uninstaller | Auto-Start |
|----|-----------|-------------|------------|
| **Linux** (Debian/Ubuntu/Fedora/Arch/Alpine) | `scripts/linux/install.sh` | `scripts/linux/uninstall.sh` | systemd |
| **macOS** (Intel + Apple Silicon) | `scripts/macos/install.command` | `scripts/macos/uninstall.command` | launchd |
| **Windows** (10/11) | `scripts/windows/install.ps1` (PowerShell) or `install.bat` (CMD) | `scripts/windows/uninstall.ps1` | Scheduled Task |
| **Auto-detect** | `scripts/install.sh` | `scripts/uninstall.sh` | OS-specific |

## 🚀 Universal Installer (Recommended)

The universal installer auto-detects your OS and runs the appropriate script:

```bash
# Linux / macOS
chmod +x scripts/install.sh
./scripts/install.sh              # local install (default)
./scripts/install.sh --npm       # install from npm

# Windows (PowerShell)
.\scripts\windows\install.ps1
# Or CMD fallback:
.\scripts\windows\install.bat
```

## 🐧 Linux

### Supported Distributions
- ✅ Debian / Ubuntu (apt)
- ✅ Fedora / RHEL / CentOS (dnf)
- ✅ Arch Linux (pacman)
- ✅ Alpine Linux (apk)

### Quick Install
```bash
chmod +x scripts/linux/install.sh
./scripts/linux/install.sh --local
```

### What it does:
1. Detects your Linux distribution
2. Checks Node.js 18+ and Git
3. Installs missing dependencies (curl, git) via your package manager
4. Creates `~/.nemons/` with all subdirectories
5. Copies `daemon.yml` and `governance-rules.yml` to `~/.nemons/config/`
6. Installs CLI dependencies (`npm install --production`)
7. Links CLI globally (`npm link`)
8. Installs systemd service at `/etc/systemd/system/nemons-daemon.service`
9. Enables + starts the service
10. Detects coding agents and installs plugins
11. Runs 10-test verification

### Auto-Start (systemd)
The installer sets up a systemd user service:
- **Service file**: `/etc/systemd/system/nemons-daemon.service`
- **Logs**: `~/.nemons/logs/daemon.log`
- **Auto-start on boot**: enabled

Commands:
```bash
sudo systemctl start nemons-daemon      # Start
sudo systemctl stop nemons-daemon       # Stop
sudo systemctl restart nemons-daemon     # Restart
sudo systemctl status nemons-daemon     # Status
sudo systemctl disable nemons-daemon    # Disable auto-start
sudo journalctl -u nemons-daemon -f     # View logs
```

## 🍎 macOS

### Supported Versions
- ✅ macOS 12+ (Monterey and later)
- ✅ Apple Silicon (M1/M2/M3)
- ✅ Intel-based Macs

### Quick Install
```bash
# Option 1: Double-click the file in Finder
open scripts/macos/install.command

# Option 2: Run from terminal
chmod +x scripts/macos/install.command
./scripts/macos/install.sh --local
```

### What it does:
1. Checks Node.js 18+ and Git
2. Checks for Homebrew (optional)
3. Creates `~/.nemons/` with all subdirectories
4. Copies config files
5. Installs CLI dependencies + `npm link`
6. Installs launchd plist at `~/Library/LaunchAgents/com.nemons.daemon.plist`
7. Loads the launchd agent
8. Detects coding agents and installs plugins
9. Runs 10-test verification

### Auto-Start (launchd)
The installer sets up a launchd agent:
- **Plist file**: `~/Library/LaunchAgents/com.nemons.daemon.plist`
- **Logs**: `~/.nemons/logs/daemon.log`
- **Auto-start on login**: enabled

Commands:
```bash
launchctl load ~/Library/LaunchAgents/com.nemons.daemon.plist   # Start
launchctl unload ~/Library/LaunchAgents/com.nemons.daemon.plist # Stop
launchctl list | grep nemons                                    # Status
tail -f ~/.nemons/logs/daemon.log                              # View logs
```

## 🪟 Windows

### Supported Versions
- ✅ Windows 10 (Build 19041+)
- ✅ Windows 11
- ✅ Windows Server 2019+

### Prerequisites
- **Node.js 18+** — Download from https://nodejs.org
- **PowerShell 5.1+** — Built into Windows 10+
- **Git for Windows** (optional, for evidence collection)

### Quick Install (PowerShell)
```powershell
# Run from PowerShell
.\scripts\windows\install.ps1
# Or with options:
.\scripts\windows\install.ps1 -Local    # Install from local directory (default)
.\scripts\windows\install.ps1 -Npm      # Install from npm registry
```

**Note**: If you get a script execution error, run:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Quick Install (CMD)
If PowerShell is unavailable, use the batch fallback:
```cmd
scripts\windows\install.bat
```

### What it does:
1. Checks PowerShell 5.1+, Node.js 18+, npm
2. Creates `%USERPROFILE%\.nemons\` with all subdirectories
3. Copies config files
4. Installs CLI dependencies + `npm link`
5. Starts the daemon (as background process)
6. Creates a Windows Scheduled Task for auto-start on login
7. Detects coding agents and installs plugins
8. Runs 10-test verification

### Auto-Start (Scheduled Task)
The installer creates a Windows Scheduled Task:
- **Task name**: `NemonsDaemon`
- **Trigger**: At user logon
- **Action**: `nemons daemon start`

Commands:
```powershell
# View task
Get-ScheduledTask -TaskName "NemonsDaemon"

# Start manually
Start-ScheduledTask -TaskName "NemonsDaemon"

# Stop
Stop-ScheduledTask -TaskName "NemonsDaemon"

# Remove
Unregister-ScheduledTask -TaskName "NemosDaemon" -Confirm:$false
```

Alternative (manual XML import):
```cmd
schtasks /Create /XML scripts\windows\nemons-windows-task.xml /TN "NemonsDaemon"
```

## 📥 After Installation

### Verify it works
```bash
nemons verify
# → Should show 10/10 tests passing ✓
```

### Open the dashboard
Open http://localhost:3456 in your browser.

### Test with your coding agent
```bash
# OpenCode
opencode
> implement a hello world function

# Or Claude Code
claude
> fix the bug in auth flow

# Or Codex CLI
codex
> refactor the API routes
```

Nemons will auto-trigger on every prompt. 🎉

## 🗑️ Uninstallation

### Universal Uninstaller
```bash
# Linux / macOS
./scripts/uninstall.sh                          # Keep data
./scripts/uninstall.sh --remove-data            # Remove data too

# Windows (PowerShell)
.\scripts\windows\uninstall.ps1
.\scripts\windows\uninstall.ps1 -RemoveData    # Remove data too
```

### OS-Specific Uninstallers
```bash
# Linux
./scripts/linux/uninstall.sh
./scripts/linux/uninstall.sh --remove-data

# macOS (double-click or terminal)
open scripts/macos/uninstall.command
./scripts/macos/uninstall.command --remove-data

# Windows (PowerShell)
.\scripts\windows\uninstall.ps1 -RemoveData -Force
```

## 🐛 Troubleshooting

### Common Issues

#### Linux: `npm link` fails with permission error
```bash
# Fix npm permissions
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc

# Then re-run installer
./scripts/linux/install.sh
```

#### macOS: "command not found: nemons"
```bash
# Add npm global bin to PATH
echo 'export PATH="/usr/local/bin:$(npm bin -g 2>/dev/null):$PATH"' >> ~/.zshrc
source ~/.zshrc

# Or use Homebrew Node
brew install node
```

#### Windows: "Running scripts is disabled on this system"
```powershell
# Run as Administrator
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope LocalMachine

# Or per-user
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

#### Windows: npm link fails
```powershell
# Run PowerShell as Administrator
# Then re-run installer
.\scripts\windows\install.ps1
```

#### Daemon won't start
```bash
# Check logs
tail -50 ~/.nemons/logs/daemon.log
tail -50 ~/.nemons/logs/daemon-error.log

# Check if port 3456 is in use
# Linux:
sudo lsof -i :3456
# macOS:
lsof -i :3456
# Windows:
netstat -ano | findstr :3456

# Kill conflicting process
# Linux/macOS:
kill -9 <PID>
# Windows:
taskkill /PID <PID> /F
```

### Getting Help

If you're still stuck:

1. **Check logs**: `~/.nemons/logs/daemon.log`
2. **Run verify**: `nemons verify` (gives detailed error messages)
3. **Open an issue**: https://github.com/your-org/nemons/issues
   - Include your OS, Node version, and the error message
   - Attach the log file content

## 📊 File Locations

| Path | OS | Purpose |
|------|-----|---------|
| `~/.nemons/config/daemon.yml` | All | Main configuration |
| `~/.nemons/config/governance-rules.yml` | All | Governance rules |
| `~/.nemons/logs/daemon.log` | All | Daemon logs |
| `~/.nemons/experiences/` | All | Stored experiences |
| `~/.nemons/evidence/` | All | Evidence files |
| `~/.nemons/context-packs/` | All | Context packs |
| `/etc/systemd/system/nemons-daemon.service` | Linux | systemd service |
| `~/Library/LaunchAgents/com.nemons.daemon.plist` | macOS | launchd plist |
| `NemosDaemon` (Scheduled Task) | Windows | Auto-start task |
