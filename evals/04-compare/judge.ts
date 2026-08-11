/**
 * The judge, as a reusable function taking its model and rubric as inputs.
 *
 * Yes, this duplicates the judge call in `evals/02-judge/run-judge.ts`. That
 * is deliberate: the Hands-on 2 file keeps the whole mechanism inline so
 * attendees can read schema-in/score-out without following an import, and
 * that file must stay readable at 10:00 on a Tuesday. This one is the
 * parameterized version Tier 4 needs. If you change the judge PROMPT, change
 * it in both — or the exercise stops matching what the harness does.
 */
import type { GoldenExpectation } from '../../solutions/checks';
import { menu } from '../../src/matching';

export interface JudgeVerdict {
	score: number | null;
	reasoning: string;
	costUsd: number;
	latencyMs: number;
}

export async function judgeOutput(opts: {
	transcript: string;
	output: unknown;
	expected: GoldenExpectation;
	rubric: string;
	model: string;
	/** Pinned to 0 by callers: a judge that wobbles cannot rank models. */
	temperature?: number;
}): Promise<JudgeVerdict> {
	const apiKey = process.env.OPENROUTER_API_KEY;
	if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set (see .env.example)');

	const startedAt = performance.now();
	const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model: opts.model,
			...(opts.temperature === undefined ? {} : { temperature: opts.temperature }),
			messages: [
				{
					role: 'user',
					content: `You are evaluating the output of a voice-order assistant.

# Rubric
${opts.rubric}

# The menu the assistant had
${menu.map((m) => `- ${m.name}`).join('\n')}

# Customer transcript
"${opts.transcript}"

# Golden expectations (ground truth from a human labeler)
- Items that may legitimately appear: ${opts.expected.allowedItems.join(', ')}
- A clarification question is expected: ${opts.expected.expectClarification}

# Assistant output to evaluate
${JSON.stringify(opts.output, null, 2)}

First reason step by step about how the output measures against the rubric.
Then answer with a final line in exactly this format:
SCORE: <1-5>`
				}
			]
		})
	});

	if (!res.ok) throw new Error(`Judge call failed: ${res.status} ${await res.text()}`);
	const data = (await res.json()) as {
		choices: { message: { content: string } }[];
		usage?: { cost?: number };
	};
	const text = data.choices[0].message.content;
	const m = text.match(/SCORE:\s*([1-5])/);
	return {
		score: m ? Number(m[1]) : null,
		reasoning: text,
		costUsd: data.usage?.cost ?? 0,
		latencyMs: performance.now() - startedAt
	};
}
