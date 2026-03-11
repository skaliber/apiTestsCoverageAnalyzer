/**
 * DAST (Dynamic Application Security Testing) stage types.
 *
 * DAST results are produced by an external scanner (e.g. ZAP, Burp)
 * and consumed by this stage to verify endpoint reachability and
 * detect security annotation enforcement gaps.
 */

/**
 * A single DAST probe result.
 */
export interface DastProbeResult {
  /** HTTP method probed */
  method: string;
  /** URL path probed */
  path: string;
  /** Normalized path template */
  normalizedPath?: string;
  /** Whether the endpoint was reachable */
  reachable: boolean;
  /** HTTP status code returned */
  statusCode?: number;
  /** Whether authentication was required */
  authRequired?: boolean;
  /** Whether the probe detected an auth bypass */
  authBypass?: boolean;
  /** Whether the response indicated server error */
  serverError?: boolean;
  /** Additional metadata (e.g. response headers, scan tool info) */
  metadata?: Record<string, unknown>;
}

/**
 * Shape of the dast-results.json file.
 */
export interface DastResultsFile {
  results: DastProbeResult[];
  generatedAt?: string;
  scannerVersion?: string;
  targetUrl?: string;
}

/**
 * Output of the DAST stage.
 */
export interface DastOutput {
  results: DastProbeResult[];
  confirmedEndpoints: string[];
  unreachableEndpoints: string[];
  conflictsEmitted: number;
}
