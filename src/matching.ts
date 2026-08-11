import { matchedOrderSchema, type MatchedOrder } from './schema';
import { matchingPrompt } from './prompts/matchingPrompt';
import type { MatchingMenuItem, OrderGroup } from './types';
import menuJson from '../fixtures/menu.json';

export const menu: MatchingMenuItem[] = menuJson as MatchingMenuItem[];

/**
 * Simplified port of the production `validateOrder`: resolve every name the
 * model returned against the menu, drop anything that does not resolve, and
 * enforce the container/standalone discrimination the schema cannot express
 * (see src/schema.ts on why the schema is a flat object).
 *
 * NOTE for the workshop: this function is the app's LAST line of defense at
 * runtime. Your eval checks in Hands-on 1 look at the model's RAW output
 * (before this cleanup) on purpose — a model that constantly needs rescuing
 * is a quality problem you want to SEE, not silently repair.
 */
export function validateOrder(raw: MatchedOrder['order'], menuItems: MatchingMenuItem[]): OrderGroup[] {
	const byName = new Map(menuItems.map((m) => [m.name, m]));
	const groups: OrderGroup[] = [];

	for (const g of raw) {
		if (g.type === 'container') {
			const containerItem = g.container ? byName.get(g.container.name) : undefined;
			if (!containerItem?.isContainer) continue;
			const scoops = (g.scoops ?? []).filter((s) => byName.get(s.name)?.requiresContainer);
			if (scoops.length === 0) continue; // no empty container groups
			const addOns = (g.addOns ?? []).filter((a) =>
				containerItem.addOns?.some((x) => x.name === a)
			);
			groups.push({
				type: 'container',
				id: g.id,
				container: { name: containerItem.name },
				scoops,
				...(addOns.length ? { addOns } : {})
			});
		} else {
			const item = g.item ? byName.get(g.item.name) : undefined;
			if (!item || item.isContainer || item.requiresContainer) continue;
			const validOptions = new Set(
				(item.optionGroups ?? []).flatMap((og) => og.options.map((o) => o.name))
			);
			const options = (g.options ?? []).filter((o) => validOptions.has(o));
			const addOns = (g.addOns ?? []).filter((a) => item.addOns?.some((x) => x.name === a));
			groups.push({
				type: 'standalone',
				id: g.id,
				item: { name: item.name },
				...(options.length ? { options } : {}),
				...(addOns.length ? { addOns } : {})
			});
		}
	}
	return normalizeIds(groups);
}

function normalizeIds(groups: OrderGroup[]): OrderGroup[] {
	return groups.map((group, gIdx) => {
		const groupId = `g${gIdx + 1}`;
		if (group.type === 'container') {
			return {
				...group,
				id: groupId,
				scoops: group.scoops.map((scoop, sIdx) => ({ ...scoop, id: `s${gIdx + 1}-${sIdx + 1}` }))
			};
		}
		return { ...group, id: groupId };
	});
}

/**
 * Live call to the model via OpenRouter (used in Hands-on 2 and the
 * red-team demo; Hands-on 1 never calls this).
 *
 * The production app uses the Vercel AI SDK's structured output. Here we use
 * a plain fetch with `response_format: json_schema` so you can see the whole
 * mechanism without SDK indirection: schema in, JSON out, zod-parse to trust.
 */
export async function matchOrder(
	transcript: string,
	currentOrder: OrderGroup[] = [],
	openClarification?: string,
	model = 'anthropic/claude-haiku-4.5'
): Promise<MatchedOrder> {
	const { raw } = await matchOrderWithMeta({ transcript, currentOrder, openClarification, model });
	const parsed = matchedOrderSchema.safeParse(raw);
	if (!parsed.success) throw new Error(`Model output failed schema parse: ${parsed.error.message}`);
	return parsed.data;
}

/** What one call to a candidate model cost us, besides the order itself. */
export interface CallMeta {
	model: string;
	latencyMs: number;
	promptTokens: number;
	completionTokens: number;
	/** Charged amount in OpenRouter credits (USD). Always present since 2025. */
	costUsd: number;
}

/**
 * The same call as `matchOrder`, but returning what Tier 4 needs to compare
 * models: tokens, cost and latency alongside the order.
 *
 * `matchOrder` above is the thin wrapper the exercises use — its signature
 * stays deliberately boring so Hands-on 2 and the red-team demo read as
 * "transcript in, order out" with no measurement apparatus in the way.
 */
export async function matchOrderWithMeta(opts: {
	transcript: string;
	currentOrder?: OrderGroup[];
	openClarification?: string;
	model?: string;
	/** Pin for reproducibility. Omitted entirely when undefined, so the
	 *  exercises keep whatever the provider defaults to. */
	temperature?: number;
}): Promise<{ raw: unknown; meta: CallMeta }> {
	const {
		transcript,
		currentOrder = [],
		openClarification,
		model = 'anthropic/claude-haiku-4.5',
		temperature
	} = opts;
	const apiKey = process.env.OPENROUTER_API_KEY;
	if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set (see .env.example)');

	const startedAt = performance.now();
	const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model,
			...(temperature === undefined ? {} : { temperature }),
			messages: [
				{ role: 'user', content: matchingPrompt(menu, transcript, currentOrder, openClarification) }
			],
			response_format: {
				type: 'json_schema',
				json_schema: {
					name: 'matched_order',
					strict: true,
					schema: {
						type: 'object',
						additionalProperties: false,
						required: ['order'],
						properties: {
							order: {
								type: 'array',
								items: {
									type: 'object',
									additionalProperties: false,
									required: ['type', 'id'],
									properties: {
										type: { type: 'string', enum: ['container', 'standalone'] },
										id: { type: 'string' },
										container: {
											type: 'object',
											additionalProperties: false,
											required: ['name'],
											properties: { name: { type: 'string' } }
										},
										scoops: {
											type: 'array',
											items: {
												type: 'object',
												additionalProperties: false,
												required: ['id', 'name'],
												properties: { id: { type: 'string' }, name: { type: 'string' } }
											}
										},
										item: {
											type: 'object',
											additionalProperties: false,
											required: ['name'],
											properties: { name: { type: 'string' } }
										},
										options: { type: 'array', items: { type: 'string' } },
										addOns: { type: 'array', items: { type: 'string' } }
									}
								}
							},
							clarification: { type: 'string' }
						}
					}
				}
			}
		})
	});

	if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
	const data = (await res.json()) as {
		choices: { message: { content: string } }[];
		usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
	};
	const latencyMs = performance.now() - startedAt;
	const content = data.choices[0].message.content;

	// Deliberately NOT zod-parsed here. A candidate model that returns
	// malformed JSON is a finding Tier 4 must record (SCHEMA_INVALID), not an
	// exception that aborts the run — so the raw payload goes back untouched
	// and the caller decides. `matchOrder` above still throws, because the
	// exercises want a trustworthy MatchedOrder or nothing.
	let raw: unknown;
	try {
		raw = JSON.parse(content);
	} catch {
		raw = content; // not even JSON — fails schema validation downstream
	}

	return {
		raw,
		meta: {
			model,
			latencyMs,
			promptTokens: data.usage?.prompt_tokens ?? 0,
			completionTokens: data.usage?.completion_tokens ?? 0,
			costUsd: data.usage?.cost ?? 0
		}
	};
}
