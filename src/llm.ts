import { config } from './config.js';

interface LlmOptions {
  temperature?: number;
  maxTokens?: number;
}

/**
 * Calls the shared AI brain (an OpenAI-compatible chat endpoint, Groq by default).
 *
 * If no API key is configured we fall back to an offline "demo brain" so the whole
 * system still runs end-to-end with zero setup — handy for the very first demo.
 * Add LLM_API_KEY to .env to get real, high-quality output.
 */
export async function llm(system: string, user: string, opts: LlmOptions = {}): Promise<string> {
  if (!config.llm.apiKey) {
    return demoBrain(system, user);
  }

  const res = await fetch(`${config.llm.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.llm.apiKey}`,
    },
    body: JSON.stringify({
      model: config.llm.model,
      temperature: opts.temperature ?? 0.4,
      max_tokens: opts.maxTokens ?? 1400,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LLM request failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content?.trim() ?? '';
}

/**
 * A tiny offline stand-in so the app works without any API key.
 * It produces plausible, clearly-labelled placeholder text per role.
 */
function demoBrain(system: string, user: string): string {
  const s = system.toLowerCase();
  const tag = '_[demo brain — add a free LLM_API_KEY in .env for real AI output]_';

  if (s.includes('research')) {
    return [
      `${tag}`,
      '',
      'Key findings (placeholder):',
      '- Point 1 distilled from the gathered sources.',
      '- Point 2 with relevant context.',
      '- Point 3 covering a counter-argument or nuance.',
    ].join('\n');
  }
  if (s.includes('writer') || s.includes('report')) {
    return [
      `${tag}`,
      '',
      '## Summary',
      'A concise overview of the topic would appear here.',
      '',
      '## Details',
      'Structured analysis with inline citations [1][2] would appear here.',
      '',
      '## Conclusion',
      'A short, balanced wrap-up would appear here.',
    ].join('\n');
  }
  if (s.includes('fact') || s.includes('verif')) {
    return [
      `${tag}`,
      '',
      'Verification: claims appear broadly consistent with the cited sources.',
      'Confidence: 0.7',
    ].join('\n');
  }
  return `${tag}\n\nResponse to: ${user.slice(0, 160)}`;
}
