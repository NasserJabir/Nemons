// Realistic Benchmark — COMPLETE v2.5.0
// Based on: arXiv:2510.08996 (Saving SWE-Bench)
class RealisticBenchmark {
  constructor() {
    this.transformations = [
      { formal: /fix the bug in (?:the )?(\w+) function/i, realistic: (m) => `the ${m[1]} function is broken` },
      { formal: /resolve issue #\d+:?\s*(.+)/i, realistic: (m) => `something wrong: ${m[1]}` },
      { formal: /implement (?:a )?(\w+) function that (.+)/i, realistic: (m) => `I need a ${m[1]} that ${m[2]}` },
      { formal: /add support for (.+)/i, realistic: (m) => `can we support ${m[1]}?` },
      { formal: /refactor (?:the )?(\w+) to (.+)/i, realistic: (m) => `the ${m[1]} is messy, clean it up to ${m[2]}` },
      { formal: /write (?:unit )?tests for (?:the )?(\w+)/i, realistic: (m) => `add tests for ${m[1]}` },
      { formal: /update (?:the )?(\w+) (?:module|component|function)/i, realistic: (m) => `the ${m[1]} needs updating` },
      { formal: /optimize (?:the )?(\w+) (?:function|method|component)/i, realistic: (m) => `the ${m[1]} is too slow` },
      { formal: /debug (?:the )?(\w+) (?:function|method|component)/i, realistic: (m) => `something weird with ${m[1]}` },
      { formal: /deploy (?:the )?(\w+) (?:to|on) (.+)/i, realistic: (m) => `put ${m[1]} on ${m[2]}` },
    ];
    
    this.userStylePrefixes = ["please", "hey", "I think", "not sure why but", "seems like", "would be great if", "can you"];
    this.userStyleSuffixes = ["thanks", "if possible", "when you get a chance", "appreciate it"];
  }
  
  transform(formalSpec) {
    let realistic = formalSpec;
    let patternUsed = null;
    
    for (const t of this.transformations) {
      const match = formalSpec.match(t.formal);
      if (match) {
        realistic = t.realistic(match);
        patternUsed = t.formal.source;
        break;
      }
    }
    
    // Add casual style (50% chance)
    const styleAdded = {};
    if (Math.random() > 0.5) {
      const prefix = this.userStylePrefixes[Math.floor(Math.random() * this.userStylePrefixes.length)];
      realistic = `${prefix.charAt(0).toUpperCase() + prefix.slice(1)}, ${realistic}`;
      styleAdded.prefix = prefix;
    }
    if (Math.random() > 0.7) {
      const suffix = this.userStyleSuffixes[Math.floor(Math.random() * this.userStyleSuffixes.length)];
      realistic = `${realistic} - ${suffix}`;
      styleAdded.suffix = suffix;
    }
    
    // Casual replacements
    const replacements = {
      "Implement": "create", "Resolve": "fix", "according to specification": "",
      "as described in the requirements": "", "utilizing best practices": "",
    };
    for (const [formal, casual] of Object.entries(replacements)) {
      realistic = realistic.replace(new RegExp(formal, "gi"), casual);
    }
    realistic = realistic.replace(/\s+/g, " ").replace(/ ,/g, ",").trim();
    
    return {
      original: formalSpec,
      realistic,
      pattern_used: patternUsed,
      style_added: styleAdded,
      transformations_count: patternUsed ? 1 + Object.keys(styleAdded).length : Object.keys(styleAdded).length,
    };
  }
  
  generateBatch(formalSpecs) {
    return formalSpecs.map(spec => this.transform(spec));
  }
  
  measurePerformanceGap(formalResults, realisticResults) {
    const fPass = formalResults.filter(r => r.pass).length / formalResults.length;
    const rPass = realisticResults.filter(r => r.pass).length / realisticResults.length;
    const overestimation = fPass - rPass;
    
    return {
      formal_pass_rate: Math.round(fPass * 1000) / 1000,
      realistic_pass_rate: Math.round(rPass * 1000) / 1000,
      overestimation: Math.round(overestimation * 1000) / 1000,
      overestimation_percent: ((overestimation / Math.max(fPass, 0.001)) * 100).toFixed(1) + "%",
      finding: overestimation > 0.1
        ? "Significant overestimation detected (matches SWE-bench findings)"
        : "No significant overestimation",
    };
  }
  
  getTestPrompts() {
    const formal = [
      "Implement a function that returns the factorial of a number n.",
      "Fix the bug in the parseDate function that fails on ISO 8601 format.",
      "Write unit tests for the UserService class covering edge cases.",
      "Refactor the authentication module to use OAuth 2.1.",
      "Debug the calculateTotal function that returns incorrect values for negative numbers.",
      "Optimize the searchComponent to reduce render time from 500ms to under 100ms.",
      "Add support for WebP image format in the image upload handler.",
      "Deploy the user-service to Kubernetes with health checks and auto-scaling.",
    ];
    return {
      formal,
      realistic: formal.map(f => this.transform(f).realistic),
    };
  }
  
  stats() {
    return {
      transformation_patterns: this.transformations.length,
      user_style_prefixes: this.userStylePrefixes.length,
      user_style_suffixes: this.userStyleSuffixes.length,
      reference: "arXiv:2510.08996",
      key_finding: "Formal benchmarks overestimate agent capabilities by ~50%",
    };
  }
}

module.exports = { RealisticBenchmark };
