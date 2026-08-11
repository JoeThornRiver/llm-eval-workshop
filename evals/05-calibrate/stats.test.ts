/**
 * Unit tests for the calibration statistics.
 *
 * These are hand-rolled formulas whose failure mode is a plausible-looking
 * wrong number, which is the worst kind: a miscomputed kappa would certify a
 * judge that does not track the labels. Every expected value below is derived
 * by hand, not captured from a previous run.
 */
import { describe, expect, test } from 'bun:test';
import { inversions, median, quadraticWeightedKappa, spearman, stdDev } from './stats';

describe('median', () => {
	test('odd count takes the middle', () => {
		expect(median([3, 1, 2])).toBe(2);
	});
	test('even count averages the two middles, rounded half up', () => {
		expect(median([1, 2, 3, 4])).toBe(3); // (2+3)/2 = 2.5 -> 3
		expect(median([4, 4, 2, 2])).toBe(3);
	});
	test('single value', () => {
		expect(median([5])).toBe(5);
	});
});

describe('spearman', () => {
	test('identical ordering is +1', () => {
		expect(spearman([1, 2, 3, 4], [1, 2, 3, 4])).toBeCloseTo(1, 10);
	});
	test('reversed ordering is -1', () => {
		expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1, 10);
	});
	test('monotone but non-linear still scores 1 — it is rank-based', () => {
		expect(spearman([1, 2, 3], [1, 4, 100])).toBeCloseTo(1, 10);
	});
	test('ties are averaged, not broken arbitrarily', () => {
		// human [1,1,2] -> ranks [1.5,1.5,3]; judge [2,2,5] -> ranks [1.5,1.5,3]
		expect(spearman([1, 1, 2], [2, 2, 5])).toBeCloseTo(1, 10);
	});
	test('no variance on one side is undefined, not zero', () => {
		expect(spearman([1, 2, 3], [4, 4, 4])).toBeNaN();
	});
});

describe('quadraticWeightedKappa', () => {
	test('perfect agreement is 1', () => {
		expect(quadraticWeightedKappa([1, 2], [1, 2])).toBeCloseTo(1, 10);
	});

	test('perfect inversion on the extremes is -1', () => {
		// human [1,5] vs judge [5,1]: numerator = 1+1 = 2, denominator = 1.0
		// (worked by hand: w(0,4)=w(4,0)=1, expected 0.5 each)
		expect(quadraticWeightedKappa([1, 5], [5, 1])).toBeCloseTo(-1, 10);
	});

	test('distant disagreement is punished harder than adjacent', () => {
		const adjacent = quadraticWeightedKappa([1, 2, 4, 5], [1, 3, 4, 5]);
		const distant = quadraticWeightedKappa([1, 2, 4, 5], [1, 5, 4, 5]);
		expect(distant).toBeLessThan(adjacent);
	});

	test('a constant rater gives no expected disagreement, so NaN not 0', () => {
		expect(quadraticWeightedKappa([3, 3], [3, 3])).toBeNaN();
	});

	test('empty input is NaN', () => {
		expect(quadraticWeightedKappa([], [])).toBeNaN();
	});
});

describe('inversions', () => {
	test('finds a pair ranked the opposite way', () => {
		const found = inversions([
			{ caseId: 'good', humanScore: 5, judgeScore: 1 },
			{ caseId: 'bad', humanScore: 1, judgeScore: 5 }
		]);
		expect(found).toHaveLength(1);
		expect(found[0]!.betterCaseId).toBe('good');
		expect(found[0]!.worseCaseId).toBe('bad');
		expect(found[0]!.humanGap).toBe(4);
	});

	test('agreement produces none', () => {
		expect(
			inversions([
				{ caseId: 'a', humanScore: 5, judgeScore: 4 },
				{ caseId: 'b', humanScore: 2, judgeScore: 1 }
			])
		).toHaveLength(0);
	});

	test('equal judge scores are not an inversion — only a strict flip counts', () => {
		expect(
			inversions([
				{ caseId: 'a', humanScore: 5, judgeScore: 3 },
				{ caseId: 'b', humanScore: 2, judgeScore: 3 }
			])
		).toHaveLength(0);
	});

	test('sorted by human gap, widest first', () => {
		const found = inversions([
			{ caseId: 'top', humanScore: 5, judgeScore: 1 },
			{ caseId: 'mid', humanScore: 4, judgeScore: 2 },
			{ caseId: 'low', humanScore: 1, judgeScore: 3 }
		]);
		expect(found[0]!.humanGap).toBe(4);
	});
});

describe('stdDev', () => {
	test('identical values have zero spread', () => {
		expect(stdDev([4, 4, 4])).toBe(0);
	});
	test('sample standard deviation, n-1 denominator', () => {
		// [2,4]: mean 3, deviations ±1, sample sd = sqrt(2/1) = 1.414...
		expect(stdDev([2, 4])).toBeCloseTo(Math.SQRT2, 10);
	});
	test('a single value has no spread', () => {
		expect(stdDev([3])).toBe(0);
	});
});
