# Chapter 6 — evaluating MCP servers (findings, no code)

**There is deliberately no code in this chapter.** It is a written answer to a
question that came up in a live session — *"we use MCP servers, does any of this
apply?"* — and it stops at findings. Nothing here is runnable, nothing imports
from it, and no npm script points at it.

Everything below was checked against primary sources on **2026-08-12**, against
MCP specification revision **`2026-07-28`**. MCP moves quickly; re-verify before
relying on any of it. Sources at the end.

---

## The short answer

Roughly two-thirds of Tiers 1–5 transfer directly. Two things change, and they
change a lot:

1. **The unit under test moves from a single call to a whole trajectory.** Our
   harness takes one transcript, produces one structured output, and scores it.
   An MCP agent takes many steps, and the set of available tools is dynamic.
   Single-turn input/output matching does not survive that.
2. **Most of the official MCP threat model is not an LLM problem.** It is OAuth
   and application security, with hard `MUST` requirements that conventional
   tests assert deterministically. The layer our red-team tier covers — model
   behaviour under adversarial content — is not in that document at all.

So: the discipline transfers, the code does not.

---

## Split the problem before you build anything

An MCP server is **deterministic software**. Given arguments, does it return
correct data, valid schemas and sane errors? That is unit and integration
testing. Paying judge tokens to check a database query is waste.

What is non-deterministic is **the model's use of your server**: which tool it
picks, with which arguments, in which order, and whether it recovers when a call
fails. That is the part that needs evals.

Draw that line first. It decides which half of your budget each test lives in.

---

## What transfers unchanged

| From this repo | For MCP |
|---|---|
| **Golden datasets**, hand-curated, never model-generated (`fixtures/cases/`) | Task → expected tool calls and/or expected end state. Same rule: a human writes the labels, or you are measuring agreement instead of correctness. |
| **The deterministic gate runs first** (`evals/01-deterministic`) | Protocol and argument conformance: schemas valid, no hallucinated tool names, required arguments present and correctly typed. Our `UNRESOLVED_NAME` is literally "that tool does not exist"; `ROLE_VIOLATION` is "that tool was used for the wrong job". |
| **A judge for the residual** (`evals/02-judge`) | Still needed for what only judgment can decide — was the final answer faithful and useful — with rubric criteria rewritten for trajectories. |
| **Judge calibration** (`evals/05-calibrate`) | **More** necessary, not less. Scoring a multi-step trajectory is fuzzier than scoring one JSON object, so there is more room for a judge to be confidently wrong. Still the tier nobody ships. |
| **Versioned run artifacts and model comparison** (`evals/04-compare`) | Directly applicable, and arguably more valuable: "which model drives our server best?" is the same question, and the comparability guards (same judge, same rubric, refuse to crown a winner inside the noise) matter identically. |
| **Tier by cost, threshold as exit code** (`.github/workflows/evals.yml`) | Unchanged. |

## What has to be added

**A multi-turn driver.** The single biggest gap. You need a real client session,
a tool-call budget, and a transcript to score. Our harness has no loop.

**Trajectory-level finding codes.** The `expectedFindings` idea extends
naturally: `WRONG_TOOL`, `MISSING_REQUIRED_ARG`, `HALLUCINATED_TOOL`,
`UNNECESSARY_CALL`, `IGNORED_ERROR`, `LOOP`. These stay deterministic — they are
checked against the trajectory, not judged.

**Separating tool failure from model error.** This is our own
"errors are not passes" bug wearing a new costume, and it is easy to get wrong: a
flaky upstream API must not be recorded as a model using your server badly.
Precedent exists — Scale's MCP Atlas added retry handling for transient tool
errors in April 2026, and replaced a 20-turn limit with a 100 tool-call budget.

**Conformance tests against the spec's `MUST` list.** Deterministic, cheap, and
nothing to do with a model. See the security section.

**More repeats.** Every step can wobble, so trajectory variance compounds. Our
lesson that one sample cannot rank anything applies with more force here, not
less.

---

## Your tool descriptions are prompts

This is the finding with the most practical value for a team that owns a server.

A tool's `description` and schema are injected into the model's context and are
the main lever on tool-selection accuracy. Anthropic's guidance on writing tools
for agents is direct about it: describe a tool as you would to a new hire, make
implicit context explicit, name a parameter `user_id` rather than `user` — and
*"even small refinements to tool descriptions can yield dramatic improvements."*

That guidance recommends the same loop this workshop teaches — prototype, run
evals on realistic tasks, analyse, iterate — tracking accuracy, runtime, token
consumption and error rates, and using **held-out test sets to avoid
overfitting**. There is also an academic write-up of exactly this discipline
applied to an MCP server (*Agentic DraCor and the Art of Docstring
Engineering*).

The consequence for your harness: **the artefact you version and A/B is the tool
description.** The Tier 4 comparison machinery — fixed judge, fixed rubric,
recorded hashes, refuse-to-crown-inside-the-noise — works just as well for
ranking description versions as for ranking models, and that is probably the
highest-value eval a server owner can build.

---

## Security is two different jobs

### Job 1 — classic appsec and OAuth (no judge involved)

The official MCP security best practices document is almost entirely
conventional security. Its named attacks, with mitigations that are mostly hard
`MUST` requirements:

- **Confused deputy** — an MCP proxy with a static third-party client ID plus
  dynamic client registration lets an attacker skip user consent. Mitigation:
  per-client consent stored server-side, checked *before* forwarding.
- **Token passthrough** — servers **MUST NOT** accept tokens that were not
  explicitly issued for them. Audience validation is the boundary.
- **SSRF via OAuth metadata discovery** — a malicious server can point discovery
  URLs at `169.254.169.254` or `localhost`. Mitigations: HTTPS only, block
  private ranges, validate redirect targets, consider an egress proxy.
- **State handle hijacking** — MCP is **stateless in this revision, with no
  protocol-level sessions**. State handles travel as ordinary tool arguments, so
  servers **MUST** verify inbound requests and **MUST NOT** treat possession of a
  handle as authentication; bind handles server-side to the authenticated user.
- **Local server compromise** — local servers execute with client privileges;
  one-click configuration **MUST** show the exact command and get explicit
  consent.
- **OAuth authorization URL validation** — reject `javascript:`, `data:`,
  `file:`; never open URLs via a shell. XSS here can escalate to RCE through
  stdio-proxy architectures.
- **Mix-up attacks**, **localhost redirect URI impersonation**, **CIMD trust
  policies**, **scope minimization**.

Every one of those is testable without a model in the loop. They belong in an
integration and pen-test suite, and they are somebody else's job than the eval
suite — probably a different person on your team.

### Job 2 — model behaviour under adversarial content (our Tier 3)

Not covered by that document. For MCP the injection channel moves from the
user's transcript to **the tool's return value**: your server returns a document,
and the document contains "ignore previous instructions". Indirect injection.

Same discipline as `evals/03-redteam`: adversarial input in, machine-checkable
verdict out, exit code for CI. Only the channel changes. Note the finding from
that chapter transfers with unusual force here — injection resistance is a
property of the **model**, not of your prompt, so it must be re-probed for every
candidate model rather than inherited.

---

## Do not rebuild the benchmarks

For choosing a *model*, published work already exists: **MCP-Bench** (ICLR 2026,
250 tools across 28 servers, with intra-server dependency chains and cross-server
orchestration), **MCP-AgentBench** (33 servers, 188 tools, 600 queries), and
Scale's **MCP Atlas** leaderboard.

Use them to shortlist. They cannot tell you whether *your* tool descriptions are
clear, whether *your* schemas are unambiguous, or whether *your* tasks complete —
that is what your own golden set is for. Exactly the argument the third row of
our comparison table makes: a leaderboard cannot know your schema, your catalogue
or your cost per order.

## Tooling worth knowing

The **MCP Inspector** (`@modelcontextprotocol/inspector`) is the reference
developer tool, and it ships three clients behind one binary — web, TUI, and a
**scriptable CLI with machine-readable output, exit codes and documented CI
recipes**:

```bash
npx @modelcontextprotocol/inspector --cli node path/to/server.js --method tools/list
npx @modelcontextprotocol/inspector --cli https://api.example.com/mcp --transport http \
  --method tools/call --tool-name get_weather --tool-arg city=Boston --format json
```

That CLI mode is what makes the free tier genuinely free for MCP: conformance
checks with no model involved. It is developer and CI tooling, not an eval
harness — a smaller and more accurate claim than it is often given.

---

## Claims to avoid

Written down because each is an easy way to be caught by someone who has read
the spec:

- **This repo's harness does not work on MCP as-is.** It is single-turn and has
  no tool-calling loop.
- **The trajectory metric vocabulary is convention, not a standard.** Task
  completion, tool-selection accuracy, step efficiency and friends come partly
  from vendor write-ups.
- **The MCP security best practices document does not cover prompt injection.**
  It is OAuth and application security.
- **MCP has no protocol-level sessions in the current revision.** Session
  guidance moved to the older `2025-11-25` page. This changed recently.
- **We have run none of the benchmarks named here.** They are cited as existing
  work; no numbers are ours.

---

## Sources

- MCP security best practices, spec `2026-07-28` —
  <https://modelcontextprotocol.io/specification/latest/basic/security_best_practices>
- MCP Inspector — <https://modelcontextprotocol.io/legacy/tools/inspector>
- Anthropic, *Writing effective tools for agents* —
  <https://www.anthropic.com/engineering/writing-tools-for-agents>
- MCP-Bench (ICLR 2026) — <https://openreview.net/forum?id=fe8mzHwMxN>
- Scale MCP Atlas leaderboard — <https://labs.scale.com/leaderboard/mcp_atlas>
- *Agentic DraCor and the Art of Docstring Engineering* —
  <https://arxiv.org/pdf/2508.13774>
- Practitioner write-ups on trajectory metrics (vendor content, treat as
  convention) — <https://futureagi.com/blog/step-by-step-guide-mcp-evaluation-2026/>,
  <https://toloka.ai/blog/how-to-test-ai-agents-in-real-environments/>
