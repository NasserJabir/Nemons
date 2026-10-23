// ============================================================
// nemons install — wrapper for the bash install.sh
// Supports both local (current dir) and npm install
// ============================================================
const { execSync, spawnSync } = require("child_process");
const path = require("path");
const os = require("os");
const fs = require("fs");

module.exports = async function (opts) {
  const platform = os.platform();
  const isWindows = platform === "win32";

  if (isWindows) {
    console.error("✗ Please run install.ps1 on Windows");
    process.exit(1);
  }

  // Determine install source
  let cliPath;

  if (opts.npm) {
    console.log("[nemons] Installing CLI from npm...");
    try {
      execSync("npm install -g @nemons/cli", { stdio: "inherit" });
      console.log("✓ Installed from npm");
      return;
    } catch (err) {
      console.error(`✗ npm install failed: ${err.message}`);
      console.error("  Hint: Use --local to install from this directory");
      process.exit(1);
    }
  }

  // Local install — try npm link from current package
  console.log("[nemons] Installing CLI from local directory...");

  // Find the package directory (parent of this file's parent)
  const pkgDir = path.resolve(__dirname, "..", "..");
  const pkgJsonPath = path.join(pkgDir, "package.json");

  if (!fs.existsSync(pkgJsonPath)) {
    console.error(`✗ No package.json found in ${pkgDir}`);
    console.error("  Hint: Use --npm to install from npm registry");
    process.exit(1);
  }

  // Install dependencies first
  console.log("  → Installing dependencies...");
  try {
    execSync("npm install --production", { cwd: pkgDir, stdio: "inherit" });
  } catch (err) {
    console.error(`✗ npm install failed: ${err.message}`);
    process.exit(1);
  }

  // Link globally
  console.log("  → Linking CLI globally...");
  try {
    execSync("npm link", { cwd: pkgDir, stdio: "inherit" });
    console.log("✓ Installed locally (via npm link)");
    console.log(`  Location: ${pkgDir}`);
  } catch (err) {
    // Try with sudo
    console.log("  ⚠ Trying with sudo...");
    try {
      execSync("sudo npm link", { cwd: pkgDir, stdio: "inherit" });
      console.log("✓ Installed locally");
    } catch {
      console.error(`✗ npm link failed: ${err.message}`);
      process.exit(1);
    }
  }

  // Run the rest of install.sh
  const installScript = path.join(pkgDir, "scripts", "install.sh");
  if (fs.existsSync(installScript)) {
    console.log("\n[nemons] Running full installation script...");
    try {
      execSync(`bash ${installScript}`, { stdio: "inherit" });
    } catch (err) {
      console.error(`✗ Install script failed: ${err.message}`);
      process.exit(1);
    }
  } else {
    console.log("\n⚠ install.sh not found — run daemon manually:");
    console.log("  nemons daemon start");
    console.log("  nemons plugin install");
  }
};
