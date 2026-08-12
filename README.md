# LLM Eval Workshop — testing a non-deterministic feature

A 2-hour hands-on workshop on building an automated eval suite for an LLM
feature, using a real production case: a **voice-order assistant** for an ice
cream cafe. The model matches a spoken transcript against a menu and returns
a structured order — non-deterministic output, a genuine notion of
correctness, and real failure modes.

The code is extracted and simplified from a production app (SvelteKit +
Bun); prompts, schema quirks and validation semantics are the real thing,
translated to an English-only case.

## Quick start

Open in **GitHub Codespaces** (or any devcontainer host) — everything is
pre-installed. Locally: install [Bun](https://bun.sh), then:

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

**Attendees do nothing.** The key is a Codespaces *repository secret*,
injected as `OPENROUTER_API_KEY` into every Codespace created on this repo.
It is deliberately **not committed**: a key in the repo is a key in the git
history forever, and OpenRouter is a GitHub secret-scanning partner — the
day this repo turns public, the key gets revoked out from under you, having
already been exposed.

Trainer setup, once per workshop:

```bash
gh secret set OPENROUTER_API_KEY --app codespaces --repo <owner>/llm-eval-workshop
```

No key mechanism can restrict *where* a key is used — OpenRouter
authenticates the bearer token and nothing else, with no per-key limit on
models, IPs or origins. What bounds the risk is the spend cap, so:

- give the workshop its own key, never your personal one
- put a credit limit on it (OpenRouter dashboard, or `limit` on
  `POST /api/v1/keys`) — a 20-person session runs on a couple of dollars
- delete the key when the workshop ends

Working locally instead: `cp .env.example .env` and paste your own key. Bun
loads `.env` automatically; `.gitignore` keeps it out of git.

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
- An attendee can print the shared key inside their own Codespace. That is
  unavoidable — their code has to call the API with it — so treat the credit
  limit, not secrecy, as the control, and revoke the key afterwards.
- `bun test evals/01-deterministic` (Hands-on 1) is red by design, so CI runs
  `bun test solutions` for the repo's own health. See the comment in
  `.github/workflows/evals.yml`.
