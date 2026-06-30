import type { AgentName } from '../bus.js';

/** A request from one agent to hire (and pay) another agent for a capability. */
export interface HireRequest {
  from: AgentName; // who pays (the orchestrator)
  to: AgentName; // which provider does the work
  capability: string; // e.g. "research.web"
  input: unknown; // the task payload
  price: number; // amount of (test) USDC held in escrow
}

export interface HireResult {
  orderId: string;
  result: unknown;
}

/** A provider's work function: given an input, produce a deliverable. */
export type ProviderHandler = (input: unknown) => Promise<unknown>;

/**
 * A payment rail moves money between agents and runs the order lifecycle
 * (negotiate -> lock escrow -> deliver -> clear).
 *
 * We have two implementations behind this one interface:
 *   - SimulatedRail: fully offline, for demos and first runs
 *   - CrooRail:      the real CROO Agent Protocol on Base
 *
 * The orchestrator and agents don't care which one is active — that's the
 * whole point of the abstraction.
 */
export interface PaymentRail {
  readonly name: string;
  init(): Promise<void>;
  registerProvider(agent: AgentName, capability: string, handler: ProviderHandler): void;
  balanceOf(agent: AgentName): number;
  hire(req: HireRequest): Promise<HireResult>;
  shutdown(): Promise<void>;

  /**
   * Optional: let the orchestrator itself act as a SELLER. When an external buyer
   * pays for the orchestrator's own service, `handler(input)` is run to produce the
   * deliverable (it internally hires the worker agents). Only the live CROO rail
   * uses this; the simulated rail can leave it unimplemented.
   */
  setSelfService?(handler: ProviderHandler): void;
}
