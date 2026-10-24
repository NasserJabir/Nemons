const SECRET_PATTERNS = [
  { n: "aws_access", r: "AKIA[0-9A-Z]{16}", s: "critical" },
  { n: "openai", r: "sk-(?!ant-)[a-zA-Z0-9]{20,}", s: "critical" },
  { n: "anthropic", r: "sk-ant-[a-zA-Z0-9_-]+", s: "critical" },
  { n: "github", r: "gh[ps]_[A-Za-z0-9]{36}", s: "critical" },
  { n: "slack", r: "xox[baprs]-[A-Za-z0-9-]+", s: "high" },
  { n: "jwt", r: "eyJ[a-zA-Z0-9_-]+\\.[a-zA-Z0-9_-]+\\.[a-zA-Z0-9_-]+", s: "high" },
  { n: "pem", r: "-----BEGIN[\\s\\S]*?PRIVATE KEY-----", s: "critical" },
  { n: "email", r: "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}", s: "medium" },
  { n: "pwd", r: "(?:password|passwd|pwd)\\s*[:=]\\s*['\"][^'\"]{4,}['\"]", s: "high" },
];
class SD {
  detect(t) {
    const r = [];
    for (const p of SECRET_PATTERNS) {
      const re = new RegExp(p.r, "g");
      let m;
      while ((m = re.exec(t)) !== null) r.push({ type: p.n, severity: p.s, start: m.index });
    }
    return {
      total_candidates: r.length,
      confirmed_secrets: r.length,
      secrets: r.map((x) => ({ type: x.type, severity: x.severity })),
      stats: {
        by_severity: r.reduce((a, x) => {
          a[x.severity] = (a[x.severity] || 0) + 1;
          return a;
        }, {}),
      },
    };
  }
}
module.exports = { SecretDetector: SD };
