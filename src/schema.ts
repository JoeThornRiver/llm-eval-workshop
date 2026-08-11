import { z } from 'zod';

/**
 * The order schema the LLM is constrained to — carried over from production
 * almost verbatim, because it teaches the single most important lesson of
 * this workshop:
 *
 *   SCHEMA CONFORMANCE IS NECESSARY BUT NOT SUFFICIENT.
 *
 * Two deliberate quirks, both real:
 *
 * 1. It is a single flat object, NOT a discriminated union. The clean design
 *    would be `z.discriminatedUnion('type', [...])`, but that compiles to
 *    JSON-Schema `oneOf`, which some structured-output backends reject
 *    ("Schema type 'oneOf' is not supported"). So `type` merely *hints* which
 *    of the optional field sets applies — the schema itself would happily
 *    accept `type: "container"` with no scoops, or a group carrying BOTH
 *    `container` and `item`. That consistency gap is exactly what your
 *    deterministic checks (Hands-on 1) must close.
 *
 * 2. There is no price field. The model returns identity only (names);
 *    price is resolved against the menu by `validateOrder`. The model cannot
 *    misstate a price because the schema gives it nowhere to put one —
 *    the cheapest guardrail is a field that does not exist.
 */
const groupSchema = z.object({
	type: z.enum(['container', 'standalone']),
	id: z.string(),
	container: z.object({ name: z.string() }).optional(),
	scoops: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
	item: z.object({ name: z.string() }).optional(),
	options: z.array(z.string()).optional(),
	addOns: z.array(z.string()).optional()
});

export const matchedOrderSchema = z.object({
	order: z.array(groupSchema),
	clarification: z.string().optional()
});

export type MatchedOrder = z.infer<typeof matchedOrderSchema>;
export type RawGroup = z.infer<typeof groupSchema>;
