/**
 * SOLUTION — Hands-on 1 deterministic checks.
 *
 * The check implementations live in `solutions/checks.ts`, because Tier 4
 * (evals/04-compare) runs the very same checks over LIVE output from
 * candidate models. Read that file to compare with your own version —
 * several checks have more than one valid implementation, what matters is
 * that the finding set matches.
 *
 * This file is only the assertion loop over the recorded fixtures.
 */
import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runChecks, type FindingCode, type GoldenExpectation } from './checks';

interface CaseFile {
	id: string;
	title: string;
	transcript: string;
	recorded: unknown;
	expected: GoldenExpectation;
	expectedFindings: FindingCode[];
	note: string;
}

const casesDir = join(import.meta.dir, '../fixtures/cases');
const cases: CaseFile[] = readdirSync(casesDir)
	.filter((f) => f.endsWith('.json'))
	.sort()
	.map((f) => JSON.parse(readFileSync(join(casesDir, f), 'utf-8')));

describe('deterministic checks on recorded outputs', () => {
	for (const c of cases) {
		test(`${c.id}: ${c.title}`, () => {
			expect(runChecks(c.recorded, c.expected)).toEqual([...c.expectedFindings].sort());
		});
	}
});
