import {
  matchesBranchPattern,
  resolveThresholdsForBranch,
  effectiveThresholdForCategory,
  evaluateQualityGate,
  QualityGateConfig,
} from '../src/qualityGate';
import type { CoverageResult } from '../src/reporting';

// ─── helpers ─────────────────────────────────────────────────────────────────

const makeResult = (type: string, percent: number, total = 10): CoverageResult => ({
  type,
  totalItems: total,
  coveredItems: Math.round((percent / 100) * total),
  coveragePercent: percent,
  details: {},
});

// ─── matchesBranchPattern ─────────────────────────────────────────────────────

describe('matchesBranchPattern', () => {
  it('matches exact branch names', () => {
    expect(matchesBranchPattern('main', 'main')).toBe(true);
    expect(matchesBranchPattern('develop', 'main')).toBe(false);
  });

  it('matches wildcard patterns (feature/*)', () => {
    expect(matchesBranchPattern('feature/my-feature', 'feature/*')).toBe(true);
    expect(matchesBranchPattern('main', 'feature/*')).toBe(false);
  });

  it('matches release/* pattern', () => {
    expect(matchesBranchPattern('release/1.0', 'release/*')).toBe(true);
    expect(matchesBranchPattern('releases/1.0', 'release/*')).toBe(false);
  });

  it('matches ** for any depth', () => {
    expect(matchesBranchPattern('a/b/c', 'a/**')).toBe(true);
  });
});

// ─── resolveThresholdsForBranch ───────────────────────────────────────────────

describe('resolveThresholdsForBranch', () => {
  it('returns base thresholds when no branch given', () => {
    const config: QualityGateConfig = {
      thresholds: { endpoint: 80, business: 70 },
    };
    const result = resolveThresholdsForBranch(config);
    expect(result).toEqual({ endpoint: 80, business: 70 });
  });

  it('applies branch-specific overrides', () => {
    const config: QualityGateConfig = {
      thresholds: { global: 100 },
      thresholdsByBranch: {
        'feature/*': { global: 80 },
      },
    };
    const result = resolveThresholdsForBranch(config, 'feature/my-branch');
    expect(result['global']).toBe(80);
  });

  it('keeps base thresholds when branch does not match any pattern', () => {
    const config: QualityGateConfig = {
      thresholds: { global: 100 },
      thresholdsByBranch: {
        'feature/*': { global: 80 },
      },
    };
    const result = resolveThresholdsForBranch(config, 'main');
    expect(result['global']).toBe(100);
  });
});

// ─── effectiveThresholdForCategory ───────────────────────────────────────────

describe('effectiveThresholdForCategory', () => {
  it('returns the category-specific threshold when available', () => {
    expect(effectiveThresholdForCategory({ endpoint: 80, global: 100 }, 'endpoint')).toBe(80);
  });

  it('falls back to global when no category-specific threshold', () => {
    expect(effectiveThresholdForCategory({ global: 90 }, 'business')).toBe(90);
  });

  it('returns undefined when neither category nor global is set', () => {
    expect(effectiveThresholdForCategory({ endpoint: 80 }, 'business')).toBeUndefined();
  });
});

// ─── evaluateQualityGate ──────────────────────────────────────────────────────

describe('evaluateQualityGate', () => {
  describe('default threshold (no config)', () => {
    it('defaults to 100% when no thresholds are configured', () => {
      const results = [makeResult('endpoint', 90)];
      const gate = evaluateQualityGate(results, {});
      expect(gate.passed).toBe(false);
      expect(gate.failures).toHaveLength(1);
      expect(gate.failures[0].category).toBe('endpoint');
      expect(gate.failures[0].expected).toBe(100);
      expect(gate.failures[0].actual).toBe(90);
      expect(gate.failures[0].gap).toBe(10);
    });

    it('passes when all results are at 100%', () => {
      const results = [makeResult('endpoint', 100), makeResult('business', 100)];
      const gate = evaluateQualityGate(results, {});
      expect(gate.passed).toBe(true);
      expect(gate.failures).toHaveLength(0);
    });
  });

  describe('global threshold', () => {
    it('applies global threshold to all categories', () => {
      const results = [makeResult('endpoint', 80), makeResult('business', 77)];
      const config: QualityGateConfig = { thresholds: { global: 75 } };
      const gate = evaluateQualityGate(results, config);
      expect(gate.passed).toBe(true);
    });

    it('fails when a category is below global threshold', () => {
      const results = [makeResult('endpoint', 80), makeResult('business', 60)];
      const config: QualityGateConfig = { thresholds: { global: 75 } };
      const gate = evaluateQualityGate(results, config);
      expect(gate.passed).toBe(false);
      expect(gate.failures).toHaveLength(1);
      expect(gate.failures[0].category).toBe('business');
    });
  });

  describe('per-category thresholds', () => {
    it('applies per-category thresholds', () => {
      const results = [makeResult('endpoint', 80), makeResult('business', 60)];
      const config: QualityGateConfig = {
        thresholds: { endpoint: 80, business: 55 },
      };
      const gate = evaluateQualityGate(results, config);
      expect(gate.passed).toBe(true);
    });

    it('ignores results with no configured threshold', () => {
      const results = [makeResult('endpoint', 10), makeResult('security', 10)];
      const config: QualityGateConfig = { thresholds: { endpoint: 80 } };
      const gate = evaluateQualityGate(results, config);
      expect(gate.failures).toHaveLength(1);
      expect(gate.failures[0].category).toBe('endpoint');
    });
  });

  describe('global threshold with per-category overrides', () => {
    it('uses category override when available, global otherwise', () => {
      const results = [
        makeResult('endpoint', 100),
        makeResult('performance', 85),
        makeResult('business', 95),
      ];
      const config: QualityGateConfig = {
        thresholds: { global: 100, performance: 85 },
      };
      const gate = evaluateQualityGate(results, config);
      // endpoint: 100 >= 100 ✓, performance: 85 >= 85 ✓, business: 95 < 100 ✗
      expect(gate.passed).toBe(false);
      expect(gate.failures).toHaveLength(1);
      expect(gate.failures[0].category).toBe('business');
    });
  });

  describe('branch-aware thresholds', () => {
    it('applies branch-specific thresholds when branch matches', () => {
      const results = [makeResult('endpoint', 75)];
      const config: QualityGateConfig = {
        thresholds: { global: 100 },
        thresholdsByBranch: { 'feature/*': { global: 70 } },
      };
      const gate = evaluateQualityGate(results, config, 'feature/my-feature');
      expect(gate.passed).toBe(true);
    });

    it('uses global threshold when branch does not match', () => {
      const results = [makeResult('endpoint', 75)];
      const config: QualityGateConfig = {
        thresholds: { global: 100 },
        thresholdsByBranch: { 'feature/*': { global: 70 } },
      };
      const gate = evaluateQualityGate(results, config, 'main');
      expect(gate.passed).toBe(false);
    });
  });

  describe('warn mode', () => {
    it('marks as passed even when thresholds are missed in warn mode', () => {
      const results = [makeResult('endpoint', 50)];
      const config: QualityGateConfig = {
        thresholds: { global: 100 },
        qualityGate: { mode: 'warn' },
      };
      const gate = evaluateQualityGate(results, config);
      expect(gate.passed).toBe(true);
      // but failures are still computed
      expect(gate.failures).toHaveLength(1);
    });
  });

  describe('disabled quality gate', () => {
    it('returns passed when gate is disabled regardless of coverage', () => {
      const results = [makeResult('endpoint', 0)];
      const config: QualityGateConfig = {
        qualityGate: { enabled: false },
      };
      const gate = evaluateQualityGate(results, config);
      expect(gate.passed).toBe(true);
      expect(gate.failures).toHaveLength(0);
    });
  });

  describe('result structure', () => {
    it('populates actual coverage map', () => {
      const results = [makeResult('endpoint', 75), makeResult('business', 60)];
      const gate = evaluateQualityGate(results, {});
      expect(gate.actual['endpoint']).toBe(75);
      expect(gate.actual['business']).toBe(60);
    });

    it('returns scalar threshold when only global is set', () => {
      const config: QualityGateConfig = { thresholds: { global: 90 } };
      const gate = evaluateQualityGate([makeResult('endpoint', 90)], config);
      expect(gate.threshold).toBe(90);
    });

    it('includes gap in failure details', () => {
      const results = [makeResult('endpoint', 70)];
      const config: QualityGateConfig = { thresholds: { global: 100 } };
      const gate = evaluateQualityGate(results, config);
      expect(gate.failures[0].gap).toBe(30);
    });
  });
});
