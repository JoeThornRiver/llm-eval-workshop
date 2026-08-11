#!/usr/bin/env bun
/**
 * TIER 5 — calibrate the judge against human labels.
 *
 * This is the step that turns "we have an LLM-as-judge" into "we have a judge
 * we can defend". Nothing else in this repo earns the right to gate a release
 * on a judge score until this passes.
 *
 * It judges the RECORDED outputs in fixtures/cases/*.json — not live ones — so
 * the model output is held constant and the judge is the only variable. Then
 * it compares the judge's scores with the human labels in labels.json and
 * reports the three things that actually matter:
 *
 *   OFFSET      is the judge systematically kinder or harsher than the human?
 *               Fixable with anchors or by moving the threshold.
 *   ORDERING    does it RANK outputs the way the human does? (Spearman, kappa)
 *               A judge one point too kind everywhere is still usable.
 *   INVERSIONS  does it rank a bad output ABOVE a good one? That means the
 *               rubric is missing a criterion the human is using. Not fixable
 *               by moving a threshold — you have to write the criterion.
 *
 * Plus two things people forget: whether the judge agrees with ITSELF across
 * repeats, and whether it catches the catastrophic cases specifically (judges
 * are lenient, and an average hides a missed disaster).
 *
 * Usage:
 *   bun run eval:calibrate
 *   bun run eval:calibrate -- --rubric placeholder     # prove the metric bites
 *   bun run eval:calibrate -- --judge openai/gpt-5.6-luna --repeats 5
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { CALIBRATED_RUBRIC, RUBRIC_ID } from '../../solutions/rubric';
import type { GoldenExpectation } from '../../solutions/checks';
import { judgeOutput } from '../04-compare/judge';
import { inversions, mean, median, quadraticWeightedKappa, spearman, stdDev } from './stats';

/**
 * A copy of the deliberately useless rubric from evals/02-judge/run-judge.ts.
 * Copied rather than imported on purpose: attendees REPLACE that constant
 * during Hands-on 2, and this comparison must keep reproducing the original
 * bad-rubric result afterwards.
 */
const PLACEHOLDER_RUBRIC = `
Rate how good this voice-order assistant output is, from 1 (bad) to 5 (great).
`;

const { values } = parseArgs({
	options: {
		judge: { type: 'string', default: 'anthropic/claude-sonnet-5' },
		rubric: { type: 'string', default: 'calibrated' },
		repeats: { type: 'string', default: '3' },
		labels: { type: 'string', default: join(import.meta.dir, 'labels.json') },
		out: { type: 'string', default: join(import.meta.dir, 'results') },
		concurrency: { type: 'string', default: '4' }
	}
});

const judgeModel = values.judge!;
const repeats = Number(values.repeats);
const concurrency = Number(values.concurrency);
const useCalibrated = values.rubric !== 'placeholder';
const rubric = useCalibrated ? CALIBRATED_RUBRIC : PLACEHOLDER_RUBRIC;
const rubricId = useCalibrated ? RUBRIC_ID : 'placeholder-hands-on-2-starter';

// --- Thresholds the verdict gates on. Documented, not magic. ---------------
const MIN_KAPPA = 0.6; // below this the judge is not tracking the human
const MIN_SEVERE_RECALL = 0.8; // catastrophic cases the judge must also fail
const MAX_SEVERE_INVERSIONS = 0; // ranking a disaster above a good output

interface CaseFile {
	id: string;
	transcript: string;
	recorded: unknown;
	expected: GoldenExpectation;
}

const casesDir = join(import.meta.dir, '../../fixtures/cases');
const cases: CaseFile[] = readdirSync(casesDir)
	.filter((f) => f.endsWith('.json'))
	.sort()
	.map((f) => JSON.parse(readFileSync(join(casesDir, f), 'utf-8')));

const labelFile = JSON.parse(readFileSync(values.labels!, 'utf-8')) as {
	labelSetVersion: string;
	provenance: string;
	labels: { caseId: string; humanScore: number; rationale: string }[];
};
const humanByCase = new Map(labelFile.labels.map((l) => [l.caseId, l]));

const labeled = cases.filter((c) => humanByCase.has(c.id));
if (labeled.length === 0) {
	console.error('No fixture ids matched the label file.');
	process.exit(2);
}

console.log(
	`Tier 5 — judge calibration\n` +
		`  judge     ${judgeModel}\n` +
		`  rubric    ${rubricId}\n` +
		`  labels    ${labelFile.labelSetVersion} (${labeled.length} items × ${repeats} repeats)\n`
);

async function mapWithConcurrency<T, R>(
	items: T[],
	limit: number,
	fn: (item: T) => Promise<R>
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let next = 0;
	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, async () => {
			while (true) {
				const i = next++;
				if (i >= items.length) return;
				results[i] = await fn(items[i]!);
			}
		})
	);
	return results;
}

const startedAt = new Date().toISOString();
let totalJudgeCost = 0;

const scored = await mapWithConcurrency(labeled, concurrency, async (c) => {
	const runs: number[] = [];
	let error: string | undefined;
	for (let r = 0; r < repeats; r++) {
		try {
			const verdict = await judgeOutput({
				transcript: c.transcript,
				output: c.recorded,
				expected: c.expected,
				rubric,
				model: judgeModel,
				temperature: 0
			});
			totalJudgeCost += verdict.costUsd;
			if (verdict.score !== null) runs.push(verdict.score);
		} catch (e) {
			error = (e as Error).message;
		}
	}
	const human = humanByCase.get(c.id)!.humanScore;
	const judge = runs.length ? median(runs) : null;
	console.log(
		`  ${c.id}  human ${human}  judge ${judge ?? 'ERR'}` +
			`${runs.length > 1 ? ` (runs ${runs.join('/')})` : ''}${error ? ` ${error.slice(0, 50)}` : ''}`
	);
	return { caseId: c.id, human, judge, runs, error };
});

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------
const usable = scored.filter((s): s is typeof s & { judge: number } => s.judge !== null);
const humanScores = usable.map((s) => s.human);
const judgeScores = usable.map((s) => s.judge);

const diffs = usable.map((s) => s.judge - s.human);
const exact = usable.filter((s) => s.judge === s.human).length / usable.length;
const within1 = usable.filter((s) => Math.abs(s.judge - s.human) <= 1).length / usable.length;
const offset = mean(diffs);
const mae = mean(diffs.map(Math.abs));
const rho = spearman(humanScores, judgeScores);
const kappa = quadraticWeightedKappa(humanScores, judgeScores);

const allInversions = inversions(
	usable.map((s) => ({ caseId: s.caseId, humanScore: s.human, judgeScore: s.judge }))
);
const severeInversions = allInversions.filter((i) => i.humanGap >= 2);

// "Severe" = the human considered it a failure. A judge that scores these
// generously is the single most dangerous failure mode, because averages hide it.
const severe = usable.filter((s) => s.human <= 2);
const severeRecall = severe.length
	? severe.filter((s) => s.judge <= 2).length / severe.length
	: NaN;

// Does the judge agree with itself? Unstable judging caps how well it can
// ever agree with a human, and no rubric wording fixes it.
const selfConsistent = scored.filter((s) => s.runs.length > 1 && new Set(s.runs).size === 1).length;
const repeatable = scored.filter((s) => s.runs.length > 1).length;
const meanRunSpread = mean(scored.filter((s) => s.runs.length > 1).map((s) => stdDev(s.runs)));

const pass =
	!Number.isNaN(kappa) &&
	kappa >= MIN_KAPPA &&
	(Number.isNaN(severeRecall) || severeRecall >= MIN_SEVERE_RECALL) &&
	severeInversions.length <= MAX_SEVERE_INVERSIONS;

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const num = (x: number) => (Number.isNaN(x) ? 'n/a' : x.toFixed(2));

console.log(`
— calibration: ${judgeModel} / ${rubricId} —
  agreement       exact ${pct(exact)}, within 1 point ${pct(within1)}
  offset          ${offset > 0 ? '+' : ''}${num(offset)} (judge minus human — positive means kinder)
  mean abs error  ${num(mae)}
  ordering        Spearman ${num(rho)}, quadratic-weighted kappa ${num(kappa)} (need ≥ ${MIN_KAPPA})
  inversions      ${allInversions.length} total, ${severeInversions.length} severe (human gap ≥ 2, need ≤ ${MAX_SEVERE_INVERSIONS})
  severe recall   ${num(severeRecall)} of ${severe.length} cases the human failed (need ≥ ${MIN_SEVERE_RECALL})
  self-agreement  ${repeatable ? pct(selfConsistent / repeatable) : 'n/a'} of items identical across repeats, mean spread ${num(meanRunSpread)}
  judge cost      $${totalJudgeCost.toFixed(4)}

  VERDICT: ${pass ? 'USABLE — this judge tracks the labels well enough to gate on' : 'NOT USABLE — do not gate a release on this judge yet'}`);

if (severeInversions.length) {
	console.log('\n  Severe inversions (the rubric is missing a criterion the human used):');
	for (const i of severeInversions.slice(0, 8))
		console.log(
			`    ${i.betterCaseId} (human +${i.humanGap} better than ${i.worseCaseId}) was scored ${Math.abs(i.judgeGap)} point(s) LOWER by the judge`
		);
}

if (usable.length < 30)
	console.log(
		`\n  CAVEAT: n=${usable.length}. Every number above has a wide confidence interval;` +
			`\n  50-100 labeled items is the working minimum for a gate you would defend.`
	);

const noFours = !humanScores.includes(4);
if (noFours)
	console.log(
		`  CAVEAT: the label set contains no 4s, so the judge's ability to tell a 4` +
			`\n  from a 5 is entirely untested here.`
	);

// ---------------------------------------------------------------------------
// Artifact — judge drift is silent, so keep the history
// ---------------------------------------------------------------------------
const artifact = {
	schemaVersion: 1,
	judgeModel,
	rubricId,
	rubricHash: `sha256:${createHash('sha256').update(rubric).digest('hex').slice(0, 16)}`,
	labelSetVersion: labelFile.labelSetVersion,
	labelProvenance: labelFile.provenance,
	repeats,
	startedAt,
	finishedAt: new Date().toISOString(),
	thresholds: { MIN_KAPPA, MIN_SEVERE_RECALL, MAX_SEVERE_INVERSIONS },
	metrics: {
		n: usable.length,
		exactAgreement: exact,
		within1Agreement: within1,
		offset,
		meanAbsError: mae,
		spearman: rho,
		quadraticWeightedKappa: kappa,
		inversions: allInversions.length,
		severeInversions: severeInversions.length,
		severeRecall,
		selfAgreement: repeatable ? selfConsistent / repeatable : null,
		meanRunSpread,
		judgeCostUsd: totalJudgeCost
	},
	pass,
	cases: scored,
	severeInversionDetail: severeInversions
};

mkdirSync(values.out!, { recursive: true });
const file = join(
	values.out!,
	`${judgeModel.replace(/[^a-z0-9.]+/gi, '_')}__${rubricId}__${startedAt.replace(/[:.]/g, '-')}.json`
);
writeFileSync(file, JSON.stringify(artifact, null, 2));
console.log(`\nartifact: ${file}`);

process.exit(pass ? 0 : 1);
