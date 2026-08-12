# Handover — update the impulse deck

**Task for the assistant reading this:** update the existing PowerPoint
`HYPE_LLM_Eval_Workshop_Impulse_1.pptx` so it matches the workshop as it now
stands. The deck is the ~20-minute *impulse* that opens a 2-hour hands-on
session; it is not the workshop itself.

**Do not restyle anything.** Keep the existing template, layouts, master, fonts,
colours, and image assets exactly as they are. Every change below is content:
text, bullet structure, one or two new slides built from existing layouts. The
file is 17 MB because of template assets — preserve them.

**Source of truth for every claim:** <https://github.com/JoeThornRiver/llm-eval-workshop>
(public). Where this document gives a number, it was measured against that repo
on 2026-08-11/12 and can be re-derived from the files named in the last section.

---

## 1. The one structural change that drives everything else

The old deck presents a workshop that *ends* with CI wiring, and treats
evaluating a different model as an afterthought. It has since been restructured
around a single question the audience actually owns:

> **"Can we run your software on this new model?"**

That question is now the destination. Every block earns the right to answer it,
and the session ends by answering it live in 24 seconds. The deck should set up
that question in the first two minutes and promise the answer.

Why this matters to the audience: today a senior person spends a day re-reading
outputs whenever a customer asks about a new LLM, and does it again for the next
model. Cost scales with models × cases and never falls. After this it scales
with cases, and each new model is a script run. **Do not claim the human
disappears** — their work moves upstream and stops repeating. That framing is
honest and it is a bigger number than "we automated your evals".

---

## 2. Current deck inventory, in presentation order

| # | Internal file | Current content | Verdict |
|---|---|---|---|
| 1 | `slide1` | Title: "Testing the Untestable — Evals for LLM Features" | **Keep.** Optionally add a subtitle carrying the new question (§1). |
| 2 | `slide26` | "Why assertEquals dies here" / "Same prompt, three correct answers" | **Keep, strengthen.** See §4 — there is now a live example that is *stronger* than non-determinism. |
| 3 | `slide22` | "One artifact, three eval layers" — a *document generation* example (Markdown + typed frontmatter) | **Decide.** This is a different production case, not the workshop's. Either keep it as a second illustration or replace it with the model-acceptance framing. Recommendation: replace, because the deck is already long and §1 needs the room. |
| 4 | `slide41` | "The eval map" — four tiers (deterministic, similarity, judge, red team) | **Revise.** Now six layers, and one of the four should be marked as not used here. See §5. |
| 5 | `slide12` | "Today's case" — voice order, with an example JSON | **Revise — contains an incorrect JSON shape.** See §6. Also needs the domain primer. |
| 6 | `slide16` | "Precision equals recall" — the harness rule | **Keep.** Still exactly right and still the best one-liner in the deck. |
| 7 | `slide5` | Agenda — 5 blocks | **Replace contents.** New agenda in §3. |
| 8 | `slide8` | "Open your Codespace" — `github.com/ORG/llm-eval-workshop` | **Fix.** Placeholder org, and the setup steps have changed. See §7. |

---

## 3. New agenda slide (replaces `slide5` contents)

Seven blocks. Keep the numbered-list layout; note the timings are cumulative
clock positions, and that the last block is the destination rather than a
summary.

| | Block | Time | What it contributes to the verdict |
|---|---|---|---|
| A | The question that costs you a day | 0:00 · 15 min | why a human reads outputs today |
| B | Hands-on 1 — the gate you write once (offline) | 0:15 · 30 min | the free, model-independent half of the answer |
| C | Hands-on 2 — the judge for the residual (live) | 0:45 · 25 min | the half that needs taste |
| D | Trust the judge, or don't ship it | 1:10 · 15 min | proof the judge's number means anything |
| E | A new model is a new attack surface | 1:25 · 10 min | injection resistance, per candidate |
| F | **The verdict: one eval set, many models** | 1:35 · 20 min | **the answer, in 24 seconds, in writing** |
| G | Wrap-up — what changes on Monday | 1:55 · 5 min | |

CI wiring is no longer its own block; it folds into F as "how this runs
unattended".

---

## 4. Slide 2 — the live example that beats "non-determinism"

The current slide argues that the same prompt yields three correct answers, so
`assertEquals` cannot work. True, but there is a sharper, measured example, and
it is worth adding as a second bullet or a follow-on slide:

Transcript: **"A chocolate scoop and a fruit sundae."** The correct behaviour is
to keep the sundae, hold the scoop back because no container was named, and ask
*cone or cup?* Run the production model ten times:

- The clarification text comes back **byte-identical every time** — so this is
  not a story about randomness.
- On **9 of 10 runs** the model also emits a second group: a Waffle Cone it
  invented, **containing the chocolate scoop**, while the clarification still
  asks which container the customer wants. It decides and asks in one breath.
- That output is **schema-valid**, every name is a real menu item, every role is
  correct, and the runtime validator passes it through **untouched**.
- The customer is charged for a cone they never chose.

The point for the deck: assertions fail not because output is random, but
because it is **confidently and repeatably wrong** in ways only a semantic check
catches. That is why a human has to read outputs today, and why swapping models
is expensive.

---

## 5. Slide 4 — the eval map, updated

Same one-axis idea (cost per run decides how often it runs), now six layers:

| Layer | What it verifies | Runs | Cost |
|---|---|---|---|
| Schema validation | output parses, has the right shape | every commit | free |
| Deterministic checks | business rules the schema cannot express | every commit | free |
| Golden labels | output matches what was actually said | every commit | free (labels cost human time) |
| LLM-as-judge + rubric | quality needing judgment: helpfulness, reasonableness | PRs / nightly | cents |
| Red-team probes | robustness against adversarial input, **per candidate model** | nightly / per candidate | cents |
| **Model acceptance + judge calibration** | can a *different* model run this software, and is the judge trustworthy | on request / per candidate | cents per model |

Two edits to the existing four rows:

- The **similarity** tier (embedding distance to a reference) should be marked
  *not used here* — these outputs are structured, so it buys nothing. Keeping it
  unqualified implies the workshop uses it.
- The red-team row gains "per candidate model", which is new and is the point of
  §9.

---

## 6. Slide 5 — "Today's case", with two fixes

**Fix the JSON.** The slide currently shows something like
`{"container": "Waffle Cone", "scoops": ["Chocolate Scoop", …]}`. That is not the
real schema. The actual shape is nested, and the nesting is the whole reason
Hands-on 1 exists:

```json
{
  "order": [
    {
      "type": "container",
      "id": "g1",
      "container": { "name": "Waffle Cone" },
      "scoops": [
        { "id": "s1", "name": "Chocolate Scoop" },
        { "id": "s2", "name": "Chocolate Scoop" },
        { "id": "s3", "name": "Strawberry Scoop" }
      ]
    }
  ],
  "clarification": "…optional…"
}
```

**Add the domain primer.** The audience has never seen this app, and without
these four rules the demos are unreadable. Four bullets:

- **Scoops** (Vanilla, Chocolate, Pistachio) cannot be sold alone — they must sit
  inside a container.
- **Containers** (Waffle Cone, Cup) are free, hold the scoops, and can carry
  add-ons.
- **Standalone items** (Spaghetti Ice Cream, sundaes, milkshakes, Cappuccino,
  Coca-Cola) are sold on their own and never go inside a container.
- **Options vs add-ons**: an option is single-select per dimension (one flavour,
  one milk) and only if the customer named it; an add-on is a stackable extra
  (cream, sauce) and only from that item's own list.

Then the rule that generates most of what the session looks at, worth its own
line: **if the customer names scoops but no container, the model must not pick
one — it asks.** Guessing is the failure they will see most, and it costs the
customer money.

Also worth one line: there is deliberately **no banana split** on the menu, so
the off-menu case can be tested.

---

## 7. Slide 8 — setup, corrected

The repository is now **public**, which changes the steps:

- URL: **`codespaces.new/JoeThornRiver/llm-eval-workshop`** — no invitation and
  no repo access needed; anyone with a GitHub account can open it. (Equivalent
  click path: repo → green **Code** button → **Codespaces** → **Create codespace
  on main**.)
- Compute comes out of each attendee's own free GitHub quota, not the trainer's.
- **Hands-on 1 needs no API key** — that part of the old slide stays true.
- For the live tiers, the trainer shares the key in the room and each attendee
  runs `cp .env.example .env` and pastes it in. A public repo cannot carry the
  key, and GitHub does not hand repository secrets to arbitrary users of a
  public repo.
- The first command is **`bun test evals/01-deterministic`** → *4 pass, 9 fail*.
  **Do not print a bare `bun test`** on the slide: that collects every test file
  in the repo, including the finished solutions, and reports 37 pass / 9 fail.

---

## 8. Verified numbers — use these, they are measured

Label them as measurements, not benchmarks. Every one is reproducible from the
repo.

**Hands-on 1 (offline)** — 13 golden cases: 10 carry a planted defect, 3 are
clean so precision is testable. Starting state 4 pass / 9 fail; reference
implementation 13 / 13.

**Hands-on 2 (the placeholder rubric)** — average **4.62** and **4.54** on two
runs of the identical 13 cases, against a pass threshold of 4.0. Ten of thirteen
scored 5. **Both runs pass the gate.** One case (`case-09`) moved from 5 to 3
between those two runs on identical input. The judge's reasoning under that
rubric is pure vibes — verbatim: *"a well-executed response that aligns closely
with the golden expectations"* → `SCORE: 5`, without checking a single policy.

**Judge calibration** — same judge, same 13 outputs, three rubrics:

| Rubric | Chance-corrected agreement (weighted κ) | Failure catch-rate | Opposite-ranked pairs (severe) | Verdict |
|---|---|---|---|---|
| placeholder | 0.37 | 0.33 | 5 | not usable |
| the taught rubric (v1) | 0.60 | 0.67 | 0 | **not usable** |
| v2 — one sentence longer | 0.73 | 0.83 | 0 | **usable** |

The headline: the rubric the workshop teaches beats the useless one on every
metric **and still fails its own gate**, and one added criterion fixes it. Gate
thresholds are κ ≥ 0.60 and catch-rate ≥ 0.80.

**Model acceptance** — one eval set, three models, 13 cases × 2 repeats:

| Model | Gate pass | Judge mean | P95 latency | $ / 1k orders |
|---|---|---|---|---|
| `anthropic/claude-haiku-4.5` | 92% | 4.23 ±1.14 | 5191 ms | $3.50 |
| `meta-llama/llama-3.1-8b-instruct` | 54% | 2.31 ±1.52 | 1736 ms | $0.51 |
| `openai/gpt-5-nano` | **incompatible** | n/a | — | — |

Defect profile, which is what a reviewer signs off rather than one score: Llama
hallucinated items on **8 of 26** calls, Haiku on **2 of 26**.

**Evals are not free, and the judge is the expensive half** — in one comparison
run the judging cost **$0.21** against **$0.09** for the model being judged. In
another, **68×** the candidate's cost.

**A fourth model, accepted live in 24 seconds** —
`mistralai/mistral-small-24b-instruct-2501`: clears the gate on 100% of calls,
judge mean 3.00, $0.13 per 1k orders. Structurally fine, qualitatively weaker,
27× cheaper than Haiku. Then see §9.

---

## 9. Two findings that deserve their own slide

These are the most persuasive material in the whole deck, and both were
discovered by running the suite rather than by reasoning about it.

**(a) "Can we run on this model" is an architecture question first.**
`openai/gpt-5-nano` scored nothing: all 26 calls rejected. OpenAI's strict
structured-output mode requires the JSON Schema's `required` array to list
**every** key in `properties`. This schema deliberately leaves fields optional —
which was itself a workaround for a different backend that rejects JSON-Schema
`oneOf`. So the workaround is **not portable across vendors**, and the eval
suite surfaces that in ninety seconds where a human reading outputs finds it on
day three, if at all.

**(b) Injection resistance belongs to the model, not to your prompt.** Same
prompt, same schema, same three probes. Against the incumbent, all three hold —
and the clarification-hijack probe produces no clarification at all in five
consecutive runs. Against `mistral-small-24b`, **all three break**: one inflates
the order to 16 items, and another returns **the entire system prompt** — full
menu with prices, every rule, every few-shot example, 8,618 characters — in the
field that is displayed to the customer.

The sting: that is the same model that passed the deterministic gate on 100% of
calls and scored a respectable 3.00 with the judge. **Quality screening alone
would have accepted it.** This is why adversarial probes belong on the
model-acceptance checklist and not only on a nightly schedule.

---

## 10. Do not claim any of this

Integrity matters more than punch here; every one of these will be challenged by
someone technical in the room.

- **Do not say the judge is validated against real human labels.** The
  calibration labels are *synthetic* — derived by applying the rubric's anchors
  to each fixture's known defects. They prove the measurement apparatus works
  and locate the judge's blind spots; they do **not** prove human agreement.
- **Do not present n=13 as a production-grade eval set.** It is a teaching set.
  A gate you would defend to a customer wants 50–100 labelled items, stratified.
- **Do not quote P95 as a reliable tail.** At 26 calls per model the 95th
  percentile *is* the second-slowest call. Smoke signal, not measurement.
- **Do not imply the deterministic checks and the judge see the same thing.**
  Tier 1 grades recorded fixtures; the judge grades fresh live output.
- **Do not say the human evaluator is replaced.** See §1.
- **Do not put the API key, or any key material, on a slide.**
- **Do not claim the judge can catch everything.** One case stays wrong under
  every rubric tried: an output missing a required field, unparseable and
  useless downstream, which the judge scored a perfect 5 three times running —
  because it never sees the schema and the *content* was right. That is the
  empirical argument for running the free deterministic gate first.

---

## 11. Suggested final order

1. Title (+ the new question as subtitle)
2. Why `assertEquals` dies here — with the measured 9-of-10 example (§4)
3. Today's case — domain primer + corrected JSON (§6)
4. The eval map — six layers (§5)
5. Precision equals recall — unchanged
6. **New:** the two findings (§9) — one slide, or two if there is room
7. Agenda — seven blocks (§3)
8. Setup — corrected (§7)

Moving "Today's case" ahead of the eval map is deliberate: the audience cannot
read the map without knowing the domain.

---

## 12. Where to verify each claim

| Claim | File in the repo |
|---|---|
| Domain rules, the 13 cases, worked examples | `README.md` → *The scenario*, *The 13 golden cases* |
| The real JSON shape and why it is flat | `src/schema.ts` |
| 4 pass / 9 fail, and why exactly four | `evals/01-deterministic/EXERCISE.md` |
| What the judge harness actually grades | `evals/02-judge/EXERCISE.md` → *How the harness works* |
| Metric definitions in plain language | `evals/05-calibrate/README.md` |
| Calibration numbers per rubric | `evals/05-calibrate/results/*.json` |
| Model comparison numbers, P95, defect matrix | `evals/04-compare/results/*.json`, `evals/04-compare/README.md` |
| The vendor-dialect finding | `evals/04-compare/README.md` → *The finding that surprised us* |
| The per-candidate probe finding | `evals/03-redteam/DEMO.md` |
| Tiering, triggers, thresholds | `.github/workflows/evals.yml` |
| The one-page take-away | `docs/CHEATSHEET.md` |
