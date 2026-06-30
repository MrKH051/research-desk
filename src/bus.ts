import { EventEmitter } from 'node:events';

// The four agents in our system.
export type AgentName = 'orchestrator' | 'research' | 'writer' | 'verifier';

// A single event that the dashboard listens to (over Server-Sent Events).
export interface BusEvent {
  type: string;
  ts?: number;
  [key: string]: unknown;
}

// One global event bus. The orchestrator + rail push events in;
// the web server forwards them to every connected browser.
export const bus = new EventEmitter();
bus.setMaxListeners(100);

export function emit(ev: BusEvent): void {
  bus.emit('event', { ...ev, ts: Date.now() });
}
