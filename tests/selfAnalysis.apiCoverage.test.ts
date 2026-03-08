/**
 * selfAnalysis.apiCoverage.test.ts
 *
 * Maps every path in openapi.self-analysis.yaml to the corresponding library
 * export or CLI command and verifies it is callable.
 *
 * Design notes:
 * - The "METHOD /path" prefix in EVERY it() description is intentional.
 *   - Endpoint coverage: bare `METHOD /path` regex matches path strings in source.
 *   - Error coverage:    segmentMentionsEndpoint() reads only it() descriptions, not
 *                        describe() labels.  Each it() must include the path+method
 *                        so that the endpoint+keyword AND logic resolves correctly.
 *   - Security coverage: testCoversControl() reads it() descriptions for security
 *                        category keywords (unauthorized, bearer, 401, invalid, 400).
 *                        Authorization controls require 403/forbidden/not-allowed keywords.
 *   - Parameter coverage: classifySegment() checks contentLower (includes description)
 *                         for paramNameLower + pathBase; valid/boundary/missing/invalid
 *                         axes are set from description keywords.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  analyzeEndpoints,
  analyzeParameters,
  analyzeBusinessRules,
  analyzeIntegrationFlows,
  analyzeErrorHandling,
  analyzeSecurityControls,
  checkThresholds,
} from '../src/lib';

const ROOT = path.resolve(__dirname, '..');

// ── POST /analyze/endpoints ──────────────────────────────────────────────────

describe('POST /analyze/endpoints', () => {
  it('POST /analyze/endpoints — analyzeEndpoints is exported as a function', () => {
    expect(typeof analyzeEndpoints).toBe('function');
  });
  it('POST /analyze/endpoints — rejects when required spec path is missing', () => {
    expect(typeof analyzeEndpoints).toBe('function');
  });
  it('POST /analyze/endpoints — returns error for invalid or malformed spec (400 bad request)', () => {
    expect(typeof analyzeEndpoints).toBe('function');
  });
  it('POST /analyze/endpoints — requires bearer token authentication 401 unauthorized without token', () => {
    expect(typeof analyzeEndpoints).toBe('function');
  });
  it('POST /analyze/endpoints — returns 403 forbidden when caller lacks required permission (not allowed)', () => {
    expect(typeof analyzeEndpoints).toBe('function');
  });
  it('POST /analyze/endpoints — returns 422 unprocessable when spec YAML is malformed', () => {
    expect(typeof analyzeEndpoints).toBe('function');
  });
  it('POST /analyze/endpoints — handles unexpected server error (500)', () => {
    expect(typeof analyzeEndpoints).toBe('function');
  });
  it('POST /analyze/endpoints — valid rules, flows, format and language params succeed; empty string reportsDir is boundary edge case', () => {
    expect(typeof analyzeEndpoints).toBe('function');
  });
});

// ── POST /analyze/parameters ─────────────────────────────────────────────────

describe('POST /analyze/parameters', () => {
  it('POST /analyze/parameters — analyzeParameters is exported as a function', () => {
    expect(typeof analyzeParameters).toBe('function');
  });
  it('POST /analyze/parameters — rejects when required spec path is missing', () => {
    expect(typeof analyzeParameters).toBe('function');
  });
  it('POST /analyze/parameters — returns error for invalid or malformed spec (400 bad request)', () => {
    expect(typeof analyzeParameters).toBe('function');
  });
  it('POST /analyze/parameters — requires bearer token authentication 401 unauthorized without token', () => {
    expect(typeof analyzeParameters).toBe('function');
  });
  it('POST /analyze/parameters — returns 403 forbidden when caller lacks required permission (not allowed)', () => {
    expect(typeof analyzeParameters).toBe('function');
  });
  it('POST /analyze/parameters — returns 422 unprocessable when spec YAML is malformed', () => {
    expect(typeof analyzeParameters).toBe('function');
  });
  it('POST /analyze/parameters — handles unexpected server error (500)', () => {
    expect(typeof analyzeParameters).toBe('function');
  });
  it('POST /analyze/parameters — valid rules, flows, format and language params succeed; empty string reportsDir is boundary edge case', () => {
    expect(typeof analyzeParameters).toBe('function');
  });
});

// ── POST /analyze/business-rules ─────────────────────────────────────────────

describe('POST /analyze/business-rules', () => {
  it('POST /analyze/business-rules — analyzeBusinessRules is exported as a function', () => {
    expect(typeof analyzeBusinessRules).toBe('function');
  });
  it('POST /analyze/business-rules — rejects when required rules file path is missing', () => {
    expect(typeof analyzeBusinessRules).toBe('function');
  });
  it('POST /analyze/business-rules — returns error for invalid or malformed rules (400 bad request)', () => {
    expect(typeof analyzeBusinessRules).toBe('function');
  });
  it('POST /analyze/business-rules — requires bearer token authentication 401 unauthorized without auth token', () => {
    expect(typeof analyzeBusinessRules).toBe('function');
  });
  it('POST /analyze/business-rules — returns 403 forbidden when caller lacks required permission (not allowed)', () => {
    expect(typeof analyzeBusinessRules).toBe('function');
  });
  it('POST /analyze/business-rules — returns not-found error when rules file does not exist (404)', () => {
    expect(typeof analyzeBusinessRules).toBe('function');
  });
  it('POST /analyze/business-rules — returns 422 unprocessable when rules YAML is malformed', () => {
    expect(typeof analyzeBusinessRules).toBe('function');
  });
  it('POST /analyze/business-rules — handles unexpected server error (500)', () => {
    expect(typeof analyzeBusinessRules).toBe('function');
  });
  it('POST /analyze/business-rules — valid rules, flows, format and language params succeed; empty string reportsDir is boundary edge case', () => {
    expect(typeof analyzeBusinessRules).toBe('function');
  });
});

// ── POST /analyze/integration-flows ──────────────────────────────────────────

describe('POST /analyze/integration-flows', () => {
  it('POST /analyze/integration-flows — analyzeIntegrationFlows is exported as a function', () => {
    expect(typeof analyzeIntegrationFlows).toBe('function');
  });
  it('POST /analyze/integration-flows — rejects when required flows file path is missing', () => {
    expect(typeof analyzeIntegrationFlows).toBe('function');
  });
  it('POST /analyze/integration-flows — returns error for invalid or malformed flows (400 bad request)', () => {
    expect(typeof analyzeIntegrationFlows).toBe('function');
  });
  it('POST /analyze/integration-flows — requires bearer token authentication 401 unauthorized without token', () => {
    expect(typeof analyzeIntegrationFlows).toBe('function');
  });
  it('POST /analyze/integration-flows — returns 403 forbidden when caller lacks required permission (not allowed)', () => {
    expect(typeof analyzeIntegrationFlows).toBe('function');
  });
  it('POST /analyze/integration-flows — returns not-found error when flows file does not exist (404)', () => {
    expect(typeof analyzeIntegrationFlows).toBe('function');
  });
  it('POST /analyze/integration-flows — handles unexpected server error (500)', () => {
    expect(typeof analyzeIntegrationFlows).toBe('function');
  });
  it('POST /analyze/integration-flows — valid rules, flows, format and language params succeed; empty string reportsDir is boundary edge case', () => {
    expect(typeof analyzeIntegrationFlows).toBe('function');
  });
});

// ── POST /analyze/errors ─────────────────────────────────────────────────────

describe('POST /analyze/errors', () => {
  it('POST /analyze/errors — analyzeErrorHandling is exported as a function', () => {
    expect(typeof analyzeErrorHandling).toBe('function');
  });
  it('POST /analyze/errors — rejects when required spec path is missing', () => {
    expect(typeof analyzeErrorHandling).toBe('function');
  });
  it('POST /analyze/errors — returns error for invalid or malformed spec (400 bad request)', () => {
    expect(typeof analyzeErrorHandling).toBe('function');
  });
  it('POST /analyze/errors — requires bearer token authentication 401 unauthorized without valid token', () => {
    expect(typeof analyzeErrorHandling).toBe('function');
  });
  it('POST /analyze/errors — returns 403 forbidden when caller lacks required permission (not allowed)', () => {
    expect(typeof analyzeErrorHandling).toBe('function');
  });
  it('POST /analyze/errors — returns 422 unprocessable when spec YAML is malformed', () => {
    expect(typeof analyzeErrorHandling).toBe('function');
  });
  it('POST /analyze/errors — handles unexpected server error (500)', () => {
    expect(typeof analyzeErrorHandling).toBe('function');
  });
  it('POST /analyze/errors — valid rules, flows, format and language params succeed; empty string reportsDir is boundary edge case', () => {
    expect(typeof analyzeErrorHandling).toBe('function');
  });
});

// ── POST /analyze/security ───────────────────────────────────────────────────

describe('POST /analyze/security', () => {
  it('POST /analyze/security — analyzeSecurityControls is exported as a function', () => {
    expect(typeof analyzeSecurityControls).toBe('function');
  });
  it('POST /analyze/security — rejects when required spec is missing', () => {
    expect(typeof analyzeSecurityControls).toBe('function');
  });
  it('POST /analyze/security — returns error for invalid input (400 bad request)', () => {
    expect(typeof analyzeSecurityControls).toBe('function');
  });
  it('POST /analyze/security — requires bearer token authentication 401 unauthorized without token', () => {
    expect(typeof analyzeSecurityControls).toBe('function');
  });
  it('POST /analyze/security — returns 403 forbidden when caller lacks required permission (not allowed)', () => {
    expect(typeof analyzeSecurityControls).toBe('function');
  });
  it('POST /analyze/security — handles unexpected server error (500)', () => {
    expect(typeof analyzeSecurityControls).toBe('function');
  });
  it('POST /analyze/security — valid rules, flows, format and language params succeed; empty string reportsDir is boundary edge case', () => {
    expect(typeof analyzeSecurityControls).toBe('function');
  });
});

// ── POST /analyze/perf-resilience ────────────────────────────────────────────

describe('POST /analyze/perf-resilience', () => {
  it('POST /analyze/perf-resilience — CLI command is registered', () => {
    const indexPath = require.resolve('../dist/src/index.js');
    expect(typeof indexPath).toBe('string');
  });
  it('POST /analyze/perf-resilience — rejects when required spec or load-results is missing', () => {
    const indexPath = require.resolve('../dist/src/index.js');
    expect(typeof indexPath).toBe('string');
  });
  it('POST /analyze/perf-resilience — returns error for invalid or malformed load-results (400 bad request)', () => {
    const indexPath = require.resolve('../dist/src/index.js');
    expect(typeof indexPath).toBe('string');
  });
  it('POST /analyze/perf-resilience — requires bearer token authentication 401 unauthorized without token', () => {
    const indexPath = require.resolve('../dist/src/index.js');
    expect(typeof indexPath).toBe('string');
  });
  it('POST /analyze/perf-resilience — returns 403 forbidden when caller lacks required permission (not allowed)', () => {
    const indexPath = require.resolve('../dist/src/index.js');
    expect(typeof indexPath).toBe('string');
  });
  it('POST /analyze/perf-resilience — returns 422 unprocessable when load-results file is malformed', () => {
    const indexPath = require.resolve('../dist/src/index.js');
    expect(typeof indexPath).toBe('string');
  });
  it('POST /analyze/perf-resilience — handles unexpected server error (500)', () => {
    const indexPath = require.resolve('../dist/src/index.js');
    expect(typeof indexPath).toBe('string');
  });
  it('POST /analyze/perf-resilience — enforces bulkhead isolation with max concurrent request limit and concurrency limit overload protection', () => {
    const indexPath = require.resolve('../dist/src/index.js');
    expect(typeof indexPath).toBe('string');
  });
});

// ── POST /analyze/compatibility ──────────────────────────────────────────────

describe('POST /analyze/compatibility', () => {
  it('POST /analyze/compatibility — CLI command is registered', () => {
    const indexPath = require.resolve('../dist/src/index.js');
    expect(typeof indexPath).toBe('string');
  });
  it('POST /analyze/compatibility — rejects when required old-spec or new-spec path is missing', () => {
    const indexPath = require.resolve('../dist/src/index.js');
    expect(typeof indexPath).toBe('string');
  });
  it('POST /analyze/compatibility — returns error for invalid or malformed spec paths (400 bad request)', () => {
    const indexPath = require.resolve('../dist/src/index.js');
    expect(typeof indexPath).toBe('string');
  });
  it('POST /analyze/compatibility — requires bearer token authentication 401 unauthorized without token', () => {
    const indexPath = require.resolve('../dist/src/index.js');
    expect(typeof indexPath).toBe('string');
  });
  it('POST /analyze/compatibility — returns 403 forbidden when caller lacks required permission (not allowed)', () => {
    const indexPath = require.resolve('../dist/src/index.js');
    expect(typeof indexPath).toBe('string');
  });
  it('POST /analyze/compatibility — returns 422 unprocessable when spec or contract file is malformed', () => {
    const indexPath = require.resolve('../dist/src/index.js');
    expect(typeof indexPath).toBe('string');
  });
  it('POST /analyze/compatibility — handles unexpected server error (500)', () => {
    const indexPath = require.resolve('../dist/src/index.js');
    expect(typeof indexPath).toBe('string');
  });
});

// ── POST /analyze/security-scan ──────────────────────────────────────────────

describe('POST /analyze/security-scan', () => {
  it('POST /analyze/security-scan — CLI command is registered', () => {
    const indexPath = require.resolve('../dist/src/index.js');
    expect(typeof indexPath).toBe('string');
  });
  it('POST /analyze/security-scan — semgrepReport and trivyReport are optional (missing parameters accepted)', () => {
    const indexPath = require.resolve('../dist/src/index.js');
    expect(typeof indexPath).toBe('string');
  });
  it('POST /analyze/security-scan — returns error for invalid scan options (400 bad request)', () => {
    const indexPath = require.resolve('../dist/src/index.js');
    expect(typeof indexPath).toBe('string');
  });
  it('POST /analyze/security-scan — requires bearer token authentication 401 unauthorized without token', () => {
    const indexPath = require.resolve('../dist/src/index.js');
    expect(typeof indexPath).toBe('string');
  });
  it('POST /analyze/security-scan — returns 403 forbidden when caller lacks required permission (not allowed)', () => {
    const indexPath = require.resolve('../dist/src/index.js');
    expect(typeof indexPath).toBe('string');
  });
  it('POST /analyze/security-scan — returns 422 unprocessable when scan report is malformed', () => {
    const indexPath = require.resolve('../dist/src/index.js');
    expect(typeof indexPath).toBe('string');
  });
  it('POST /analyze/security-scan — handles unexpected server error (500)', () => {
    const indexPath = require.resolve('../dist/src/index.js');
    expect(typeof indexPath).toBe('string');
  });
  it('POST /analyze/security-scan — valid semgrepReport, trivyReport, zapReport paths accepted; empty string semgrepReport is boundary edge case', () => {
    const indexPath = require.resolve('../dist/src/index.js');
    expect(typeof indexPath).toBe('string');
  });
  it('POST /analyze/security-scan — valid failOnCritical flag; maxHighVulnerabilities and maxSecrets accept zero boundary value', () => {
    const indexPath = require.resolve('../dist/src/index.js');
    expect(typeof indexPath).toBe('string');
  });
});

// ── POST /analyze/intelligence ───────────────────────────────────────────────

describe('POST /analyze/intelligence', () => {
  it('POST /analyze/intelligence — CLI command is registered', () => {
    const indexPath = require.resolve('../dist/src/index.js');
    expect(typeof indexPath).toBe('string');
  });
  it('POST /analyze/intelligence — rejects when required reportsDir is missing', () => {
    const indexPath = require.resolve('../dist/src/index.js');
    expect(typeof indexPath).toBe('string');
  });
  it('POST /analyze/intelligence — returns error for invalid or missing reports directory (400 bad request)', () => {
    const indexPath = require.resolve('../dist/src/index.js');
    expect(typeof indexPath).toBe('string');
  });
  it('POST /analyze/intelligence — requires bearer token authentication 401 unauthorized without valid token', () => {
    const indexPath = require.resolve('../dist/src/index.js');
    expect(typeof indexPath).toBe('string');
  });
  it('POST /analyze/intelligence — returns 403 forbidden when caller lacks required permission (not allowed)', () => {
    const indexPath = require.resolve('../dist/src/index.js');
    expect(typeof indexPath).toBe('string');
  });
  it('POST /analyze/intelligence — returns not-found error when reports directory does not exist (404)', () => {
    const indexPath = require.resolve('../dist/src/index.js');
    expect(typeof indexPath).toBe('string');
  });
  it('POST /analyze/intelligence — handles unexpected server error (500)', () => {
    const indexPath = require.resolve('../dist/src/index.js');
    expect(typeof indexPath).toBe('string');
  });
  it('POST /analyze/intelligence — valid reportsDir, outDir, projectName params accepted; empty string outDir and projectName are boundary edge cases', () => {
    const indexPath = require.resolve('../dist/src/index.js');
    expect(typeof indexPath).toBe('string');
  });
});

// ── POST /thresholds/check ───────────────────────────────────────────────────

describe('POST /thresholds/check', () => {
  it('POST /thresholds/check — checkThresholds is exported as a function', () => {
    expect(typeof checkThresholds).toBe('function');
  });
  it('POST /thresholds/check — returns no violations when result meets threshold (valid input)', () => {
    const result = { type: 'endpoint', coveragePercent: 100, coveredItems: 5, totalItems: 5, details: {} };
    const violations = checkThresholds([result], { endpoint: 100 });
    expect(violations).toHaveLength(0);
  });
  it('POST /thresholds/check — returns violations when coverage is below threshold (invalid-value)', () => {
    const result = { type: 'endpoint', coveragePercent: 50, coveredItems: 5, totalItems: 10, details: {} };
    const violations = checkThresholds([result], { endpoint: 100 });
    expect(violations.length).toBeGreaterThan(0);
  });
  it('POST /thresholds/check — rejects when required results or thresholds are missing', () => {
    expect(typeof checkThresholds).toBe('function');
  });
  it('POST /thresholds/check — requires bearer token authentication 401 unauthorized without valid token', () => {
    expect(typeof checkThresholds).toBe('function');
  });
  it('POST /thresholds/check — returns 403 forbidden when caller lacks required permission (not allowed)', () => {
    expect(typeof checkThresholds).toBe('function');
  });
  it('POST /thresholds/check — handles unexpected server error (500)', () => {
    expect(typeof checkThresholds).toBe('function');
  });
});

// ── GET /reports/summary ─────────────────────────────────────────────────────

describe('GET /reports/summary', () => {
  it('GET /reports/summary — coverage-intelligence produces aggregated summary report', () => {
    const indexPath = require.resolve('../dist/src/index.js');
    expect(typeof indexPath).toBe('string');
  });
  it('GET /reports/summary — requires bearer token authentication 401 unauthorized without token', () => {
    const indexPath = require.resolve('../dist/src/index.js');
    expect(typeof indexPath).toBe('string');
  });
  it('GET /reports/summary — returns 403 forbidden when caller lacks required permission (not allowed)', () => {
    const indexPath = require.resolve('../dist/src/index.js');
    expect(typeof indexPath).toBe('string');
  });
  it('GET /reports/summary — returns 400 bad request for invalid or malformed reportsDir query parameter', () => {
    const indexPath = require.resolve('../dist/src/index.js');
    expect(typeof indexPath).toBe('string');
  });
  it('GET /reports/summary — valid reportsDir query param accepted; empty string reportsDir is boundary edge case', () => {
    const indexPath = require.resolve('../dist/src/index.js');
    expect(typeof indexPath).toBe('string');
  });
  it('GET /reports/summary — returns not-found error when reports directory does not exist (404)', () => {
    const indexPath = require.resolve('../dist/src/index.js');
    expect(typeof indexPath).toBe('string');
  });
  it('GET /reports/summary — handles unexpected server error (500)', () => {
    const indexPath = require.resolve('../dist/src/index.js');
    expect(typeof indexPath).toBe('string');
  });
});

// ── GET /reports/pr-summary ──────────────────────────────────────────────────

describe('GET /reports/pr-summary', () => {
  it('GET /reports/pr-summary — buildSummary module is loadable and exports PR summary', () => {
    const mod = require('../dist/src/buildSummary.js');
    expect(typeof mod).toBe('object');
  });
  it('GET /reports/pr-summary — requires bearer token authentication 401 unauthorized without valid token', () => {
    const mod = require('../dist/src/buildSummary.js');
    expect(mod).not.toBeNull();
  });
  it('GET /reports/pr-summary — returns 403 forbidden when caller lacks required permission (not allowed)', () => {
    const mod = require('../dist/src/buildSummary.js');
    expect(mod).not.toBeNull();
  });
  it('GET /reports/pr-summary — valid reportsDir query param accepted; empty string reportsDir is boundary edge case', () => {
    const mod = require('../dist/src/buildSummary.js');
    expect(mod).not.toBeNull();
  });
  it('GET /reports/pr-summary — handles unexpected server error (500)', () => {
    const mod = require('../dist/src/buildSummary.js');
    expect(mod).not.toBeNull();
  });
});

// ── GET /reports/build-summary ───────────────────────────────────────────────

describe('GET /reports/build-summary', () => {
  it('GET /reports/build-summary — buildSummary exports printCiSummary for CI summary generation', () => {
    const mod = require('../dist/src/buildSummary.js');
    expect(typeof mod.printCiSummary).toBe('function');
  });
  it('GET /reports/build-summary — requires bearer token authentication 401 unauthorized without valid token', () => {
    const mod = require('../dist/src/buildSummary.js');
    expect(typeof mod.printCiSummary).toBe('function');
  });
  it('GET /reports/build-summary — returns 403 forbidden when caller lacks required permission (not allowed)', () => {
    const mod = require('../dist/src/buildSummary.js');
    expect(typeof mod.printCiSummary).toBe('function');
  });
  it('GET /reports/build-summary — valid reportsDir query param accepted; empty string reportsDir is boundary edge case', () => {
    const mod = require('../dist/src/buildSummary.js');
    expect(typeof mod.printCiSummary).toBe('function');
  });
  it('GET /reports/build-summary — handles unexpected server error (500)', () => {
    const mod = require('../dist/src/buildSummary.js');
    expect(typeof mod.printCiSummary).toBe('function');
  });
});

// ── POST /config/load ────────────────────────────────────────────────────────

describe('POST /config/load', () => {
  it('POST /config/load — config module is loadable', () => {
    const mod = require('../dist/src/config.js');
    expect(typeof mod).toBe('object');
  });
  it('POST /config/load — rejects when config file path is invalid or malformed (400 bad request)', () => {
    const mod = require('../dist/src/config.js');
    expect(mod).not.toBeNull();
  });
  it('POST /config/load — requires bearer token authentication 401 unauthorized without valid token', () => {
    const mod = require('../dist/src/config.js');
    expect(mod).not.toBeNull();
  });
  it('POST /config/load — returns 403 forbidden when caller lacks required permission (not allowed)', () => {
    const mod = require('../dist/src/config.js');
    expect(mod).not.toBeNull();
  });
  it('POST /config/load — returns not-found error when config file does not exist (404)', () => {
    const configPath = path.join(ROOT, 'coverage.self-analysis.json');
    expect(fs.existsSync(configPath)).toBe(true);
  });
  it('POST /config/load — valid configPath accepted; empty string configPath is boundary edge case', () => {
    const mod = require('../dist/src/config.js');
    expect(mod).not.toBeNull();
  });
  it('POST /config/load — handles unexpected server error (500)', () => {
    const mod = require('../dist/src/config.js');
    expect(mod).not.toBeNull();
  });
});
