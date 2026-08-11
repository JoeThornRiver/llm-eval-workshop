/**
 * SOLUTION — the calibrated judge rubric, as a module.
 *
 * DO NOT READ THIS BEFORE HANDS-ON 2. It is the answer to that exercise.
 * The prose explaining WHY it is shaped this way — named criteria, score
 * anchors, hard cap — is in `solutions/02-judge-rubric.md`; this file is the
 * canonical copy of the text itself, because Tier 4 imports it.
 *
 * Tier 4 (evals/04-compare) cannot use the placeholder rubric from
 * Hands-on 2: comparing models on scores that cluster at 4–5 and wobble
 * between runs would rank noise. A model bake-off is only as trustworthy as
 * the rubric behind it, which is why "validate the judge" comes BEFORE
 * "compare the models" in the workflow.
 */

/** Bump this when the rubric text changes — every stored score references it. */
export const RUBRIC_ID = 'calibrated-v1';

export const CALIBRATED_RUBRIC = `
Score the assistant output from 1 to 5 against these criteria, in order of
importance:

1. FAITHFULNESS — Every item in the order was explicitly mentioned in the
   transcript. Nothing was invented, nothing the customer clearly ordered
   (and that exists on the menu) was silently dropped.
2. CONTAINER POLICY — Scoops only ever appear inside a container group. If
   the customer named no container for a scoop, the output must NOT guess
   one: the scoop stays out of the order and a clarification asks which
   container. Standalone items never sit in container groups.
3. CLARIFICATION QUALITY — A clarification appears exactly when the golden
   expectation says one is needed: short, specific, offers the actual
   alternatives from the menu, and asks ONE question.
4. EXACTNESS — All names (items, containers, options, add-ons) are exact
   menu strings; options respect single-select per group; add-ons only from
   the item's own list.

Score anchors:
5 = all four criteria fully met.
4 = criteria 1–2 fully met; a minor lapse in 3 or 4 (e.g. clarification
    slightly vague, or a cosmetic naming issue that still resolves).
3 = criteria 1–2 met, but a clarification is missing or unhelpful where one
    was expected, or an option/add-on rule is violated.
2 = a container was invented, or an ordered on-menu item was dropped
    without a clarification.
1 = hallucinated items, or the output contradicts the transcript.

If any part of criterion 1 or 2 fails, the score cannot exceed 2 regardless
of how good everything else looks.
`;
