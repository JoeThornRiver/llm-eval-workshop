#!/usr/bin/env bun
/**
 * HANDS-ON 2 — LLM-as-judge over live model outputs.
 *
 * This harness is complete EXCEPT for the judge rubric (your exercise).
 * It re-runs a subset of the golden cases against the real matching model,
 * then asks a judge model to score each output 1–5 against the rubric.
 *
 * Costs: a few cents per full run (13 matching calls + 13 judge calls).
 * Requires OPENROUTER_API_KEY (workshop Codespaces secret).
 *
 * Run: bun run eval:judge
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { matchOrder, menu } from '../../src/matching';
import { matchingPrompt } from '../../src/prompts/matchingPrompt';

const JUDGE_MODEL = 'anthropic/claude-sonnet-5';
const PASS_THRESHOLD = 4.0; // average score required for CI to go green

// ---------------------------------------------------------------------------
// YOUR EXERCISE: write the rubric.
//
// A good judge rubric (1) names concrete criteria, not vibes, (2) forces the
// judge to reason BEFORE scoring, (3) anchors every score level with what it
// means. Fill in the criteria for this domain. Think about: faithfulness to
// the transcript, container policy, clarification quality, exact menu names.
//
// Deliberately bad starter below — run it once AS-IS and look at how useless
// the scores are. That experience is part of the exercise.
// ---------------------------------------------------------------------------
const RUBRIC = `
Rate how good this voice-order assistant output is, from 1 (bad) to 5 (great).
`;
// TODO: replace the rubric above. See solutions/02-judge-rubric.md afterwards.

interface CaseFile {
	id: string;
	transcript: string;
	expected: { allowedItems: string[]; expectClarification: boolean };
}

const casesDir = join(import.meta.dir, '../../fixtures/cases');
const cases: CaseFile[] = readdirSync(casesDir)
	.filter((f) => f.endsWith('.json'))
	.sort()
	.map((f) => JSON.parse(readFileSync(join(casesDir, f), 'utf-8')));

async function judge(transcript: string, output: unknown, expected: CaseFile['expected']) {
	const apiKey = process.env.OPENROUTER_API_KEY;
	const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model: JUDGE_MODEL,
			messages: [
				{
					role: 'user',
					content: `You are evaluating the output of a voice-order assistant.

# Rubric
${RUBRIC}

# The menu the assistant had
${menu.map((m) => `- ${m.name}`).join('\n')}

# Customer transcript
"${transcript}"

# Golden expectations (ground truth from a human labeler)
- Items that may legitimately appear: ${expected.allowedItems.join(', ')}
- A clarification question is expected: ${expected.expectClarification}

# Assistant output to evaluate
${JSON.stringify(output, null, 2)}

First reason step by step about how the output measures against the rubric.
Then answer with a final line in exactly this format:
SCORE: <1-5>`
				}
			]
		})
	});
	if (!res.ok) throw new Error(`Judge call failed: ${res.status} ${await res.text()}`);
	const data = (await res.json()) as { choices: { message: { content: string } }[] };
	const text = data.choices[0].message.content;
	const m = text.match(/SCORE:\s*([1-5])/);
	return { score: m ? Number(m[1]) : NaN, reasoning: text };
}

const results: { id: string; score: number }[] = [];
for (const c of cases) {
	process.stdout.write(`${c.id} … `);
	try {
		const output = await matchOrder(c.transcript);
		const { score } = await judge(c.transcript, output, c.expected);
		results.push({ id: c.id, score });
		console.log(`score ${score}`);
	} catch (e) {
		console.log(`ERROR: ${(e as Error).message}`);
		results.push({ id: c.id, score: NaN });
	}
}

const valid = results.filter((r) => !Number.isNaN(r.score));
const avg = valid.reduce((s, r) => s + r.score, 0) / Math.max(valid.length, 1);
console.log('\n— Results —');
for (const r of results) console.log(`${r.id}: ${Number.isNaN(r.score) ? 'error' : r.score}`);
console.log(`\nAverage: ${avg.toFixed(2)} (threshold ${PASS_THRESHOLD}, n=${valid.length})`);

// Threshold, not perfection: a single flaky case must not redden the build.
process.exit(avg >= PASS_THRESHOLD ? 0 : 1);
