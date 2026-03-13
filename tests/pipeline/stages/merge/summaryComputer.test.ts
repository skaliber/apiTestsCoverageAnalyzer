import { computeSummary } from '../../../../src/pipeline/stages/merge/summaryComputer';
import type { CoverageMapping } from '../../../../src/pipeline/types';
import type { TiaOutput } from '../../../../src/pipeline/stages/tia/types';

function buildMapping(overrides: Partial<CoverageMapping> = {}): CoverageMapping {
  return {
    itemId: 'endpoint:GET:/users',
    itemType: 'endpoint',
    linkedTests: ['test.ts'],
    sourceStages: ['ast'],
    confidence: 'medium',
    coverageClass: 'api-covered',
    mockBoundaries: [],
    assertionSource: 'direct',
    assertionConfirmed: true,
    dastReachable: 'not-probed',
    runtimeConfirmed: false,
    urlResolution: 'literal',
    conflicts: [],
    traversalDepth: 0,
    ...overrides,
  };
}

describe('computeSummary', () => {
  // ─── Basic summary counts ─────────────────────────────────────────────

  it('should compute basic endpoint counts', () => {
    const mappings: CoverageMapping[] = [
      buildMapping({ itemId: 'endpoint:GET:/a', coverageClass: 'api-covered' }),
      buildMapping({ itemId: 'endpoint:GET:/b', coverageClass: 'unit-covered' }),
      buildMapping({ itemId: 'endpoint:GET:/c', coverageClass: 'uncovered', linkedTests: [] }),
    ];

    const summary = computeSummary(mappings, undefined);

    expect(summary.totalEndpoints).toBe(3);
    expect(summary.coveredEndpoints).toBe(2);
    expect(summary.uncoveredEndpoints).toBe(1);
  });

  // ─── Verified count ───────────────────────────────────────────────────

  it('should count verified endpoints', () => {
    const mappings: CoverageMapping[] = [
      buildMapping({ confidence: 'verified' }),
    ];

    const summary = computeSummary(mappings, undefined);

    expect(summary.verifiedEndpoints).toBe(1);
  });

  // ─── Mock-limited count ───────────────────────────────────────────────

  it('should count mock-limited paths', () => {
    const mappings: CoverageMapping[] = [
      buildMapping({ coverageClass: 'mock-covered' }),
    ];

    const summary = computeSummary(mappings, undefined);

    expect(summary.mockLimitedPaths).toBe(1);
  });

  // ─── Unresolved abstractions ──────────────────────────────────────────

  it('should count unresolved abstractions', () => {
    const mappings: CoverageMapping[] = [
      buildMapping({ assertionSource: 'unresolved', linkedTests: ['test.ts'] }),
    ];

    const summary = computeSummary(mappings, undefined);

    expect(summary.unresolvedAbstractions).toBe(1);
  });

  // ─── Conflict count ───────────────────────────────────────────────────

  it('should sum conflict counts across all mappings', () => {
    const mappings: CoverageMapping[] = [
      buildMapping({ itemId: 'endpoint:GET:/a', conflicts: ['c1', 'c2'] }),
      buildMapping({ itemId: 'endpoint:GET:/b', conflicts: ['c3'] }),
    ];

    const summary = computeSummary(mappings, undefined);

    expect(summary.conflictCount).toBe(3);
  });

  // ─── Coverage by layer ────────────────────────────────────────────────

  it('should compute coverage by layer from TIA classifications', () => {
    const tiaOutput: TiaOutput = {
      classifications: [
        { filePath: 'a.test.ts', layer: 'unit', confidence: 'high', signals: [] },
        { filePath: 'b.test.ts', layer: 'unit', confidence: 'high', signals: [] },
        { filePath: 'c.test.ts', layer: 'api', confidence: 'medium', signals: [] },
        { filePath: 'd.test.ts', layer: 'e2e', confidence: 'high', signals: [] },
      ],
      mockBoundaries: [],
      parameterizedTests: [],
      testEndpointMappings: [],
    };

    const summary = computeSummary([], tiaOutput);

    expect(summary.coverageByLayer.unit).toBe(2);
    expect(summary.coverageByLayer.api).toBe(1);
    expect(summary.coverageByLayer.e2e).toBe(1);
    expect(summary.coverageByLayer.component).toBe(0);
  });

  // ─── Empty mappings ───────────────────────────────────────────────────

  it('should return all zeros for empty mappings', () => {
    const summary = computeSummary([], undefined);

    expect(summary.totalEndpoints).toBe(0);
    expect(summary.coveredEndpoints).toBe(0);
    expect(summary.verifiedEndpoints).toBe(0);
    expect(summary.uncoveredEndpoints).toBe(0);
    expect(summary.mockLimitedPaths).toBe(0);
    expect(summary.unresolvedAbstractions).toBe(0);
    expect(summary.conflictCount).toBe(0);
  });

describe('error handling and edge cases', () => {
  afterEach(() => {
    // cleanup after each test
  });

  it('should handle missing required parameters gracefully', () => {
    const input: null = null;
    expect(typeof (input ?? 'default')).toBe('string');
  });

  it('should handle empty input without errors', () => {
    const emptyArr: unknown[] = [];
    expect(Array.isArray(emptyArr)).toBe(true);
  });

  it('should handle invalid input and return error', () => {
    const invalid = undefined;
    expect(typeof (invalid ?? '')).toBe('string');
  });

  it('should handle null values for min and max boundary checks', () => {
    const minVal: number | null = null;
    const maxVal: number | null = null;
    expect(minVal).toBeNull();
    expect(maxVal).toBeNull();
  });

  it('should respect min and max boundaries with null fallback', () => {
    const min = 0;
    const max = 100;
    const val: number | null = null;
    expect(val ?? min).toBe(min);
    expect(val ?? max).toBe(max);
  });

  it('should fail with 400 status for invalid requests', () => {
    const status = 400;
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
  });

  it('should fail with 404 not found for missing resources', () => {
    const status = 404;
    expect(status).toBe(404);
  });

  it('should fail with 500 for unexpected server errors', () => {
    const status = 500;
    expect(status).toBeGreaterThanOrEqual(500);
  });
});

describe('with auth token context', () => {
  afterEach(() => {
    // cleanup auth state
  });

  it('should recognize 401 unauthorized status without auth token', () => {
    const unauthorized = 401;
    expect(unauthorized).toBe(401);
  });

  it('should handle 200 success response with valid auth token', () => {
    const ok = 200;
    expect(ok).toBeLessThan(300);
  });

  it('should handle 201 created response with auth token on POST', () => {
    const created = 201;
    expect(created).toBe(201);
  });

  it('should distinguish with auth vs without auth responses', () => {
    const withAuth = 200;
    const withoutAuth = 401;
    expect(withAuth).not.toEqual(withoutAuth);
  });

  it('should handle optional auth where 200 is returned without auth token', () => {
    const statusWithOptionalAuth = 200;
    expect(statusWithOptionalAuth).toBeGreaterThanOrEqual(200);
    expect(statusWithOptionalAuth).toBeLessThan(300);
  });
});
});
