import { randomUUID } from 'node:crypto';
import { emit, type AgentName } from '../bus.js';
import type { HireRequest, HireResult, PaymentRail, ProviderHandler } from './types.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A faithful, offline simulation of the CROO escrow lifecycle.
 *
 * It mirrors the real phases — negotiate -> accept -> lock -> deliver -> clear —
 * and actually moves balances between agents, so the dashboard shows the same
 * "agents paying each other" story whether or not we're connected to Base.
 */
export class SimulatedRail implements PaymentRail {
  readonly name = 'Simulated escrow (offline)';

  private handlers = new Map<string, ProviderHandler>();
  private balances = new Map<AgentName, number>();

  async init(): Promise<void> {
    // The orchestrator starts with a wallet of test USDC; workers start empty.
    this.balances.set('orchestrator', 100);
    this.balances.set('research', 0);
    this.balances.set('writer', 0);
    this.balances.set('verifier', 0);
    for (const [agent, balance] of this.balances) {
      emit({ type: 'balance', agent, balance });
    }
  }

  registerProvider(agent: AgentName, capability: string, handler: ProviderHandler): void {
    this.handlers.set(`${agent}:${capability}`, handler);
  }

  balanceOf(agent: AgentName): number {
    return this.balances.get(agent) ?? 0;
  }

  async hire(req: HireRequest): Promise<HireResult> {
    const { from, to, capability, input, price } = req;
    const orderId = 'sim_' + randomUUID().slice(0, 8);

    const phase = (p: string, extra: Record<string, unknown> = {}) =>
      emit({ type: 'order', orderId, from, to, capability, amount: price, phase: p, ...extra });

    // 1) Negotiate — the orchestrator proposes terms to the provider.
    phase('negotiate');
    await sleep(450);

    // 2) Accept — the provider agrees to the terms.
    phase('accept');
    await sleep(350);

    // 3) Lock — funds leave the payer and sit in escrow.
    const fromBalance = this.balanceOf(from);
    if (fromBalance < price) {
      throw new Error(`${from} has insufficient balance (${fromBalance} < ${price}).`);
    }
    this.balances.set(from, fromBalance - price);
    emit({ type: 'balance', agent: from, balance: this.balanceOf(from) });
    phase('lock');
    await sleep(450);

    // 4) Work — the provider actually performs the task.
    const handler = this.handlers.get(`${to}:${capability}`);
    if (!handler) {
      throw new Error(`No provider registered for "${to}:${capability}".`);
    }
    emit({ type: 'agent', agent: to, state: 'working' });
    const result = await handler(input);
    emit({ type: 'agent', agent: to, state: 'idle' });

    // 5) Deliver — the provider submits the result.
    phase('deliver');
    await sleep(350);

    // 6) Clear — escrow releases the funds to the provider.
    this.balances.set(to, this.balanceOf(to) + price);
    emit({ type: 'balance', agent: to, balance: this.balanceOf(to) });
    phase('clear');
    await sleep(250);

    return { orderId, result };
  }

  async shutdown(): Promise<void> {
    /* nothing to clean up for the simulated rail */
  }
}
