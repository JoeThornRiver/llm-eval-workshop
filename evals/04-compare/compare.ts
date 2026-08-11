#!/usr/bin/env bun
/**
 * TIER 4 — compare stored runs across models.
 *
 * Reads the artifacts written by `run-model.ts` and prints the table a human
 * actually needs in order to sign off a new model. Three design decisions
 * worth arguing about in the workshop:
 *
 * 1. IT REFUSES QUIETLY-INVALID COMPARISONS. If two runs used different judge
 *    models, different rubrics, different prompts or different eval sets,
 *    their scores are not on the same scale. Most homegrown harnesses print
 *    the table anyway. This one prints the table AND shouts.
 *
 * 2. IT REPORTS THE DEFECT PROFILE, NOT JUST A SCORE. "Hallucinates in 8% of
 *    orders but always asks for a container" is what a reviewer signs off on;
 *    "4.6" is not.
 *
 * 3. IT REFUSES TO CROWN A WINNER INSIDE THE NOISE. A judge-mean gap smaller
 *    than the spread of the scores is not a result, it is sampling.
 *
 * Usage:
 *   bun run eval:compare
 *   bun run eval:compare -- --dir ./results --all
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { ARTIFACT_SCHEMA_VERSION, type RunArtifact } from './types';

const { values } = parseArgs({
	options: {
		dir: { type: 'string', default: join(import.meta.dir, 'results') },
		/** Show every run, not just the newest per model. */
		all: { type: 'boolean', default: false }
	}
});

let files: string[] = [];
try {
	files = readdirSync(values.dir!).filter((f) => f.endsWith('.json'));
} catch {
	console.error(`No results directory at ${values.dir}.`);
	console.error('Run at least two models first, e.g.:');
	console.error('  bun run eval:model -- --model anthropic/claude-haiku-4.5');
	console.error('  bun run eval:model -- --model anthropic/claude-sonnet-4.5');
	process.exit(2);
}

if (files.length === 0) {
	console.error(`No artifacts in ${values.dir}. Run eval:model first.`);
	process.exit(2);
}

const loaded = files.map((f) => ({
	file: f,
	artifact: JSON.parse(readFileSync(join(values.dir!, f), 'utf-8')) as RunArtifact
}));

// Refuse foreign artifact versions rather than reading absent fields as zeros.
const stale = loaded.filter((l) => l.artifact.schemaVersion !== ARTIFACT_SCHEMA_VERSION);
for (const s of stale)
	console.error(
		`! ignoring ${s.file}: artifact schemaVersion ${s.artifact.schemaVersion}, this tool reads ${ARTIFACT_SCHEMA_VERSION}. Re-run that model.`
	);

const artifacts: RunArtifact[] = loaded
	.filter((l) => l.artifact.schemaVersion === ARTIFACT_SCHEMA_VERSION)
	.map((l) => l.artifact)
	.sort((a, b) => a.startedAt.localeCompare(b.startedAt));

if (artifacts.length === 0) {
	console.error(`\nNo artifacts at the current version in ${values.dir}. Re-run eval:model.`);
	process.exit(2);
}

// Newest run per model, unless --all.
const runs = values.all
	? artifacts
	: [...new Map(artifacts.map((a) => [a.candidateModel, a])).values()];

// ---------------------------------------------------------------------------
// Comparability — the part most harnesses skip
// ---------------------------------------------------------------------------
const warnings: string[] = [];
const distinct = <K extends keyof RunArtifact>(key: K) => [...new Set(runs.map((r) => r[key]))];

if (distinct('judgeModel').length > 1)
	warnings.push(
		`Judge model differs across runs (${distinct('judgeModel').join(', ')}). Judge scores are NOT on a common scale — re-run every model with one judge before comparing.`
	);
if (distinct('rubricHash').length > 1)
	warnings.push(
		`Rubric differs across runs (${distinct('rubricHash').join(', ')}). Same caveat: the scores measure different things.`
	);
if (distinct('promptHash').length > 1)
	warnings.push(
		`Prompt or menu differs across runs (${distinct('promptHash').join(', ')}). You are comparing models AND prompts at once; you will not know which moved the number.`
	);
if (distinct('evalSetHash').length > 1)
	warnings.push(`Eval set differs across runs (${distinct('evalSetHash').join(', ')}).`);
if (distinct('caseCount').length > 1)
	warnings.push(
		`Case count differs (${distinct('caseCount').join(', ')}) — did one run use --limit?`
	);
for (const r of runs) {
	if (r.temperature === null || r.temperature > 0)
		warnings.push(
			`${r.candidateModel} ran at temperature ${r.temperature ?? 'provider default'} — repeats measure sampling noise, which is intended, but the run is not reproducible.`
		);
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------
const rows = runs.map((r) => ({
	model: r.candidateModel,
	n: `${r.caseCount}×${r.repeats}`,
	gate: !r.summary.compatible
		? 'INCOMPAT'
		: `${(r.summary.gatePassRate! * 100).toFixed(0)}%`,
	judge:
		r.summary.judgeMean === null
			? 'n/a'
			: `${r.summary.judgeMean.toFixed(2)}${
					r.summary.judgeStdDev === null ? '' : ` ±${r.summary.judgeStdDev.toFixed(2)}`
				}`,
	p95: `${r.summary.p95LatencyMs}ms`,
	cost: `$${r.summary.costPer1kOrdersUsd.toFixed(2)}`,
	unstable: `${r.summary.unstableCases.length}`,
	errors: `${r.summary.errors}`
}));

const headers = {
	model: 'model',
	n: 'n',
	gate: 'gate pass',
	judge: 'judge mean',
	p95: 'p95',
	cost: '$/1k orders',
	unstable: 'unstable',
	errors: 'err'
} as const;

type Col = keyof typeof headers;
const cols = Object.keys(headers) as Col[];
const width = (c: Col) => Math.max(headers[c].length, ...rows.map((r) => r[c].length));
const line = (cells: Record<Col, string>) =>
	cols.map((c) => cells[c].padEnd(width(c))).join('  ').trimEnd();

console.log('\n=== Tier 4 — model comparison ===\n');
console.log(line(headers));
console.log(cols.map((c) => '-'.repeat(width(c))).join('  '));
for (const r of rows) console.log(line(r));

// ---------------------------------------------------------------------------
// Defect matrix — the actionable half
// ---------------------------------------------------------------------------
const allCodes = [...new Set(runs.flatMap((r) => Object.keys(r.summary.defectCounts)))].sort();
if (allCodes.length) {
	console.log('\n--- defects (count of calls raising each finding) ---\n');
	const modelW = Math.max(...runs.map((r) => r.candidateModel.length), 'finding'.length);
	console.log(
		'finding'.padEnd(Math.max(...allCodes.map((c) => c.length), 'finding'.length)) +
			'  ' +
			runs.map((r) => r.candidateModel.padEnd(modelW)).join('  ')
	);
	for (const code of allCodes) {
		const cells = runs.map((r) =>
			String(r.summary.defectCounts[code as keyof typeof r.summary.defectCounts] ?? 0).padEnd(
				modelW
			)
		);
		console.log(
			code.padEnd(Math.max(...allCodes.map((c) => c.length), 'finding'.length)) +
				'  ' +
				cells.join('  ')
		);
	}
} else {
	console.log('\nNo deterministic findings in any run — every model cleared the hard gate.');
}

for (const r of runs) {
	if (r.summary.unstableCases.length)
		console.log(
			`\n${r.candidateModel}: findings varied between repeats on ${r.summary.unstableCases.join(', ')}`
		);
}

// ---------------------------------------------------------------------------
// Is the winner real?
// ---------------------------------------------------------------------------
const scored = runs.filter((r) => r.summary.judgeMean !== null);
if (scored.length >= 2) {
	const ranked = [...scored].sort((a, b) => b.summary.judgeMean! - a.summary.judgeMean!);
	const [first, second] = ranked as [RunArtifact, RunArtifact];
	const gap = first.summary.judgeMean! - second.summary.judgeMean!;
	const noise = Math.max(first.summary.judgeStdDev ?? 0, second.summary.judgeStdDev ?? 0);
	console.log('');
	if (gap < noise)
		console.log(
			`Judge means of ${first.candidateModel} (${first.summary.judgeMean!.toFixed(2)}) and ` +
				`${second.candidateModel} (${second.summary.judgeMean!.toFixed(2)}) differ by ${gap.toFixed(2)}, ` +
				`which is inside the score spread (±${noise.toFixed(2)}). NOT a winner — add repeats or accept a tie.`
		);
	else
		console.log(
			`${first.candidateModel} leads on judge mean by ${gap.toFixed(2)} (spread ±${noise.toFixed(2)}). ` +
				`Check the gate and defect columns before concluding: a higher score with a worse gate is a worse model.`
		);
}

// A model that could not be called at all is a compatibility answer, and the
// most useful one in the room: no amount of rubric tuning fixes it.
for (const r of runs) {
	if (!r.summary.compatible)
		console.log(
			`\n${r.candidateModel}: INCOMPATIBLE — every call failed, so there is no score to compare.\n` +
				`  ${r.summary.firstError?.slice(0, 240)}`
		);
}

// Self-preference: the judge scoring its own family is a known confound.
const family = (slug: string) => slug.split('/')[0] ?? slug;
for (const r of scored) {
	if (family(r.judgeModel) === family(r.candidateModel))
		warnings.push(
			`${r.candidateModel} was judged by ${r.judgeModel} — same vendor family. Judges tend to score their own family higher; use a judge from an uninvolved family, or a panel, before trusting this row against a rival.`
		);
}

if (warnings.length) {
	console.log('\n--- warnings ---');
	for (const w of [...new Set(warnings)]) console.log(`  ! ${w}`);
}
console.log('');
