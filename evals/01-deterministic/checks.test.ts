/**
 * HANDS-ON 1 — Deterministic checks on recorded model outputs.
 *
 * Everything here runs offline against fixtures/cases/*.json. No API key,
 * no network, no cost, no flakiness — this is your Tier-1 eval layer that
 * runs on every commit.
 *
 * HOW THIS HARNESS WORKS
 * Each case fixture contains a `recorded` model output and an
 * `expectedFindings` array naming the defect codes your checks should raise
 * for it. The test below runs ALL checks against ALL cases and asserts that
 * detected findings == expected findings. So:
 *   - a check that misses a planted defect  -> test fails (false negative)
 *   - a check that fires on a healthy case  -> test fails (false positive)
 * Precision matters as much as recall: an eval suite that cries wolf gets
 * ignored, which is worse than having none.
 *
 * YOUR TASK: implement the checks marked TODO until `bun test` is green.
 * Check 1 (SCHEMA_INVALID) is done for you as the pattern to follow.
 */
import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { matchedOrderSchema, type MatchedOrder, type RawGroup } from '../../src/schema';
import { menu } from '../../src/matching';

// ---------------------------------------------------------------------------
// Harness (nothing to change here)
// ---------------------------------------------------------------------------

interface CaseFile {
	id: string;
	title: string;
	transcript: string;
	recorded: unknown;
	expected: { allowedItems: string[]; expectClarification: boolean };
	expectedFindings: string[];
	note: string;
}

const casesDir = join(import.meta.dir, '../../fixtures/cases');
const cases: CaseFile[] = readdirSync(casesDir)
	.filter((f) => f.endsWith('.json'))
	.sort()
	.map((f) => JSON.parse(readFileSync(join(casesDir, f), 'utf-8')));

const menuByName = new Map(menu.map((m) => [m.name, m]));

/** Run every check; return the sorted, de-duplicated set of finding codes. */
function runChecks(c: CaseFile): string[] {
	const findings = new Set<string>();

	// --- Check 1: SCHEMA_INVALID (implemented — use this as your template) --
	const parsed = matchedOrderSchema.safeParse(c.recorded);
	if (!parsed.success) {
		findings.add('SCHEMA_INVALID');
		return [...findings].sort(); // unparseable output: nothing else to check
	}
	const out: MatchedOrder = parsed.data;

	for (const g of out.order) {
		checkTypeFieldConsistency(g, findings);
		checkEmptyContainerGroup(g, findings);
		checkNamesResolve(g, findings);
		checkRoles(g, findings);
		checkOptionsAndAddOns(g, findings);
	}
	checkAgainstGoldenLabels(out, c, findings);

	return [...findings].sort();
}

// ---------------------------------------------------------------------------
// TODO 2 — TYPE_FIELD_MISMATCH
// The schema is a flat object (read src/schema.ts to understand why), so it
// cannot enforce that `type` and the populated fields agree. Enforce it here:
//   - type "container"  => must have `container` and `scoops`, must NOT have `item`
//   - type "standalone" => must have `item`, must NOT have `container`/`scoops`
// ---------------------------------------------------------------------------
function checkTypeFieldConsistency(g: RawGroup, findings: Set<string>) {
	// TODO: implement — findings.add('TYPE_FIELD_MISMATCH')
}

// ---------------------------------------------------------------------------
// TODO 3 — EMPTY_CONTAINER_GROUP
// A container group with zero scoops violates the "no empty groups" rule.
// ---------------------------------------------------------------------------
function checkEmptyContainerGroup(g: RawGroup, findings: Set<string>) {
	// TODO: implement — findings.add('EMPTY_CONTAINER_GROUP')
}

// ---------------------------------------------------------------------------
// TODO 4 — UNRESOLVED_NAME
// Every name the model emits (container name, scoop names, item name) must be
// an EXACT string from the menu. Use `menuByName`.
// ---------------------------------------------------------------------------
function checkNamesResolve(g: RawGroup, findings: Set<string>) {
	// TODO: implement — findings.add('UNRESOLVED_NAME')
}

// ---------------------------------------------------------------------------
// TODO 5 — ROLE_VIOLATION
// Resolving is not enough — the item must play the right ROLE:
//   - a container group's container must have `isContainer`
//   - every scoop must have `requiresContainer`
//   - a standalone group's item must be NEITHER a container NOR a scoop
// Only check names that resolved (unresolved ones are TODO 4's job).
// ---------------------------------------------------------------------------
function checkRoles(g: RawGroup, findings: Set<string>) {
	// TODO: implement — findings.add('ROLE_VIOLATION')
}

// ---------------------------------------------------------------------------
// TODO 6 — INVALID_OPTION_OR_ADDON
// Options must come from the item's own optionGroups (any group); add-ons
// must come from the container's/item's addOns list. Skip names that don't
// resolve.
// ---------------------------------------------------------------------------
function checkOptionsAndAddOns(g: RawGroup, findings: Set<string>) {
	// TODO: implement — findings.add('INVALID_OPTION_OR_ADDON')
}

// ---------------------------------------------------------------------------
// TODO 7 — HALLUCINATED_ITEM and TODO 8 — MISSING_CLARIFICATION
// Structural checks cannot know what the customer actually SAID. That is
// what the golden labels in `c.expected` are for:
//   - HALLUCINATED_ITEM: any emitted name not in `expected.allowedItems`
//     (only consider names that resolve against the menu)
//   - MISSING_CLARIFICATION: `expected.expectClarification` is true but the
//     output has no (or an empty) `clarification`
// ---------------------------------------------------------------------------
function checkAgainstGoldenLabels(out: MatchedOrder, c: CaseFile, findings: Set<string>) {
	// TODO: implement — findings.add('HALLUCINATED_ITEM') / findings.add('MISSING_CLARIFICATION')
}

// ---------------------------------------------------------------------------
// The assertion loop (nothing to change here)
// ---------------------------------------------------------------------------
describe('deterministic checks on recorded outputs', () => {
	for (const c of cases) {
		test(`${c.id}: ${c.title}`, () => {
			expect(runChecks(c)).toEqual([...c.expectedFindings].sort());
		});
	}
});
