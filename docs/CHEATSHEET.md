# Which eval type for which problem? (take-away)

| You want to verify… | Eval type | Runs | Cost | Example from today |
|---|---|---|---|---|
| Output parses / has the right shape | Schema validation (Zod / JSON Schema) | every commit | free | `SCHEMA_INVALID` |
| Business rules the schema can't express | Deterministic checks | every commit | free | empty groups, roles, option lists |
| Output matches what was actually said | Golden labels + deterministic compare | every commit | free (labels cost human time) | `HALLUCINATED_ITEM` |
| Output is *semantically close* to a reference | Embedding similarity + threshold | every commit | ~free | (not needed today — our outputs are structured) |
| Quality that needs judgment (helpfulness, tone, reasonableness) | LLM-as-judge with rubric | PRs / nightly | cents per run | clarification quality |
| Robustness against adversarial input | Red-team probes with verdict functions | nightly / pre-release | cents per run | transcript injection |

## The six rules that keep eval suites alive

1. **Tier by cost.** Free checks on every commit; paid checks on PRs;
   adversarial suites on a schedule. A suite nobody can afford to run is a
   suite nobody runs.
2. **Thresholds, not perfection.** Non-determinism means a single flaky case
   must not redden the build — or the team learns to ignore red.
3. **Precision equals recall.** A check that cries wolf gets deleted. The
   harness in Hands-on 1 fails on false positives for exactly this reason.
4. **Golden data is versioned, hand-curated, never auto-overwritten.** The
   moment a model writes your labels, your eval measures agreement, not
   correctness.
5. **Judges get rubrics with anchors and hard caps — and get calibrated
   against human labels** before any CI gate trusts them. Re-calibrate on
   every judge-model change.
6. **Log model + prompt + eval-set versions with every score.** A score
   without its versions is a number without meaning.

## Tooling pointers

Today's harness is ~200 lines of plain TypeScript on `bun test` — the
pattern matters, not the framework. When you outgrow hand-rolled: PromptFoo
(open source, YAML-first, CI-friendly), Braintrust / LangSmith (hosted,
dashboards, score history). All of them implement exactly the tiers above.
