import process from 'node:process';

// Load variables from a local ".env" file if one exists.
// (Node 20.12+/24 ships this built in — no extra library needed.)
try {
  process.loadEnvFile?.();
} catch {
  // No .env file present — that's fine, we fall back to safe defaults below.
}

export type RailName = 'sim' | 'croo';

export const config = {
  port: Number(process.env.PORT ?? 3000),

  // Which payment rail to use:
  //   "sim"  -> simulated escrow, runs fully offline (great for demos / first run)
  //   "croo" -> real CROO Agent Protocol on Base
  rail: (process.env.RAIL ?? 'sim') as RailName,

  // The shared "AI brain" used by every worker agent.
  // OpenAI-compatible endpoint (Groq by default — free & fast).
  llm: {
    baseUrl: process.env.LLM_BASE_URL ?? 'https://api.groq.com/openai/v1',
    model: process.env.LLM_MODEL ?? 'llama-3.3-70b-versatile',
    apiKey: process.env.LLM_API_KEY ?? '',
  },

  // Real CROO settings (only used when rail === "croo").
  croo: {
    apiUrl: process.env.CROO_API_URL ?? 'https://api.croo.network',
    wsUrl: process.env.CROO_WS_URL ?? 'wss://api.croo.network/ws',
    rpcUrl: process.env.CROO_RPC_URL || undefined,
    // The amount of (test) USDC deposited into the orchestrator's wallet —
    // used only to render spend on the dashboard.
    startBalance: Number(process.env.CROO_START_BALANCE ?? 50),

    // One SDK key per agent (each agent is a separate profile in the CROO dashboard).
    orchestratorKey: process.env.CROO_ORCHESTRATOR_SDK_KEY ?? '',
    workerKeys: {
      research: process.env.CROO_RESEARCH_SDK_KEY ?? '',
      writer: process.env.CROO_WRITER_SDK_KEY ?? '',
      verifier: process.env.CROO_VERIFIER_SDK_KEY ?? '',
    },

    // The orchestrator hires a worker by referencing that worker's SERVICE id.
    serviceIds: {
      research: process.env.CROO_RESEARCH_SERVICE_ID ?? '',
      writer: process.env.CROO_WRITER_SERVICE_ID ?? '',
      verifier: process.env.CROO_VERIFIER_SERVICE_ID ?? '',
    } as Record<'research' | 'writer' | 'verifier', string>,
  },
};
