import {
  computeBaseConfidence,
  applyConfidenceCaps,
  computeConfidence,
  capConfidence,
  compareConfidence,
  minConfidence,
  hasMockBoundaryOnPath,
  hasPartialResolution,
  buildConfidenceEvidence,
} from '../../src/pipeline/confidence';
import { CoverageKnowledgeGraph } from '../../src/pipeline/graph';
import type {
  ConfidenceEvidence,
  PipelineConfidence,
  GraphNode,
  StageName,
  GraphNodeType,
} from '../../src/pipeline/types';

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Build a minimal ConfidenceEvidence with sensible defaults. */
function evidence(overrides: Partial<ConfidenceEvidence> = {}): ConfidenceEvidence {
  return {
    sourceStages: [],
    hasIastConfirmation: false,
    hasDastConfirmation: false,
    hasAssertionConfirmation: false,
    hasMockBoundary: false,
    hasPartialResolution: false,
    hasSymbolicUrl: false,
    isStaticOnlyMode: false,
    ...overrides,
  };
}

function makeNode(
  id: string,
  type: GraphNodeType = 'endpoint',
  stage: StageName = 'ast',
  metadata: Record<string, unknown> = {},
): GraphNode {
  return { id, type, label: `Label for ${id}`, sourceStage: stage, metadata };
}

// ─── computeBaseConfidence ───────────────────────────────────────────────────

describe('computeBaseConfidence', () => {
  it('returns low for AST only (no TIA link)', () => {
    expect(computeBaseConfidence(evidence({ sourceStages: ['ast'] }))).toBe('low');
  });

  it('returns medium for AST + TIA', () => {
    expect(computeBaseConfidence(evidence({ sourceStages: ['ast', 'tia'] }))).toBe('medium');
  });

  it('returns high for AST + TIA + IAST', () => {
    expect(
      computeBaseConfidence(
        evidence({ sourceStages: ['ast', 'tia'], hasIastConfirmation: true }),
      ),
    ).toBe('high');
  });

  it('returns high for AST + TIA + DAST', () => {
    expect(
      computeBaseConfidence(
        evidence({ sourceStages: ['ast', 'tia'], hasDastConfirmation: true }),
      ),
    ).toBe('high');
  });

  it('returns high (NOT verified) for AST + TIA + IAST + DAST without assertion', () => {
    expect(
      computeBaseConfidence(
        evidence({
          sourceStages: ['ast', 'tia'],
          hasIastConfirmation: true,
          hasDastConfirmation: true,
          hasAssertionConfirmation: false,
        }),
      ),
    ).toBe('high');
  });

  it('returns verified for AST + TIA + IAST + DAST + assertion', () => {
    expect(
      computeBaseConfidence(
        evidence({
          sourceStages: ['ast', 'tia'],
          hasIastConfirmation: true,
          hasDastConfirmation: true,
          hasAssertionConfirmation: true,
        }),
      ),
    ).toBe('verified');
  });

  it('returns low when no stages are present', () => {
    expect(computeBaseConfidence(evidence({ sourceStages: [] }))).toBe('low');
  });

  it('returns low for TIA only (without AST)', () => {
    expect(computeBaseConfidence(evidence({ sourceStages: ['tia'] }))).toBe('low');
  });
});

// ─── applyConfidenceCaps ─────────────────────────────────────────────────────

describe('applyConfidenceCaps', () => {
  it('caps high to medium when mock boundary is present', () => {
    expect(applyConfidenceCaps('high', evidence({ hasMockBoundary: true }))).toBe('medium');
  });

  it('caps high to medium when partial resolution is present', () => {
    expect(applyConfidenceCaps('high', evidence({ hasPartialResolution: true }))).toBe('medium');
  });

  it('caps high to medium when symbolic URL is present', () => {
    expect(applyConfidenceCaps('high', evidence({ hasSymbolicUrl: true }))).toBe('medium');
  });

  it('caps high to medium when static-only mode is active', () => {
    expect(applyConfidenceCaps('high', evidence({ isStaticOnlyMode: true }))).toBe('medium');
  });

  it('applies multiple caps simultaneously (all active)', () => {
    expect(
      applyConfidenceCaps(
        'verified',
        evidence({
          hasMockBoundary: true,
          hasPartialResolution: true,
          hasSymbolicUrl: true,
          isStaticOnlyMode: true,
        }),
      ),
    ).toBe('medium');
  });

  it('does not alter level when no caps apply', () => {
    expect(applyConfidenceCaps('high', evidence())).toBe('high');
    expect(applyConfidenceCaps('verified', evidence())).toBe('verified');
  });

  it('does not lower a level that is already at or below the cap', () => {
    expect(applyConfidenceCaps('low', evidence({ hasMockBoundary: true }))).toBe('low');
    expect(applyConfidenceCaps('medium', evidence({ hasMockBoundary: true }))).toBe('medium');
  });
});

// ─── computeConfidence (end-to-end) ──────────────────────────────────────────

describe('computeConfidence (end-to-end)', () => {
  it('AST + TIA + mock boundary results in medium (not above)', () => {
    expect(
      computeConfidence(
        evidence({
          sourceStages: ['ast', 'tia'],
          hasMockBoundary: true,
        }),
      ),
    ).toBe('medium');
  });

  it('AST + TIA + IAST + partial resolution results in medium (capped from high)', () => {
    expect(
      computeConfidence(
        evidence({
          sourceStages: ['ast', 'tia'],
          hasIastConfirmation: true,
          hasPartialResolution: true,
        }),
      ),
    ).toBe('medium');
  });

  it('AST + TIA + IAST + DAST + assertion + no caps results in verified', () => {
    expect(
      computeConfidence(
        evidence({
          sourceStages: ['ast', 'tia'],
          hasIastConfirmation: true,
          hasDastConfirmation: true,
          hasAssertionConfirmation: true,
        }),
      ),
    ).toBe('verified');
  });

  it('verified is capped to medium when static-only mode is active', () => {
    expect(
      computeConfidence(
        evidence({
          sourceStages: ['ast', 'tia'],
          hasIastConfirmation: true,
          hasDastConfirmation: true,
          hasAssertionConfirmation: true,
          isStaticOnlyMode: true,
        }),
      ),
    ).toBe('medium');
  });
});

// ─── capConfidence ───────────────────────────────────────────────────────────

describe('capConfidence', () => {
  it('caps low at medium — returns low (already below cap)', () => {
    expect(capConfidence('low', 'medium')).toBe('low');
  });

  it('caps high at medium — returns medium', () => {
    expect(capConfidence('high', 'medium')).toBe('medium');
  });

  it('caps verified at medium — returns medium', () => {
    expect(capConfidence('verified', 'medium')).toBe('medium');
  });

  it('caps medium at medium — returns medium (equal)', () => {
    expect(capConfidence('medium', 'medium')).toBe('medium');
  });

  it('caps low at low — returns low', () => {
    expect(capConfidence('low', 'low')).toBe('low');
  });

  it('does not cap when current is below max', () => {
    expect(capConfidence('medium', 'high')).toBe('medium');
    expect(capConfidence('low', 'verified')).toBe('low');
  });
});

// ─── compareConfidence ───────────────────────────────────────────────────────

describe('compareConfidence', () => {
  it('low < medium', () => {
    expect(compareConfidence('low', 'medium')).toBeLessThan(0);
  });

  it('medium < high', () => {
    expect(compareConfidence('medium', 'high')).toBeLessThan(0);
  });

  it('high < verified', () => {
    expect(compareConfidence('high', 'verified')).toBeLessThan(0);
  });

  it('equal levels return 0', () => {
    expect(compareConfidence('medium', 'medium')).toBe(0);
    expect(compareConfidence('verified', 'verified')).toBe(0);
  });

  it('higher > lower returns positive', () => {
    expect(compareConfidence('verified', 'low')).toBeGreaterThan(0);
    expect(compareConfidence('high', 'medium')).toBeGreaterThan(0);
  });

  it('full ordering: low < medium < high < verified', () => {
    const levels: PipelineConfidence[] = ['low', 'medium', 'high', 'verified'];
    for (let i = 0; i < levels.length; i++) {
      for (let j = i + 1; j < levels.length; j++) {
        expect(compareConfidence(levels[i], levels[j])).toBeLessThan(0);
        expect(compareConfidence(levels[j], levels[i])).toBeGreaterThan(0);
      }
    }
  });
});

// ─── minConfidence ───────────────────────────────────────────────────────────

describe('minConfidence (RULE-06)', () => {
  it('returns low for an empty array', () => {
    expect(minConfidence([])).toBe('low');
  });

  it('returns the single element for a one-element array', () => {
    expect(minConfidence(['high'])).toBe('high');
    expect(minConfidence(['verified'])).toBe('verified');
  });

  it('returns the weakest level from a mixed array', () => {
    expect(minConfidence(['high', 'medium', 'verified'])).toBe('medium');
  });

  it('returns low when low is present among higher levels', () => {
    expect(minConfidence(['verified', 'high', 'low', 'medium'])).toBe('low');
  });

  it('returns verified when all are verified', () => {
    expect(minConfidence(['verified', 'verified', 'verified'])).toBe('verified');
  });
});

// ─── hasMockBoundaryOnPath ───────────────────────────────────────────────────

describe('hasMockBoundaryOnPath', () => {
  it('returns true when path contains a mock-boundary node', () => {
    const graph = new CoverageKnowledgeGraph();
    graph.addNode(makeNode('a', 'test-case', 'tia'));
    graph.addNode(makeNode('b', 'mock-boundary', 'tia'));
    graph.addNode(makeNode('c', 'endpoint', 'ast'));

    expect(hasMockBoundaryOnPath(graph, ['a', 'b', 'c'])).toBe(true);
  });

  it('returns false when path has no mock-boundary node', () => {
    const graph = new CoverageKnowledgeGraph();
    graph.addNode(makeNode('a', 'test-case', 'tia'));
    graph.addNode(makeNode('b', 'controller', 'ast'));
    graph.addNode(makeNode('c', 'endpoint', 'ast'));

    expect(hasMockBoundaryOnPath(graph, ['a', 'b', 'c'])).toBe(false);
  });

  it('returns false for an empty path', () => {
    const graph = new CoverageKnowledgeGraph();
    expect(hasMockBoundaryOnPath(graph, [])).toBe(false);
  });

  it('returns false when node ids do not exist in the graph', () => {
    const graph = new CoverageKnowledgeGraph();
    expect(hasMockBoundaryOnPath(graph, ['nonexistent'])).toBe(false);
  });
});

// ─── hasPartialResolution ────────────────────────────────────────────────────

describe('hasPartialResolution', () => {
  it('returns true when a node has resolution:partial metadata', () => {
    const graph = new CoverageKnowledgeGraph();
    graph.addNode(makeNode('a', 'endpoint', 'ast', { resolution: 'partial' }));
    graph.addNode(makeNode('b', 'controller', 'ast'));

    expect(hasPartialResolution(graph, ['a', 'b'])).toBe(true);
  });

  it('returns false when no node has resolution:partial metadata', () => {
    const graph = new CoverageKnowledgeGraph();
    graph.addNode(makeNode('a', 'endpoint', 'ast', { resolution: 'full' }));
    graph.addNode(makeNode('b', 'controller', 'ast'));

    expect(hasPartialResolution(graph, ['a', 'b'])).toBe(false);
  });

  it('returns false for an empty path', () => {
    const graph = new CoverageKnowledgeGraph();
    expect(hasPartialResolution(graph, [])).toBe(false);
  });

  it('returns false when node ids do not exist in the graph', () => {
    const graph = new CoverageKnowledgeGraph();
    expect(hasPartialResolution(graph, ['nonexistent'])).toBe(false);
  });

  it('detects partial resolution among multiple nodes', () => {
    const graph = new CoverageKnowledgeGraph();
    graph.addNode(makeNode('a', 'endpoint', 'ast'));
    graph.addNode(makeNode('b', 'controller', 'ast', { resolution: 'partial' }));
    graph.addNode(makeNode('c', 'service', 'ast'));

    expect(hasPartialResolution(graph, ['a', 'b', 'c'])).toBe(true);
  });
});

// ─── buildConfidenceEvidence ─────────────────────────────────────────────────

describe('buildConfidenceEvidence', () => {
  it('builds evidence from a graph path with mixed node types', () => {
    const graph = new CoverageKnowledgeGraph();

    // AST node
    graph.addNode(makeNode('n1', 'endpoint', 'ast'));
    // TIA node
    graph.addNode(makeNode('n2', 'test-case', 'tia'));
    // IAST runtime event
    graph.addNode(makeNode('n3', 'runtime-event', 'iast'));
    // DAST node
    graph.addNode(makeNode('n4', 'endpoint', 'dast'));
    // Assertion node
    graph.addNode(makeNode('n5', 'assertion', 'tia'));

    const ev = buildConfidenceEvidence(graph, ['n1', 'n2', 'n3', 'n4', 'n5'], false);

    expect(ev.sourceStages).toContain('ast');
    expect(ev.sourceStages).toContain('tia');
    expect(ev.sourceStages).toContain('iast');
    expect(ev.sourceStages).toContain('dast');
    expect(ev.hasIastConfirmation).toBe(true);
    expect(ev.hasDastConfirmation).toBe(true);
    expect(ev.hasAssertionConfirmation).toBe(true);
    expect(ev.hasMockBoundary).toBe(false);
    expect(ev.hasPartialResolution).toBe(false);
    expect(ev.hasSymbolicUrl).toBe(false);
    expect(ev.isStaticOnlyMode).toBe(false);
  });

  it('detects mock boundary on path', () => {
    const graph = new CoverageKnowledgeGraph();
    graph.addNode(makeNode('n1', 'mock-boundary', 'tia'));

    const ev = buildConfidenceEvidence(graph, ['n1'], false);
    expect(ev.hasMockBoundary).toBe(true);
  });

  it('detects partial resolution metadata', () => {
    const graph = new CoverageKnowledgeGraph();
    graph.addNode(makeNode('n1', 'endpoint', 'ast', { resolution: 'partial' }));

    const ev = buildConfidenceEvidence(graph, ['n1'], false);
    expect(ev.hasPartialResolution).toBe(true);
  });

  it('detects symbolic URL metadata', () => {
    const graph = new CoverageKnowledgeGraph();
    graph.addNode(makeNode('n1', 'endpoint', 'ast', { urlResolution: 'symbolic' }));

    const ev = buildConfidenceEvidence(graph, ['n1'], false);
    expect(ev.hasSymbolicUrl).toBe(true);
  });

  it('passes through isStaticOnlyMode flag', () => {
    const graph = new CoverageKnowledgeGraph();
    graph.addNode(makeNode('n1', 'endpoint', 'ast'));

    const ev = buildConfidenceEvidence(graph, ['n1'], true);
    expect(ev.isStaticOnlyMode).toBe(true);
  });

  it('handles missing node ids gracefully (skips them)', () => {
    const graph = new CoverageKnowledgeGraph();
    graph.addNode(makeNode('n1', 'endpoint', 'ast'));

    const ev = buildConfidenceEvidence(graph, ['n1', 'missing1', 'missing2'], false);
    expect(ev.sourceStages).toEqual(['ast']);
  });

  it('deduplicates source stages', () => {
    const graph = new CoverageKnowledgeGraph();
    graph.addNode(makeNode('n1', 'endpoint', 'ast'));
    graph.addNode(makeNode('n2', 'controller', 'ast'));

    const ev = buildConfidenceEvidence(graph, ['n1', 'n2'], false);
    const astCount = ev.sourceStages.filter((s) => s === 'ast').length;
    expect(astCount).toBe(1);
  });

  it('returns empty-like evidence for an empty path', () => {
    const graph = new CoverageKnowledgeGraph();

    const ev = buildConfidenceEvidence(graph, [], false);
    expect(ev.sourceStages).toEqual([]);
    expect(ev.hasIastConfirmation).toBe(false);
    expect(ev.hasDastConfirmation).toBe(false);
    expect(ev.hasAssertionConfirmation).toBe(false);
    expect(ev.hasMockBoundary).toBe(false);
    expect(ev.hasPartialResolution).toBe(false);
    expect(ev.hasSymbolicUrl).toBe(false);
  });

  it('integrates with computeConfidence for end-to-end scoring', () => {
    const graph = new CoverageKnowledgeGraph();
    graph.addNode(makeNode('n1', 'endpoint', 'ast'));
    graph.addNode(makeNode('n2', 'test-case', 'tia'));
    graph.addNode(makeNode('n3', 'runtime-event', 'iast'));
    graph.addNode(makeNode('n4', 'endpoint', 'dast'));
    graph.addNode(makeNode('n5', 'assertion', 'tia'));

    const ev = buildConfidenceEvidence(graph, ['n1', 'n2', 'n3', 'n4', 'n5'], false);
    const confidence = computeConfidence(ev);
    expect(confidence).toBe('verified');
  });

  it('end-to-end: mock boundary caps score to medium', () => {
    const graph = new CoverageKnowledgeGraph();
    graph.addNode(makeNode('n1', 'endpoint', 'ast'));
    graph.addNode(makeNode('n2', 'test-case', 'tia'));
    graph.addNode(makeNode('n3', 'runtime-event', 'iast'));
    graph.addNode(makeNode('n4', 'mock-boundary', 'tia'));

    const ev = buildConfidenceEvidence(graph, ['n1', 'n2', 'n3', 'n4'], false);
    const confidence = computeConfidence(ev);
    // Base would be high (AST + TIA + IAST), but mock boundary caps to medium
    expect(confidence).toBe('medium');
  });
});
