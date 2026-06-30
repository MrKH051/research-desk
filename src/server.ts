import express from 'express';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { config } from './config.js';
import { bus, emit, type BusEvent } from './bus.js';
import type { PaymentRail } from './rail/types.js';
import { SimulatedRail } from './rail/sim.js';
import { researchHandler, writerHandler, verifierHandler } from './agents/workers.js';
import { runResearch } from './agents/orchestrator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- Pick and wire up the active payment rail ----
async function buildRail(): Promise<PaymentRail> {
  let rail: PaymentRail;
  if (config.rail === 'croo') {
    const { CrooRail } = await import('./rail/croo.js'); // lazy: only load SDK in croo mode
    rail = new CrooRail();
  } else {
    rail = new SimulatedRail();
  }

  // Register the three worker agents and the capabilities they sell.
  rail.registerProvider('research', 'research.web', researchHandler);
  rail.registerProvider('writer', 'writing.report', writerHandler);
  rail.registerProvider('verifier', 'verify.factcheck', verifierHandler);

  await rail.init();
  return rail;
}

async function main() {
  const rail = await buildRail();
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Tell the UI which rail is live and whether a real AI brain is configured.
  app.get('/api/status', (_req, res) => {
    res.json({
      rail: config.rail,
      railName: rail.name,
      llm: config.llm.apiKey ? config.llm.model : 'demo brain (no LLM key set)',
    });
  });

  // Server-Sent Events: stream every bus event to connected browsers.
  app.get('/api/events', (req, res) => {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.flushHeaders();
    res.write(`data: ${JSON.stringify({ type: 'hello' })}\n\n`);

    const listener = (ev: BusEvent) => res.write(`data: ${JSON.stringify(ev)}\n\n`);
    bus.on('event', listener);
    req.on('close', () => bus.off('event', listener));
  });

  // Kick off a research run. Returns immediately; progress streams over SSE.
  app.post('/api/run', (req, res) => {
    const query = String(req.body?.query ?? '').trim();
    if (!query) {
      res.status(400).json({ error: 'Please provide a "query".' });
      return;
    }
    runResearch(rail, query).catch((err) => {
      emit({ type: 'log', level: 'error', message: String(err?.message ?? err) });
    });
    res.json({ ok: true });
  });

  app.listen(config.port, () => {
    console.log(`\n  Research Desk is running:  http://localhost:${config.port}`);
    console.log(`  Payment rail: ${rail.name}`);
    console.log(`  AI brain:     ${config.llm.apiKey ? config.llm.model : 'demo brain (set LLM_API_KEY for real AI)'}\n`);
  });
}

main().catch((err) => {
  console.error('Failed to start Research Desk:', err);
  process.exit(1);
});
