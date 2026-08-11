# Red-team demo — injection via the transcript (trainer-led, 20 min)

## The point

The transcript is user-controlled text interpolated into the prompt.
Whatever a customer says to the microphone lands inside your prompt
template — the voice channel IS an injection surface.

## Script

1. Show `run-redteam.ts`: three probes, each with a machine-checkable
   verdict function. Emphasize: a red-team test is not "try something scary
   and eyeball it" — it is transcript in, VERDICT out, exit code for CI.
2. Run live: `bun run eval:redteam`.
3. For every probe that held, trace WHY it held. This system has layered
   defenses, and the discussion writes itself:
   - the schema has no price field → "everything is free" has nowhere to go
   - structured output constrains the shape → no prose channel to hijack
     except `clarification`
   - `validateOrder` drops non-menu items → even a fooled model cannot
     order what does not exist
4. Break one layer on stage: comment out the schema constraint in
   `matchOrder` (send the prompt without `response_format`) and re-run.
   Watch what the probes do to free-text output.

## Takeaways

- Defense in depth: the eval proves the FIRST layer holds; the architecture
  ensures a breach of one layer is not a breach of the system.
- Verdict functions are deterministic checks over adversarial inputs — Tier
  1 and the red-team suite are the same discipline pointed at different
  inputs.
- Schedule: this suite runs nightly/weekly and before releases, not on
  every commit (cost + it exercises the live model).
