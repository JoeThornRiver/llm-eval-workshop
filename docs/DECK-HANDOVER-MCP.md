# Handover — add 1–3 MCP slides to the impulse deck

**Task for the assistant reading this:** add between one and three slides to
`HYPE_LLM_Eval_Workshop_Impulse_1.pptx` answering an audience question that came
up live: *"we use MCP servers — does any of this apply?"*

This is a companion to `DECK-HANDOVER.md`, which covers updating the existing
slides. Same rules apply:

- **Do not restyle anything.** Reuse existing layouts, fonts, colours and master.
- Build **slide 1 first**. It stands alone. Slides 2 and 3 are additive and can
  be dropped without leaving a hole.
- **Terse on the slide, detail in the speaker notes.** The text marked
  `ON SLIDE` is what the audience reads; the text marked `NOTES` goes in the
  speaker-notes pane, not on the slide.

**Placement:** as an appendix, *after* the setup slide at the end. The main arc
of the deck is the workshop, and MCP is an extension — putting it mid-deck
dilutes the argument. If the presenter wants it earlier, immediately after "The
eval map" is the second-best spot, because it reads as "same map, different
unit".

**Provenance:** every claim below was checked against primary sources on
**2026-08-12** against MCP spec revision **`2026-07-28`**. MCP moves fast; date
the slide footer or re-verify before reusing this deck in a few months. Sources
are listed at the end and should appear as a small source line on slide 3 (or on
slide 1 if it is the only one built).

---

## The headline, in one sentence

Roughly two-thirds of the eval suite transfers directly, but **the unit under
test changes from a single call to a whole trajectory** — and **most of the
official MCP threat model is not an LLM problem at all.**

---

## SLIDE 1 (build this one) — "Does this apply to MCP servers?"

Suggested title: **Same discipline, different unit**
Suggested kicker: *"We use MCP servers — does any of this apply?"*

### ON SLIDE — a three-column table

| Transfers unchanged | Changes shape | Must be added |
|---|---|---|
| Golden datasets, hand-curated | Deterministic gate → protocol & argument conformance | A multi-turn driver: our harness is single-turn |
| Deterministic gate runs first | Judge rubric → trajectory-aware criteria | Trajectory findings: wrong tool, missing arg, unnecessary call, ignored error, loop |
| Judge for the residual | Red-team input → tool **results**, not user text | Separating *tool failure* from *model error* |
| **Judge calibration** | Model comparison → also compares tool descriptions | Protocol conformance tests against the spec's `MUST` list |
| Tier by cost, threshold in CI | | |

### NOTES

- The single most important row is *"a multi-turn driver"*: our 13-case harness
  takes one transcript and scores one output. An MCP agent takes many steps and
  the tool list is dynamic, so single-turn input/output matching breaks.
- Judge calibration becomes **more** necessary, not less: scoring a multi-step
  trajectory is fuzzier than scoring one JSON object, so there is more room for
  a judge to be confidently wrong. It is still the tier nobody ships.
- If asked "can we reuse the 13 fixtures?" — no, but the *shape* transfers: task
  in, expected tool calls and end state out, labelled by a human, versioned,
  never model-generated.

---

## SLIDE 2 (if there is room) — "What's actually different"

Suggested title: **Three things that change with MCP**

### ON SLIDE — three blocks

**1 · The server is deterministic software**
Most of "evaluating an MCP server" is ordinary testing: correct data, valid
schemas, sane errors. Official tooling exists — the MCP Inspector ships a
scriptable CLI with machine-readable output and exit codes, made for CI.
*Don't pay judge tokens to test a database query.*

**2 · The unit is a trajectory, not a call**
What is non-deterministic is the model's *use* of your server: tool choice,
arguments, sequencing, recovery. Metrics: task completion, tool-selection
accuracy (precision **and** recall), step efficiency, unnecessary calls, error
recovery.
*Every step can wobble — so repeats matter more here, not less.*

**3 · Your tool description IS the prompt**
It is injected into the model's context and is the main lever on tool-selection
accuracy. Anthropic's guidance: describe a tool as you would to a new hire, name
it `user_id` not `user` — *"even small refinements to tool descriptions can yield
dramatic improvements."*
*So the artefact you version and A/B is the description.*

### NOTES

- Block 3 is the practical takeaway for a team that owns a server: the same
  comparison harness that ranks models can rank **tool-description versions**,
  with the same statistical guards. That is probably the highest-value eval they
  can build.
- Anthropic's tools guidance recommends exactly our loop — prototype, run evals
  on realistic tasks, analyse, iterate — tracking accuracy, runtime, token
  consumption and error rates, with **held-out test sets to avoid overfitting**.
- The Inspector CLI point matters because it makes the free tier genuinely free:
  `--cli --method tools/list` and `--method tools/call` give you conformance
  checks with exit codes, no model in the loop.

---

## SLIDE 3 (if there is room) — "MCP security is two different jobs"

Suggested title: **Two security jobs, two teams**

### ON SLIDE — two columns

**Job 1 — classic appsec and OAuth** *(not an LLM problem)*
The official MCP security best practices are almost entirely conventional
security, with hard `MUST` requirements you can assert deterministically:
confused deputy · token passthrough (`MUST NOT` accept tokens not issued for
your server) · SSRF via OAuth metadata discovery · `javascript:` authorization
URLs · stdio-proxy privilege escalation · state handle hijacking · scope
minimization.
→ *Pen-test and integration-test work. No judge involved.*

**Job 2 — model behaviour under adversarial content** *(what our red-team tier does)*
Not covered by that document. For MCP the injection vector moves from the user's
transcript to **the tool's return value** — a document your server returns
containing "ignore previous instructions".
→ *Same probe discipline, machine-checkable verdict, new input channel.*

**And don't rebuild the benchmarks:** MCP-Bench (ICLR 2026), MCP-AgentBench,
Scale's MCP Atlas leaderboard exist for choosing a *model*. They cannot tell you
whether *your* descriptions are clear or *your* tasks complete. That is your own
golden set.

### NOTES

- Worth saying out loud: MCP is **stateless in the current spec — no
  protocol-level sessions.** State handles now arrive as ordinary tool arguments
  and must be bound server-side to the authenticated user, which makes state
  handle hijacking a concrete test case. (Session-hijacking guidance moved to the
  older `2025-11-25` revision of the page.)
- The tool-failure-vs-model-error point has a real precedent: Scale's MCP Atlas
  added retry handling for transient tool errors in April 2026 and replaced a
  20-turn limit with a 100 tool-call budget. That is our own
  "errors are not passes" fix appearing independently in someone else's harness —
  a flaky API must not read as a model using your server wrong.

---

## Do not claim any of this

- **Do not say our harness works on MCP as-is.** It is single-turn and has no
  tool-calling loop. The discipline transfers; the code does not.
- **Do not present the trajectory metric list as a standard.** Task completion,
  tool-selection accuracy and friends are practitioner convention drawn partly
  from vendor blogs, not a specification.
- **Do not imply the MCP security best practices document covers prompt
  injection.** It does not — it is OAuth and application security. Saying
  otherwise will be caught by anyone who has read it.
- **Do not say MCP has sessions.** The current revision is explicitly stateless
  with no protocol-level sessions. This changed; get it right or don't mention it.
- **Do not quote benchmark scores.** We have not run MCP-Bench, MCP-AgentBench or
  MCP Atlas. Name them as existing work, cite no numbers.
- **Do not describe the Inspector as an eval harness.** It is developer tooling
  for inspecting and calling servers — its CLI mode is scriptable and suits CI
  conformance checks, which is a different and smaller claim.

---

## Sources

- MCP security best practices, spec `2026-07-28` —
  <https://modelcontextprotocol.io/specification/latest/basic/security_best_practices>
- MCP Inspector (web / CLI / TUI, CI recipes) —
  <https://modelcontextprotocol.io/legacy/tools/inspector>
- Anthropic, *Writing effective tools for agents* —
  <https://www.anthropic.com/engineering/writing-tools-for-agents>
- MCP-Bench (ICLR 2026) — <https://openreview.net/forum?id=fe8mzHwMxN>
- Scale MCP Atlas leaderboard — <https://labs.scale.com/leaderboard/mcp_atlas>
- *Agentic DraCor and the Art of Docstring Engineering* —
  <https://arxiv.org/pdf/2508.13774>
- Practitioner write-ups on trajectory metrics (vendor content, treat as
  convention): <https://futureagi.com/blog/step-by-step-guide-mcp-evaluation-2026/>,
  <https://toloka.ai/blog/how-to-test-ai-agents-in-real-environments/>
