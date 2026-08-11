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
bun test        # your Hands-on 1 starting position: 4 pass, 9 fail
```

Hands-on 1 is fully offline: no API key, no cost. Hands-on 2 and the
red-team demo call the live model via OpenRouter (`.env.example`; in the
workshop the key is a Codespaces secret).

## Workshop flow (120 min)

| Time | Block | Where |
|---|---|---|
| 0:00 | Impulse: why your assertions fail on LLMs | slides / live demo |
| 0:20 | **Hands-on 1: deterministic checks** (offline) | `evals/01-deterministic/EXERCISE.md` |
| 0:50 | **Hands-on 2: LLM-as-judge** (live) | `evals/02-judge/EXERCISE.md` |
| 1:20 | Red-team demo: transcript injection | `evals/03-redteam/DEMO.md` |
| 1:40 | CI wiring: tiers, triggers, thresholds | `.github/workflows/evals.yml` |
| 1:55 | Wrap-up | `docs/CHEATSHEET.md` |

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
solutions/               full solutions — no peeking before you're green
docs/CHEATSHEET.md       the one-page take-away
```

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
