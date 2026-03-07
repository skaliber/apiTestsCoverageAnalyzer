/**
 * MCP integration – mock MCP server.
 *
 * This module provides a deterministic mock MCP server for testing.
 * It can operate in two modes:
 *
 *   1. **HTTP mode** – starts an HTTP server on a configurable port that
 *      accepts POST /mcp requests and returns deterministic AI responses.
 *
 *   2. **stdio mode** – a standalone Node script that reads a JSON prompt
 *      from stdin and writes a deterministic JSON response to stdout.
 *
 * The mock can be configured to:
 *   - Return normal deterministic responses
 *   - Simulate errors (status 500)
 *   - Simulate timeouts (delayed response)
 *   - Return malformed JSON
 */

import * as http from 'http';
import type { NormalizedAiAnalysis } from '../../types';

// ─── Mock response builder ─────────────────────────────────────────────────────

/** Behaviours that the mock server can be configured to exhibit */
export type MockBehaviour = 'normal' | 'error' | 'timeout' | 'malformed';

/**
 * Build a deterministic mock NormalizedAiAnalysis for a given category.
 */
export function buildMockAnalysisResponse(
  category: string,
  behaviour: MockBehaviour = 'normal',
): NormalizedAiAnalysis {
  if (behaviour !== 'normal') {
    throw new Error(`Mock behaviour "${behaviour}" should be handled by the server layer`);
  }
  return {
    summary: `Mock AI analysis for category: ${category}. All systems nominal.`,
    keyFindings: [
      `Coverage analysis completed for ${category}`,
      'No critical gaps detected in mock mode',
    ],
    topRisks: [`Mock risk item for ${category}`],
    recommendedActions: [
      `Review ${category} coverage results`,
      'Add tests for any uncovered areas',
    ],
    missingCoverageAreas: [],
    likelyRootCauses: [],
    confidence: 'high',
    isFallback: false,
    category,
  };
}

// ─── HTTP mock server ─────────────────────────────────────────────────────────

// Wait effectively indefinitely — rely on the client's configured timeout.
// 24 hours ensures the server never resolves before the client times out.
const WAIT_INDEFINITELY_MS = 24 * 60 * 60 * 1000;

export interface MockServerOptions {
  port?: number;
  behaviour?: MockBehaviour;
  /** Delay in ms before responding (for timeout simulation) */
  delayMs?: number;
}

export interface MockServerHandle {
  url: string;
  close(): Promise<void>;
  /** Change behaviour after the server is started */
  setBehaviour(behaviour: MockBehaviour, delayMs?: number): void;
}

/**
 * Start an HTTP mock MCP server.
 *
 * @example
 * const server = await startMockMcpServer({ port: 3099 });
 * // use server.url in test MCP config
 * await server.close();
 */
export async function startMockMcpServer(
  options: MockServerOptions = {},
): Promise<MockServerHandle> {
  let behaviour: MockBehaviour = options.behaviour ?? 'normal';
  let delayMs: number = options.delayMs ?? 0;

  const server = http.createServer((req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const respond = () => {
        try {
          const body = Buffer.concat(chunks).toString('utf-8');
          let parsed: { category?: string } = {};
          try { parsed = JSON.parse(body); } catch { /* ignore parse errors */ }
          const category = parsed.category ?? 'unknown';

          if (behaviour === 'error') {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Mock server error' }));
            return;
          }

          if (behaviour === 'malformed') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end('not-valid-json{{{');
            return;
          }

          const responseBody = JSON.stringify(buildMockAnalysisResponse(category));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(responseBody);
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: String(err) }));
        }
      };

      if (behaviour === 'timeout' || delayMs > 0) {
        setTimeout(respond, delayMs || WAIT_INDEFINITELY_MS);
      } else {
        respond();
      }
    });
  });

  const port = options.port ?? 0;
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));

  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}/mcp`;

  return {
    url,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
    setBehaviour(newBehaviour, newDelayMs) {
      behaviour = newBehaviour;
      if (newDelayMs !== undefined) delayMs = newDelayMs;
    },
  };
}
