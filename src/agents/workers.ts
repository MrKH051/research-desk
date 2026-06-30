import { emit } from '../bus.js';
import { llm } from '../llm.js';
import { webSearch, type SearchResult } from '../search.js';
import type { ProviderHandler } from '../rail/types.js';

// ---- Shared payload shapes passed between agents ----

export interface ResearchInput {
  query: string;
}
export interface ResearchOutput {
  findings: string;
  sources: SearchResult[];
}

export interface WriterInput {
  query: string;
  findings: string;
  sources: SearchResult[];
}
export interface WriterOutput {
  report: string;
}

export interface VerifierInput {
  query: string;
  report: string;
  sources: SearchResult[];
}
export interface VerifierOutput {
  confidence: number;
  notes: string;
}

/**
 * RESEARCH AGENT — gathers real sources from the web and distils key findings.
 */
export const researchHandler: ProviderHandler = async (raw) => {
  const { query } = raw as ResearchInput;

  const sources = await webSearch(query, 6);
  const sourceBlock = sources.length
    ? sources.map((s, i) => `[${i + 1}] ${s.title}\n${s.url}\n${s.snippet}`).join('\n\n')
    : '(no live web results were available; rely on your own knowledge and say so)';

  const findings = await llm(
    'You are a meticulous research agent. Extract the most important, factual findings about the topic. Be concise and neutral. When you use a source, cite it like [1], [2].',
    `Topic: ${query}\n\nSources:\n${sourceBlock}\n\nWrite 4-7 bullet-point findings with citations.`,
    { temperature: 0.3, maxTokens: 900 },
  );

  emit({ type: 'result', agent: 'research', content: findings });
  return { findings, sources } satisfies ResearchOutput;
};

/**
 * WRITER AGENT — turns raw findings into a clean, structured report.
 */
export const writerHandler: ProviderHandler = async (raw) => {
  const { query, findings, sources } = raw as WriterInput;
  const sourceList = sources.map((s, i) => `[${i + 1}] ${s.title} — ${s.url}`).join('\n');

  const report = await llm(
    'You are a professional report writer. Produce a well-structured Markdown report with a short summary, a details section, and a conclusion. Keep the inline [n] citations from the findings. Do not invent facts.',
    `Question: ${query}\n\nFindings:\n${findings}\n\nAvailable sources:\n${sourceList}\n\nWrite the report now.`,
    { temperature: 0.5, maxTokens: 1400 },
  );

  emit({ type: 'result', agent: 'writer', content: report });
  return { report } satisfies WriterOutput;
};

/**
 * VERIFIER AGENT — fact-checks the report against the sources and scores confidence.
 */
export const verifierHandler: ProviderHandler = async (raw) => {
  const { query, report, sources } = raw as VerifierInput;
  const sourceList = sources.map((s, i) => `[${i + 1}] ${s.title} — ${s.url}`).join('\n');

  const review = await llm(
    'You are a strict fact-checking agent. Judge whether the report is well-supported by the listed sources. Point out any unsupported or risky claims. End with a single line "Confidence: X" where X is between 0 and 1.',
    `Question: ${query}\n\nSources:\n${sourceList}\n\nReport to check:\n${report}`,
    { temperature: 0.2, maxTokens: 700 },
  );

  // Pull the confidence score out of the model's reply (default to 0.6).
  const match = review.match(/confidence:\s*([01](?:\.\d+)?)/i);
  const confidence = match ? Number(match[1]) : 0.6;

  emit({ type: 'result', agent: 'verifier', content: review });
  return { confidence, notes: review } satisfies VerifierOutput;
};
