/**
 * The shape of a Tier 4 run artifact — one file per candidate model per run.
 *
 * Cheatsheet rule 6: "log model + prompt + eval-set versions with every
 * score. A score without its versions is a number without meaning." That
 * rule is why this type has a boring top half: every field above `cases` is
 * there so a score found six months from now can still be interpreted, and
 * so `compare.ts` can REFUSE to compare runs that are not comparable.
 */
import type { FindingCode } from '../../solutions/checks';

/**
 * Bump whenever the artifact shape changes. `compare.ts` REFUSES artifacts
 * from another version instead of reading a missing field as a zero — which
 * is exactly the failure this version number earned itself catching: an added
 * `compatible` flag made every older run read as incompatible.
 */
export const ARTIFACT_SCHEMA_VERSION = 2;

export interface CaseResult {
	caseId: string;
	/** 0-based repeat index — same case, same input, sampled again. */
	repeat: number;
	/** Findings from the deterministic checks. Empty === passed the gate. */
	findings: FindingCode[];
	/** Judge score 1–5, or null when the judge errored / returned no score. */
	judgeScore: number | null;
	latencyMs: number;
	promptTokens: number;
	completionTokens: number;
	/** Cost of the CANDIDATE call only — what production would pay per order. */
	costUsd: number;
	/** Cost of judging this output. Eval overhead; never part of unit cost. */
	judgeCostUsd: number;
	/** Present only when the matching call itself failed. */
	error?: string;
	/** The raw model output, kept so a human can audit any score later. */
	output?: unknown;
}

export interface RunSummary {
	calls: number;
	errors: number;
	/**
	 * False when NOT ONE call succeeded — the model could not be evaluated at
	 * all. Usually a structured-output dialect mismatch rather than a quality
	 * problem: OpenAI's strict mode, for example, requires `required` to list
	 * every key in `properties`, which our deliberately-flat schema does not.
	 * That is a disqualifying compatibility result, not a bad score.
	 */
	compatible: boolean;
	/** Why the calls failed, truncated. Only set when calls errored. */
	firstError?: string;
	/** Fraction of calls whose output had ZERO findings. Null if incompatible. */
	gatePassRate: number | null;
	/** How often each finding code fired, across all calls. */
	defectCounts: Partial<Record<FindingCode, number>>;
	judgeMean: number | null;
	judgeStdDev: number | null;
	judgeScored: number;
	meanLatencyMs: number;
	p95LatencyMs: number;
	/** Candidate inference only — the number that scales with production traffic. */
	candidateCostUsd: number;
	/** What the judging cost you. Scales with eval runs, not with traffic. */
	judgeCostUsd: number;
	/** Candidate + judge: the price of this run. */
	totalCostUsd: number;
	/** Derived from candidateCostUsd alone. Do not fold the judge in here. */
	costPer1kOrdersUsd: number;
	/**
	 * Cases whose finding set was NOT identical across repeats. These are the
	 * cases where the model is non-deterministic in a way that matters — the
	 * single most useful column when someone asks "is this model stable?".
	 */
	unstableCases: string[];
}

export interface RunArtifact {
	schemaVersion: number;
	/** The model under test. */
	candidateModel: string;
	/** The judge. MUST be identical across every model you intend to compare. */
	judgeModel: string;
	rubricId: string;
	/** sha256 of the rubric text — catches an edited rubric with the same id. */
	rubricHash: string;
	/** sha256 of the rendered prompt template, menu included. */
	promptHash: string;
	/** sha256 over all fixture files — the eval-set version. */
	evalSetHash: string;
	caseCount: number;
	repeats: number;
	/** null means "provider default", i.e. NOT reproducible. */
	temperature: number | null;
	startedAt: string;
	finishedAt: string;
	summary: RunSummary;
	cases: CaseResult[];
}
