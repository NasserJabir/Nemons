// Static Analysis — COMPLETE v2.5.0
// Based on: arXiv:2508.14419
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

class StaticAnalysis {
  constructor() {
    this.tools = {
      eslint: { cmd: "npx", args: ["eslint", "--format=json", "--no-eslintrc"], lang: "javascript", type: "quality" },
      tsc: { cmd: "npx", args: ["tsc", "--noEmit"], lang: "typescript", type: "types" },
      bandit: { cmd: "bandit", args: ["-r", ".", "-f", "json"], lang: "python", type: "security" },
      pylint: { cmd: "pylint", args: ["--output-format=json"], lang: "python", type: "quality" },
      mypy: { cmd: "mypy", args: ["--json"], lang: "python", type: "types" },
      go_vet: { cmd: "go", args: ["vet", "./..."], lang: "go", type: "quality" },
      cargo_clippy: { cmd: "cargo", args: ["clippy", "--message-format=json"], lang: "rust", type: "quality" },
      semgrep: { cmd: "semgrep", args: ["--json"], lang: "any", type: "security" },
    };
  }
  
  detectLanguage(projectRoot) {
    try {
      const files = fs.readdirSync(projectRoot);
      if (files.some(f => f.endsWith(".py"))) return "python";
      if (files.some(f => f === "tsconfig.json")) return "typescript";
      if (files.some(f => f === "package.json")) return "javascript";
      if (files.some(f => f === "go.mod")) return "go";
      if (files.some(f => f === "Cargo.toml")) return "rust";
    } catch {}
    
    // Try reading files to detect language
    try {
      const allFiles = execSync(`find ${projectRoot} -maxdepth 2 -type f -name "*.py" -o -name "*.ts" -o -name "*.js" -o -name "*.go" -o -name "*.rs" 2>/dev/null | head -5`, { encoding: "utf-8" }).trim().split("\n");
      if (allFiles.some(f => f.endsWith(".py"))) return "python";
      if (allFiles.some(f => f.endsWith(".ts"))) return "typescript";
      if (allFiles.some(f => f.endsWith(".js"))) return "javascript";
      if (allFiles.some(f => f.endsWith(".go"))) return "go";
      if (allFiles.some(f => f.endsWith(".rs"))) return "rust";
    } catch {}
    
    return "unknown";
  }
  
  runTool(toolName, projectRoot) {
    const tool = this.tools[toolName];
    if (!tool) return { error: `Unknown tool: ${toolName}` };
    
    try {
      const cmd = `${tool.cmd} ${tool.args.join(" ")} ${projectRoot} 2>&1 || true`;
      const output = execSync(cmd, { encoding: "utf-8", timeout: 30000, cwd: projectRoot, maxBuffer: 1024 * 1024 });
      
      // Try to parse JSON output
      try {
        const parsed = JSON.parse(output);
        return { tool: toolName, type: tool.type, result: parsed, raw_output: output.slice(0, 500) };
      } catch {
        // Non-JSON output (still useful)
        const issueCount = (output.match(/error|warning|issue|violation/gi) || []).length;
        return { tool: toolName, type: tool.type, result: { raw: output.slice(0, 1000), issue_count: issueCount } };
      }
    } catch (err) {
      // Tool not installed or failed
      return { tool: toolName, type: tool.type, error: err.message.slice(0, 200), not_installed: true };
    }
  }
  
  async analyze(projectRoot, options) {
    const opts = options || {};
    const language = opts.language || this.detectLanguage(projectRoot);
    
    const toolsByLang = {
      python: ["bandit", "pylint", "mypy"],
      javascript: ["eslint"],
      typescript: ["eslint", "tsc"],
      go: ["go_vet"],
      rust: ["cargo_clippy"],
    };
    
    const tools = toolsByLang[language] || [];
    const results = {};
    
    for (const tool of tools) {
      results[tool] = this.runTool(tool, projectRoot);
    }
    
    // Always try semgrep (language-agnostic)
    if (tools.length > 0) {
      results.semgrep = this.runTool("semgrep", projectRoot);
    }
    
    return {
      language,
      project_root: projectRoot,
      tools_run: Object.keys(results),
      results,
      summary: this.summarize(results),
      feedback: this.buildFeedback({ results }),
    };
  }
  
  summarize(results) {
    const summary = { total_issues: 0, by_severity: { critical: 0, high: 0, medium: 0, low: 0 }, by_tool: {}, tools_not_installed: [] };
    
    for (const [tool, result] of Object.entries(results)) {
      if (result.not_installed) {
        summary.tools_not_installed.push(tool);
        continue;
      }
      const issues = this.extractIssues(result);
      summary.by_tool[tool] = issues.length;
      summary.total_issues += issues.length;
      
      for (const issue of issues) {
        const sev = (issue.severity || "low").toLowerCase();
        if (sev in summary.by_severity) summary.by_severity[sev]++;
        else summary.by_severity.low++;
      }
    }
    
    return summary;
  }
  
  extractIssues(result) {
    if (!result || result.error || result.not_installed) return [];
    if (!result.result) return [];
    
    // Common JSON formats
    if (Array.isArray(result.result)) return result.result;
    if (result.result?.results) return result.result.results;
    if (result.result?.issues) return result.result.issues;
    if (result.result?.messages) return result.result.messages;
    if (result.result?.raw && result.result.issue_count) {
      // Non-JSON output with issue count
      return Array(result.result.issue_count).fill({ severity: "low", message: "issue detected" });
    }
    return [];
  }
  
  buildFeedback(analysisResult) {
    const feedback = [];
    const results = analysisResult.results || {};
    
    for (const [tool, result] of Object.entries(results)) {
      if (result.not_installed) {
        feedback.push({ tool, message: `${tool} not installed. Install for better analysis.`, severity: "info" });
        continue;
      }
      const issues = this.extractIssues(result);
      for (const issue of issues.slice(0, 5)) {
        feedback.push({
          tool, severity: issue.severity || "low",
          message: issue.message || issue.msg || issue.description || "issue found",
          file: issue.filename || issue.file || issue.path || "unknown",
          line: issue.line || issue.lineno || issue.startLine,
          suggestion: this.generateSuggestion(tool, issue),
        });
      }
    }
    
    return feedback;
  }
  
  generateSuggestion(tool, issue) {
    const suggestions = {
      bandit: "Review security implications. Use safer alternatives.",
      pylint: "Refactor to address code quality issues.",
      mypy: "Add type annotations or fix type errors.",
      eslint: "Fix linting issues. Run eslint --fix for auto-fixable.",
      tsc: "Fix TypeScript type errors.",
      semgrep: "Review security pattern. Apply recommended fix.",
      go_vet: "Review Go vet findings.",
      cargo_clippy: "Review Clippy suggestions for Rust idioms.",
    };
    return suggestions[tool] || "Review and address the issue.";
  }
}

module.exports = { StaticAnalysis };
