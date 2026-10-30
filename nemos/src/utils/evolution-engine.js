// ============================================================
// EvoAgentX — Self-Evolution Engine
// Based on: EvoAgentX (GitHub: ANative-Lab/EvoAgentX)
// 4 algorithms: TextGrad, MIPRO, AFlow, EvoPrompt
//
// HONESTY NOTE (do not remove): this module GENERATES candidate
// prompt/workflow variants. It has NO evaluator of its own, so it cannot
// measure whether a variant is better. It used to fill the gap with
// `0.5 + Math.random() * 0.5` and label it `score_source:
// "random_unmeasured"` — a label is not enough, because any consumer reading
// `expected_score` got a fabricated metric. Now an unmeasured variant has no
// score at all (`expected_score: null`), no "best" is selected, and the result
// says `scored: false`. Inject an evaluator (`new EvolutionEngine({ evaluator })`,
// an async (prompt, meta) => number) to get real scores.
// ============================================================
const path = require("path");
const { nemonsHome } = require("./runtime-config");

const DATA_DIR = path.join(nemonsHome(), "evolution");

class EvolutionEngine {
  constructor({ evaluator = null } = {}) {
    this.evaluator = typeof evaluator === "function" ? evaluator : null;
    this.algorithms = {
      textgrad: this.textGrad.bind(this),
      mipro: this.mipro.bind(this),
      aflow: this.aflow.bind(this),
      evoprompt: this.evoPrompt.bind(this),
    };
  }

  // TextGrad: gradient-inspired prompt refinement
  async textGrad(prompt, feedback, iterations) {
    iterations = iterations || 3;
    let current = prompt;
    const history = [];
    for (let i = 0; i < iterations; i++) {
      // "Gradient" = direction of improvement based on feedback
      const gradient = this.computeGradient(current, feedback);
      const updated = this.applyGradient(current, gradient);
      history.push({ iteration: i + 1, prompt: updated.slice(0, 100), gradient_score: gradient.score });
      current = updated;
    }
    return {
      algorithm: "textgrad",
      final_prompt: current,
      iterations: history.length,
      history,
      // heuristic keyword-overlap score, not a measured quality delta
      improvement: history[history.length - 1]?.gradient_score || 0,
      score_source: "heuristic_keyword_overlap",
    };
  }

  computeGradient(prompt, feedback) {
    const fl = (feedback || "").toLowerCase();
    const pl = (prompt || "").toLowerCase();
    const feedbackWords = fl.split(/\s+/).filter(w => w.length > 4);
    let matched = 0;
    for (const w of feedbackWords) if (pl.includes(w)) matched++;
    return {
      score: matched / Math.max(feedbackWords.length, 1),
      suggestions: feedbackWords.filter(w => !pl.includes(w)).slice(0, 5),
    };
  }

  applyGradient(prompt, gradient) {
    if (!gradient.suggestions.length) return prompt;
    return prompt + "\n// Improved based on feedback: consider " + gradient.suggestions.join(", ");
  }

  // MIPRO-inspired: generate variants. Selection is only performed when an
  // evaluator is injected; otherwise every variant is returned unscored and
  // `best_variant` stays null, because "best" would be an invention.
  async mipro(prompt, examples, objective) {
    const variants = [];
    for (let i = 0; i < 3; i++) {
      variants.push({ variant: i, prompt: this.mutate(prompt, i) });
    }

    if (!this.evaluator) {
      return {
        algorithm: "mipro",
        original: prompt.slice(0, 100),
        variants,
        best_variant: null,
        scored: false,
        score_source: "unmeasured",
        note: "Variants generated but not evaluated: no evaluator is configured, so none is scored and none is selected.",
      };
    }

    const scored = [];
    for (const v of variants) {
      const score = await this.evaluator(v.prompt, { algorithm: "mipro", variant: v.variant, examples, objective });
      if (typeof score !== "number" || !Number.isFinite(score)) {
        throw new Error("evaluator returned a non-numeric score");
      }
      scored.push({ ...v, expected_score: score });
    }
    const best = scored.slice().sort((a, b) => b.expected_score - a.expected_score)[0];
    return {
      algorithm: "mipro",
      original: prompt.slice(0, 100),
      variants: scored,
      best_variant: best.variant,
      best_prompt: best.prompt,
      scored: true,
      score_source: "external_evaluator",
    };
  }

  mutate(prompt, idx) {
    const variations = ["// Optimized for clarity\n", "// Focused on edge cases\n", "// Emphasis on testing\n"];
    return (variations[idx % variations.length] || "") + prompt;
  }

  // AFlow-inspired: MCTS-shaped workflow exploration. Child values come only
  // from an injected evaluator; without one the tree is generated but nothing
  // is scored and no child is chosen (previously random placeholders were used).
  async aflow(workflow, rewards) {
    const tree = { node: workflow, visits: 1, value: rewards?.[0] ?? null, children: [] };
    // Expand: try different execution orders
    const steps = workflow.steps || [];
    for (let i = 0; i < Math.min(steps.length, 3); i++) {
      tree.children.push({ node: { ...workflow, steps: this.reorder(steps, i) }, visits: 0, value: null, children: [] });
    }

    if (!this.evaluator) {
      return {
        algorithm: "aflow",
        original_value: tree.value,
        children_explored: tree.children.length,
        best_child: null,
        best_value: null,
        scored: false,
        score_source: "unmeasured",
        note: "Child workflows generated but not simulated or scored: no evaluator is configured, so no child is selected.",
      };
    }

    for (const child of tree.children) {
      const value = await this.evaluator(child.node, { algorithm: "aflow" });
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error("evaluator returned a non-numeric value");
      }
      child.visits = 1;
      child.value = value;
    }
    const best = tree.children.slice().sort((a, b) => b.value - a.value)[0];
    return {
      algorithm: "aflow",
      original_value: tree.value,
      children_explored: tree.children.length,
      best_child: best ? best.node : null,
      best_value: best ? best.value : null,
      scored: true,
      score_source: "external_evaluator",
    };
  }

  reorder(steps, idx) {
    const r = [...steps];
    if (idx < r.length) {
      const tmp = r[0];
      r[0] = r[idx];
      r[idx] = tmp;
    }
    return r;
  }

  // EvoPrompt: feedback-driven prompt refinement
  async evoPrompt(prompt, feedbackHistory) {
    let current = prompt;
    const generations = [];
    for (let i = 0; i < (feedbackHistory?.length || 3); i++) {
      const feedback = feedbackHistory[i] || "improve clarity";
      const refined = this.refine(current, feedback);
      generations.push({ generation: i + 1, feedback: feedback.slice(0, 50), prompt: refined.slice(0, 100) });
      current = refined;
    }
    return { algorithm: "evoprompt", final_prompt: current, generations: generations.length, history: generations };
  }

  refine(prompt, feedback) {
    const pl = (prompt || "").toLowerCase();
    const fl = (feedback || "").toLowerCase();
    if (fl.includes("clear") && !pl.includes("clear")) return "// Be clear and concise\n" + prompt;
    if (fl.includes("test") && !pl.includes("test")) return "// Include test coverage\n" + prompt;
    return prompt + "\n// Refined based on: " + feedback;
  }

  // Run the requested algorithms and collect results
  async evolve(prompt, options) {
    const opts = options || {};
    const results = {};
    if (opts.feedback) results.textgrad = await this.textGrad(prompt, opts.feedback, opts.iterations || 3);
    if (opts.examples) results.mipro = await this.mipro(prompt, opts.examples, opts.objective);
    if (opts.workflow) results.aflow = await this.aflow(opts.workflow, opts.rewards);
    if (opts.feedback_history) results.evoprompt = await this.evoPrompt(prompt, opts.feedback_history);
    return {
      original: prompt.slice(0, 100),
      algorithms_run: Object.keys(results),
      // No evaluator ⇒ no score anywhere in `results`; read this before
      // treating any number here as a measurement.
      scored: Boolean(this.evaluator),
      evaluation_backend: this.evaluator ? "external evaluator (injected)" : "none",
      results,
    };
  }

  async stats() {
    return {
      algorithms: ["textgrad", "mipro", "aflow", "evoprompt"],
      reference: "EvoAgentX (GitHub)",
      evaluation_backend: this.evaluator ? "external evaluator (injected)" : "none",
      capabilities: {
        generates_variants: true,
        // mipro/aflow selection needs an evaluator; textgrad/evoprompt are
        // deterministic string edits with no quality claim.
        scores_variants: Boolean(this.evaluator),
        selects_best_variant: Boolean(this.evaluator),
      },
      data_dir: DATA_DIR,
    };
  }
}

module.exports = { EvolutionEngine };
