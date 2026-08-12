# Tier 4 — running one eval set against many models

Beyond the 2-hour workshop. This is the harness for the question a vendor's
customers keep asking: **"we want to use model X — does your software still
work?"** Today that question costs a human a day of reading outputs. Once the
golden set and the judge exist, it costs a script run.

```bash
bun run eval:model -- --model anthropic/claude-haiku-4.5
bun run eval:model -- --model meta-llama/llama-3.1-8b-instruct
bun run eval:compare
```

`results/` ships with recorded runs for three models, so `eval:compare` works
before you spend anything.

## The two layers, cheapest first

**1. The deterministic gate.** The Hands-on 1 checks, run over the candidate's
*live* raw output. Free, instant, perfectly reproducible, no opinion involved.
A model that emits invalid schema, invents menu items or breaks the container
policy is disqualified here — whatever a judge thinks of its prose. Run this
layer alone with `--no-judge`: no judge cost, no judge error to argue about.

**2. The graded score.** The calibrated judge, for the residual that genuinely
needs taste: is the clarification helpful, is the reading of an ambiguous
order reasonable. Uses `solutions/rubric.ts`, never the Hands-on 2 placeholder
— comparing models on scores that cluster at 4–5 and wobble between runs ranks
noise, not models.

## What a run stores, and why

One JSON per model per run in `results/`, carrying the candidate model, judge
model, rubric id + hash, prompt hash, eval-set hash, temperature, repeat
count, per-case findings, scores, tokens, latency, cost, and the raw outputs.

That top half is cheatsheet rule 6 made executable: *a score without its
versions is a number without meaning.* It lets `compare.ts` **refuse
quietly-invalid comparisons** — different judge, different rubric, different
prompt, different eval set, different case count all produce a loud warning
instead of a plausible table. Most homegrown harnesses print the table anyway.

## What the comparison tells you

| Column | Why it is there |
|---|---|
| `gate pass` | share of calls with zero deterministic findings — the hard gate |
| `judge mean ±sd` | graded quality, with the spread that decides if a gap is real |
| defect matrix | *which* failures, per model. What a reviewer actually signs off |
| `p95` | tail latency, not the average that hides it — see below |
| `$/1k orders` | candidate inference only — the judge is eval overhead, never unit cost |
| `unstable` | cases whose findings changed between repeats on identical input |
| `err` | calls that failed outright |

### P95, in plain words

**Response time, 95th percentile.** Line every call up from fastest to slowest
and read off the point where 95% of them are quicker — so it is *the slowest
response a customer sees in roughly one call out of twenty*.

The average is the number that hides the problem. From the runs in `results/`:

| Model | Mean | P95 | Slowest |
|---|---|---|---|
| `anthropic/claude-haiku-4.5` | 1994 ms | **5191 ms** | 6626 ms |
| `meta-llama/llama-3.1-8b-instruct` | 967 ms | **1736 ms** | 2043 ms |

Haiku's tail is two and a half times its own average, and three times Llama's —
on the model that is *better* at the actual job. One order in twenty waiting
over five seconds, at a counter with a queue behind it, is a product decision
that a mean of "about two seconds" would have hidden completely.

One caveat to state rather than bury: at 26 calls per model, the 95th
percentile *is* the second-slowest call. Treat it as a smoke signal, not a
measurement — quoting a tail to a customer wants hundreds of calls.

## Four things this harness refuses to let you get wrong

**Ranking on one sample.** Default `--repeats 3`. We measured the same 13
cases twice with the same rubric and got 4.62 then 4.54, with one case
swinging 5 → 3. `compare.ts` will not crown a winner whose lead is smaller
than the score spread; it says so and tells you to add repeats.

**Moving the judge.** The judge model and rubric must be identical across
every candidate, or the scores are not on one scale. Change either and every
baseline needs re-running — the hashes in each artifact make that detectable
instead of a silent mistake.

**Self-preference.** A judge tends to score its own vendor family higher. When
the judge and a candidate share a family, `compare.ts` warns. Fixes, cheapest
first: judge from an uninvolved family; or a panel of 2–3 judges from
different families, averaged; or measure the bias directly by scoring one
fixed output set with each judge.

**Confusing "cannot run" with "scores badly".** A model whose every call fails
is reported as `INCOMPAT` with the provider's reason, not as 0%.

## The finding that surprised us

`openai/gpt-5-nano` scores nothing at all here — every call is rejected:

```
Invalid schema for response_format 'matched_order': 'required' is required to
be supplied and to be an array including every key in properties.
Missing 'container'.
```

OpenAI's strict structured-output mode requires `required` to list **every**
key in `properties`. Our schema (`src/matching.ts`) requires only `type` and
`id`, leaving `container`/`scoops`/`item` optional — which is the whole point
of the flat-object design, itself a workaround for a backend that rejects
JSON-Schema `oneOf` (see `src/schema.ts`).

So the schema workaround is **not portable across vendors**, and the answer to
"can we run on this model?" turns out to be an architecture question before it
is ever a quality question. Two ways out, and it is a real decision:

- keep the schema and record such models as incompatible (what we do now), or
- rewrite the JSON Schema to the *intersection* of the dialects — every key in
  `required`, optionality expressed as nullable types — which costs you the
  clean optional-field shape and needs re-validating against your own backend.

Deciding that is exactly the kind of question an eval suite is supposed to
surface early, and a manual review process surfaces late.

## Is the judge behind these scores trustworthy?

That question has its own tier now: **`evals/05-calibrate/`** measures the
judge against human labels — chance-corrected agreement, ordering,
opposite-ranked pairs, and recall on the cases a human failed. Run it before
you quote a `judge mean` at anyone.

What it currently says: the rubric this harness imports (`calibrated-v1`) is
better than a placeholder on every metric and **still fails** its own gate, on
failure catch-rate; the one-sentence-longer `calibrated-v2` passes. Two caveats
carry over — those labels are synthetic, and this harness still imports v1, so
the `judge mean` column here rests on a rubric that did not clear calibration.

Which is a long way of saying what the two layers already imply: the
`gate pass` and defect columns are load-bearing because they are deterministic
and need no trust, and the `judge mean` column is indicative until you have
calibrated the judge on labels of your own.
