const ROLE_TEMPLATES = {
  senior_engineer: {
    role: "Senior Software Engineer",
    rules: ["Choose fewest tools", "Max 4 tool calls per turn", "Prefer composite tools"],
  },
  security_engineer: {
    role: "Security Engineer",
    rules: ["Always validate input", "Never log secrets", "Use least privilege"],
  },
  devops_engineer: {
    role: "DevOps Engineer",
    rules: ["Infrastructure as Code", "Make it reproducible", "Monitor everything"],
  },
};
class PB {
  build(k, c) {
    const t = ROLE_TEMPLATES[k] || ROLE_TEMPLATES.senior_engineer;
    const lines = [`# ROLE`, `You are **${t.role}**.`, `# RULES`];
    t.rules.forEach((r, i) => lines.push(`${i + 1}. ${r}`));
    return lines.join("\n");
  }
  listRoles() {
    return Object.entries(ROLE_TEMPLATES).map(([k, v]) => ({
      key: k,
      role: v.role,
      rules_count: v.rules.length,
    }));
  }
  stats() {
    return {
      total_roles: Object.keys(ROLE_TEMPLATES).length,
      reference: "arXiv:2509.00482",
      improvement: "+10%",
    };
  }
}
module.exports = { PersonaBuilder: PB, ROLE_TEMPLATES: ROLE_TEMPLATES };
