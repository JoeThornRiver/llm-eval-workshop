# Solution — a calibrated judge rubric for the matching feature

The canonical copy of this text is exported as `CALIBRATED_RUBRIC` from
`solutions/rubric.ts`, because Tier 4 (`evals/04-compare/`) imports it to
score candidate models. Edit it there; this file is the explanation.

Replace the placeholder `RUBRIC` in `evals/02-judge/run-judge.ts` with:

```
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
```

## Why the placeholder rubric fails (the point of the exercise)

"Rate how good this is, 1–5" produces scores that cluster at 4–5, disagree
between runs, and reward fluent-looking JSON over correct policy. Three
mechanisms fix that, and each maps to a line above:

1. **Named criteria** convert the judge from a taste oracle into a checklist
   executor — its variance drops sharply.
2. **Score anchors** pin what a "3" means, so two runs (or two judge models)
   agree. Without anchors, thresholds in CI are meaningless.
3. **The hard cap** ("cannot exceed 2 if …") encodes your non-negotiables.
   Judges otherwise average away catastrophic failures: a hallucinated order
   with beautiful phrasing scores 3.5 on vibes.

## Calibration (do this before trusting any judge in CI)

Label 10–20 outputs by hand, run the judge over them, and compare. You are
looking for (a) systematic offset — the judge is consistently one point
kinder than you, fixable via anchors or threshold, and (b) inversions — the
judge ranks a bad output above a good one, which means a criterion is
missing from the rubric. Re-calibrate whenever the prompt, the menu
structure, or the judge model changes: judge drift is silent.
