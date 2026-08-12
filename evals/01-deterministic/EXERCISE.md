# Hands-on 1 — Deterministic checks (30 min)

## The situation

You have inherited a voice-order feature. The model turns a customer
transcript into a structured order, constrained by a Zod schema. The schema
guarantees the SHAPE of the output — and nothing else. Your job: build the
Tier-1 safety net that runs on every commit, offline, in milliseconds.

New to the case? Read **The scenario** in the root `README.md` first — two
minutes, and it covers the four domain rules (scoops need containers,
standalone items never go in one, options vs add-ons, and never guess a
container) that the 13 golden cases are built to test.

## Setup check (should already be done by the devcontainer)

```bash
bun install
bun test evals/01-deterministic   # 4 pass, 9 fail — your starting position
```

Pass that path every time you re-run. A bare `bun test` collects every test
file in the repo, including the finished solutions, and reports 37 pass / 9
fail — the 9 failures are still yours, but the number is useless as a progress
signal.

## Your task

Open `checks.test.ts`. Check 1 (`SCHEMA_INVALID`) is implemented as your
template. Implement checks 2–8 until all 13 cases are green.

Work through the TODOs in order — they are sorted by difficulty, and each
teaches one concept:

| # | Finding code | Concept |
|---|---|---|
| 2 | `TYPE_FIELD_MISMATCH` | schemas can be structurally too weak for the domain (read `src/schema.ts`!) |
| 3 | `EMPTY_CONTAINER_GROUP` | business rules the schema cannot express |
| 4 | `UNRESOLVED_NAME` | outputs must resolve against reference data |
| 5 | `ROLE_VIOLATION` | resolving is not enough — semantics matter |
| 6 | `INVALID_OPTION_OR_ADDON` | constraint checks against per-item rules |
| 7+8 | `HALLUCINATED_ITEM`, `MISSING_CLARIFICATION` | golden labels: structure cannot know what the customer SAID |

## Rules of the game

- The harness compares your detected findings with each case's
  `expectedFindings` — **false positives fail the suite too.** A check that
  fires on `case-01` is as broken as one that misses `case-07`.
- Read each case's `note` field when you get stuck — it explains why the
  case exists.
- Do not "fix" the fixtures. They are recordings of real failure modes.

## When you are green

Compare your implementation with `solutions/checks.ts` (the test file next to
it is only the assertion loop). Different implementations are fine; identical
finding sets are the contract.

Those same functions get a second life in `evals/04-compare/`, where they run
against the LIVE output of candidate models — the cheapest possible answer to
"can we run on this new LLM?". Note the semantic shift: a fixture's
`expectedFindings` describes the defects planted in that recording, but for a
live run the expectation is always zero findings.

Then discuss with your pair:

1. Which of these defects would `validateOrder` (src/matching.ts) have
   silently repaired at runtime? Why do we still want the eval to fail?
2. Which checks needed golden labels, and what does that mean for the cost
   of growing this suite?
3. `case-09` contains a contradictory output that is half right. Should the
   suite treat "asked the right question but also emitted the bad option"
   better than "emitted the bad option silently"? What would that require?
