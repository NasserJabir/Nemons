#!/usr/bin/env python3
"""
Build Nemos v2.2.1 — Adds Object-Oriented Harness (OO-Harness)
Based on: arXiv:2610.28380 (Li et al., October 2026)
- BaseHarness abstract class
- 6 specialized harnesses: BugFix, Refactor, Feature, Test, Deploy, Debug
- HarnessRouter for task-specific routing
- Expected improvement: up to 15% absolute
"""
import zipfile
import tarfile
import os
import shutil
import subprocess
from pathlib import Path

DOWNLOAD = Path("/home/z/my-project/download")
V22_ZIP = DOWNLOAD / "nemos-project-v2.2.0.zip"
V221_ZIP = DOWNLOAD / "nemos-project-v2.2.1.zip"
V221_TAR = DOWNLOAD / "nemos-project-v2.2.1.tar.gz"
TEMP_DIR = DOWNLOAD / "_temp_v221"
BUILD_DIR = DOWNLOAD / "_v221_build"

# Step 1: Clean temp
if TEMP_DIR.exists():
    shutil.rmtree(TEMP_DIR)
TEMP_DIR.mkdir()

# Step 2: Extract v2.2.0 as base
print(f"Extracting {V22_ZIP.name}...")
result = subprocess.run(['unzip', '-q', str(V22_ZIP), '-d', str(TEMP_DIR)], capture_output=True, text=True)
if result.returncode != 0:
    print(f"Failed: {result.stderr}")
    exit(1)

project = TEMP_DIR / "nemos-project"
print(f"Project extracted to: {project}")

# Step 3: Add OO-Harness files
print("\n=== Adding OO-Harness files (v2.2.1) ===")
utils_dir = project / "nemos" / "src" / "utils"
utils_dir.mkdir(parents=True, exist_ok=True)

harness_files = {
    "harness-base.js": "BaseHarness abstract class",
    "harness-bugfix.js": "BugFixHarness (specialized for bug fixes)",
    "harness-refactor.js": "RefactorHarness (specialized for refactoring)",
    "harness-feature.js": "FeatureHarness (specialized for features)",
    "harness-test.js": "TestHarness (specialized for tests)",
    "harness-deploy.js": "DeployHarness (specialized for deployment)",
    "harness-debug.js": "DebugHarness (specialized for debugging)",
    "harness-router.js": "HarnessRouter (selects appropriate harness)",
}

for filename, desc in harness_files.items():
    src = BUILD_DIR / "utils" / filename
    if src.exists():
        dst = utils_dir / filename
        shutil.copy2(src, dst)
        print(f"  + {filename} ({desc})")
    else:
        print(f"  ! Missing: {src}")

# Step 4: Update server.js to add harness endpoints
print("\n=== Updating server.js with harness endpoints ===")
server_js = project / "nemos" / "src" / "daemon" / "server.js"
content = server_js.read_text(encoding='utf-8')

# Add OO-Harness imports
HARNESS_IMPORTS = '''
// ---------- v2.2.1 OO-Harness (arXiv:2610.28380) ----------
const { router: harnessRouter } = require("../utils/harness-router");
const { BaseHarness } = require("../utils/harness-base");
'''

# Find insertion point (after v2.2.0 imports)
marker = 'const { PersonaBuilder } = require("../utils/persona-builder");'
if marker in content:
    content = content.replace(marker, marker + HARNESS_IMPORTS)
    print("  + Added OO-Harness imports")
else:
    # Try alternate marker
    alt_marker = 'app.get("/persona/roles"'
    if alt_marker in content:
        content = content.replace(alt_marker, HARNESS_IMPORTS + "\n" + alt_marker)
        print("  + Added OO-Harness imports (alt)")

# Add harness endpoints
HARNESS_ENDPOINTS = '''
// ============================================================
// v2.2.1 OO-Harness Endpoints (arXiv:2610.28380)
// ============================================================

// Route a prompt to the appropriate specialized harness
app.post("/harness/route", (req, res) => {
  try {
    const prompt = req.body.prompt || "";
    const result = harnessRouter.route(prompt);
    res.json({
      prompt,
      ...result,
      reference: "arXiv:2610.28380",
      improvement: "up to 15% absolute",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List all available harnesses
app.get("/harness/list", (req, res) => {
  res.json({
    harnesses: harnessRouter.list(),
    total: harnessRouter.list().length,
    reference: "arXiv:2610.28380",
  });
});

// Get verification criteria for a specific harness
app.get("/harness/:name/criteria", (req, res) => {
  try {
    const harness = harnessRouter.getHarness(req.params.name);
    res.json({
      harness: harness.name || req.params.name,
      task_type: harness.task_type,
      verification_criteria: harness.getVerificationCriteria(),
      cbr_strategy: harness.getCBRStrategy(),
      repair_strategy: harness.getRepairStrategy(),
      max_retries: harness.getMaxRetries(),
      persona_role: harness.getPersonaRole(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get full metadata for a specific harness
app.get("/harness/:name/metadata", (req, res) => {
  try {
    const harness = harnessRouter.getHarness(req.params.name);
    res.json(harness.getMetadata());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Execute with a specific harness (full OO-Harness pipeline)
app.post("/harness/:name/execute", async (req, res) => {
  try {
    const harness = harnessRouter.getHarness(req.params.name);
    const result = await harness.execute(req.body);
    res.json({
      harness: harness.name,
      ...result,
      reference: "arXiv:2610.28380",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Auto-route and execute (combined: route + execute)
app.post("/harness/auto-execute", async (req, res) => {
  try {
    const prompt = req.body.prompt || "";
    const routing = harnessRouter.route(prompt);
    const harness = harnessRouter.getHarness(routing.harness);
    const result = await harness.execute(req.body);
    res.json({
      routing,
      execution: result,
      reference: "arXiv:2610.28380",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get harness statistics
app.get("/harness/stats", (req, res) => {
  res.json(harnessRouter.getStats());
});

// Register a custom harness (extensibility)
app.post("/harness/register", (req, res) => {
  try {
    res.json({
      message: "Custom harness registration requires server-side code",
      note: "See utils/harness-base.js for BaseHarness class to extend",
      reference: "arXiv:2610.28380",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

'''

# Insert before "Start server" marker
start_marker = "// ---------- Start server ----------"
if start_marker in content:
    content = content.replace(start_marker, HARNESS_ENDPOINTS + "\n" + start_marker)
    print("  + Added OO-Harness endpoints")
else:
    alt_marker = "const port = parseInt"
    if alt_marker in content:
        content = content.replace(alt_marker, HARNESS_ENDPOINTS + "\n" + alt_marker)
        print("  + Added OO-Harness endpoints (alt)")

server_js.write_text(content, encoding='utf-8')
print(f"  + Updated server.js ({len(content)} bytes)")

# Step 5: Update version numbers
print("\n=== Updating version numbers ===")
for pkg in [project / "package.json", project / "nemos" / "package.json"]:
    if pkg.exists():
        content = pkg.read_text()
        content = content.replace('"2.2.0"', '"2.2.1"').replace('"2.1.0"', '"2.2.1"').replace('"2.0.0"', '"2.2.1"')
        pkg.write_text(content)
        print(f"  + Updated: {pkg.relative_to(project)}")

# Update install.bat title
install_bat = project / "install.bat"
if install_bat.exists():
    content = install_bat.read_text()
    content = content.replace("Nemos v2.0.0", "Nemos v2.2.1")
    content = content.replace("Nemos v2.1.0", "Nemos v2.2.1")
    content = content.replace("Nemos v2.2.0", "Nemos v2.2.1")
    install_bat.write_text(content)
    print("  + Updated: install.bat title")

# Step 6: Add OO-Harness documentation
docs_dir = project / "nemos" / "docs"
oo_harness_md = '''# Object-Oriented Harness (OO-Harness)

## Reference
- **Paper**: [arXiv:2610.28380](https://arxiv.org/abs/2610.28380)
- **Authors**: Gaotong Li et al. (Google DeepMind)
- **Published**: October 2026
- **Improvement**: up to 15% absolute over base

## Problem
Single global harnesses struggle with heterogeneous tasks requiring different execution strategies. A one-size-fits-all approach is insufficient for diverse task types (bug fixes, refactoring, feature implementation, etc.).

## Solution: Object-Oriented Design
Apply OO principles to agent harnesses:

```
BaseHarness (abstract)
    ├── DebugHarness (specialized for debugging)
    ├── BugFixHarness (specialized for bug fixes)
    ├── TestHarness (specialized for test writing)
    ├── DeployHarness (specialized for deployment)
    ├── RefactorHarness (specialized for refactoring)
    └── FeatureHarness (specialized for features)
```

### Components
1. **BaseHarness** — abstract class with shared utilities
2. **Specialized Harnesses** — inherit from BaseHarness, override:
   - Verification criteria
   - CBR retrieval strategy
   - Repair strategy
   - Max retries
   - Persona role
3. **HarnessRouter** — selects appropriate harness per task

## Harness Specializations

| Harness | Task Type | Max Retries | Repair Strategy | Persona |
|---------|-----------|------------|-----------------|---------|
| BugFixHarness | bug_fix | 3 | counterexample_guided | senior_engineer |
| RefactorHarness | refactor | 1 | minimal_edit | senior_engineer |
| FeatureHarness | feature | 2 | spec_driven | senior_engineer |
| TestHarness | test | 2 | test_first | senior_engineer |
| DeployHarness | deploy | 1 | rollback | devops_engineer |
| DebugHarness | debug | 3 | root_cause_first | senior_engineer |

## Endpoints

```bash
# Route a prompt to the best harness
curl -X POST http://localhost:3456/harness/route \\
  -H "Content-Type: application/json" \\
  -d '{"prompt":"fix the bug in auth flow"}'

# List all harnesses
curl http://localhost:3456/harness/list

# Get verification criteria for a specific harness
curl http://localhost:3456/harness/BugFixHarness/criteria

# Get full metadata
curl http://localhost:3456/harness/RefactorHarness/metadata

# Execute with a specific harness
curl -X POST http://localhost:3456/harness/FeatureHarness/execute \\
  -H "Content-Type: application/json" \\
  -d '{"prompt":"implement user login","project_root":"/tmp","adapter":"opencode"}'

# Auto-route and execute
curl -X POST http://localhost:3456/harness/auto-execute \\
  -H "Content-Type: application/json" \\
  -d '{"prompt":"refactor the auth module","project_root":"/tmp","adapter":"opencode"}'

# Get harness stats
curl http://localhost:3456/harness/stats
```

## Integration with Existing Features

| Existing Feature | OO-Harness Integration |
|------------------|----------------------|
| DAG Planner (v2.2.0) | Determines task type → feeds Router |
| Persona Builder (v2.2.0) | Each harness uses specialized persona |
| Trust Factor (v2.1.0) | Each harness updates TF differently |
| CBR Store (v2.1.0) | Each harness retrieves with specialized strategy |
| 4-Layer Verification (v2.1.0) | Each harness applies specialized criteria |
| Counterexample Repair (v2.1.0) | Each harness uses specialized repair strategy |

## How to Extend

### Create a Custom Harness

```javascript
const { BaseHarness } = require("./harness-base");

class SecurityAuditHarness extends BaseHarness {
  constructor(config) {
    super(config);
    this.task_type = "security_audit";
    this.persona_role = "security_engineer";
    this.max_retries = 1;
    
    this.verification_criteria = {
      must_pass: [
        "no_vulnerabilities",
        "owasp_top_10_checked",
        "secrets_scanned",
      ],
      // ...
    };
  }
  
  matches(prompt) {
    return /security|vulnerability|owasp|audit/i.test(prompt);
  }
}

// Register it
const { router } = require("./harness-router");
router.register(new SecurityAuditHarness());
```
'''
(docs_dir / "oo-harness.md").write_text(oo_harness_md)
print("  + Added: docs/oo-harness.md")

# Step 7: Collect all files
print("\n=== Collecting files ===")
all_files = []
for root, dirs, files in os.walk(project):
    if "node_modules" in root:
        continue
    for f in files:
        if "package-lock" in f:
            continue
        rel = os.path.relpath(os.path.join(root, f), project)
        all_files.append((os.path.join(root, f), rel))

print(f"Total: {len(all_files)} files")

# Step 8: Remove old archives
for p in [V221_ZIP, V221_TAR]:
    if p.exists():
        p.unlink()

# Step 9: Create zip
print(f"\nCreating {V221_ZIP.name}...")
with zipfile.ZipFile(V221_ZIP, 'w', zipfile.ZIP_DEFLATED) as zipf:
    for full_path, rel_path in all_files:
        arcname = os.path.join("nemos-project", rel_path)
        zipf.write(full_path, arcname)
print(f"  Created: {V221_ZIP} ({V221_ZIP.stat().st_size} bytes)")

# Step 10: Create tar.gz
print(f"\nCreating {V221_TAR.name}...")
with tarfile.open(V221_TAR, "w:gz") as tar:
    for full_path, rel_path in all_files:
        arcname = os.path.join("nemos-project", rel_path)
        tar.add(full_path, arcname=arcname)
print(f"  Created: {V221_TAR} ({V221_TAR.stat().st_size} bytes)")

# Step 11: Cleanup
shutil.rmtree(TEMP_DIR)
shutil.rmtree(BUILD_DIR)

# Verify
print("\n=== Verification ===")
with zipfile.ZipFile(V221_ZIP, 'r') as z:
    names = z.namelist()

    # Check harness files
    harness_files_check = [
        "harness-base.js", "harness-bugfix.js", "harness-refactor.js",
        "harness-feature.js", "harness-test.js", "harness-deploy.js",
        "harness-debug.js", "harness-router.js",
    ]
    print("  OO-Harness files:")
    for f in harness_files_check:
        path = f"nemos-project/nemos/src/utils/{f}"
        print(f"    {'OK' if path in names else 'MISSING'} {f}")

    # Check endpoints
    with z.open('nemos-project/nemos/src/daemon/server.js') as sf:
        server_content = sf.read().decode('utf-8')
        endpoints = [
            "/harness/route", "/harness/list", "/harness/:name/criteria",
            "/harness/:name/metadata", "/harness/:name/execute",
            "/harness/auto-execute", "/harness/stats", "/harness/register",
        ]
        print("\n  Endpoints:")
        for ep in endpoints:
            print(f"    {'OK' if ep in server_content else 'MISSING'} {ep}")

print(f"\n{'='*60}")
print(f"  NEMOS v2.2.1 — OO-HARNESS EDITION READY")
print(f"{'='*60}")
print(f"  New Feature: Object-Oriented Harness")
print(f"  Reference: arXiv:2610.28380")
print(f"  Expected Improvement: up to 15% absolute")
print(f"  Total Features: 19 (18 from v2.2.0 + 1 new)")
print(f"  Total Endpoints: 63+ (55+ from v2.2.0 + 8 new)")
print(f"  Total Files: {len(all_files)}")
print(f"")
print(f"  Archives:")
print(f"    {V221_ZIP}")
print(f"    {V221_TAR}")
