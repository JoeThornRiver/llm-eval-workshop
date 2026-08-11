# Tier 5 — calibrating the judge against human labels

The step that turns *"we have an LLM-as-judge"* into *"we have a judge we can
defend"*. Nothing in this repo earns the right to gate a release on a judge
score until this passes.

```bash
bun run eval:calibrate                              # the calibrated rubric
bun run eval:calibrate -- --rubric placeholder      # prove the metric bites
bun run eval:calibrate -- --judge openai/gpt-5.6-luna --repeats 5
```

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

| metric | calibrated rubric | placeholder rubric | threshold |
|---|---|---|---|
| exact agreement | 69% | 31% | — |
| mean abs error | 0.69 | 1.08 | — |
| Spearman ρ | 0.49 | 0.27 | — |
| weighted κ | 0.60 | 0.37 | ≥ 0.60 |
| severe inversions | **0** | **5** | 0 |
| severe recall | 0.67 | 0.33 | ≥ 0.80 |
| self-agreement | 77% | 69% | — |

**Both verdicts are NOT USABLE.** The calibrated rubric is better on every
single metric and still fails, on exactly one criterion: severe recall.

That the placeholder produces five severe inversions is the demonstration
worth showing: it ranked `case-12` — the output that follows the container
policy perfectly — *below* `case-02`, which is not even parseable. A rubric
that does that will happily green-light a release.

## Why the good rubric fails, and the two different fixes

The entire verdict hinges on two cases, and they fail for opposite reasons.

**`case-05` — human 2, judge 4.** The output emits `"Choco Scoop"`, which is
not a menu string, so at runtime the scoop silently vanishes and the customer
does not get what they ordered. The judge called it a minor lapse. The menu
*is* in the judge's prompt, so this is a **rubric-weighting failure**: anchor 4
says "a cosmetic naming issue that still resolves", and the judge stretched it
to a name that does not resolve. Fixable in the rubric — split that anchor so a
non-resolving name falls under the hard cap.

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
