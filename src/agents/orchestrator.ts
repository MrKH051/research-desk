import { randomUUID } from 'node:crypto';
import { emit } from '../bus.js';
import type { PaymentRail } from '../rail/types.js';
import type {
  ResearchOutput,
  WriterOutput,
  VerifierOutput,
} from './workers.js';

/**
 * THE ORCHESTRATOR — the consumer-facing agent.
 *
 * Given a single user question, it autonomously hires (and pays, via escrow)
 * three specialist agents in sequence:
 *
 *   research  ->  writer  ->  verifier
 *
 * Each hire is a real economic transaction on the active payment rail.
 */

// What each step costs, in (test) USDC.
const PRICE = {
  research: 5,
  writer: 8,
  verifier: 4,
} as const;

export interface FinalReport {
  runId: string;
  query: string;
  report: string;
  confidence: number;
  verifierNotes: string;
  sources: Array<{ title: string; url: string }>;
  totalSpent: number;
}

export async function runResearch(rail: PaymentRail, query: string): Promise<FinalReport> {
  const runId = randomUUID().slice(0, 8);
  emit({ type: 'run', phase: 'start', runId, query });

  try {
    // 1) Hire the research agent.
    const r1 = await rail.hire({
      from: 'orchestrator',
      to: 'research',
      capability: 'research.web',
      input: { query },
      price: PRICE.research,
    });
    const research = r1.result as ResearchOutput;

    // 2) Hire the writer agent, feeding it the research output.
    const r2 = await rail.hire({
      from: 'orchestrator',
      to: 'writer',
      capability: 'writing.report',
      input: { query, findings: research.findings, sources: research.sources },
      price: PRICE.writer,
    });
    const written = r2.result as WriterOutput;

    // 3) Hire the verifier agent to fact-check the report.
    const r3 = await rail.hire({
      from: 'orchestrator',
      to: 'verifier',
      capability: 'verify.factcheck',
      input: { query, report: written.report, sources: research.sources },
      price: PRICE.verifier,
    });
    const verified = r3.result as VerifierOutput;

    const totalSpent = PRICE.research + PRICE.writer + PRICE.verifier;

    const final: FinalReport = {
      runId,
      query,
      report: written.report,
      confidence: verified.confidence,
      verifierNotes: verified.notes,
      sources: research.sources.map((s) => ({ title: s.title, url: s.url })),
      totalSpent,
    };

    emit({ type: 'run', phase: 'done', runId, report: final });
    return final;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emit({ type: 'run', phase: 'error', runId, message });
    throw err;
  }
}
