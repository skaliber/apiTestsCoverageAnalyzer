import {
  mergeConfidence,
  mergeTestEvidence,
  mergeSourceStages,
  determineCoverageClass,
  coverageClassRank,
  mergeCoverageClass,
} from '../../../../src/pipeline/stages/merge/mergeRules';

describe('mergeRules', () => {
  // ─── mergeConfidence ──────────────────────────────────────────────────

  describe('mergeConfidence', () => {
    it('should raise confidence from low to high', () => {
      expect(mergeConfidence('low', 'high')).toBe('high');
    });

    it('should never demote confidence', () => {
      expect(mergeConfidence('high', 'low')).toBe('high');
    });

    it('should return same level when both match', () => {
      expect(mergeConfidence('medium', 'medium')).toBe('medium');
    });

    it('should raise to verified', () => {
      expect(mergeConfidence('high', 'verified')).toBe('verified');
    });
  });

  // ─── mergeTestEvidence ────────────────────────────────────────────────

  describe('mergeTestEvidence', () => {
    it('should deduplicate test evidence arrays', () => {
      const result = mergeTestEvidence(['a', 'b'], ['b', 'c']);
      expect(result).toEqual(['a', 'b', 'c']);
    });
  });

  // ─── mergeSourceStages ────────────────────────────────────────────────

  describe('mergeSourceStages', () => {
    it('should deduplicate source stages', () => {
      const result = mergeSourceStages(['ast'], ['ast', 'tia']);
      expect(result).toEqual(['ast', 'tia']);
    });
  });

  // ─── determineCoverageClass ───────────────────────────────────────────

  describe('determineCoverageClass', () => {
    it('should return mock-covered when mock boundary exists', () => {
      expect(determineCoverageClass('unit', true)).toBe('mock-covered');
    });

    it('should return unit-covered for unit layer without mock boundary', () => {
      expect(determineCoverageClass('unit', false)).toBe('unit-covered');
    });

    it('should return e2e-covered for e2e layer without mock boundary', () => {
      expect(determineCoverageClass('e2e', false)).toBe('e2e-covered');
    });

    it('should return uncovered when no test layer is provided', () => {
      expect(determineCoverageClass(undefined, false)).toBe('uncovered');
    });
  });

  // ─── coverageClassRank ────────────────────────────────────────────────

  describe('coverageClassRank', () => {
    it('should return correct ranks for coverage classes', () => {
      expect(coverageClassRank('uncovered')).toBe(0);
      expect(coverageClassRank('mock-covered')).toBe(1);
      expect(coverageClassRank('e2e-covered')).toBe(6);
    });
  });

  // ─── mergeCoverageClass ───────────────────────────────────────────────

  describe('mergeCoverageClass', () => {
    it('should raise coverage class to higher rank', () => {
      expect(mergeCoverageClass('unit-covered', 'e2e-covered')).toBe('e2e-covered');
    });

    it('should never demote coverage class', () => {
      expect(mergeCoverageClass('e2e-covered', 'unit-covered')).toBe('e2e-covered');
    });
  });
});
