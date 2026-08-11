# Hands-on 2 — LLM-as-judge (30 min)

## Why Tier 1 is not enough

Your deterministic checks catch structure, resolution and policy violations.
They cannot judge whether a clarification is *helpful*, whether the model
picked the *reasonable* interpretation of an ambiguous order, or how badly a
failure hurts. For that you need a judge — a second model scoring the first
one against a rubric.

## Setup

Hands-on 2 goes live: `OPENROUTER_API_KEY` must be set (in the workshop it
arrives as a Codespaces secret). A full run costs a few cents.

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
