#!/usr/bin/env node
/**
 * MCP integration – stdio mock server script.
 *
 * Reads a single JSON prompt request from stdin, writes a deterministic JSON
 * response to stdout, and exits with code 0.
 *
 * Behaviour can be controlled via the MCP_MOCK_BEHAVIOUR environment variable:
 *   normal    – return a deterministic mock response (default)
 *   error     – exit with code 1
 *   malformed – write invalid JSON and exit 0
 *   timeout   – wait indefinitely (rely on client timeout)
 */

'use strict';

const behaviour = process.env['MCP_MOCK_BEHAVIOUR'] ?? 'normal';

if (behaviour === 'error') {
  process.stderr.write('Mock stdio server error\n');
  process.exit(1);
}

if (behaviour === 'timeout') {
  // Never write anything – wait for the client to time out
  setTimeout(() => {}, 60_000 * 60);
  process.stdin.resume();
  return;
}

const chunks = [];
process.stdin.on('data', (chunk) => chunks.push(chunk));
process.stdin.on('end', () => {
  try {
    const input = Buffer.concat(chunks).toString('utf-8').trim();
    let category = 'unknown';
    try {
      const parsed = JSON.parse(input);
      category = parsed.category ?? 'unknown';
    } catch {
      /* ignore */
    }

    if (behaviour === 'malformed') {
      process.stdout.write('not-valid-json{{{');
      process.exit(0);
    }

    const response = {
      summary: `Mock stdio AI analysis for category: ${category}. All systems nominal.`,
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

    process.stdout.write(JSON.stringify(response) + '\n');
    process.exit(0);
  } catch (err) {
    process.stderr.write(String(err));
    process.exit(1);
  }
});
