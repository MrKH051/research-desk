# Research Desk — Autonomous Multi-Agent Commerce

> An AI research assistant where **AI agents hire and pay each other on-chain** to get the job done.
> Built for the **CROO Agent Hackathon** on the [CROO Agent Protocol](https://cap.croo.network/) (Base).

You ask one question. A single **orchestrator agent** then autonomously **hires and pays**
three specialist agents a **Researcher**, a **Writer**, and a **Verifier** settling each job
through real on-chain escrow. A live dashboard shows the money moving between agents in real time.

---

## Why this is different

Most agent demos are a single bot doing a single task. CROO exists so that agents can
**transact with each other** discover, negotiate, pay, deliver, and build reputation.
Research Desk is built around exactly that idea: it's a small, working **agent-to-agent (A2A) economy**.

```
                ┌──────────────────────────┐
   you  ───────▶│      Orchestrator        │  (the buyer / consumer agent)
                └────────────┬─────────────┘
                             │  hires & pays via escrow (test-USDC)
          ┌──────────────────┼───────────────────┐
          ▼                  ▼                    ▼
   ┌────────────┐     ┌────────────┐       ┌────────────┐
   │  Research  │ ──▶ │   Writer   │  ──▶  │  Verifier  │
   │  finds     │     │  drafts    │       │  fact-     │
   │  sources   │     │  report    │       │  checks    │
   └────────────┘     └────────────┘       └────────────┘
        each step is a real order: negotiate → lock → deliver → clear
```

---

## Two interchangeable payment rails

Everything runs behind one `PaymentRail` interface, so the agents don't care how payment happens:

| Rail (`RAIL` env var) | What it does | When to use |
| --- | --- | --- |
| `sim` *(default)* | Faithful **offline** simulation of the escrow lifecycle. No accounts needed. | First run, local development, a reliable demo fallback. |
| `croo` | The **real CROO Agent Protocol on Base** — real test-USDC escrow via `@croo-network/sdk`. | The live hackathon demo. |

Switching is a one-line change in `.env`. Same code, same dashboard, real settlement.

---

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Copy the example config (optional for sim mode)
cp .env.example .env

# 3. Run it
npm start
# open http://localhost:3000
```

It runs out of the box in `sim` mode with a built-in offline "demo brain".
For real AI output, add a **free** Groq key to `.env`:

```env
LLM_API_KEY=your_free_groq_key   # from https://console.groq.com/keys
```

To run against the real CROO network, set `RAIL=croo` and fill in the CROO keys in `.env`.

---

## Tech stack

- **TypeScript + Node.js** (run directly with `tsx`, no build step)
- **Express** + **Server-Sent Events** for the real-time dashboard
- **OpenAI-compatible LLM** (Groq by default — free & fast)
- **CROO Agent Protocol SDK** (`@croo-network/sdk`) for on-chain escrow on Base
- Free, no-key **web search** (DuckDuckGo) for real sources

## Project layout

```
src/
  config.ts            # env + settings
  bus.ts               # event bus -> dashboard
  llm.ts               # the shared AI brain (with offline fallback)
  search.ts            # free web search
  rail/
    types.ts           # PaymentRail interface
    sim.ts             # offline escrow simulation
    croo.ts            # real CROO Agent Protocol integration
  agents/
    workers.ts         # research / writer / verifier agents
    orchestrator.ts    # hires & pays the workers
  server.ts            # web server + live event stream
public/                # the dashboard (HTML/CSS/JS)
```

## Author

Built by **Ali Khamis** ([@MrKH051](https://github.com/MrKH051)) for the CROO Agent Hackathon.

## License

MIT — see [LICENSE](LICENSE).
