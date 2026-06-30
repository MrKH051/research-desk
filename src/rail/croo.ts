import { config } from '../config.js';
import { emit, type AgentName } from '../bus.js';
import type { HireRequest, HireResult, PaymentRail, ProviderHandler } from './types.js';

type WorkerName = 'research' | 'writer' | 'verifier';

/**
 * THE REAL RAIL — CROO Agent Protocol on Base.
 *
 * Wired to the actual `@croo-network/sdk` API (verified against its type
 * definitions). It runs all four of our agents in a single process:
 *
 *   • Atlas (buyer)   — negotiates, pays, and collects deliveries.
 *   • Argus / Calliope / Themis (providers) — each its own AgentClient that
 *     auto-accepts negotiations and delivers once the order is paid.
 *
 * Lifecycle (from the SDK docs):
 *   buyer.negotiateOrder(serviceId) → provider.acceptNegotiation()
 *     → buyer gets OrderCreated → buyer.payOrder()
 *     → provider gets OrderPaid → provider.deliverOrder()
 *     → buyer gets OrderCompleted → buyer.getDelivery()
 */

interface Pending {
  to: AgentName;
  capability: string;
  price: number;
  orderId?: string;
  resolve: (r: HireResult) => void;
  reject: (e: Error) => void;
}

export class CrooRail implements PaymentRail {
  readonly name = 'CROO Agent Protocol (Base)';

  private sdk: any;
  private buyer: any;
  private buyerStream: any;

  private handlerByAgent = new Map<AgentName, { capability: string; handler: ProviderHandler }>();
  private providerStreams: any[] = [];

  private pendingByNeg = new Map<string, Pending>();
  private pendingByOrder = new Map<string, Pending>();

  private balances = new Map<AgentName, number>();

  registerProvider(agent: AgentName, capability: string, handler: ProviderHandler): void {
    this.handlerByAgent.set(agent, { capability, handler });
  }

  balanceOf(agent: AgentName): number {
    return this.balances.get(agent) ?? 0;
  }

  async init(): Promise<void> {
    this.sdk = await import('@croo-network/sdk');
    const { AgentClient } = this.sdk;
    const cfg = {
      baseURL: config.croo.apiUrl,
      wsURL: config.croo.wsUrl,
      ...(config.croo.rpcUrl ? { rpcURL: config.croo.rpcUrl } : {}),
    };

    if (!config.croo.orchestratorKey) {
      throw new Error('Missing CROO_ORCHESTRATOR_SDK_KEY in .env (or use RAIL=sim).');
    }

    // ---- Buyer: Atlas ----
    this.buyer = new AgentClient(cfg, config.croo.orchestratorKey);
    this.buyerStream = await this.buyer.connectWebSocket();
    this.attachBuyerHandlers();

    // ---- Providers: Argus / Calliope / Themis ----
    const workers: WorkerName[] = ['research', 'writer', 'verifier'];
    for (const worker of workers) {
      const key = config.croo.workerKeys[worker];
      const reg = this.handlerByAgent.get(worker);
      if (!key) throw new Error(`Missing SDK key for "${worker}" in .env.`);
      if (!reg) throw new Error(`No handler registered for "${worker}".`);

      const client = new AgentClient(cfg, key);
      const stream = await client.connectWebSocket();
      this.attachProviderHandlers(worker, client, stream, reg.handler);
      this.providerStreams.push(stream);
    }

    // Seed dashboard balances (display only; real funds live on-chain).
    this.balances.set('orchestrator', config.croo.startBalance);
    for (const w of workers) this.balances.set(w, 0);
    for (const [agent, balance] of this.balances) emit({ type: 'balance', agent, balance });

    emit({ type: 'log', level: 'info', message: 'Connected to CROO Agent Protocol on Base.' });
  }

  /** Buyer side: pay when the order is created, collect when it completes. */
  private attachBuyerHandlers(): void {
    const { EventType } = this.sdk;

    this.buyerStream.on(EventType.OrderCreated, async (e: any) => {
      const pending = e.negotiation_id ? this.pendingByNeg.get(e.negotiation_id) : undefined;
      if (!pending) return;
      const orderId = e.order_id;
      pending.orderId = orderId;
      if (orderId) this.pendingByOrder.set(orderId, pending);

      // Read the real on-chain price (USDC, 6 decimals) so the dashboard shows
      // the actual amount instead of the placeholder.
      try {
        const order = await this.buyer.getOrder(orderId);
        const realPrice = formatUsdc(order?.price);
        if (realPrice != null) pending.price = realPrice;
      } catch {
        /* keep placeholder price */
      }
      this.phase(pending, 'accept', orderId);

      try {
        const res = await this.buyer.payOrder(orderId);
        this.deduct(pending.price);
        this.phase(pending, 'lock', orderId, res?.txHash);
      } catch (err) {
        this.fail(pending, err);
      }
    });

    this.buyerStream.on(EventType.OrderCompleted, async (e: any) => {
      const pending = e.order_id ? this.pendingByOrder.get(e.order_id) : undefined;
      if (!pending) return;
      try {
        const delivery = await this.buyer.getDelivery(e.order_id);
        this.phase(pending, 'deliver', e.order_id);
        this.credit(pending.to, pending.price);
        this.phase(pending, 'clear', e.order_id);
        pending.resolve({ orderId: e.order_id, result: safeParse(delivery?.deliverableText) });
        this.cleanup(pending);
      } catch (err) {
        this.fail(pending, err);
      }
    });

    this.buyerStream.on(EventType.OrderRejected, (e: any) => {
      const pending = e.order_id ? this.pendingByOrder.get(e.order_id) : undefined;
      if (pending) this.fail(pending, new Error(`Order rejected: ${e.reason ?? 'unknown'}`));
    });
  }

  /** Provider side: auto-accept negotiations, then do the work and deliver. */
  private attachProviderHandlers(
    worker: WorkerName,
    client: any,
    stream: any,
    handler: ProviderHandler,
  ): void {
    const { EventType, DeliverableType } = this.sdk;

    stream.on(EventType.NegotiationCreated, async (e: any) => {
      try {
        await client.acceptNegotiation(e.negotiation_id);
      } catch (err) {
        emit({ type: 'log', level: 'error', message: `${worker} accept failed: ${String(err)}` });
      }
    });

    stream.on(EventType.OrderPaid, async (e: any) => {
      const orderId = e.order_id;
      try {
        emit({ type: 'agent', agent: worker, state: 'working' });
        const order = await client.getOrder(orderId);
        const input = safeParse(order?.requirements);
        const result = await handler(input);
        await client.deliverOrder(orderId, {
          deliverableType: DeliverableType.Text,
          deliverableText: JSON.stringify(result),
        });
      } catch (err) {
        emit({ type: 'log', level: 'error', message: `${worker} deliver failed: ${String(err)}` });
      } finally {
        emit({ type: 'agent', agent: worker, state: 'idle' });
      }
    });
  }

  async hire(req: HireRequest): Promise<HireResult> {
    const { to, capability, input, price } = req;
    const serviceId = config.croo.serviceIds[to as WorkerName];
    if (!serviceId) {
      throw new Error(`Missing service id for "${to}" (set CROO_${to.toUpperCase()}_SERVICE_ID in .env).`);
    }

    return new Promise<HireResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.fail(pending, new Error(`Order to ${to} timed out.`));
      }, 180_000);

      const pending: Pending = {
        to,
        capability,
        price,
        resolve: (r) => {
          clearTimeout(timer);
          resolve(r);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      };

      this.phase(pending, 'negotiate');
      this.buyer
        .negotiateOrder({ serviceId, requirements: JSON.stringify(input) })
        .then((neg: any) => this.pendingByNeg.set(neg.negotiationId, pending))
        .catch((err: unknown) => this.fail(pending, err));
    });
  }

  // ---- helpers ----

  private phase(p: Pending, phase: string, orderId?: string, txHash?: string): void {
    emit({
      type: 'order',
      orderId: orderId ?? '',
      from: 'orchestrator',
      to: p.to,
      capability: p.capability,
      amount: p.price,
      phase,
      ...(txHash ? { txHash } : {}),
    });
  }

  private deduct(amount: number): void {
    const next = this.balanceOf('orchestrator') - amount;
    this.balances.set('orchestrator', next);
    emit({ type: 'balance', agent: 'orchestrator', balance: next });
  }

  private credit(agent: AgentName, amount: number): void {
    const next = this.balanceOf(agent) + amount;
    this.balances.set(agent, next);
    emit({ type: 'balance', agent, balance: next });
  }

  private fail(p: Pending, err: unknown): void {
    p.reject(err instanceof Error ? err : new Error(String(err)));
    this.cleanup(p);
  }

  private cleanup(p: Pending): void {
    for (const [k, v] of this.pendingByNeg) if (v === p) this.pendingByNeg.delete(k);
    for (const [k, v] of this.pendingByOrder) if (v === p) this.pendingByOrder.delete(k);
  }

  async shutdown(): Promise<void> {
    try {
      this.buyerStream?.close();
    } catch {
      /* ignore */
    }
    for (const s of this.providerStreams) {
      try {
        s.close();
      } catch {
        /* ignore */
      }
    }
  }
}

function safeParse(value: unknown): any {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/** Convert a USDC base-units string (6 decimals) into a human number, e.g. "10000" -> 0.01. */
function formatUsdc(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round((n / 1_000_000) * 1e6) / 1e6;
}
