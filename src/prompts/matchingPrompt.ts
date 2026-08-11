import type { MatchingMenuItem, OrderGroup } from '../types';

/**
 * English adaptation of the production matching prompt.
 *
 * The production prompt serves a German ice cream cafe (German transcripts,
 * bilingual menu labels, German clarifications). For this workshop the case
 * is English-only, so the bilingual `(de: ...)` matching rules are gone —
 * everything else (container semantics, clarification policy, few-shot
 * style) mirrors production. When you read a rule here, assume it exists
 * because a real model got it wrong at some point.
 */

function renderMenu(menu: MatchingMenuItem[]): string {
	return menu
		.map((item) => {
			const flags: string[] = [];
			if (item.isContainer) flags.push('container');
			if (item.requiresContainer) flags.push('needs container');
			const suffix = flags.length ? ` [${flags.join(', ')}]` : '';
			// Render each option group as its own dimension so the model keeps
			// them apart and picks AT MOST one per group — "exactly one" made the
			// model fabricate defaults (e.g. a milk choice on a plain cappuccino).
			const groups = item.optionGroups?.filter((g) => g.options.length > 0) ?? [];
			const optionsSuffix = groups.length
				? ` (options, pick AT MOST ONE per group and only if the customer names it — ${groups
						.map((g) => `${g.name}: ${g.options.map((o) => o.name).join(', ')}`)
						.join('; ')})`
				: '';
			const addOnsSuffix = item.addOns?.length
				? ` (add-ons: ${item.addOns.map((a) => a.name).join(', ')})`
				: '';
			return `- ${item.name}: $${item.price.toFixed(2)}${suffix}${optionsSuffix}${addOnsSuffix}`;
		})
		.join('\n');
}

function renderOrderGroup(group: OrderGroup): string {
	const addOns = group.addOns?.length ? ` +add-ons: ${group.addOns.join(', ')}` : '';
	if (group.type === 'container') {
		const scoops = group.scoops.map((s) => `  - ${s.id}: ${s.name}`).join('\n');
		return `${group.id}: [${group.container.name}]${addOns}\n${scoops}`;
	}
	const opt = group.options?.length ? ` (options: ${group.options.join(', ')})` : '';
	return `${group.id}: ${group.item.name}${opt}${addOns}`;
}

function renderCurrentOrder(order: OrderGroup[]): string {
	if (order.length === 0) return '(empty)';
	return order.map(renderOrderGroup).join('\n--\n');
}

export const matchingPrompt = (
	menu: MatchingMenuItem[],
	transcript: string,
	currentOrder: OrderGroup[],
	openClarification?: string
) => `
You are a voice order assistant. Match the customer's spoken order against the menu and return the COMPLETE updated order in a hierarchical group structure.

# Menu
${renderMenu(menu)}

# Current order
${renderCurrentOrder(currentOrder)}
${
	openClarification
		? `
# Open clarification (asked by us on the previous turn, awaiting an answer)
"${openClarification}"
`
		: ''
}
# New customer transcript
"${transcript}"

# Rules
- **Open clarification takes priority:** If an "Open clarification" section appears above, the customer's new utterance is most likely an answer to that question. Resolve it FIRST by updating the current order in place — do NOT create a new order line for the answer. Only treat the utterance as a new order if it clearly does not address the open question. Once answered, do NOT re-emit the clarification.
- **Single-utterance scope:** The transcript is ONLY the customer's most recent utterance. Treat it as an UPDATE to the current order. Items already in the current order are confirmed; do not flag them again.
- **No hallucination:** Only include items explicitly mentioned in the transcript. Do NOT add scoops that were not ordered.
- **No empty groups:** Never create a container group that contains no scoops.
- **Hierarchical groups:** The order consists of groups. A container group holds scoops that need a container (Waffle Cone, Cup). A standalone group holds a single item that does not use a container (Milkshake, Spaghetti Ice Cream, Sundaes).
- **Standalone items:** Items like "Spaghetti Ice Cream" or "Stracciatella Sundae" are standalone and must NOT be put into a container group.
- **Stable IDs:** Keep existing group and scoop IDs from the current order. Assign fresh IDs ("g1", "g2"; "s1", "s2") for new items.
- **Mandatory containers:** Every scoop (item flagged [needs container]) you put in the \`order\` MUST sit inside a container group. The one exception: if the customer named no container, you do NOT emit the scoop at all — you ask instead (next rule). NEVER fabricate a container just to satisfy this rule.
- **No container specified (ALWAYS ask, never invent one):** If the customer names scoops with no container phrase ("in a waffle cone", "in a cup"), you do not know which container they want. NEVER pick one for them. Keep any fully-resolved items in the \`order\`, leave the container-less scoops OUT, and set \`clarification\` to ask which container they want. If those scoops are the only thing ordered, return an empty \`order\` with just the clarification. This holds even for a single scoop, and it holds when the rest of the order is complete.
- **Shared vs separate:** "Two scoops in a waffle cone" is ONE container group with two scoops. "One scoop in a waffle cone and one in a cup" is TWO container groups.
- **Container phrasing:** A container is only ever introduced by a prepositional phrase ("in a cup", "in the waffle cone"). When a container word appears as part of a compound item name (e.g. "Stracciatella Sundae"), it is NOT a container — check whether the phrase exactly matches a standalone menu item and, if so, emit that item instead of decomposing it. Never collapse a prepositional "<flavor> in a cup" into a Sundae.
- **Container scope:** A trailing container phrase scopes to the entire enumeration within the SAME clause. Scoops in a PRIOR, COMPLETE clause (finite verb or full stop) are a finished order item and must NOT be pulled into a container mentioned later. Example: "I'd like two pistachio scoops. And a strawberry one in a waffle cone." → clarification for the pistachio scoops + Waffle Cone[Strawberry].
- **Exact names:** Always use the exact menu \`name\` strings for containers, scoops, items, options and add-ons in the output.
- **Off-menu items:** If the customer orders something not on the menu, do NOT silently drop it. Set \`clarification\` to say it is unavailable and suggest the closest alternative. Return an empty order for that item.
- **Options (option groups):** Each option group is single-select: pick AT MOST ONE option per group, and only when the customer expressed a choice for that dimension. Add the chosen option's exact string to the \`options\` array. Omit \`options\` when nothing was chosen. If genuinely ambiguous, ask a clarification instead of guessing.
- **Add-ons (extras):** Add-ons are zero-or-more stackable extras on a serving ("with cream", "and strawberry sauce"). Capture them on the GROUP, never on an individual scoop, gated by that container's/item's add-on list. If the customer requests an extra the item does not offer, keep the rest of the order and set \`clarification\` to say so.

# Clarification field
Use the optional \`clarification\` field for a short question to the customer — when no container was specified for scoops, or when genuinely uncertain. Omit it when confident.

# Examples
Transcript: "Two scoops of chocolate in a waffle cone, please."
Output:
{"order":[{"type":"container","id":"g1","container":{"name":"Waffle Cone"},"scoops":[{"id":"s1","name":"Chocolate Scoop"},{"id":"s2","name":"Chocolate Scoop"}]}]}

Transcript: "A chocolate scoop and a large milkshake."
Output:
{"order":[{"type":"standalone","id":"g1","item":{"name":"Large Milkshake"}}],"clarification":"Would you like the chocolate scoop in a waffle cone or in a cup?"}

Transcript: "I'd like two pistachio scoops. And, uh, a strawberry and a chocolate one in a waffle cone."
Output:
{"order":[{"type":"container","id":"g1","container":{"name":"Waffle Cone"},"scoops":[{"id":"s1","name":"Strawberry Scoop"},{"id":"s2","name":"Chocolate Scoop"}]}],"clarification":"Would you like the two pistachio scoops in a waffle cone or in a cup?"}

Transcript: "A vanilla milkshake, small, please."
Output:
{"order":[{"type":"standalone","id":"g1","item":{"name":"Small Milkshake"},"options":["Vanilla"]}]}

Transcript: "A spaghetti ice cream and a scoop of lemon."
Output:
{"order":[{"type":"standalone","id":"g1","item":{"name":"Spaghetti Ice Cream"}}],"clarification":"Would you like the lemon scoop in a waffle cone or in a cup?"}

Transcript: "I'd like a banana split."
Output:
{"order":[],"clarification":"I'm sorry, we don't have a banana split. Would you like a Spaghetti Ice Cream instead?"}

Transcript: "In the waffle cone."
Current order: (empty)
Open clarification: "Would you like the chocolate scoop in a waffle cone or in a cup?"
Output:
{"order":[{"type":"container","id":"g1","container":{"name":"Waffle Cone"},"scoops":[{"id":"s1","name":"Chocolate Scoop"}]}]}

Transcript: "A stracciatella sundae, please."
Output:
{"order":[{"type":"standalone","id":"g1","item":{"name":"Stracciatella Sundae"}}]}

Transcript: "One stracciatella in a cup, please."
Output:
{"order":[{"type":"container","id":"g1","container":{"name":"Cup"},"scoops":[{"id":"s1","name":"Stracciatella Scoop"}]}]}

Transcript: "Two strawberry scoops in a waffle cone with cream and strawberry sauce."
Output:
{"order":[{"type":"container","id":"g1","container":{"name":"Waffle Cone"},"scoops":[{"id":"s1","name":"Strawberry Scoop"},{"id":"s2","name":"Strawberry Scoop"}],"addOns":["Cream","Strawberry Sauce"]}]}

Transcript: "Two chocolate scoops in a cup with caramel sauce."
Output:
{"order":[{"type":"container","id":"g1","container":{"name":"Cup"},"scoops":[{"id":"s1","name":"Chocolate Scoop"},{"id":"s2","name":"Chocolate Scoop"}]}],"clarification":"I'm sorry, we don't have caramel sauce. Would you like cream or strawberry sauce instead?"}
`;
