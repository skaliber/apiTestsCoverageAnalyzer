/**
 * MCP integration – client.
 *
 * Manages transport connections, sends prompts, and returns raw MCP responses.
 * Supports stdio (child-process) and HTTP transports.
 *
 * Security:
 *  - Server URLs validated against allowlist before connection.
 *  - Transports validated against allowlist.
 *  - Payload size validated before sending.
 *  - Secrets redacted from all outgoing payloads.
 *  - Hard timeout enforced per request.
 */

import * as http from 'http';
import * as https from 'https';
import * as childProcess from 'child_process';
import { URL } from 'url';
import type { McpConfig, McpPromptRequest, McpRawResponse } from '../types';
import {
  resolveServerConfig,
  validateTransport,
  validateServerUrl,
  validatePayloadSize,
  redactSecrets,
  MCP_DEFAULT_TIMEOUT_MS,
  MCP_DEFAULT_MAX_RETRIES,
  MCP_DEFAULT_RETRY_DELAY_MS,
} from '../config';

/** Spawn function type – injectable for testing */
export type SpawnFn = typeof childProcess.spawn;

// ─── MCP Client ───────────────────────────────────────────────────────────────

export class McpClient {
  private readonly spawnFn: SpawnFn;

  /**
   * @param globalConfig  MCP configuration block
   * @param spawnFn       Optional spawn override (useful in unit tests to avoid
   *                      spawning real child processes)
   */
  constructor(
    private readonly globalConfig: McpConfig,
    spawnFn?: SpawnFn,
  ) {
    this.spawnFn = spawnFn ?? childProcess.spawn;
  }

  /**
   * Send a prompt to the named MCP server and return the raw response.
   *
   * @param serverName  Key in config.servers (e.g. "coverageSummary")
   * @param request     Prompt request to send
   */
  async send(serverName: string, request: McpPromptRequest): Promise<McpRawResponse> {
    const serverCfg = resolveServerConfig(this.globalConfig, serverName);
    const transport = serverCfg.transport ?? 'stdio';

    // Security: validate transport and server URL
    validateTransport(this.globalConfig, transport);
    if (transport === 'http' && serverCfg.url) {
      validateServerUrl(this.globalConfig, serverCfg.url);
    }

    // Security: redact secrets from context before serialising
    const sanitisedRequest: McpPromptRequest = {
      ...request,
      context: redactSecrets(request.context) as Record<string, unknown>,
    };

    const payload = JSON.stringify(sanitisedRequest);
    validatePayloadSize(this.globalConfig, payload);

    const maxRetries = this.globalConfig.retryPolicy?.maxRetries ?? MCP_DEFAULT_MAX_RETRIES;
    const retryDelayMs = this.globalConfig.retryPolicy?.retryDelayMs ?? MCP_DEFAULT_RETRY_DELAY_MS;
    const timeoutMs = serverCfg.timeoutMs ?? MCP_DEFAULT_TIMEOUT_MS;

    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        await sleep(retryDelayMs);
      }
      try {
        if (transport === 'http') {
          return await this.sendHttp(serverCfg.url!, payload, timeoutMs);
        } else {
          return await this.sendStdio(
            serverCfg.command ?? 'node',
            serverCfg.args ?? [],
            payload,
            timeoutMs,
          );
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    return { ok: false, error: lastError?.message ?? 'Unknown MCP error' };
  }

  // ─── HTTP transport ─────────────────────────────────────────────────────────

  private sendHttp(url: string, payload: string, timeoutMs: number): Promise<McpRawResponse> {
    return new Promise((resolve) => {
      const start = Date.now();
      let resolved = false;

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve({ ok: false, error: 'MCP HTTP request timed out', latencyMs: timeoutMs });
        }
      }, timeoutMs);

      try {
        const parsedUrl = new URL(url);
        const isHttps = parsedUrl.protocol === 'https:';
        const lib = isHttps ? https : http;

        const options: http.RequestOptions = {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (isHttps ? 443 : 80),
          path: parsedUrl.pathname + (parsedUrl.search ?? ''),
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          },
          timeout: timeoutMs,
        };

        const req = lib.request(options, (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            clearTimeout(timer);
            if (!resolved) {
              resolved = true;
              const body = Buffer.concat(chunks).toString('utf-8');
              const latencyMs = Date.now() - start;
              if ((res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300) {
                resolve({ ok: true, content: body, latencyMs });
              } else {
                resolve({
                  ok: false,
                  error: `HTTP ${res.statusCode}: ${body.slice(0, 200)}`,
                  latencyMs,
                });
              }
            }
          });
        });

        req.on('error', (err) => {
          clearTimeout(timer);
          if (!resolved) {
            resolved = true;
            resolve({ ok: false, error: err.message, latencyMs: Date.now() - start });
          }
        });

        req.write(payload);
        req.end();
      } catch (err) {
        clearTimeout(timer);
        if (!resolved) {
          resolved = true;
          resolve({
            ok: false,
            error: err instanceof Error ? err.message : String(err),
            latencyMs: Date.now() - start,
          });
        }
      }
    });
  }

  // ─── stdio transport ────────────────────────────────────────────────────────

  private sendStdio(
    command: string,
    args: string[],
    payload: string,
    timeoutMs: number,
  ): Promise<McpRawResponse> {
    return new Promise((resolve) => {
      const start = Date.now();
      let resolved = false;

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          child.kill();
          resolve({ ok: false, error: 'MCP stdio process timed out', latencyMs: timeoutMs });
        }
      }, timeoutMs);

      const child = this.spawnFn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
      const chunks: Buffer[] = [];
      const errChunks: Buffer[] = [];

      child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
      child.stderr.on('data', (chunk: Buffer) => errChunks.push(chunk));

      child.on('close', (code) => {
        clearTimeout(timer);
        if (!resolved) {
          resolved = true;
          const latencyMs = Date.now() - start;
          if (code === 0) {
            const content = Buffer.concat(chunks).toString('utf-8');
            resolve({ ok: true, content, latencyMs });
          } else {
            const stderr = Buffer.concat(errChunks).toString('utf-8');
            resolve({
              ok: false,
              error: `MCP stdio process exited with code ${code}: ${stderr.slice(0, 200)}`,
              latencyMs,
            });
          }
        }
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        if (!resolved) {
          resolved = true;
          resolve({ ok: false, error: err.message, latencyMs: Date.now() - start });
        }
      });

      child.stdin.write(payload + '\n');
      child.stdin.end();
    });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
