/**
 * SOLUTION — Hands-on 1 deterministic checks, fully implemented.
 * Compare with your own version; several checks have more than one valid
 * implementation, what matters is that the finding set matches.
 *
 */
import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { matchedOrderSchema, type MatchedOrder, type RawGroup } from '../src/schema';
import { menu } from '../src/matching';

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

const casesDir = join(import.meta.dir, '../fixtures/cases');
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
	if (g.type === 'container') {
		if (!g.container || !g.scoops || g.item) findings.add('TYPE_FIELD_MISMATCH');
	} else {
		if (!g.item || g.container || g.scoops) findings.add('TYPE_FIELD_MISMATCH');
	}
}

// ---------------------------------------------------------------------------
// TODO 3 — EMPTY_CONTAINER_GROUP
// A container group with zero scoops violates the "no empty groups" rule.
// ---------------------------------------------------------------------------
function checkEmptyContainerGroup(g: RawGroup, findings: Set<string>) {
	if (g.type === 'container' && g.scoops && g.scoops.length === 0)
		findings.add('EMPTY_CONTAINER_GROUP');
}

// ---------------------------------------------------------------------------
// TODO 4 — UNRESOLVED_NAME
// Every name the model emits (container name, scoop names, item name) must be
// an EXACT string from the menu. Use `menuByName`.
// ---------------------------------------------------------------------------
function checkNamesResolve(g: RawGroup, findings: Set<string>) {
	const names = [
		...(g.container ? [g.container.name] : []),
		...(g.scoops ?? []).map((s) => s.name),
		...(g.item ? [g.item.name] : [])
	];
	if (names.some((n) => !menuByName.has(n))) findings.add('UNRESOLVED_NAME');
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
	const container = g.container && menuByName.get(g.container.name);
	if (container && !container.isContainer) findings.add('ROLE_VIOLATION');
	for (const s of g.scoops ?? []) {
		const item = menuByName.get(s.name);
		if (item && !item.requiresContainer) findings.add('ROLE_VIOLATION');
	}
	const standalone = g.item && menuByName.get(g.item.name);
	if (standalone && (standalone.isContainer || standalone.requiresContainer))
		findings.add('ROLE_VIOLATION');
}

// ---------------------------------------------------------------------------
// TODO 6 — INVALID_OPTION_OR_ADDON
// Options must come from the item's own optionGroups (any group); add-ons
// must come from the container's/item's addOns list. Skip names that don't
// resolve.
// ---------------------------------------------------------------------------
function checkOptionsAndAddOns(g: RawGroup, findings: Set<string>) {
	const host = menuByName.get(g.type === 'container' ? (g.container?.name ?? '') : (g.item?.name ?? ''));
	if (!host) return;
	const validOptions = new Set((host.optionGroups ?? []).flatMap((og) => og.options.map((o) => o.name)));
	if ((g.options ?? []).some((o) => !validOptions.has(o))) findings.add('INVALID_OPTION_OR_ADDON');
	const validAddOns = new Set((host.addOns ?? []).map((a) => a.name));
	if ((g.addOns ?? []).some((a) => !validAddOns.has(a))) findings.add('INVALID_OPTION_OR_ADDON');
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
	const allowed = new Set(c.expected.allowedItems);
	for (const g of out.order) {
		const names = [
			...(g.container ? [g.container.name] : []),
			...(g.scoops ?? []).map((s) => s.name),
			...(g.item ? [g.item.name] : [])
		];
		for (const n of names) {
			if (menuByName.has(n) && !allowed.has(n)) findings.add('HALLUCINATED_ITEM');
		}
	}
	if (c.expected.expectClarification && !out.clarification?.trim())
		findings.add('MISSING_CLARIFICATION');
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
