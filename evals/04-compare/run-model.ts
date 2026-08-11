#!/usr/bin/env bun
/**
 * TIER 4 — run the eval set against ONE candidate model and store the result.
 *
 * This is the "can we run our software on this new LLM?" harness. It answers
 * that in two layers, cheapest first:
 *
 *   1. DETERMINISTIC GATE — the Hands-on 1 checks, over the model's live raw
 *      output. Free, instant, perfectly reproducible, no opinion involved.
 *      A model that emits invalid schema or hallucinates menu items is
 *      disqualified here, whatever a judge might think of its prose.
 *   2. GRADED SCORE — the calibrated judge, for the residual that genuinely
 *      needs taste: is the clarification helpful, is the reading reasonable.
 *
 * Everything lands in one JSON artifact per run, which `compare.ts` reads.
 *
 * Usage:
 *   bun run eval:model -- --model anthropic/claude-haiku-4.5
 *   bun run eval:model -- --model openai/gpt-5 --repeats 5 --limit 4
 *
 * Options:
 *   --model <slug>       candidate model (required)
 *   --judge <slug>       judge model (default anthropic/claude-sonnet-5)
 *   --repeats <n>        samples per case (default 3 — one is never enough)
 *   --temperature <t>    candidate sampling temperature (default 0)
 *   --limit <n>          only the first n cases (for a cheap smoke test)
 *   --concurrency <n>    parallel cases (default 4)
 *   --no-judge           deterministic gate only: free, offline-fast, no judge
 *   --out <dir>          artifact directory (default ./results)
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { matchOrderWithMeta, menu } from '../../src/matching';
import { matchingPrompt } from '../../src/prompts/matchingPrompt';
import { runChecks, type FindingCode, type GoldenExpectation } from '../../solutions/checks';
import { CALIBRATED_RUBRIC, RUBRIC_ID } from '../../solutions/rubric';
import { judgeOutput } from './judge';
import { ARTIFACT_SCHEMA_VERSION, type CaseResult, type RunArtifact, type RunSummary } from './types';

const { values } = parseArgs({
	options: {
		model: { type: 'string' },
		judge: { type: 'string', default: 'anthropic/claude-sonnet-5' },
		repeats: { type: 'string', default: '3' },
		temperature: { type: 'string', default: '0' },
		limit: { type: 'string' },
		concurrency: { type: 'string', default: '4' },
		'no-judge': { type: 'boolean', default: false },
		out: { type: 'string', default: join(import.meta.dir, 'results') }
	}
});

if (!values.model) {
	console.error('--model is required, e.g. --model anthropic/claude-haiku-4.5');
	process.exit(2);
}

const candidateModel = values.model;
const judgeModel = values.judge!;
const repeats = Number(values.repeats);
const temperature = Number(values.temperature);
const concurrency = Number(values.concurrency);
const useJudge = !values['no-judge'];

// ---------------------------------------------------------------------------
// Load the eval set. Only `transcript` and `expected` are used: those are
// model-independent. A fixture's `recorded` output and `expectedFindings`
// belong to the OFFLINE exercise — for a live run the expectation is always
// the same, and always simply zero findings.
// ---------------------------------------------------------------------------
interface CaseFile {
	id: string;
	transcript: string;
	expected: GoldenExpectation;
}

const casesDir = join(import.meta.dir, '../../fixtures/cases');
const caseFiles = readdirSync(casesDir)
	.filter((f) => f.endsWith('.json'))
	.sort();
const rawCases = caseFiles.map((f) => readFileSync(join(casesDir, f), 'utf-8'));
const allCases: CaseFile[] = rawCases.map((s) => JSON.parse(s));
const cases = values.limit ? allCases.slice(0, Number(values.limit)) : allCases;

const sha = (s: string) => `sha256:${createHash('sha256').update(s).digest('hex').slice(0, 16)}`;
const evalSetHash = sha(rawCases.join('\n'));
// Hashing the rendered template with an empty transcript captures both the
// rules AND the menu — a menu change invalidates comparisons just as surely
// as a prompt change does.
const promptHash = sha(matchingPrompt(menu, '', [], undefined));
const rubricHash = sha(CALIBRATED_RUBRIC);

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
async function mapWithConcurrency<T, R>(
	items: T[],
	limit: number,
	fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let next = 0;
	const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (true) {
			const i = next++;
			if (i >= items.length) return;
			results[i] = await fn(items[i]!, i);
		}
	});
	await Promise.all(workers);
	return results;
}

const units = cases.flatMap((c) => Array.from({ length: repeats }, (_, r) => ({ c, repeat: r })));

console.log(
	`Tier 4 — ${candidateModel}\n` +
		`  eval set ${cases.length} cases × ${repeats} repeats = ${units.length} calls\n` +
		`  judge ${useJudge ? judgeModel : '(disabled)'}   temperature ${temperature}\n`
);

const startedAt = new Date().toISOString();
let done = 0;

const results = await mapWithConcurrency(units, concurrency, async ({ c, repeat }) => {
	const result: CaseResult = {
		caseId: c.id,
		repeat,
		findings: [],
		judgeScore: null,
		latencyMs: 0,
		promptTokens: 0,
		completionTokens: 0,
		costUsd: 0,
		judgeCostUsd: 0
	};

	try {
		const { raw, meta } = await matchOrderWithMeta({
			transcript: c.transcript,
			model: candidateModel,
			temperature
		});
		result.latencyMs = Math.round(meta.latencyMs);
		result.promptTokens = meta.promptTokens;
		result.completionTokens = meta.completionTokens;
		result.costUsd = meta.costUsd;
		result.output = raw;
		result.findings = runChecks(raw, c.expected);

		if (useJudge) {
			try {
				const verdict = await judgeOutput({
					transcript: c.transcript,
					output: raw,
					expected: c.expected,
					rubric: CALIBRATED_RUBRIC,
					model: judgeModel,
					temperature: 0
				});
				result.judgeScore = verdict.score;
				result.judgeCostUsd = verdict.costUsd;
			} catch (e) {
				// A judge failure must not erase a valid deterministic result.
				result.error = `judge: ${(e as Error).message}`;
			}
		}
	} catch (e) {
		result.error = (e as Error).message;
	}

	done++;
	const tag = result.error
		? `ERROR ${result.error.slice(0, 60)}`
		: `${result.findings.length ? result.findings.join(',') : 'clean'}${
				result.judgeScore === null ? '' : ` score ${result.judgeScore}`
			}`;
	console.log(`  [${done}/${units.length}] ${c.id} r${repeat} — ${tag}`);
	return result;
});

const finishedAt = new Date().toISOString();

// ---------------------------------------------------------------------------
// Summarize
// ---------------------------------------------------------------------------
function percentile(sorted: number[], p: number): number {
	if (sorted.length === 0) return 0;
	const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
	return sorted[Math.max(0, idx)]!;
}

const ok = results.filter((r) => !r.error || r.error.startsWith('judge:'));
const errors = results.filter((r) => r.error && !r.error.startsWith('judge:'));
const scores = results.map((r) => r.judgeScore).filter((s): s is number => s !== null);
const judgeMean = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
const judgeStdDev =
	scores.length > 1 && judgeMean !== null
		? Math.sqrt(scores.reduce((a, s) => a + (s - judgeMean) ** 2, 0) / (scores.length - 1))
		: null;

const defectCounts: Partial<Record<FindingCode, number>> = {};
for (const r of results) for (const f of r.findings) defectCounts[f] = (defectCounts[f] ?? 0) + 1;

const unstableCases = cases
	.map((c) => c.id)
	.filter((id) => {
		const sets = results.filter((r) => r.caseId === id).map((r) => r.findings.join('|'));
		return new Set(sets).size > 1;
	});

const latencies = ok.map((r) => r.latencyMs).sort((a, b) => a - b);
// Candidate and judge costs are kept apart on purpose: the first scales with
// production traffic, the second only with how often you run the eval.
// Folding them together inflates the unit cost of every model you test.
const candidateCost = results.reduce((a, r) => a + r.costUsd, 0);
const judgeCost = results.reduce((a, r) => a + r.judgeCostUsd, 0);

const summary: RunSummary = {
	calls: results.length,
	errors: errors.length,
	compatible: ok.length > 0,
	...(errors.length ? { firstError: errors[0]!.error!.slice(0, 400) } : {}),
	gatePassRate: ok.length ? ok.filter((r) => r.findings.length === 0).length / ok.length : null,
	defectCounts,
	judgeMean,
	judgeStdDev,
	judgeScored: scores.length,
	meanLatencyMs: latencies.length
		? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
		: 0,
	p95LatencyMs: Math.round(percentile(latencies, 95)),
	candidateCostUsd: candidateCost,
	judgeCostUsd: judgeCost,
	totalCostUsd: candidateCost + judgeCost,
	costPer1kOrdersUsd: results.length ? (candidateCost / results.length) * 1000 : 0,
	unstableCases
};

const artifact: RunArtifact = {
	schemaVersion: ARTIFACT_SCHEMA_VERSION,
	candidateModel,
	judgeModel: useJudge ? judgeModel : '(none)',
	rubricId: useJudge ? RUBRIC_ID : '(none)',
	rubricHash: useJudge ? rubricHash : '(none)',
	promptHash,
	evalSetHash,
	caseCount: cases.length,
	repeats,
	temperature: Number.isNaN(temperature) ? null : temperature,
	startedAt,
	finishedAt,
	summary,
	cases: results
};

mkdirSync(values.out!, { recursive: true });
const slug = candidateModel.replace(/[^a-z0-9.]+/gi, '_');
const file = join(values.out!, `${slug}__${startedAt.replace(/[:.]/g, '-')}.json`);
writeFileSync(file, JSON.stringify(artifact, null, 2));

if (!summary.compatible) {
	console.log(`
— ${candidateModel} — INCOMPATIBLE
  Not one call succeeded, so this model cannot be evaluated against the eval
  set as it stands. This is a compatibility verdict, not a quality score.
  ${summary.firstError}

artifact: ${file}`);
	process.exit(1);
}

console.log(`
— ${candidateModel} —
  gate pass       ${(summary.gatePassRate! * 100).toFixed(1)}%  (zero findings)
  judge mean      ${summary.judgeMean === null ? 'n/a' : summary.judgeMean.toFixed(2)}${
		summary.judgeStdDev === null ? '' : ` ± ${summary.judgeStdDev.toFixed(2)}`
	}
  defects         ${
		Object.keys(defectCounts).length
			? Object.entries(defectCounts)
					.sort((a, b) => b[1] - a[1])
					.map(([k, v]) => `${k}×${v}`)
					.join(', ')
			: 'none'
	}
  unstable cases  ${unstableCases.length ? unstableCases.join(', ') : 'none'}
  latency         mean ${summary.meanLatencyMs}ms, p95 ${summary.p95LatencyMs}ms
  unit cost       $${summary.costPer1kOrdersUsd.toFixed(2)} per 1k orders (candidate only)
  run cost        $${summary.totalCostUsd.toFixed(4)} = $${summary.candidateCostUsd.toFixed(4)} candidate + $${summary.judgeCostUsd.toFixed(4)} judge
  errors          ${summary.errors}

artifact: ${file}
next:     bun run eval:compare`);
