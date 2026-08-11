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

/**
 * v2 — the output of one turn of the Tier 5 calibration loop.
 *
 * v1 above is left EXACTLY as taught in Hands-on 2. This is not a correction
 * of the exercise; it is what the exercise's own method produces when you
 * actually measure the rubric instead of admiring it.
 *
 * What calibration found (evals/05-calibrate): on `case-05` the model emitted
 * "Choco Scoop", which is not a menu string, so at runtime the scoop is
 * dropped and the customer receives nothing for it. v1 scored that a 4 on
 * three consecutive runs, because anchor 4 forgives "a cosmetic naming issue
 * that still resolves" and nothing in v1 says a name that does NOT resolve is
 * a faithfulness failure — and only criteria 1 and 2 trigger the hard cap.
 *
 * THE ONLY DIFFERENCE FROM v1 is the final sentence of criterion 1. The cap
 * then does the rest of the work by itself, which is the point: a well-built
 * rubric is fixed by adding a criterion, not by tuning a threshold.
 *
 * What it does NOT fix, and cannot: `case-02` returns an output missing its
 * `type` field, so the consuming system can parse nothing. The judge scores it
 * 5 because, on the information it is given, the content IS right — it never
 * sees the schema. No rubric wording reaches that. That case belongs to the
 * Tier 1 deterministic checks permanently, and it is the reason the gate runs
 * before the judge rather than after.
 */
export const RUBRIC_V2_ID = 'calibrated-v2';

export const CALIBRATED_RUBRIC_V2 = `
Score the assistant output from 1 to 5 against these criteria, in order of
importance:

1. FAITHFULNESS — Every item in the order was explicitly mentioned in the
   transcript. Nothing was invented, nothing the customer clearly ordered
   (and that exists on the menu) was silently dropped. An ITEM, CONTAINER or
   SCOOP name that is not an exact menu string counts as dropped: the system
   cannot resolve it, so the customer does not receive that item. (A bad
   OPTION or ADD-ON name is criterion 4, not this one.)
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
