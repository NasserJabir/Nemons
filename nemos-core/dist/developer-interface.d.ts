/**
 * Nemons — Developer Interface (F-059)
 *
 * A programmatic CLI interface for inspecting Runs, assets,
 * Experience, Candidates, and governance state.
 *
 * This is NOT a standalone CLI binary — it's a programmatic interface
 * that can be called from a CLI wrapper, a REPL, or a web dashboard.
 * The actual CLI entry point (bin/nem) would be a separate package.
 *
 * Architectural principles enforced here:
 *   - Read-only: the interface does NOT modify any state.
 *   - No LLM: all output is deterministic.
 *   - No network: all queries are local.
 */
import type { Run } from "./schemas/run.js";
import type { Evidence } from "./schemas/evidence.js";
import type { Experience } from "./schemas/experience.js";
import type { CandidateRecord } from "./schemas/candidate.js";
import type { Persona } from "./schemas/persona.js";
import type { Skill } from "./schemas/skill.js";
import type { Knowledge } from "./schemas/knowledge.js";
import type { MemoryRecord } from "./schemas/memory.js";
import type { HealthCheckReport } from "./persistence/persistence-contract.js";
import type { CrossReferenceReport } from "./persistence/cross-reference-checker.js";
import type { EntitySummary } from "./persistence/entity-summarizer.js";
/**
 * The stores the developer interface queries.
 * Each is optional — the interface skips queries for missing stores.
 */
export interface DeveloperInterfaceStores {
    readonly runs?: readonly Run[];
    readonly evidence?: readonly Evidence[];
    readonly experiences?: readonly Experience[];
    readonly candidates?: readonly CandidateRecord[];
    readonly personas?: readonly Persona[];
    readonly skills?: readonly Skill[];
    readonly knowledge?: readonly Knowledge[];
    readonly memory?: readonly MemoryRecord[];
    readonly healthReports?: readonly HealthCheckReport[];
    readonly crossReferenceReport?: CrossReferenceReport;
}
/**
 * The developer interface (F-059).
 */
export interface DeveloperInterface {
    /** List all Runs with their state and outcome. */
    listRuns(): readonly {
        readonly id: string;
        readonly state: string;
        readonly outcome?: string;
        readonly startedAt?: string;
        readonly endedAt?: string;
    }[];
    /** Inspect a Run's context, evidence, evaluation, and failure causes. */
    inspectRun(runId: string): {
        readonly run?: Run;
        readonly evidence?: readonly Evidence[];
        readonly summary: string;
    };
    /** List all Experience records with their provenance kind and reusability. */
    listExperiences(): readonly {
        readonly id: string;
        readonly provenanceKind: string;
        readonly reusability: string;
        readonly summary: string;
    }[];
    /** List all Candidates with their status and asset. */
    listCandidates(): readonly {
        readonly id: string;
        readonly status: string;
        readonly assetId: string;
        readonly proposedVersion: string;
    }[];
    /** List all Personas with their version and approval status. */
    listPersonas(): readonly {
        readonly id: string;
        readonly version: string;
        readonly approved: boolean;
        readonly role: string;
    }[];
    /** List all Skills with their version and approval status. */
    listSkills(): readonly {
        readonly id: string;
        readonly version: string;
        readonly approved: boolean;
        readonly name: string;
    }[];
    /** List all Knowledge with their provenance. */
    listKnowledge(): readonly {
        readonly id: string;
        readonly provenanceKind: string;
        readonly title: string;
    }[];
    /** List all Memory records. */
    listMemory(): readonly {
        readonly id: string;
        readonly kind: string;
        readonly provenanceKind: string;
    }[];
    /** Health check: detect missing data, orphaned records, storage issues. */
    healthCheck(): {
        readonly crossReferenceReport?: CrossReferenceReport;
        readonly summary: string;
    };
    /** Get a summary of an entity (Entity Page, ADR-0009). */
    summarizeEntity(entityKind: "run" | "evidence" | "experience" | "candidate", entityId: string): EntitySummary | {
        readonly entityKind: string;
        readonly entityId: string;
        readonly found: false;
        readonly summary: string;
    };
}
/**
 * Default DeveloperInterface implementation.
 * Takes pre-loaded arrays (from persistent stores' list() methods).
 */
export declare class DefaultDeveloperInterface implements DeveloperInterface {
    private readonly stores;
    constructor(stores: DeveloperInterfaceStores);
    listRuns(): readonly {
        readonly id: string;
        readonly state: string;
        readonly outcome?: string;
        readonly startedAt?: string;
        readonly endedAt?: string;
    }[];
    inspectRun(runId: string): {
        readonly run?: Run;
        readonly evidence?: readonly Evidence[];
        readonly summary: string;
    };
    listExperiences(): readonly {
        readonly id: string;
        readonly provenanceKind: string;
        readonly reusability: string;
        readonly summary: string;
    }[];
    listCandidates(): readonly {
        readonly id: string;
        readonly status: string;
        readonly assetId: string;
        readonly proposedVersion: string;
    }[];
    listPersonas(): readonly {
        readonly id: string;
        readonly version: string;
        readonly approved: boolean;
        readonly role: string;
    }[];
    listSkills(): readonly {
        readonly id: string;
        readonly version: string;
        readonly approved: boolean;
        readonly name: string;
    }[];
    listKnowledge(): readonly {
        readonly id: string;
        readonly provenanceKind: string;
        readonly title: string;
    }[];
    listMemory(): readonly {
        readonly id: string;
        readonly kind: string;
        readonly provenanceKind: string;
    }[];
    healthCheck(): {
        readonly crossReferenceReport?: CrossReferenceReport;
        readonly summary: string;
    };
    summarizeEntity(entityKind: "run" | "evidence" | "experience" | "candidate", entityId: string): EntitySummary | {
        readonly entityKind: string;
        readonly entityId: string;
        readonly found: false;
        readonly summary: string;
    };
}
//# sourceMappingURL=developer-interface.d.ts.map