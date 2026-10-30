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

### Install the host adapter
Two adapters have been installed against real hosts. **Codex CLI** is verified end to
end; **Qoder IDE** is registered and read back, but the host did not connect during
validation (§ Qoder below).

```bash
nemons plugin install --agent codex
```

This registers the daemon with the host itself (`codex mcp add`), writes the
orchestrator skill to `$CODEX_HOME/skills/`, and then **reads the host's own view
back** before claiming anything. Expected output ends with lines like:

```
  ✓ Registered [mcp_servers.nemons] → http://127.0.0.1:3456/mcp
    transport=streamable_http auth=unsupported (confirmed via cli)
  ✓ Skill written and re-read: ~/.codex/skills/nemons-orchestrator/SKILL.md (6 endpoint reference(s) pointed at 127.0.0.1:3456)
  · codex doctor mcp.config: ok — MCP configuration is locally consistent (1 configured, 1 streamable_http)
```

`auth=unsupported` means the daemon answered the host's probe and asked for no token
(`NEMONS_AUTH_TOKEN` unset). If it is set, install wires `NEMONS_AUTH_TOKEN` as a
bearer var instead and the line reads `auth=bearer_token`. Use `--no-doctor` to skip
the host diagnostic (it also probes for updates), `--port <n>` for a non-default
daemon port, and `--home <dir>` to point at another `CODEX_HOME`.

Verify independently, at any time:

```bash
codex mcp list --json          # the host's own registry
codex doctor                   # mcp.config: "MCP configuration is locally consistent"
nemons plugin list --agent codex
nemons plugin remove --agent codex   # confirmed absent by read-back
```

For any other MCP-capable host, point its MCP client at `http://127.0.0.1:3456/mcp`.

### Qoder IDE — registered against the real host, host-side discovery not observed

Qoder IDE (1.37.0 here) has **no MCP CLI**: no `mcp add`, no `mcp list --json`, no
`doctor`, no reload command. Its user surface is one file, `~/.qoder/mcp.json`, and the
IDE proves it reads that file by storing its MD5 in
`%APPDATA%\Qoder\SharedClientCache\extension\local\mcp.json`. The installer therefore
merged the entry itself and reported two states separately — "saved" (proved from disk)
and "discovered by the host" (read from the IDE's own tool cache, which Nemons never
writes).

```powershell
$env:NEMONS_HOME = "<workspace>\.qoder-validation\nemons-home"   # isolated state
nemons daemon start
nemons plugin install --agent qoder --no-doctor
nemons plugin list --agent qoder
nemons plugin remove --agent qoder
```

Captured output on the validation machine (exit 0):

```
  QODER_HOME: C:\Users\Nasser Jabir\.qoder
  Host app:   Qoder IDE 1.37.0
  MCP url:    http://127.0.0.1:3456/mcp
  Auth:       daemon is open (NEMONS_AUTH_TOKEN unset) — no credential registered; re-run install if you enable auth
    · read-existing: ok
    · merge: ok
    · config-readback: ok
  ✓ Registered mcpServers.nemons → http://127.0.0.1:3456/mcp
    transport=streamable-http auth=none (read back from mcp.json)
    untouched alongside it: TestSprite
  ✓ Skill written and re-read: C:\Users\Nasser Jabir\.qoder\skills\nemons-orchestrator\SKILL.md (6 endpoint reference(s) pointed at 127.0.0.1:3456)
  · IDE tool cache does NOT list "nemons" yet (cache read, no entry) — that is expected: a written config is state 1, not a connection.
  ✓ Host-confirmed registrations: 1 / ~ Files staged, host not asked: 0 / ✗ Failed: 0
```

What that does **not** entitle you to claim: the IDE never sent a single request to
`/mcp` during validation (the daemon's `logs/mcp-access.log` records every message it
receives), so no Nemons tool reached a model and none was invoked. Closing that gap needs
an action inside the IDE — reload the window, or **Qoder IDE Settings → MCP** and confirm the
entry — and Qoder documents no headless equivalent.

Two limits are host facts, not implementation choices:

- **No token path.** Qoder documents no `headers`/env-var substitution for a remote entry, so
  when the daemon requires `NEMONS_AUTH_TOKEN` the install **refuses** instead of writing a
  plaintext secret into a file the IDE reads. Re-run install after enabling auth only if you
  have a documented way to carry the credential.
- **Streamable HTTP is supported**: "configure the endpoint the same way as SSE and Qoder IDE
  will automatically detect and use it" (official MCP page, accessed 2026-10-30).

Full capability report, evidence and reproducible poll: `docs/07-evaluation/experiments/QODER-01-host-capability-report.md`.

### Test with your coding agent
```bash
# OpenCode
opencode
> implement a hello world function

# Or Claude Code
claude
> fix the bug in auth flow

# Or Codex CLI (after `nemons plugin install --agent codex`)
codex
> refactor the API routes

# Or Qoder IDE (after `nemons plugin install --agent qoder`, and after the IDE has
# re-read ~/.qoder/mcp.json): use an Agent-mode chat — Ask mode does not call MCP tools.
> call the MCP tool nemons.health_check and show the raw result
```

The daemon does **not** intercept anything by itself: your agent (or a host hook) has
to call it. For Codex, registering the MCP server makes the seven `nemons.*` tools
visible to the host after a restart — the model still decides whether to call them, and
nothing patches the agent process. For Qoder IDE the same is true and the reload is the
IDE's, not ours: the entry lands in `~/.qoder/mcp.json` and the orchestrator skill in
`~/.qoder/skills/`, but a running session started before that write does not see the
tools until the IDE re-reads the file. For the other adapters in `plugins/` there is nothing
to run: they are reference shims that were staged, never accepted by a host; see
"Integration status" in the [README](README.md).

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

#### Daemon won't stop — "no PID file"
`daemon stop` reads the PID file from the SAME home the daemon was started
with. If you started the daemon with a custom `NEMONS_HOME` (or a custom
port via `NEMONS_PORT`), pass the same values to stop:

```bash
# Linux / macOS
NEMONS_HOME=/path/to/home node bin/nemons.js daemon stop

# Windows (PowerShell)
$env:NEMONS_HOME="C:\path\to\home"; node bin\nemons.js daemon stop
```

With the default home (`~/.nemons`), plain `nemons daemon stop` works.

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
