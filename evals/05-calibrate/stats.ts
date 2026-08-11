/**
 * The statistics a judge calibration needs, hand-rolled so you can read them.
 *
 * None of these is exotic; all of them are easy to get subtly wrong, which is
 * why they are here in one file with their edge cases named.
 */

/** Median. For an even count, the mean of the two middles, rounded half up. */
export function median(values: number[]): number {
	if (values.length === 0) return NaN;
	const s = [...values].sort((a, b) => a - b);
	const mid = Math.floor(s.length / 2);
	if (s.length % 2 === 1) return s[mid]!;
	return Math.round((s[mid - 1]! + s[mid]!) / 2);
}

export function mean(values: number[]): number {
	return values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN;
}

export function stdDev(values: number[]): number {
	if (values.length < 2) return 0;
	const m = mean(values);
	return Math.sqrt(values.reduce((a, v) => a + (v - m) ** 2, 0) / (values.length - 1));
}

/** Ranks with ties averaged — required for a correct Spearman. */
function ranks(values: number[]): number[] {
	const idx = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
	const out = new Array<number>(values.length);
	let i = 0;
	while (i < idx.length) {
		let j = i;
		while (j + 1 < idx.length && idx[j + 1]!.v === idx[i]!.v) j++;
		const avg = (i + j) / 2 + 1; // 1-based, averaged over the tie block
		for (let k = i; k <= j; k++) out[idx[k]!.i] = avg;
		i = j + 1;
	}
	return out;
}

/**
 * Spearman rank correlation. Answers "does the judge ORDER outputs the way the
 * human does?", which is the question that matters for gating — a judge one
 * point too kind on everything still ranks correctly and is still usable.
 * NaN when either side has no variance (e.g. the judge gave everything a 5).
 */
export function spearman(a: number[], b: number[]): number {
	if (a.length !== b.length || a.length < 2) return NaN;
	const ra = ranks(a);
	const rb = ranks(b);
	const ma = mean(ra);
	const mb = mean(rb);
	let num = 0;
	let da = 0;
	let db = 0;
	for (let i = 0; i < ra.length; i++) {
		const x = ra[i]! - ma;
		const y = rb[i]! - mb;
		num += x * y;
		da += x * x;
		db += y * y;
	}
	return da === 0 || db === 0 ? NaN : num / Math.sqrt(da * db);
}

/**
 * Quadratically weighted Cohen's kappa over an ordinal scale.
 *
 * Plain kappa treats "human 5, judge 1" as no worse than "human 5, judge 4",
 * which is wrong for scores. Quadratic weights punish distant disagreement
 * much harder — the standard choice for rating scales.
 *
 * 1 = perfect, 0 = no better than chance agreement, negative = worse than
 * chance. NaN when the expected disagreement is zero (both raters constant).
 */
export function quadraticWeightedKappa(
	human: number[],
	judge: number[],
	min = 1,
	max = 5
): number {
	if (human.length !== judge.length || human.length === 0) return NaN;
	const k = max - min + 1;
	const n = human.length;

	const observed = Array.from({ length: k }, () => new Array<number>(k).fill(0));
	const humanMarginal = new Array<number>(k).fill(0);
	const judgeMarginal = new Array<number>(k).fill(0);

	for (let i = 0; i < n; i++) {
		const h = human[i]! - min;
		const j = judge[i]! - min;
		observed[h]![j]! += 1;
		humanMarginal[h]! += 1;
		judgeMarginal[j]! += 1;
	}

	let numerator = 0;
	let denominator = 0;
	for (let h = 0; h < k; h++) {
		for (let j = 0; j < k; j++) {
			const w = (h - j) ** 2 / (k - 1) ** 2;
			const expected = (humanMarginal[h]! * judgeMarginal[j]!) / n;
			numerator += w * observed[h]![j]!;
			denominator += w * expected;
		}
	}
	return denominator === 0 ? NaN : 1 - numerator / denominator;
}

export interface Inversion {
	betterCaseId: string;
	worseCaseId: string;
	humanGap: number;
	judgeGap: number;
}

/**
 * Pairs the human ranked one way and the judge ranked the other way round.
 *
 * This is the most diagnostic output of a calibration run: an inversion means
 * the rubric is MISSING A CRITERION the human is using. A systematic offset
 * you can fix with a threshold; an inversion you cannot.
 */
export function inversions(
	items: { caseId: string; humanScore: number; judgeScore: number }[]
): Inversion[] {
	const found: Inversion[] = [];
	for (const a of items) {
		for (const b of items) {
			if (a.humanScore <= b.humanScore) continue;
			if (a.judgeScore < b.judgeScore)
				found.push({
					betterCaseId: a.caseId,
					worseCaseId: b.caseId,
					humanGap: a.humanScore - b.humanScore,
					judgeGap: a.judgeScore - b.judgeScore
				});
		}
	}
	return found.sort((x, y) => y.humanGap - x.humanGap);
}
