/**
 * Unit tests for the metric evaluation model.
 *
 * Covers all four MetricStatus values (PASS / FAIL / SKIPPED / N/A),
 * KNOWN_METRIC_TYPES ordering, and the critical invariants:
 *   - totalItems === 0 → always N/A, never PASS
 *   - ⚠️ PASS does not appear in any rendered output
 */

import { evaluateMetrics, KNOWN_METRIC_TYPES } from '../src/summary/evaluateMetrics';
import { metricStatusCell, renderInterpretationSection } from '../src/summary/markdownRenderer';
import type { CoverageResult } from '../src/reporting';
import type { QualityGateResult } from '../src/qualityGate';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeResult(
  type: string,
  percent: number,
  total = 10,
): CoverageResult {
  return {
    type,
    totalItems: total,
    coveredItems: Math.round((percent / 100) * total),
    coveragePercent: percent,
    details: {},
  };
}

function makeGate(
  passed: boolean,
  failures: Array<{ category: string; expected: number; actual: number; gap: number }> = [],
): QualityGateResult {
  return {
    passed,
    threshold: 80,
    actual: Object.fromEntries(failures.map((f) => [f.category, f.actual])),
    failures,
  };
}

// ─── evaluateMetrics – PASS ───────────────────────────────────────────────────

describe('evaluateMetrics – PASS', () => {
  it('emits PASS when threshold is met', () => {
    const results = [makeResult('endpoint', 100)];
    const thresholds = { endpoint: 80 };
    const gate = makeGate(true);
    const metrics = evaluateMetrics(results, thresholds, gate);
    const ep = metrics.find((m) => m.category === 'endpoint')!;
    expect(ep.status).toBe('PASS');
    expect(ep.executed).toBe(true);
    expect(ep.applicable).toBe(true);
  });

  it('PASS row does not contain ⚠️', () => {
    const results = [makeResult('security', 100)];
    const thresholds = { security: 90 };
    const gate = makeGate(true);
    const metrics = evaluateMetrics(results, thresholds, gate);
    const cell = metricStatusCell(metrics.find((m) => m.category === 'security')!.status);
    expect(cell).not.toContain('⚠️');
    expect(cell).toBe('✅ PASS');
  });
});

// ─── evaluateMetrics – FAIL ───────────────────────────────────────────────────

describe('evaluateMetrics – FAIL', () => {
  it('emits FAIL when threshold is missed', () => {
    const results = [makeResult('business', 50)];
    const thresholds = { business: 80 };
    const gate = makeGate(false, [{ category: 'business', expected: 80, actual: 50, gap: 30 }]);
    const metrics = evaluateMetrics(results, thresholds, gate);
    const biz = metrics.find((m) => m.category === 'business')!;
    expect(biz.status).toBe('FAIL');
    expect(biz.reason).toContain('50.00%');
    expect(biz.reason).toContain('80.00%');
  });

  it('FAIL row contains ❌', () => {
    const results = [makeResult('parameter', 30)];
    const thresholds = { parameter: 80 };
    const gate = makeGate(false, [{ category: 'parameter', expected: 80, actual: 30, gap: 50 }]);
    const metrics = evaluateMetrics(results, thresholds, gate);
    const cell = metricStatusCell(metrics.find((m) => m.category === 'parameter')!.status);
    expect(cell).toBe('❌ FAIL');
  });
});

// ─── evaluateMetrics – N/A ────────────────────────────────────────────────────

describe('evaluateMetrics – N/A', () => {
  it('emits N/A when totalItems === 0 (even with threshold configured)', () => {
    const results = [makeResult('error', 0, 0)];   // 0 items
    const thresholds = { error: 0 };
    const gate = makeGate(true);
    const metrics = evaluateMetrics(results, thresholds, gate);
    const err = metrics.find((m) => m.category === 'error')!;
    expect(err.status).toBe('N/A');
    expect(err.applicable).toBe(false);
  });

  it('N/A when totalItems === 0 does not produce ✅ PASS', () => {
    const results = [makeResult('error', 0, 0)];
    const thresholds = { error: 0 };
    const gate = makeGate(true);
    const metrics = evaluateMetrics(results, thresholds, gate);
    const cell = metricStatusCell(metrics.find((m) => m.category === 'error')!.status);
    expect(cell).not.toContain('✅ PASS');
    expect(cell).not.toContain('⚠️ PASS');
    expect(cell).toBe('— N/A');
  });

  it('emits N/A when metric ran but has no threshold', () => {
    const results = [makeResult('integration', 100)];
    const thresholds: Record<string, number | undefined> = {};   // no threshold
    const gate = makeGate(true);
    const metrics = evaluateMetrics(results, thresholds, gate);
    const intg = metrics.find((m) => m.category === 'integration')!;
    expect(intg.status).toBe('N/A');
    expect(intg.executed).toBe(true);
    expect(intg.reason).toContain('No threshold');
  });
});

// ─── evaluateMetrics – SKIPPED ────────────────────────────────────────────────

describe('evaluateMetrics – SKIPPED', () => {
  it('emits SKIPPED for known types not present in results', () => {
    const results = [makeResult('endpoint', 100)];
    const thresholds = { endpoint: 80 };
    const gate = makeGate(true);
    const metrics = evaluateMetrics(results, thresholds, gate);

    // All 8 remaining known types should be SKIPPED
    const skipped = metrics.filter((m) => m.status === 'SKIPPED');
    expect(skipped.length).toBe(KNOWN_METRIC_TYPES.length - 1);
    expect(skipped.every((m) => !m.executed)).toBe(true);
  });

  it('SKIPPED row renders with ⏭', () => {
    const cell = metricStatusCell('SKIPPED');
    expect(cell).toBe('⏭ SKIPPED');
  });
});

// ─── KNOWN_METRIC_TYPES ordering ──────────────────────────────────────────────

describe('KNOWN_METRIC_TYPES ordering', () => {
  it('returns all 9 known types in canonical order', () => {
    expect(KNOWN_METRIC_TYPES).toEqual([
      'endpoint', 'parameter', 'business', 'integration',
      'error', 'security', 'performance', 'resilience', 'compatibility',
    ]);
  });

  it('evaluateMetrics output has 9 entries for empty results', () => {
    const metrics = evaluateMetrics([], {}, undefined);
    expect(metrics.length).toBe(9);
  });

  it('evaluateMetrics output respects canonical order', () => {
    const results = [makeResult('security', 100), makeResult('endpoint', 100)];
    const metrics = evaluateMetrics(results, {}, undefined);
    const types = metrics.map((m) => m.category);
    expect(types.indexOf('endpoint')).toBeLessThan(types.indexOf('security'));
  });

  it('appends unknown/plugin types after known types', () => {
    const results = [makeResult('custom-plugin', 100)];
    const metrics = evaluateMetrics(results, {}, undefined);
    const knownCount = KNOWN_METRIC_TYPES.length;
    expect(metrics.length).toBe(knownCount + 1);
    expect(metrics[knownCount].category).toBe('custom-plugin');
  });
});

// ─── Mixed fixture ────────────────────────────────────────────────────────────

describe('evaluateMetrics – mixed fixture', () => {
  it('endpoint=PASS, error=N/A(no items), parameter=SKIPPED, business=FAIL', () => {
    const results = [
      makeResult('endpoint', 100, 10),   // PASS
      makeResult('error', 0, 0),         // N/A — no items
      makeResult('business', 50, 10),    // FAIL
      // parameter is absent → SKIPPED
    ];
    const thresholds: Record<string, number | undefined> = {
      endpoint: 80,
      error: 0,
      business: 80,
    };
    const gate = makeGate(false, [{ category: 'business', expected: 80, actual: 50, gap: 30 }]);

    const metrics = evaluateMetrics(results, thresholds, gate);

    expect(metrics.find((m) => m.category === 'endpoint')!.status).toBe('PASS');
    expect(metrics.find((m) => m.category === 'error')!.status).toBe('N/A');
    expect(metrics.find((m) => m.category === 'business')!.status).toBe('FAIL');
    expect(metrics.find((m) => m.category === 'parameter')!.status).toBe('SKIPPED');
  });
});

// ─── Critical invariant: ⚠️ never appears ─────────────────────────────────────

describe('critical invariant: ⚠️ never appears', () => {
  it('metricStatusCell never returns ⚠️ PASS', () => {
    const statuses = ['PASS', 'FAIL', 'SKIPPED', 'N/A'] as const;
    for (const s of statuses) {
      expect(metricStatusCell(s)).not.toContain('⚠️');
    }
  });

  it('renderInterpretationSection never contains ⚠️ PASS', () => {
    const results = [
      makeResult('endpoint', 100),
      makeResult('error', 0, 0),
    ];
    const thresholds = { endpoint: 80, error: 0 };
    const gate = makeGate(true);
    const metrics = evaluateMetrics(results, thresholds, gate);
    const md = renderInterpretationSection(metrics);
    // Should not contain the literal string ⚠️ PASS
    expect(md).not.toContain('⚠️ PASS');
  });

  it('zero-item metric never shows PASS in cell', () => {
    // Simulate the old ⚠️ PASS scenario: error ran, 0 items, threshold is 0
    const results = [makeResult('error', 0, 0)];
    const thresholds = { error: 0 };
    const gate = makeGate(true);
    const metrics = evaluateMetrics(results, thresholds, gate);
    const m = metrics.find((m) => m.category === 'error')!;
    const cell = metricStatusCell(m.status);
    expect(cell).not.toContain('PASS');
    expect(cell).toBe('— N/A');
  });
});
