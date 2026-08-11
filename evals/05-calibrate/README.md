# Tier 5 — calibrating the judge against human labels

The step that turns *"we have an LLM-as-judge"* into *"we have a judge we can
defend"*. Nothing in this repo earns the right to gate a release on a judge
score until this passes.

```bash
bun run eval:calibrate                              # v1, the Hands-on 2 answer
bun run eval:calibrate -- --rubric placeholder      # prove the metric bites
bun run eval:calibrate -- --rubric v2               # after one turn of the loop
bun run eval:calibrate -- --judge openai/gpt-5.6-luna --repeats 5
```

Those first three commands are the demo: a rubric that measures nothing, the
taught rubric that measures a lot and still fails its gate, and the rubric
that failure produced. Run in that order it takes about four minutes and costs
under a euro.

It judges the **recorded** outputs in `fixtures/cases/*.json`, not live ones, so
the model output is held constant and the judge is the only variable. Exit code
0 means usable, 1 means do not gate on it.

## What it measures, and why each one

| Metric | The question it answers | If it is bad |
|---|---|---|
| **offset** (judge − human) | is the judge systematically kinder or harsher? | cheap to fix: sharpen anchors or move the threshold |
| **Spearman ρ / weighted κ** | does it *order* outputs like the human? | expensive: the rubric is not tracking the human at all |
| **inversions** | does it rank a bad output ABOVE a good one? | the rubric is **missing a criterion** the human uses — no threshold fixes this |
| **severe recall** | of the cases the human failed, how many did the judge also fail? | the dangerous one: averages hide a missed disaster |
| **self-agreement** | does the judge agree with *itself* across repeats? | caps how well it can ever agree with a human; no wording fixes it |

Quadratic weights on κ are deliberate: plain κ treats "human 5, judge 1" as no
worse than "human 5, judge 4", which is nonsense for a score. The formulas live
in `stats.ts` with unit tests in `stats.test.ts` whose expected values are
derived by hand — a miscomputed κ would certify a judge that does not work,
which is worse than having no κ at all.

## The labels are SYNTHETIC — read this before quoting any number

`labels.json` was written by applying the anchors in `solutions/rubric.ts` to
each fixture's already-known defect list. That is **not** a blind human
labeling pass, and it matters:

- **What it does prove:** that the measurement apparatus works, that the
  calibrated rubric beats the placeholder on every metric, and where the
  judge's blind spots are.
- **What it does not prove:** human agreement. Labels derived *from* a rubric
  partly measure whether the judge can rediscover that rubric. Real labels
  disagree with a rubric in ways synthetic ones cannot.

Replace this file with real labels before trusting a judge in production. The
format is stable: `caseId`, `humanScore`, `rationale`. Each label here carries
its reasoning so you can argue with it — several are genuinely debatable, and
`case-02` and `case-04` are flagged in their own rationales as cases the rubric
has no anchor for.

Two structural limits of this label set, both printed by the run itself:
**n=13** (50–100 is the working minimum for a gate you would defend) and **no
4s at all**, so the judge's ability to tell a 4 from a 5 is untested here.

## The measured result

Sonnet 5, three repeats per case, temperature 0:

| metric | placeholder | v1 (taught) | v2 (after the loop) | threshold |
|---|---|---|---|---|
| exact agreement | 31% | 69% | **85%** | — |
| within 1 point | 77% | 69% | 85% | — |
| offset (judge − human) | +0.15 | +0.08 | +0.08 | — |
| mean abs error | 1.08 | 0.69 | **0.38** | — |
| Spearman ρ | 0.27 | 0.49 | **0.68** | — |
| weighted κ | 0.37 | 0.60 | **0.73** | ≥ 0.60 |
| severe inversions | **5** | 0 | 0 | 0 |
| severe recall | 0.33 | 0.67 | **0.83** | ≥ 0.80 |
| judge self-agreement | 69% | 77% | **92%** | — |
| **verdict** | NOT USABLE | NOT USABLE | **USABLE** | — |

Three things in that table are worth more than the verdict.

**The placeholder produces five severe inversions.** It ranked `case-12` — the
output that follows the container policy perfectly — *below* `case-02`, which
is not even parseable. A rubric that does that will green-light anything.

**v1 is better than the placeholder on every single metric and still fails**,
on exactly one criterion: severe recall. "Better than useless" is not a
standard; the gate is.

**v2 differs from v1 by one sentence.** Not a threshold, not a judge upgrade,
not more repeats — one added criterion. That is what a well-built rubric looks
like when it is wrong: fixable by naming the missing criterion.

## Why v1 fails, and the two different fixes

The entire verdict hinges on two cases, and they fail for opposite reasons.

**`case-05` — human 2, judge 4.** The output emits `"Choco Scoop"`, which is
not a menu string, so at runtime the scoop silently vanishes and the customer
does not get what they ordered. The judge called it a minor lapse. The menu
*is* in the judge's prompt, so this is a **rubric-weighting failure**: anchor 4
says "a cosmetic naming issue that still resolves", and the judge stretched it
to a name that does not resolve. Fixable in the rubric — **this is what v2
fixes**, and it moved the score 4 → 2, which is the single change that carries
the verdict from failing to passing.

**`case-02` — human 2, judge 5.** The group is missing its `type` field, so the
output is unparseable and the consuming system gets nothing. The judge scored
it perfect — correctly, on the information it had: it is never shown the schema,
so it graded the *content* ("a cappuccino was ordered", which is right).

That second one is **not** a rubric bug, and no amount of rubric editing fixes
it. It is the empirical case for the architecture this whole repo argues for:

> Ask the judge only what a judge can decide. Schema validity and name
> resolution are decided for free, in milliseconds, with no opinion involved,
> by the Tier 1 checks. A judge asked to grade what a parser already decided
> will answer confidently and sometimes wrongly.

In production this means the deterministic gate runs first and the judge scores
only what passes it. Note the cost of that ordering on this fixture set: only
three cases clear the gate, and all three are labeled 5 — not enough spread to
calibrate on, which is another way of saying **your calibration set needs
outputs that are flawed in ways only a human can weigh**, not outputs that a
parser can reject.

## What writing v2 taught us that the metrics did not

Two things happened while iterating on that one sentence, and both are the
reason you re-run the whole calibration rather than checking the case you aimed
at.

**The first draft over-reached.** It read "a name that is not an exact menu
string counts as dropped", which is true of item names — and also caught
*option* and *add-on* names, which this rubric deliberately puts at anchor 3.
`case-09` (Hazelnut) and `case-10` (Caramel Sauce) both fell from a correct 3
to a 2. Exact agreement dropped to 69% even though the target case was fixed.
Scoping the clause to item, container and scoop names — and saying explicitly
that a bad option or add-on name is criterion 4 — recovered both cases and took
exact agreement to 85%. **A rubric edit is a prompt change: it moves cases you
were not aiming at.**

**One disagreement survives every version: `case-04`.** The empty container
group. Our label says 3 (the espresso is right, the leftover group harms
nobody), the judge says 1 or 2 depending on the wording — it reads a
structurally broken order as severe. Neither is obviously right, and the
rubric has no anchor for "invalid but customer-harmless". That is not a bug to
fix in the judge; it is a **question for whoever owns the labels**, and it is
exactly the kind of question this harness exists to surface. Notice the
temptation it creates: our label is synthetic, so the cheapest way to make the
number look better would be to change the label. Do not — that is how a
calibration set stops measuring anything.

## What to do with a failing calibration

In order of what it usually is:

1. **Inversions?** Write the missing criterion into the rubric. Re-run.
2. **Systematic offset?** Sharpen the anchors, or move the CI threshold to
   match the judge's known bias. Re-run.
3. **Low self-agreement?** Pin temperature to 0 (done here), then consider a
   stronger judge model. A judge that contradicts itself cannot be rescued by
   wording.
4. **Low severe recall?** Check whether the missed cases are mechanically
   detectable, as both are here. If so the fix is not in the judge.

Then re-calibrate. **Judge drift is silent**, so re-run this whenever the judge
model, the rubric, the prompt or the menu structure changes — each run stores an
artifact in `results/` with the judge model, rubric hash and label-set version
precisely so a later run can be compared with an earlier one.
