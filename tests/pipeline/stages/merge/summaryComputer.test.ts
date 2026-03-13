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
});
