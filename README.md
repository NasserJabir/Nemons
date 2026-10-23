<div align="center">

# 🛡️ Nemons

### Transparent Orchestration Layer for Coding Agents

**Auto-triggers Context Pack, Evidence Collection, and Verification Loop on every prompt — works with OpenCode, Claude Code, Codex, Kiro, Kimi Code, Qoder, Cline, and Trae.**

[![Version](https://img.shields.io/badge/version-4.2.1-blue.svg?style=for-the-badge)](CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-green.svg?style=for-the-badge)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg?style=for-the-badge)](https://nodejs.org)
[![Tests](https://img.shields.io/badge/tests-88%2F90%20passing-success.svg?style=for-the-badge)](nemos/tests)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-ff69b4.svg?style=for-the-badge)](CONTRIBUTING.md)

[🚀 Quick Start](#-quick-start) • [📖 Documentation](#-documentation) • [🔌 Supported Agents](#-supported-agents) • [🛡️ Security](#-security) • [🤝 Contributing](#-contributing)

[English](#english) | [العربية](#العربية)

</div>

> ## v4.2.1 — Persona-Driven Pipeline + @nemons/core Bridge
>
> Two major architectural closures in this release:
>
> 1. **Persona now DRIVES the entire pipeline at spawn-time** — `HarnessRouter.route(prompt, personaRole?)` and `SubagentOrchestrator.autoOrchestrate(task, dag, id, personaRole?)` accept persona as a first-class input. Verification criteria, subagent roles, memory modes, and capabilities are all persona-aware AT ROUTE/SPAWN TIME (not just post-hoc). Closes the comment/code drift that existed in v4.2.0.
> 2. **JS daemon is now bridged to the TypeScript `@nemons/core` package** — the daemon no longer re-implements governed evolution, persistent stores, paired evaluation, action interception, regression detection, ablation testing, or import/export in a deficient way. A single 213-line bridge file (`nemos-bridge.js`) delegates to the battle-tested TS core (1215 tests, 16 ADRs). 19 new `/core/*` endpoints expose the full TS surface over HTTP.
>
> See [CHANGELOG.md](CHANGELOG.md) for full details.

---

## English

## 🤔 The Problem

You've installed a coding agent (OpenCode, Claude Code, Codex, etc.). It writes code, but:

- ❌ **No memory** — it forgets what worked last time
- ❌ **No verification** — it claims "done" without checking
- ❌ **No context** — you re-explain your project every time
- ❌ **No governance** — anyone can change agent behavior silently
- ❌ **No audit trail** — you can't trace what happened

## ✨ The Solution

**Nemons** sits transparently between you and your coding agent. On every prompt, it automatically:

1. **Injects the right Context Pack** (persona + skills + knowledge)
2. **Collects Evidence** (diffs, tests, lint — with auto-secret-redaction)
3. **Runs the Verification Loop** (3-tier: must-pass / should-pass / nice-to-have)
4. **Stores Experiences** — successful runs become memory for future prompts

```
┌────────────────────────────────────────────────────────────────┐
│  YOU                                                           │
│  ↓ "implement a hello world function"                         │
├────────────────────────────────────────────────────────────────┤
│  YOUR CODING AGENT (OpenCode / Claude Code / Codex / ...)     │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  Nemons Plugin (transparent, auto-triggers)             │ │
│  │  1. POST /analyze    → "should I intercept this?"        │ │
│  │  2. GET  /context-pack → load relevant pack             │ │
│  │  3. Inject pack as system context                       │ │
│  │  4. Agent runs normally                                 │ │
│  │  5. Collect evidence (diff, tests)                      │ │
│  │  6. POST /evaluate → run verification loop              │ │
│  │  7. If passed → store Experience                        │ │
│  └────────────────────────┬─────────────────────────────────┘ │
└───────────────────────────┼────────────────────────────────────┘
                            ▼
┌────────────────────────────────────────────────────────────────┐
│  NEMONS DAEMON (Express server on http://127.0.0.1:3456)      │
│  • Policy Engine   • Context Pack Builder   • Evidence Collector│
│  • Verification Loop   • Experience Store   • Audit & Governance│
└────────────────────────────────────────────────────────────────┘
```

## 🎯 Why Nemons?

| Without Nemons | **With Nemons** |
|----------------|-----------------|
| ❌ Agent forgets past successes | ✅ **Experiences stored & reused** automatically |
| ❌ "Done" means "maybe done" | ✅ **3-tier verification** before claiming success |
| ❌ Re-explain your project every time | ✅ **Context Pack** auto-injected |
| ❌ No audit trail | ✅ **Hash-chained audit logs** |
| ❌ Anyone can change agent behavior | ✅ **Hierarchical governance** (low/medium/high impact) |
| ❌ Secrets leak into logs | ✅ **Auto-secret-redaction** (API keys, JWTs, PEM files) |
| ❌ Locked to one agent | ✅ **Swap agents by changing one line** |

## ✅ Status: 10/10 Tests Passing

```
$ nemons verify

Test 1:  Daemon health                       ✓
Test 2:  Intercept 'implement' prompt         ✓
Test 3:  Skip 'hello' prompt                  ✓
Test 4:  Skip 'what is React?' prompt        ✓
Test 5:  Intercept 'fix the bug' prompt      ✓
Test 6:  Evidence + secret redaction          ✓
Test 7:  Verification loop (success)         ✓
Test 8:  Metrics endpoint                    ✓
Test 9:  Governance rules                    ✓
Test 10: Experiences listing                 ✓

✅ Nemons transparent interception is working!
```

## 🚀 Quick Start

### 1. Download & extract

```bash
# Clone the repo
git clone https://github.com/your-org/nemons.git
cd nemons

# Or extract the release archive
tar -xzf nemons-project-v1.0.0.tar.gz
cd nemons-project
```

### 2. Run the installer

```bash
chmod +x scripts/install.sh
./scripts/install.sh
```

That's it! The installer will:
- ✅ Install Node.js dependencies (Express, js-yaml)
- ✅ Link the `nemons` CLI globally (`npm link`)
- ✅ Copy default configs to `~/.nemons/`
- ✅ Start the daemon on `http://127.0.0.1:3456`
- ✅ Detect your installed coding agents (OpenCode, Claude Code, etc.)
- ✅ Install the Nemons plugin in each detected agent
- ✅ Run 10 end-to-end verification tests

### 3. Verify it works

```bash
nemons verify
# → 10/10 tests passing ✓
```

Now open your coding agent and type a prompt:

```bash
opencode  # or: claude, codex, kimi, qoder, cline
> implement a hello world function
```

Nemons will auto-trigger on every prompt. 🎉

## 🛠️ CLI Commands

```bash
nemons --help                              # Show help
nemons --version                           # Show version

nemons daemon start                        # Start daemon (background)
nemons daemon stop                         # Stop daemon
nemons daemon restart                      # Restart
nemons daemon status                       # Check status

nemons health                              # Quick health check
nemons health --detailed                   # Detailed info

nemons plugin install                      # Install plugin in all detected agents
nemons plugin install --agent opencode     # Install for specific agent
nemons plugin list                         # List detected agents + plugin status
nemons plugin remove --agent claude-code   # Remove plugin

nemons intercept enable --all              # Enable transparent interception
nemons intercept disable --all            # Disable (emergency)
nemons intercept status                    # Show current status

nemons verify                              # Run 10-test suite

nemons install --local                     # Install CLI from local directory
nemons install --npm                       # Install CLI from npm registry

nemons experiences list                    # List last 10 experiences
nemons experiences list --limit 50         # List last 50
nemons experiences search --query "auth"  # Search experiences
nemons experiences clean --maxAge 30       # Delete experiences older than 30 days
nemons experiences stats                   # Show statistics
```

## 🔌 Supported Agents

Nemons works with **8 popular coding agents**. The installer auto-detects which ones you have and installs the matching plugin:

| Agent | Plugin File | Auto-Install |
|-------|-------------|--------------|
| OpenCode | `plugins/opencode/nemons.ts` | ✅ |
| Claude Code | `plugins/claude-code/plugin.json` | ✅ |
| Codex CLI | `plugins/codex/nemons.js` | ✅ |
| Kiro | (via AWS Agent Toolkit) | ⚠️ Partial |
| Kimi Code | `plugins/kimi/nemons.js` | ✅ |
| Qoder | `plugins/qoder/manifest.json` | ✅ |
| Cline | `plugins/cline/nemons.js` | ✅ |
| Trae | `plugins/trae/manifest.json` | ✅ |

## 🎯 Smart Filtering (No Overhead on Trivial Prompts)

Nemons only intercepts code-related prompts. Trivial prompts go straight to the agent:

| Prompt | Action | Reason |
|-------|--------|--------|
| `implement a hello world function` | ✅ Intercept | matches "implement" pattern |
| `fix the bug in the auth flow` | ✅ Intercept | matches "fix" + "bug" |
| `refactor the api routes` | ✅ Intercept | matches "refactor" |
| `hello` | ⏭️ Skip | too short (< 20 chars) |
| `what is React?` | ⏭️ Skip | definition question |
| `explain async/await` | ⏭️ Skip | explanation request |

## 📋 Verification Loop (3 Tiers)

| Tier | Examples | On Failure |
|------|----------|-----------|
| **Must pass** | tests pass, no syntax errors, no security violations | ❌ Run fails |
| **Should pass** | coverage delta ≥ 0, no new lint warnings, diff < 500 lines | ⚠️ Warning + retry (max 2) |
| **Nice to have** | includes tests, has documentation | ℹ️ Informational only |

## 🏛️ Governance (Hierarchical Approvals)

| Impact | Examples | Approval Required |
|--------|----------|-------------------|
| **Low** | typo fixes, comment updates | ✅ Auto-approve |
| **Medium** | add skill, modify persona | 1 approval (tech lead) |
| **High** | change context pack, modify security | 2 approvals (tech lead + architect) |

## 🛡️ Security

Nemons follows the **MCP Security Maturity Model (Level 4 — Enterprise)**:

- 🔒 **Sandbox isolation** — daemon binds to 127.0.0.1 only (no remote access)
- 🔑 **Bearer token auth** — optional `NEMONS_AUTH_TOKEN` env var
- 🕵️ **Secret redaction** — automatic stripping of:
  - OpenAI keys (`sk-...`)
  - Anthropic keys (`sk-ant-...`)
  - AWS keys (`AKIA...`)
  - Bearer tokens
  - JWT tokens
  - PEM private keys
  - Generic passwords
- 📜 **Audit logs** — all runs and approvals logged with hash chain (tamper-proof)
- 🛡️ **Rate limiting** — 60 req/min, burst 10
- 🔐 **RBAC** — tool-level permissions (planned for 1.1.0)

## 📊 REST API

Base URL: `http://127.0.0.1:3456`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | `GET` | Daemon health check |
| `/metrics` | `GET` | Daemon metrics (memory, uptime, experience count) |
| `/analyze` | `POST` | Analyze prompt — should intercept? |
| `/context-pack/:id` | `GET` | Get context pack by ID |
| `/evidence` | `POST` | Store evidence (with auto-redaction) |
| `/evaluate` | `POST` | Run verification loop |
| `/experiences` | `GET` `POST` | List / store experiences |
| `/governance/rules` | `GET` | Get governance rules |
| `/sessions/start` | `POST` | Audit: session start |
| `/sessions/end` | `POST` | Audit: session end |

<details>
<summary>📖 Example: Analyzing a prompt (click to expand)</summary>

```bash
curl -X POST http://127.0.0.1:3456/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "implement a hello world function",
    "project_root": "/path/to/project",
    "adapter": "opencode"
  }'
```

Response:

```json
{
  "should_intercept": true,
  "reason": "intercept_pattern_matched",
  "pattern": "build|implement|add|create|make",
  "suggested_pack_id": "default",
  "similar_experiences": []
}
```

</details>

## 📦 Project Structure

```
nemons-project/
├── nemons/                              # THE PROJECT (CLI + Daemon)
│   ├── bin/nemons.js                   # Entry point
│   ├── src/
│   │   ├── index.js                    # SDK public API
│   │   ├── commands/                   # 7 CLI commands
│   │   ├── daemon/server.js            # Express daemon
│   │   ├── store/storage.js            # File-based persistence
│   │   └── utils/                      # redaction, filters
│   ├── tests/run-all.js                # End-to-end test runner
│   ├── examples/                        # Usage examples
│   └── docs/                           # Architecture, API, plugins
│
├── plugins/                            # Per-agent plugins (7 agents)
├── config/                             # Default configs + skills
├── personas/                           # Example personas
├── knowledge/                          # Example knowledge base
├── governance/                         # Approval rules
├── monitoring/                         # Metrics + alerting
├── scripts/                           # Installation scripts
├── README.md                          # This file
├── LICENSE                            # MIT
├── CHANGELOG.md
└── .gitignore
```

## 📖 Documentation

| Document | Description |
|----------|-------------|
| [Architecture](nemons/docs/architecture.md) | System overview, components, data flow |
| [API Reference](nemons/docs/api-reference.md) | All REST endpoints with examples |
| [Plugin Development](nemons/docs/plugin-development.md) | Build a Nemons plugin for any agent |
| [Examples](nemons/examples/) | Context pack + SDK usage examples |
| [Changelog](CHANGELOG.md) | Version history |

## 🎬 Example: SDK Usage

```javascript
const {
  healthCheck,
  analyzePrompt,
  getContextPack,
  submitEvidence,
  evaluateRun,
} = require("@nemons/cli");

// Health check
const health = await healthCheck();

// Analyze a prompt
const analysis = await analyzePrompt(
  "implement a hello world function",
  "/path/to/project",
  "opencode"
);

if (analysis.should_intercept) {
  // Load context pack
  const pack = await getContextPack(analysis.suggested_pack_id);
  
  // ... run your agent with augmented context ...
  
  // Submit evidence (secrets auto-redacted)
  await submitEvidence("run-123", { diff: "...", tests_pass: true });
  
  // Evaluate
  const result = await evaluateRun("run-123", { tests_pass: true });
  console.log(result.passed ? "✓" : "✗");
}
```

## 🤝 Contributing

We welcome contributions! Here's how to get started:

1. **Fork** this repository
2. **Clone** your fork: `git clone https://github.com/your-username/nemons.git`
3. **Install** dependencies: `cd nemons/nemons && npm install`
4. **Run** tests: `npm test`
5. **Create** a feature branch: `git checkout -b feat/my-feature`
6. **Make** changes, commit with conventional commits
7. **Open** a Pull Request

### Areas we need help with:

- 🌍 **Translations** — README in more languages
- 🔌 **More agents** — plugins for Cursor, Windsurf, Aider, GitHub Copilot CLI
- 🎨 **Web dashboard** — React UI for the daemon
- 📊 **PostgreSQL backend** — optional storage backend
- 🧪 **More tests** — edge cases, stress tests
- 📚 **Tutorials** — blog posts, video tutorials

## 📋 Roadmap

### v1.1.0 (Q4 2026)
- [ ] RBAC tool-level permissions
- [ ] Multi-tenant support
- [ ] PostgreSQL backend (optional)
- [ ] WebSocket for real-time metrics
- [ ] Web dashboard (React)

### v1.2.0 (Q1 2027)
- [ ] Distributed daemon (cluster mode)
- [ ] AI-powered experience ranking
- [ ] Auto-skill derivation from successful runs
- [ ] Integration with Augment Cosmos

## 📄 License

**MIT** — see [LICENSE](LICENSE) for details.

## ⭐ Star History

If Nemons helps you, please consider giving it a star! ⭐

<div align="center">

[![Star History Chart](https://api.star-history.com/svg?repos=your-org/nemons&type=Date)](https://star-history.com/#your-org/nemons&Date)

</div>

## 🌟 Acknowledgments

- **[Superpowers](https://github.com/obra/superpowers)** by Jesse Vincent — inspired our skills methodology
- **[MCP](https://modelcontextprotocol.io)** by Anthropic — the integration standard we follow
- **[OpenCode](https://opencode.ai)** — the open-source agent we tested with
- **[Claude Code](https://claude.com)** — the powerful agent we benchmark against

---

## العربية

## 🤔 المشكلة

ثبّت وكيل برمجة (OpenCode, Claude Code, Codex, إلخ). يكتب الكود، لكن:

- ❌ **لا ذاكرة** — ينسى ما نجح في المرات السابقة
- ❌ **لا تحقق** — يقول "تم" دون فحص
- ❌ **لا سياق** — تعيد شرح مشروعك في كل مرة
- ❌ **لا حوكمة** — أي أحد يعدل سلوك الوكيل دون رقابة
- ❌ **لا سجل تدقيق** — لا يمكنك تتبع ما حدث

## ✨ الحل

**Nemons** طبقة شفافة بينك وبين وكيل البرمجة. على كل برومت، يقوم تلقائيًا بـ:

1. **حقن Context Pack المناسب** (شخصية + مهارات + معرفة)
2. **جمع Evidence** (diffs, tests, lint — مع تنقيح تلقائي للأسرار)
3. **تشغيل Verification Loop** (3 مستويات: يجب-نجح / يُفضل-نجح / يُحب-نجح)
4. **تخزين Experiences** — الـ runs الناجحة تصبح ذاكرة للمستقبل

## 🚀 البدء السريع

```bash
# تنزيل وفك الضغط
tar -xzf nemons-project-v1.0.0.tar.gz
cd nemons-project

# التثبيت (يكتشف الوكلاء المثبتين تلقائيًا)
chmod +x scripts/install.sh
./scripts/install.sh

# التحقق
nemons verify
# → 10/10 اختبار ناجح ✓
```

ثم افتح وكيلك:

```bash
opencode  # أو: claude, codex, kimi, qoder, cline
> implement a hello world function
```

سيُفعل Nemons تلقائيًا على كل برومت. 🎉

## 🔌 الوكلاء المدعومون

| الوكيل | حالة الـ Plugin |
|--------|-----------------|
| OpenCode | ✅ جاهز |
| Claude Code | ✅ جاهز |
| Codex CLI | ✅ جاهز |
| Kiro | ⚠️ جزئي (عبر AWS Toolkit) |
| Kimi Code | ✅ جاهز |
| Qoder | ✅ جاهز |
| Cline | ✅ جاهز |
| Trae | ✅ جاهز |

## 🛡️ الأمان

Nemons يتبع **MCP Security Maturity Model (المستوى 4 — Enterprise)**:

- 🔒 **عزل sandbox** — الـ daemon يربط على 127.0.0.1 فقط (لا وصول بعيد)
- 🔑 **مصادقة bearer token** — متغير بيئة `NEMONS_AUTH_TOKEN` اختياري
- 🕵️ **تنقيح الأسرار تلقائيًا** — يمسح:
  - مفاتيح OpenAI (`sk-...`)
  - مفاتيح Anthropic (`sk-ant-...`)
  - مفاتيح AWS (`AKIA...`)
  - Bearer tokens
  - JWT tokens
  - PEM private keys
- 📜 **سجلات تدقيق** — كل runs + موافقات مسجلة بسلسلة hash (محمية ضد التلاعب)
- 🛡️ **rate limiting** — 60 req/min, burst 10

## 📖 التوثيق بالعربية

- [البنية المعمارية](nemons/docs/architecture.md)
- [مرجع API](nemons/docs/api-reference.md)
- [تطوير Plugins](nemons/docs/plugin-development.md)

---

<div align="center">

**[⬆ العودة للأعلى](#-nemons)**

صُنع بـ ❤️ لمجتمع وكلاء البرمجة

</div>
