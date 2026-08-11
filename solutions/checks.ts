/**
 * SOLUTION — the Hands-on 1 checks, extracted as a reusable module.
 *
 * DO NOT READ THIS BEFORE YOU ARE GREEN on evals/01-deterministic. It is the
 * full answer to the exercise. It lives in `solutions/` for exactly that
 * reason: putting it in `src/` would hand you the solution from the most
 * obvious place in the repo.
 *
 * Why a module at all, when the exercise is a test file? Because the same
 * checks serve two callers:
 *
 *   1. `solutions/01-deterministic.solution.test.ts` — offline, over the
 *      RECORDED outputs in fixtures/cases/*.json.
 *   2. `evals/04-compare/run-model.ts` — live, over whatever a candidate
 *      model just produced.
 *
 * That second caller is the whole point of Tier 4: the cheapest, most
 * reproducible signal about "can we run our software on this new model?" is
 * not a judge's opinion, it is whether the model's raw output survives these
 * checks at all.
 *
 * NOTE on semantics, because the two callers differ in a way that matters:
 * a fixture's `expectedFindings` describes the defects planted in ITS
 * recording. It is NOT what a good model should produce. For a live run the
 * expectation is always the same and always simple: ZERO findings.
 */
import { matchedOrderSchema, type MatchedOrder, type RawGroup } from '../src/schema';
import { menu } from '../src/matching';

export const FINDING_CODES = [
	'SCHEMA_INVALID',
	'TYPE_FIELD_MISMATCH',
	'EMPTY_CONTAINER_GROUP',
	'UNRESOLVED_NAME',
	'ROLE_VIOLATION',
	'INVALID_OPTION_OR_ADDON',
	'HALLUCINATED_ITEM',
	'MISSING_CLARIFICATION'
] as const;

export type FindingCode = (typeof FINDING_CODES)[number];

/** The model-independent ground truth a human labeled for one transcript. */
export interface GoldenExpectation {
	allowedItems: string[];
	expectClarification: boolean;
}

const menuByName = new Map(menu.map((m) => [m.name, m]));

/**
 * Run every check over one model output. Returns the sorted, de-duplicated
 * set of finding codes — empty means the output is clean.
 */
export function runChecks(output: unknown, expected: GoldenExpectation): FindingCode[] {
	const findings = new Set<FindingCode>();

	// --- Check 1: SCHEMA_INVALID ------------------------------------------
	const parsed = matchedOrderSchema.safeParse(output);
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
	checkAgainstGoldenLabels(out, expected, findings);

	return [...findings].sort();
}

/** Every name the model emitted, in one flat list. */
function emittedNames(g: RawGroup): string[] {
	return [
		...(g.container ? [g.container.name] : []),
		...(g.scoops ?? []).map((s) => s.name),
		...(g.item ? [g.item.name] : [])
	];
}

// ---------------------------------------------------------------------------
// Check 2 — TYPE_FIELD_MISMATCH
// The schema is a flat object (read src/schema.ts to understand why), so it
// cannot enforce that `type` and the populated fields agree.
// ---------------------------------------------------------------------------
export function checkTypeFieldConsistency(g: RawGroup, findings: Set<FindingCode>) {
	if (g.type === 'container') {
		if (!g.container || !g.scoops || g.item) findings.add('TYPE_FIELD_MISMATCH');
	} else {
		if (!g.item || g.container || g.scoops) findings.add('TYPE_FIELD_MISMATCH');
	}
}

// ---------------------------------------------------------------------------
// Check 3 — EMPTY_CONTAINER_GROUP
// A container group with zero scoops violates the "no empty groups" rule.
// ---------------------------------------------------------------------------
export function checkEmptyContainerGroup(g: RawGroup, findings: Set<FindingCode>) {
	if (g.type === 'container' && g.scoops && g.scoops.length === 0)
		findings.add('EMPTY_CONTAINER_GROUP');
}

// ---------------------------------------------------------------------------
// Check 4 — UNRESOLVED_NAME
// Every name the model emits must be an EXACT string from the menu.
// ---------------------------------------------------------------------------
export function checkNamesResolve(g: RawGroup, findings: Set<FindingCode>) {
	if (emittedNames(g).some((n) => !menuByName.has(n))) findings.add('UNRESOLVED_NAME');
}

// ---------------------------------------------------------------------------
// Check 5 — ROLE_VIOLATION
// Resolving is not enough — the item must play the right ROLE.
// ---------------------------------------------------------------------------
export function checkRoles(g: RawGroup, findings: Set<FindingCode>) {
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
// Check 6 — INVALID_OPTION_OR_ADDON
// Options must come from the item's own optionGroups (any group); add-ons
// must come from the container's/item's addOns list.
// ---------------------------------------------------------------------------
export function checkOptionsAndAddOns(g: RawGroup, findings: Set<FindingCode>) {
	const host = menuByName.get(
		g.type === 'container' ? (g.container?.name ?? '') : (g.item?.name ?? '')
	);
	if (!host) return;
	const validOptions = new Set(
		(host.optionGroups ?? []).flatMap((og) => og.options.map((o) => o.name))
	);
	if ((g.options ?? []).some((o) => !validOptions.has(o))) findings.add('INVALID_OPTION_OR_ADDON');
	const validAddOns = new Set((host.addOns ?? []).map((a) => a.name));
	if ((g.addOns ?? []).some((a) => !validAddOns.has(a))) findings.add('INVALID_OPTION_OR_ADDON');
}

// ---------------------------------------------------------------------------
// Checks 7 + 8 — HALLUCINATED_ITEM and MISSING_CLARIFICATION
// Structural checks cannot know what the customer actually SAID. That is what
// the golden labels are for.
// ---------------------------------------------------------------------------
export function checkAgainstGoldenLabels(
	out: MatchedOrder,
	expected: GoldenExpectation,
	findings: Set<FindingCode>
) {
	const allowed = new Set(expected.allowedItems);
	for (const g of out.order) {
		for (const n of emittedNames(g)) {
			if (menuByName.has(n) && !allowed.has(n)) findings.add('HALLUCINATED_ITEM');
		}
	}
	if (expected.expectClarification && !out.clarification?.trim())
		findings.add('MISSING_CLARIFICATION');
}
