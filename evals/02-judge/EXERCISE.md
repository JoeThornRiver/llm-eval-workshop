# Hands-on 2 — LLM-as-judge (30 min)

## Why Tier 1 is not enough

Your deterministic checks catch structure, resolution and policy violations.
They cannot judge whether a clarification is *helpful*, whether the model
picked the *reasonable* interpretation of an ambiguous order, or how badly a
failure hurts. For that you need a judge — a second model scoring the first
one against a rubric.

## How the harness works — read before you run it

One thing to get straight, because it is the difference between Tier 1 and
Tier 2 and everyone gets it wrong once:

> **Tier 1 grades recordings. Tier 2 grades the live model.**

`bun test evals/01-deterministic` reads the `recorded` field of each fixture —
frozen output with planted defects. `bun run eval:judge` ignores `recorded`
entirely. For each of the 13 cases it:

1. calls the **live** matching model on `transcript` (13 API calls), then
2. asks the **judge** model to score that fresh output 1–5 (13 more calls).

The judge prompt contains the rubric, the menu, the transcript, the golden
expectations (`allowedItems`, `expectClarification`) and the output to score.
The judge is told to reason step by step and finish with a line reading
exactly `SCORE: <n>`, which the harness pulls out with a regex. No match means
that case is recorded as an error and dropped from the average — that is what
`n=` counts.

The average is compared against `PASS_THRESHOLD` (4.0) and becomes the exit
code, so this script gates CI the same way a test does.

Three consequences worth knowing before you argue about numbers:

- **Your scores will differ from your neighbour's.** Fresh live output every
  run, on both the matching side and the judging side.
- **The judge is not blind.** It is handed the golden labels, which makes it
  more accurate but means it can never be used to *validate* those labels.
- **The judge is Sonnet, the model under test is Haiku** — a deliberate
  asymmetry, and the subject of discussion question 3.

### Seeing *why* the judge scored something

The harness computes the judge's reasoning and then throws it away, keeping
only the number. That is fine for CI and useless for improving a rubric — so
when a score puzzles you, print the reasoning for one case:

```bash
bun -e '
import { judgeOutput } from "./evals/04-compare/judge";
import { matchOrder } from "./src/matching";
import { readFileSync } from "node:fs";
const c = JSON.parse(readFileSync("fixtures/cases/case-07.json", "utf-8"));
const out = await matchOrder(c.transcript);
console.log("OUTPUT:", JSON.stringify(out));
const v = await judgeOutput({
  transcript: c.transcript, output: out, expected: c.expected,
  rubric: "\nRate how good this output is, from 1 (bad) to 5 (great).\n",
  model: "anthropic/claude-sonnet-5", temperature: 0
});
console.log(v.reasoning);
'
```

Swap the `rubric` string for yours and compare the reasoning. Watching a
placeholder rubric produce paragraphs of praise, and a real rubric produce a
checklist, is the fastest way to feel what the three mechanisms below actually
do.

## Setup

Hands-on 2 goes live: `OPENROUTER_API_KEY` must be set (in the workshop the
trainer shares it and you run `cp .env.example .env`). A full run costs a few
cents.

## Your task

1. Open `run-judge.ts`. The harness is complete; the `RUBRIC` is a
   deliberately useless placeholder.
2. Run it once **as-is**: `bun run eval:judge`. Look at the scores. Discuss:
   would you gate a release on these numbers?
3. Now write a real rubric. Constraints:
   - name concrete criteria for THIS domain (faithfulness? containers?
     clarifications? exact names?), ordered by importance
   - anchor every score level (what exactly is a 3?)
   - encode at least one non-negotiable as a hard cap
4. Re-run. Compare score spread and stability with step 2 (run twice!).

## When you are done

Compare with `solutions/02-judge-rubric.md` — it also explains the three
mechanisms that make rubrics work and how to calibrate a judge against
human labels before trusting it in CI.

## Discussion

1. Your judge just scored a model using golden labels a human wrote. What
   breaks when you skip the human and let a model write the labels too?
2. The CI gate is `average >= 4.0`, not `all == 5`. Why is a threshold the
   right shape for a non-deterministic system — and what pathology does a
   too-low threshold breed?
3. Judge model = Sonnet, matching model = Haiku. What happens to your eval
   if you upgrade the matching model to the judge's level?
