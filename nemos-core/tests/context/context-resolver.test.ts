import { describe, it, expect } from "vitest";
import {
  DefaultContextResolver,
  isApplicable,
} from "../../src/context/context-resolver.js";
import type { Persona } from "../../src/schemas/persona.js";
import type { Skill } from "../../src/schemas/skill.js";
import type { Knowledge } from "../../src/schemas/knowledge.js";
import type { MemoryRecord } from "../../src/schemas/memory.js";
import { asPersonaId, asSkillId, asKnowledgeId, asMemoryRecordId, asRunId } from "../../src/core/identifiers.js";
import type { RunInputs } from "../../src/schemas/run.js";

function makePersona(overrides: Partial<Persona> = {}): Persona {
  return {
    id: asPersonaId("p-1"),
    version: "1.0.0",
    provenance: { kind: "approved", source: { kind: "human", actor: "x", at: "x" } },
    role: "Test-Fix Engineer",
    responsibilities: ["fix tests"],
    workingApproach: "isolate, fix, verify",
    constraints: {},
    applicability: { taskKinds: ["test-fix"] },
    ...overrides,
  };
}

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: asSkillId("s-1"),
    version: "1.0.0",
    provenance: { kind: "approved", source: { kind: "human", actor: "x", at: "x" } },
    name: "run-tests",
    description: "Run tests",
    applicability: { taskKinds: ["test-fix"] },
    inputs: [],
    outputs: [],
    requiredCapabilities: [{ capability: "tool.shell.exec", required: true }],
    ...overrides,
  };
}

function makeKnowledge(overrides: Partial<Knowledge> = {}): Knowledge {
  return {
    id: asKnowledgeId("k-1"),
    version: "1.0.0",
    provenance: { kind: "approved", source: { kind: "human", actor: "x", at: "x" } },
    title: "Test Runner",
    summary: "config",
    content: "vitest",
    applicability: { subjectKind: "repository", taskKinds: ["test-fix"] },
    ...overrides,
  };
}

function makeMemory(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: asMemoryRecordId("m-1"),
    kind: "experience",
    provenance: { kind: "approved", source: { kind: "run", runId: asRunId("r-prev"), at: "x" } },
    applicability: { taskKinds: ["test-fix"] },
    derivedFromRunId: asRunId("r-prev"),
    content: { x: 1 },
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeRunInputs(overrides: Partial<RunInputs> = {}): RunInputs {
  return {
    taskDescription: "Fix the failing test",
    taskKind: "test-fix",
    taskTags: ["vitest"],
    repoInstance: {
      repoIdentity: { repo: "https://example.com/repo.git", sha: "abc" },
      instanceId: "inst-1",
    },
    ...overrides,
  };
}

describe("context-resolver", () => {
  describe("isApplicable", () => {
    it("matches when taskKinds contains the run's taskKind", () => {
      const asset = {
        applicability: { taskKinds: ["test-fix", "refactor"] },
      };
      expect(isApplicable(asset, makeRunInputs())).toBe(true);
    });

    it("does NOT match when taskKinds does not contain the run's taskKind", () => {
      const asset = {
        applicability: { taskKinds: ["feature"] },
      };
      expect(isApplicable(asset, makeRunInputs())).toBe(false);
    });

    it("matches when asset has no conditions (default-applicable)", () => {
      const asset = { applicability: {} };
      expect(isApplicable(asset, makeRunInputs())).toBe(true);
    });

    it("matches repoPatterns with prefix match (ending in *)", () => {
      const asset = {
        applicability: { repoPatterns: ["https://example.com/*"] },
      };
      expect(isApplicable(asset, makeRunInputs())).toBe(true);
    });

    it("does NOT match repoPatterns when prefix is different", () => {
      const asset = {
        applicability: { repoPatterns: ["https://other.com/*"] },
      };
      expect(isApplicable(asset, makeRunInputs())).toBe(false);
    });

    it("matches repoPatterns with exact match (no *)", () => {
      const asset = {
        applicability: { repoPatterns: ["https://example.com/repo.git"] },
      };
      expect(isApplicable(asset, makeRunInputs())).toBe(true);
    });

    it("AND semantics: all taskTags must be present in run", () => {
      const asset = {
        applicability: { taskTags: ["vitest", "ci"] },
      };
      expect(isApplicable(asset, makeRunInputs({ taskTags: ["vitest", "ci"] }))).toBe(true);
      expect(isApplicable(asset, makeRunInputs({ taskTags: ["vitest"] }))).toBe(false);
    });
  });

  describe("DefaultContextResolver", () => {
    it("includes approved, applicable personas", () => {
      const r = new DefaultContextResolver({
        personas: [makePersona()],
        skills: [],
        knowledge: [],
        memory: [],
      });
      const result = r.resolve({
        runInputs: makeRunInputs(),
        availableCapabilities: new Set(["tool.shell.exec"]),
      });
      expect(result.personas).toHaveLength(1);
      expect(result.personas[0]?.included).toBe(true);
    });

    it("EXCLUDES deprecated personas (lifecycle)", () => {
      const r = new DefaultContextResolver({
        personas: [
          makePersona({
            provenance: { kind: "deprecated", source: { kind: "human", actor: "x", at: "x" } },
          }),
        ],
        skills: [],
        knowledge: [],
        memory: [],
      });
      const result = r.resolve({
        runInputs: makeRunInputs(),
        availableCapabilities: new Set(),
      });
      expect(result.personas).toHaveLength(1);
      expect(result.personas[0]?.included).toBe(false);
      expect(result.personas[0]?.exclusionReasonKind).toBe("lifecycle");
    });

    it("EXCLUDES skills with unmet capability requirements (capability)", () => {
      const r = new DefaultContextResolver({
        personas: [],
        skills: [makeSkill()],
        knowledge: [],
        memory: [],
      });
      const result = r.resolve({
        runInputs: makeRunInputs(),
        availableCapabilities: new Set(), // no capabilities
      });
      expect(result.skills[0]?.included).toBe(false);
      expect(result.skills[0]?.exclusionReasonKind).toBe("capability");
    });

    it("INCLUDES skills when all required capabilities are available", () => {
      const r = new DefaultContextResolver({
        personas: [],
        skills: [makeSkill()],
        knowledge: [],
        memory: [],
      });
      const result = r.resolve({
        runInputs: makeRunInputs(),
        availableCapabilities: new Set(["tool.shell.exec"]),
      });
      expect(result.skills[0]?.included).toBe(true);
    });

    it("EXCLUDES memory records past their expiresAt", () => {
      const r = new DefaultContextResolver({
        personas: [],
        skills: [],
        knowledge: [],
        memory: [
          makeMemory({
            applicability: { taskKinds: ["test-fix"], expiresAt: "2020-01-01T00:00:00Z" },
          }),
        ],
      });
      const result = r.resolve({
        runInputs: makeRunInputs(),
        availableCapabilities: new Set(),
      });
      expect(result.memory[0]?.included).toBe(false);
      expect(result.memory[0]?.exclusionReasonKind).toBe("applicability");
    });

    it("EXCLUDES knowledge that does not match the run's taskKind", () => {
      const r = new DefaultContextResolver({
        personas: [],
        skills: [],
        knowledge: [makeKnowledge({ applicability: { subjectKind: "repository", taskKinds: ["feature"] } })],
        memory: [],
      });
      const result = r.resolve({
        runInputs: makeRunInputs(),
        availableCapabilities: new Set(),
      });
      expect(result.knowledge[0]?.included).toBe(false);
      expect(result.knowledge[0]?.exclusionReasonKind).toBe("applicability");
    });
  });
});
