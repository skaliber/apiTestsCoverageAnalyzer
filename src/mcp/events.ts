/**
 * MCP integration – real-time scan event adapter.
 *
 * Provides a lightweight event bus that emits AnalysisEvent objects during a
 * scan run.  When MCP real-time mode is enabled the events are buffered and
 * forwarded to the configured MCP server; when disabled they are buffered for
 * inclusion in the final report prompt only.
 */

import type { AnalysisEvent, AnalysisEventType } from './types';

// ─── Event emitter ────────────────────────────────────────────────────────────

export class AnalysisEventStream {
  private readonly _events: AnalysisEvent[] = [];
  private readonly _handlers: Array<(event: AnalysisEvent) => void> = [];

  /** Emit an event onto the stream */
  emit(type: AnalysisEventType, payload: Record<string, unknown> = {}): void {
    const event: AnalysisEvent = { type, timestamp: Date.now(), payload };
    this._events.push(event);
    for (const handler of this._handlers) {
      try { handler(event); } catch { /* never let handlers crash the scan */ }
    }
  }

  /** Subscribe to all events emitted on this stream */
  subscribe(handler: (event: AnalysisEvent) => void): void {
    this._handlers.push(handler);
  }

  /** Return a snapshot of all events emitted so far */
  getEvents(): ReadonlyArray<AnalysisEvent> {
    return [...this._events];
  }

  /** Clear buffered events (useful between scan phases) */
  clear(): void {
    this._events.length = 0;
  }
}

// ─── Convenience helpers ──────────────────────────────────────────────────────

/** Create a pre-wired event stream that does nothing (no-op) when MCP is off */
export function createNoOpStream(): AnalysisEventStream {
  return new AnalysisEventStream();
}
