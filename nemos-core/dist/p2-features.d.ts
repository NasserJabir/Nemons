/**
 * Nemons — P2/P3 Features Implementation
 *
 * F-001: Project Management
 * F-015: Context Budget & Optimization
 * F-051: Budget & Stop Controls
 * F-045: Regression Detection
 * F-050: Least-Privilege Execution
 * F-062: Configuration & Provider Management
 * F-056: Typed Lineage Relationships
 * F-030: Historical Reconstruction
 * F-037: Ablation Testing
 * F-063: Import/Export
 */
import type { Run } from "./schemas/run.js";
export interface Project {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly repoUrl?: string;
    readonly createdAt: string;
    readonly runIds: readonly string[];
}
export declare class InMemoryProjectStore {
    private readonly projects;
    add(p: Project): Project;
    get(id: string): Project | undefined;
    list(): readonly Project[];
    addRun(projectId: string, runId: string): Project | undefined;
    size(): number;
}
export interface ContextBudget {
    readonly maxTokens: number;
    readonly maxAssets: number;
    readonly maxBytes: number;
    readonly preserveMandatory: boolean;
}
export declare const DEFAULT_CONTEXT_BUDGET: ContextBudget;
export interface BudgetedAsset {
    readonly assetKind: string;
    readonly assetId: string;
    readonly estimatedTokens: number;
    readonly estimatedBytes: number;
    readonly mandatory: boolean;
    readonly priority: number;
}
export declare function optimizeForBudget(assets: readonly BudgetedAsset[], budget?: ContextBudget): {
    readonly included: readonly BudgetedAsset[];
    readonly excluded: readonly BudgetedAsset[];
    readonly totalTokens: number;
    readonly totalBytes: number;
};
export interface RunBudgetLimits {
    readonly maxCostUsd?: number;
    readonly maxLatencyMs?: number;
    readonly maxToolCalls?: number;
    readonly maxSteps?: number;
}
export declare function checkRunBudget(metrics: {
    readonly costUsd?: number;
    readonly latencyMs?: number;
    readonly toolCallCount?: number;
    readonly stepCount?: number;
}, limits: RunBudgetLimits): {
    readonly exceeded: boolean;
    readonly reason?: string;
};
export interface RegressionReport {
    readonly skillId: string;
    readonly baselineSuccessRate: number;
    readonly candidateSuccessRate: number;
    readonly regressed: boolean;
    readonly regressedRunIds: readonly string[];
    readonly summary: string;
}
export declare function detectRegression(skillId: string, baselineRuns: readonly Run[], candidateRuns: readonly Run[], threshold?: number): RegressionReport;
export interface PermissionScope {
    readonly allowedPaths?: readonly string[];
    readonly deniedPaths?: readonly string[];
    readonly allowedCommands?: readonly string[];
    readonly deniedCommands?: readonly string[];
    readonly networkAccess: boolean;
    readonly fileWriteAccess: boolean;
}
export declare const DEFAULT_PERMISSION_SCOPE: PermissionScope;
export declare function checkPermission(action: {
    readonly command?: string;
    readonly estimatedImpact?: string;
}, scope: PermissionScope): {
    readonly allowed: boolean;
    readonly reason?: string;
};
export interface RuntimeConfiguration {
    readonly defaultAdapterKind?: string;
    readonly defaultMaxRetries: number;
    readonly defaultNoiseThresholdPct: number;
    readonly strictRetentionByDefault: boolean;
    readonly denyDestructiveActions: boolean;
    readonly healthCheckOnStartup: boolean;
}
export declare const DEFAULT_RUNTIME_CONFIG: RuntimeConfiguration;
export type LineageRelationKind = "derived_from" | "supports" | "supersedes" | "produced_by" | "verified_against" | "replaces";
export interface LineageEdge {
    readonly from: {
        readonly kind: string;
        readonly id: string;
    };
    readonly to: {
        readonly kind: string;
        readonly id: string;
    };
    readonly relation: LineageRelationKind;
}
export interface LineageQueryResult {
    readonly edges: readonly LineageEdge[];
    readonly summary: string;
}
export declare function buildLineage(records: readonly {
    readonly id: string;
    readonly kind: string;
    readonly derivedFromRunId?: string;
    readonly evaluationId?: string;
    readonly supersedesCandidateId?: string;
    readonly evidenceRefs?: readonly string[];
    readonly provenanceSource?: {
        readonly kind: string;
        readonly evidenceId?: string;
        readonly runId?: string;
    };
}[]): LineageQueryResult;
export interface ReconstructedRun {
    readonly run: Run | undefined;
    readonly evidence: readonly {
        readonly id: string;
        readonly kind: string;
        readonly claim: string;
        readonly verified: boolean;
    }[];
    readonly evaluation?: {
        readonly id: string;
        readonly overallResult: string;
    };
    readonly experience?: {
        readonly id: string;
        readonly summary: string;
    };
    readonly candidates: readonly {
        readonly id: string;
        readonly status: string;
    }[];
    readonly summary: string;
}
export declare function reconstructRun(runId: string, stores: {
    readonly runs?: readonly Run[];
    readonly evidence?: readonly {
        readonly id: string;
        readonly runId: string;
        readonly kind: string;
        readonly claim: string;
        readonly verified: boolean;
    }[];
    readonly evaluations?: readonly {
        readonly id: string;
        readonly runId: string;
        readonly overallResult: string;
    }[];
    readonly experiences?: readonly {
        readonly id: string;
        readonly runId: string;
        readonly summary: string;
    }[];
    readonly candidates?: readonly {
        readonly id: string;
        readonly evidenceRefs?: readonly string[];
        readonly status: string;
    }[];
}): ReconstructedRun;
export interface AblationConfig {
    readonly disablePersonas: boolean;
    readonly disableSkills: boolean;
    readonly disableKnowledge: boolean;
    readonly disableMemory: boolean;
    readonly disableExperience: boolean;
}
export declare const FULL_CONFIG: AblationConfig;
export interface AblationResult {
    readonly config: AblationConfig;
    readonly success: boolean;
    readonly metrics?: {
        readonly latencyMs?: number;
        readonly toolCallCount?: number;
    };
    readonly summary: string;
}
export declare function runAblation(configs: readonly AblationConfig[], executeFn: (config: AblationConfig) => Promise<AblationResult>): Promise<readonly AblationResult[]>;
export interface ExportBundle {
    readonly version: string;
    readonly exportedAt: string;
    readonly personas: readonly unknown[];
    readonly skills: readonly unknown[];
    readonly knowledge: readonly unknown[];
    readonly experiences: readonly unknown[];
    readonly candidates: readonly unknown[];
}
export declare function exportAssets(assets: {
    readonly personas?: readonly unknown[];
    readonly skills?: readonly unknown[];
    readonly knowledge?: readonly unknown[];
    readonly experiences?: readonly unknown[];
    readonly candidates?: readonly unknown[];
}): ExportBundle;
export declare function importAssets(bundle: ExportBundle): {
    readonly personas: readonly unknown[];
    readonly skills: readonly unknown[];
    readonly knowledge: readonly unknown[];
    readonly experiences: readonly unknown[];
    readonly candidates: readonly unknown[];
};
//# sourceMappingURL=p2-features.d.ts.map