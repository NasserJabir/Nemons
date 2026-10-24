// ============================================================
// Composition root — every service the HTTP endpoints use is
// instantiated ONCE here, at daemon boot, and referenced by the
// route handlers in server.js.
//
// Before this module, handlers did `new Module()` per request, so
// every service that keeps state in memory silently reset on every
// call: /delegation/create followed by /delegation/authorize lost
// the chain ("no_chain"), every /x/stats endpoint reported empty
// stats forever, and ensemble/evolution histories never
// accumulated. Instantiating here is what makes those endpoints
// actually work — do NOT move these constructors back into the
// handlers.
// ============================================================
const { PipelineIntegrator } = require("../utils/pipeline-integrator");
const { DAGPlanner } = require("../utils/dag-planner");
const { IIRPlan } = require("../utils/iir");
const { SkillLibrary } = require("../utils/skill-library");
const { MultiTypeMemory } = require("../utils/memory");
const { ProvenanceTrail } = require("../utils/provenance");
const { ApprovalWorkflow } = require("../utils/approval-workflow");
const { StaticAnalysis } = require("../utils/static-analysis");
const { SecretDetector } = require("../utils/secret-detector");
const { TTSI } = require("../utils/ttsi");
const { RealisticBenchmark } = require("../utils/realistic-benchmark");
const { ActiveInvestigator } = require("../utils/investigator");
const { XMemory } = require("../utils/xmemory");
const { EvolutionEngine } = require("../utils/evolution-engine");
const { KanbanBoard } = require("../utils/kanban-board");
const { A2AProtocol } = require("../utils/a2a-protocol");
const { AgenticRAG } = require("../utils/agentic-rag");
const { ADMITBench } = require("../utils/admit-bench");
const { EnsembleGenerator } = require("../utils/ensemble");
const { HierarchicalCoT } = require("../utils/hierarchical-cot");
const { NoveltyToT } = require("../utils/novelty-tot");
const { CodeVisionary } = require("../utils/code-visionary");
const { MultiPersona } = require("../utils/multi-persona");
const { PersonaRecaster } = require("../utils/persona-recaster");
const { SubagentManager } = require("../utils/subagent-manager");
const { DelegationSecurity } = require("../utils/delegation-security");
const { SkillCompiler } = require("../utils/skill-compiler");
const { WikiSkill } = require("../utils/wiki-skill");
const { MetaShare } = require("../utils/metashare");
const { RecursiveImprover } = require("../utils/recursive-improver");
const { SkillDirectory } = require("../utils/skill-directory");
const { ScaffoldingOptimizer } = require("../utils/scaffolding-optimizer");
const { UnifiedSkillSystem } = require("../utils/unified-skills");
const { MetricsCollector } = require("../utils/metrics");
const { WebhookManager, SUPPORTED_EVENTS } = require("../utils/webhook-manager");
const { OpenAPISpec } = require("../utils/openapi-spec");
const { PersonaEvolver } = require("../utils/persona-evolver");
const { SubagentOrchestrator } = require("../utils/subagent-orchestrator");
const { SkillEvolver } = require("../utils/skill-evolver");
const { CandidateLifecycle } = require("../utils/candidate-lifecycle");
const { PersonaBuilder } = require("../utils/persona-builder");
const { CBRExperienceStore } = require("../utils/cbr");
const { GoldenTaskSuite } = require("../utils/golden-tasks");
const { RateLimiter } = require("../utils/rate-limiter");
const { IdentityManager } = require("../utils/identity-manager");
const { StateManager } = require("../utils/state-manager");
const { ToolContract } = require("../utils/tool-contract");
const { ToolProviderContract } = require("../utils/tool-provider-contract");
const { AdapterContract } = require("../utils/adapter-contract");
const { ExecutionEnvironment } = require("../utils/execution-environment");

const subagents = new SubagentManager();

const services = {
  // v4.0 pipeline (context packs, post-run processing)
  pipeline: new PipelineIntegrator(),

  // v2.1 research modules
  dagPlanner: new DAGPlanner(),
  iirPlan: new IIRPlan(),
  skills: new SkillLibrary(),
  memory: new MultiTypeMemory(),
  provenance: new ProvenanceTrail(),
  approvals: new ApprovalWorkflow(),
  staticAnalysis: new StaticAnalysis(),
  secretDetector: new SecretDetector(),
  ttsi: new TTSI(),
  benchmark: new RealisticBenchmark(),
  investigator: new ActiveInvestigator(),
  personaBuilder: new PersonaBuilder(),
  cbr: new CBRExperienceStore(),
  goldenTasks: new GoldenTaskSuite(),

  // v4.0 file-backed registries (were per-request `new X()` before)
  identity: new IdentityManager(),
  candidateLifecycle: new CandidateLifecycle(),
  stateManager: new StateManager(),
  toolContract: new ToolContract(),
  toolProviderContract: new ToolProviderContract(),
  adapterContract: new AdapterContract(),
  executionEnvironment: new ExecutionEnvironment(),

  // v2.3 / v2.4 modules
  xmemory: new XMemory(),
  evolution: new EvolutionEngine(),
  kanban: new KanbanBoard(),
  a2a: new A2AProtocol(),
  rag: new AgenticRAG(),
  admit: new ADMITBench(),
  ensemble: new EnsembleGenerator(),
  hcot: new HierarchicalCoT(),
  ntot: new NoveltyToT(),
  codevision: new CodeVisionary(),
  multiPersona: new MultiPersona(),
  personaRecaster: new PersonaRecaster(),
  subagents,
  delegation: new DelegationSecurity(),
  skillCompiler: new SkillCompiler(),
  wikiSkill: new WikiSkill(),
  metaShare: new MetaShare(),
  recursiveImprover: new RecursiveImprover(),
  skillDirectory: new SkillDirectory(),
  scaffolding: new ScaffoldingOptimizer(),
  unifiedSkills: new UnifiedSkillSystem(),

  // v4.0 production modules
  metrics: new MetricsCollector(),
  webhooks: new WebhookManager(),
  openapi: new OpenAPISpec(),
  rateLimiter: new RateLimiter(),
  personaEvolver: new PersonaEvolver(),
  subagentOrchestrator: new SubagentOrchestrator(subagents),
  skillEvolver: new SkillEvolver(new UnifiedSkillSystem(), new CandidateLifecycle()),
};

module.exports = { services, SUPPORTED_EVENTS };
