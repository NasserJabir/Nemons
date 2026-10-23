# Contributing to Nemons

First off, thank you for considering contributing to Nemons! 🎉

This document outlines how to contribute to the project.

## 🚀 Quick Contribution Guide

1. **Fork** the repository
2. **Clone** your fork:
   ```bash
   git clone https://github.com/your-username/nemons.git
   cd nemons
   ```
3. **Install** dependencies:
   ```bash
   cd nemons
   npm install
   ```
4. **Run** tests to verify setup:
   ```bash
   npm test
   # → All 10 tests should pass
   ```
5. **Create** a feature branch:
   ```bash
   git checkout -b feat/my-awesome-feature
   # or: fix/bug-description, docs/update-readme, etc.
   ```
6. **Make** your changes
7. **Commit** with conventional commits (see below)
8. **Push** to your fork:
   ```bash
   git push origin feat/my-awesome-feature
   ```
9. **Open** a Pull Request with a clear description

## 📝 Conventional Commits

We use [Conventional Commits](https://www.conventionalcommits.org/) for clear history:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types
- `feat` — New feature
- `fix` — Bug fix
- `docs` — Documentation only
- `style` — Code style (formatting, no code change)
- `refactor` — Code refactoring
- `test` — Adding tests
- `chore` — Build/tooling changes

### Scopes
- `daemon` — Daemon server changes
- `cli` — CLI commands
- `plugin` — Plugin development
- `security` — Security-related changes
- `governance` — Governance rules
- `monitoring` — Monitoring/metrics
- `docs` — Documentation

### Examples
```
feat(plugin): add Windsurf plugin support
fix(daemon): correct redaction pattern for OpenAI keys
docs(readme): add Arabic translation
test(verify): add edge case for empty prompts
chore(deps): update express to 4.20.0
```

## 🧪 Testing

All contributions must pass the test suite:

```bash
npm test
```

Tests are in `nemons/tests/run-all.js`. To add a new test:

1. Open `nemons/tests/run-all.js`
2. Add a new test case following the existing pattern
3. Run tests to verify: `npm test`

### Test Categories
- **Unit tests** — Test individual functions (redaction, filters)
- **Integration tests** — Test daemon endpoints
- **End-to-end tests** — Full pipeline (analyze → evaluate → store)

## 🔌 Adding a New Agent Plugin

To add support for a new coding agent:

1. Create a directory in `plugins/<agent-name>/`
2. Add the plugin file (`.js`, `.ts`, or `.json` depending on agent's plugin format)
3. Update `nemons/src/commands/plugin.js` to detect the new agent
4. Add tests in `nemons/tests/run-all.js`
5. Update `README.md` supported agents table

### Plugin Template (JavaScript)

```javascript
const NEMONS_DAEMON = "http://127.0.0.1:3456";

async function callDaemon(path, init) {
  try {
    const res = await fetch(`${NEMONS_DAEMON}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null; // graceful degradation
  }
}

function shouldIntercept(prompt) {
  if (!prompt || prompt.length < 20) return false;
  if (/^(what is|how to|explain|define)/i.test(prompt)) return false;
  return /\b(build|implement|fix|refactor|test|deploy|debug|create)\b/i.test(prompt);
}

module.exports = {
  name: "nemons-<agent>",
  
  async onPrompt(prompt, context) {
    if (!shouldIntercept(prompt)) return;
    
    const analysis = await callDaemon("/analyze", {
      method: "POST",
      body: JSON.stringify({
        prompt,
        project_root: context.cwd,
        adapter: "<agent-name>",
      }),
    });
    
    if (!analysis?.should_intercept) return;
    
    if (analysis.suggested_pack_id) {
      const pack = await callDaemon(`/context-pack/${analysis.suggested_pack_id}`);
      if (pack) {
        return {
          augment_prompt: true,
          additional_context: JSON.stringify(pack),
        };
      }
    }
  },
  
  async onResponse(prompt, response, context) {
    // ... collect evidence and call /evaluate
  },
};
```

## 🎨 Code Style

- **JavaScript**: ES2022+, Node.js 18+
- **Indentation**: 2 spaces
- **Quotes**: Single quotes for strings
- **Semicolons**: Always
- **Trailing commas**: Yes (multi-line)
- **Naming**: camelCase for variables, PascalCase for classes, UPPER_SNAKE for constants

## 🐛 Reporting Bugs

When reporting a bug, please include:

1. **Environment**: OS, Node version, Nemons version
2. **Coding agent**: Which agent you're using (OpenCode, Claude Code, etc.)
3. **Steps to reproduce**: Detailed steps
4. **Expected behavior**: What you expected
5. **Actual behavior**: What happened
6. **Logs**: Relevant output from `~/.nemons/logs/`
7. **Config**: Your `daemon.yml` (redact secrets)

Use the bug report template when opening an issue.

## 💡 Suggesting Enhancements

We welcome enhancement suggestions! Please:

1. Check existing issues first (avoid duplicates)
2. Use the feature request template
3. Explain the use case clearly
4. Suggest an API/design if possible

## 🔒 Security Vulnerabilities

If you discover a security vulnerability, please **DO NOT** open a public issue.

Email: security@your-org.com

We'll respond within 48 hours.

## 📋 Pull Request Checklist

Before submitting a PR, ensure:

- [ ] Tests pass: `npm test`
- [ ] No secrets in code (we'll auto-redact, but check)
- [ ] Documentation updated if needed
- [ ] CHANGELOG.md updated
- [ ] Conventional commit message used
- [ ] Branch is up-to-date with main

## 🌍 Translations

We'd love translations of the README into more languages:

1. Create `README.<lang>.md` (e.g., `README.es.md` for Spanish)
2. Translate the content (keep code blocks in English)
3. Add a link in the main README's language switcher

## 📚 Code of Conduct

Be kind, respectful, and constructive. We're all here to make coding agents better.

---

Thank you for contributing! 🙏
