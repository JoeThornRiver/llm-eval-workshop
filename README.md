# LLM Eval Workshop — testing a non-deterministic feature

A 2-hour hands-on workshop on building an automated eval suite for an LLM
feature, using a real production case: a **voice-order assistant** for an ice
cream cafe. The model matches a spoken transcript against a menu and returns
a structured order — non-deterministic output, a genuine notion of
correctness, and real failure modes.

The code is extracted and simplified from a production app (SvelteKit +
Bun); prompts, schema quirks and validation semantics are the real thing,
translated to an English-only case.

## The scenario — read this first

**The product.** An ice cream cafe with a queue at the counter. Instead of a
cashier tapping buttons, the customer just says what they want: *"two scoops
of chocolate in a waffle cone with cream, please."* Speech-to-text turns that
into a transcript; the transcript and the menu go to an LLM; the LLM returns a
**structured order** that the rest of the software consumes — to price it, show
it on a confirmation screen, and send it to the counter. Nobody types. The
model is the only thing standing between spoken language and a priced order.

**Why this makes a good eval case.** The same order can be said fifty ways, so
the input is open-ended and the output is non-deterministic — and yet there is
a genuinely *right* answer every time, which the customer will notice if you
get it wrong. That combination is what makes assertions useless and evals
necessary.

**The four things you need to know about the domain.** They come straight from
how an ice cream counter actually works:

| Concept | Menu examples | Rule |
|---|---|---|
| **Scoops** | Vanilla, Chocolate, Pistachio Scoop | Cannot be sold on their own. Must sit inside a container. |
| **Containers** | Waffle Cone, Cup | Free, hold one or more scoops, can carry add-ons. |
| **Standalone items** | Spaghetti Ice Cream, Stracciatella Sundae, Large Milkshake, Cappuccino, Coca-Cola | Sold on their own. Never go inside a container. |
| **Options vs add-ons** | Flavor: Vanilla…; Milk: Oat… / Cream, Strawberry Sauce | An option is single-select per dimension, only if the customer named it. An add-on is a zero-or-more stackable extra, and only from that item's own list. |

**The one rule that produces most of the interesting failures.** If the
customer names scoops but no container, the model must **not** pick one. It
keeps everything else in the order, leaves the container-less scoops out, and
sets `clarification` to ask *cone or cup?* Guessing is the failure you will see
most often today, and it is a real one — the customer gets charged for a cone
they never chose.

**What the model returns.** JSON with an `order` array of groups — each group is
either a container group (a container plus its scoops) or a standalone group
(one item) — plus an optional `clarification` string. No prices: the model
returns identity only, and the menu supplies the price. See `src/schema.ts`.

**Four worked examples** — the fastest way to internalise all of the above:

| Transcript | Correct behaviour |
|---|---|
| "Two scoops of chocolate in a waffle cone." | One container group: Waffle Cone holding 2 × Chocolate Scoop. |
| "A chocolate scoop and a fruit sundae." | Fruit Sundae goes in the order. The scoop does **not** — no container was named — and `clarification` asks cone or cup. |
| "A stracciatella sundae, please." | One standalone Stracciatella Sundae. *Not* a stracciatella scoop in a cup: "Sundae" here is part of a menu item's name, not a container. |
| "I'd like a banana split." | Empty order plus a `clarification` saying it is unavailable and offering the closest thing. There is deliberately no banana split on the menu. |

Everything in the workshop — the 13 golden cases, the judge rubric, the
adversarial probes — is about whether a model gets those four behaviours right,
and about noticing when it does not.

## The 13 golden cases — the data everything runs on

Every tier in this repo reads the same 13 files in `fixtures/cases/`. Read one
before you start; the rest then explain themselves.

### Anatomy of a case

```jsonc
{
  "id": "case-11",
  "title": "Hallucinated scoop",
  "transcript": "One scoop of vanilla in a cup.",   // what the customer said
  "recorded": {                                      // what a model ACTUALLY returned
    "order": [{ "type": "container", "id": "g1",
                "container": { "name": "Cup" },
                "scoops": [{ "id": "s1", "name": "Vanilla Scoop" },
                           { "id": "s2", "name": "Strawberry Scoop" }] }]
  },
  "expected": {                                      // ground truth, written by a human
    "allowedItems": ["Cup", "Vanilla Scoop"],
    "expectClarification": false
  },
  "expectedFindings": ["HALLUCINATED_ITEM"],         // what a correct suite must raise
  "note": "Schema-valid, names resolve, structure is fine - and the customer
           never ordered strawberry. Golden labels are the only net that
           catches this."
}
```

Nobody ordered a strawberry scoop. The output is perfectly well-formed, every
name is a real menu item, the roles are right — and it is wrong. That is the
case for evals in a single file.

**Three fields that are easy to confuse, and the difference matters:**

- **`recorded`** is *one model's output*, captured once. It is a specimen, not
  a target. This is the only model-specific thing in the file.
- **`expected`** is *human ground truth about the transcript* — which menu
  items may legitimately appear, and whether a question is owed. It is true for
  **any** model, which is why Tier 4 can reuse it to grade candidates.
- **`expectedFindings`** is *what a correct check suite must report about that
  particular recording*. For a live model run the expectation is different and
  simpler: **zero findings**.

### All 13, and what each one is for

Ten cases carry a planted defect; three are clean, because a suite that cries
wolf on healthy output is as broken as one that misses a bug.

| Case | Transcript | What the recording does | Must raise |
|---|---|---|---|
| 01 | "Two scoops of chocolate and one strawberry in a waffle cone" | correct | — |
| 02 | "A cappuccino, please." | group is missing its `type` field | `SCHEMA_INVALID` |
| 03 | "A small vanilla milkshake." | standalone group also carries a container | `TYPE_FIELD_MISMATCH`, `HALLUCINATED_ITEM` |
| 04 | "A scoop of vanilla in a waffle cone — no wait, cancel that, just an espresso." | cancels the scoop, keeps the now-empty cone | `EMPTY_CONTAINER_GROUP` |
| 05 | "A scoop of choc in a cup." | emits `"Choco Scoop"`, which is not a menu name | `UNRESOLVED_NAME` |
| 06 | "A spaghetti ice cream, please." | puts a standalone item inside a Cup | `ROLE_VIOLATION` |
| 07 | "Two scoops of pistachio, please." | invents a Cup instead of asking | `HALLUCINATED_ITEM`, `MISSING_CLARIFICATION` |
| 08 | "A banana split and a small coke." | drops the off-menu item silently | `MISSING_CLARIFICATION` |
| 09 | "A small hazelnut milkshake." | asks the right question **and** sets an invalid option | `INVALID_OPTION_OR_ADDON` |
| 10 | "Two lemon scoops in a cup with caramel sauce." | accepts an add-on the Cup does not offer, says nothing | `INVALID_OPTION_OR_ADDON`, `MISSING_CLARIFICATION` |
| 11 | "One scoop of vanilla in a cup." | adds a strawberry scoop nobody ordered | `HALLUCINATED_ITEM` |
| 12 | "A chocolate scoop and a fruit sundae." | correct: keeps the sundae, holds the scoop, asks | — |
| 13 | "A stracciatella sundae, please." | correct: one menu item, not a scoop in a cup | — |

Note the shape of that list. Cases 02–06 are catchable by structure and
reference data alone. Cases 07, 08 and 11 are **not** — no amount of schema
checking knows what the customer said, which is what the golden labels are for.
Case 09 is deliberately half-right, and case 04's defect is one your runtime
validator would silently repair.

Each file's `note` explains why the case exists; read it when a check surprises
you. And do not "fix" the fixtures — they are recordings of real failure modes,
hand-labelled, and they are the measuring instrument.

## Quick start

Open in **GitHub Codespaces** — the repo is public, so
[codespaces.new/JoeThornRiver/llm-eval-workshop](https://codespaces.new/JoeThornRiver/llm-eval-workshop)
works for anyone with a GitHub account, and everything is pre-installed
(Codespaces compute comes out of your own monthly free quota, not the repo
owner's). Locally: install [Bun](https://bun.sh), then:

```bash
bun install
bun test evals/01-deterministic   # 4 pass, 9 fail — your Hands-on 1 start
bun test solutions               # 13 pass — the reference implementation
```

Pass the path explicitly. A bare `bun test` is Bun's own runner and ignores the
`package.json` script, so it collects *every* test file in the repo — the
starter, the solutions and the calibration stats — and reports 37 pass / 9
fail, which tells you nothing about where you are. (`bun run test` also works:
it runs the scoped script.)

Hands-on 1 is fully offline: no API key, no cost. Hands-on 2 and the
red-team demo call the live model via OpenRouter — see the next section.

## The API key

Hands-on 1 needs no key at all. For the live tiers, everyone needs one — and
because **this repository is public**, the key cannot travel with it.

The key is deliberately **not committed**, and on a public repo that is not a
style preference: a committed key is public the instant it is pushed, is in the
git history forever, and OpenRouter is a GitHub secret-scanning partner, so it
gets detected and revoked out from under you — after it has been exposed.

**In a workshop**, the trainer shares the key in the room (chat message,
slide) and each attendee does:

```bash
cp .env.example .env     # then paste the key into it
```

Bun loads `.env` automatically and `.gitignore` already covers it, so it
cannot be committed by accident. This works identically in a Codespace and on
a local machine.

A Codespaces *repository secret* is the smoother route, but only for people
with repository access — GitHub does not hand repository secrets to arbitrary
users of a public repo, which is exactly what you want. Worth setting for
yourself and for CI:

```bash
gh secret set OPENROUTER_API_KEY --app codespaces --repo <owner>/llm-eval-workshop
gh secret set OPENROUTER_API_KEY --repo <owner>/llm-eval-workshop   # Actions
```

No key mechanism can restrict *where* a key is used — OpenRouter
authenticates the bearer token and nothing else, with no per-key limit on
models, IPs or origins. What bounds the risk is the spend cap, so:

- give the workshop its own key, never your personal one
- put a credit limit on it (OpenRouter dashboard, or `limit` on
  `POST /api/v1/keys`) — a 20-person session runs on a couple of dollars
- delete the key when the workshop ends

Reading this outside a workshop? Get your own key at
[openrouter.ai/keys](https://openrouter.ai/keys), put a spending limit on it,
and use the same `cp .env.example .env` step above. A full judge run plus a
red-team run costs a few cents.

## Workshop flow (120 min)

The session answers **one** question — *"can we run your software on this new
model?"* — and every block before 1:35 exists to earn the right to answer it.
Six layers go in; one defensible verdict comes out.

| Time | Block | Contributes to the verdict | Where |
|---|---|---|---|
| 0:00 | The question that costs you a day | why a human reads outputs today | live demo |
| 0:15 | **Hands-on 1: the gate you write once** (offline) | the free, model-independent half | `evals/01-deterministic/EXERCISE.md` |
| 0:45 | **Hands-on 2: the judge for the residual** (live) | the half that needs taste | `evals/02-judge/EXERCISE.md` |
| 1:10 | Trust the judge, or don't ship it | proof the judge's number means anything | `evals/05-calibrate/README.md` |
| 1:25 | A new model is a new attack surface | injection resistance, per candidate | `evals/03-redteam/DEMO.md` |
| 1:35 | **The verdict: one eval set, many models** | the answer, in 24 seconds, in writing | `evals/04-compare/README.md` |
| 1:55 | Wrap-up | what they change on Monday | `docs/CHEATSHEET.md` |

CI wiring (`.github/workflows/evals.yml`) folds into the 1:35 block as "how
this runs unattended". An earlier revision of this workshop ended at the CI
block and treated Tiers 4–5 as optional extras; the arc above is stronger,
because model acceptance is the problem the audience actually owns.

## Repository map

```
src/
  types.ts               domain types
  schema.ts              the Zod schema — READ THE COMMENTS (flat-object trap)
  prompts/matchingPrompt.ts  the real prompt, English adaptation
  matching.ts            validateOrder + live model call (plain fetch, no SDK)
fixtures/
  menu.json              workshop menu (deliberately has no Banana Split)
  cases/*.json           13 golden cases: transcript + recorded output +
                         expected findings (planted, labeled defects)
evals/
  01-deterministic/      Tier 1 — offline checks (starter with TODOs)
  02-judge/              Tier 2 — judge harness (rubric is the exercise)
  03-redteam/            adversarial probes with verdict functions
  04-compare/            Tier 4 — one eval set vs many models (post-workshop)
  05-calibrate/          Tier 5 — is the judge worth trusting? (post-workshop)
solutions/               full solutions — no peeking before you're green
  checks.ts              the Tier 1 checks as a module (Tier 4 imports these)
  rubric.ts              the calibrated judge rubric (Tier 4 imports this)
docs/CHEATSHEET.md       the one-page take-away
.devcontainer/           Codespaces environment (Bun, no key baked in)
.github/workflows/evals.yml  the CI tiering, itself a teaching artifact
```

## The destination: model acceptance

`evals/04-compare/` is where the 120 minutes land: **"our customer wants to
use model X — does our software still work?"** It runs the same golden set
against any OpenRouter model, applies the Tier 1 checks to the live output as
a hard gate, scores the residual with the calibrated judge, and stores a
versioned artifact per run so the results can be compared without lying to
you.

```bash
bun run eval:model -- --model anthropic/claude-haiku-4.5
bun run eval:model -- --model meta-llama/llama-3.1-8b-instruct
bun run eval:compare
```

Recorded runs for three models ship in `evals/04-compare/results/`, so the
comparison works before you spend a cent. Read
`evals/04-compare/README.md` — including why one of those three models cannot
run this eval set at all, for reasons that have nothing to do with quality.

`evals/05-calibrate/` is the step that has to come FIRST in practice, even
though it is numbered later: it measures whether the judge actually
distinguishes good output from bad, against human labels, and refuses to
certify it otherwise.

```bash
bun run eval:calibrate -- --rubric placeholder    # measures nothing: κ 0.37
bun run eval:calibrate                            # taught rubric: κ 0.60, FAILS
bun run eval:calibrate -- --rubric v2             # one sentence later: PASSES
```

Run in that order, those three commands are the whole argument: a rubric that
measures nothing, the taught rubric that beats it on every metric and still
fails its gate, and the rubric that failure produced — differing from the
previous one by a single added criterion. Roughly four minutes, under a euro.
`evals/05-calibrate/README.md` has the numbers and the one disagreement that
survives every version.

A candidate also has to survive the adversarial probes, because injection
resistance belongs to the model and cannot be inherited from the incumbent:

```bash
bun run eval:redteam                                              # the incumbent
bun run eval:redteam -- --model mistralai/mistral-small-24b-instruct-2501
```

That second model clears the deterministic gate on 100% of calls and scores a
respectable 3.00 with the judge — and loses **all three** probes, returning the
entire system prompt (menu, rules, few-shot examples) to the customer in the
`clarification` field. Quality screening alone would have accepted it.

## Design notes for trainers

- The fixture defects are **recordings of realistic failure modes**, each
  labeled with the finding codes a correct suite must raise. The harness
  fails on false positives too — precision is part of the lesson.
- `src/schema.ts` preserves the production workaround (flat object instead
  of a discriminated union because a backend rejects JSON-Schema `oneOf`).
  That gap between schema and domain is the hook for Hands-on 1.
- The judge harness ships with a deliberately bad rubric; running it as-is
  and watching useless scores is step 1 of the exercise.
- Costs: Hands-on 1 zero; a full judge run and a red-team run are each a
  few cents. A spending-limited key comfortably covers a 20-person session.
- An attendee can print the shared key wherever they run the code. That is
  unavoidable — their code has to call the API with it — so treat the credit
  limit, not secrecy, as the control, and revoke the key afterwards. On a
  public repo this is the whole reason the key is distributed in the room
  rather than stored in the repository.
- Run artifacts under `evals/*/results/` are committed as demo data, and they
  embed provider error payloads. `run-model.ts` strips account identifiers and
  caps their length before writing, because a public repo publishes whatever
  those payloads happened to contain.
- `bun test evals/01-deterministic` (Hands-on 1) is red by design, so CI runs
  `bun test solutions` for the repo's own health. See the comment in
  `.github/workflows/evals.yml`.
