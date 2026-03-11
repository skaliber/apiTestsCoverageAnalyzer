import { classifyTestLayer } from '../../../../src/pipeline/stages/tia/testLayerClassifier';

describe('classifyTestLayer', () => {
  // ─── e2e ────────────────────────────────────────────────────────────────────

  it('should classify as e2e by directory pattern (cypress)', () => {
    const result = classifyTestLayer('/project/cypress/integration/login.spec.js');
    expect(result.layer).toBe('e2e');
  });

  it('should classify as e2e by content pattern (cy.visit)', () => {
    const result = classifyTestLayer(
      '/project/tests/app.test.ts',
      'cy.visit("/login")',
    );
    expect(result.layer).toBe('e2e');
  });

  // ─── performance ────────────────────────────────────────────────────────────

  it('should classify as performance by directory pattern', () => {
    const result = classifyTestLayer('/project/performance/load.test.ts');
    expect(result.layer).toBe('performance');
  });

  it('should classify as performance by content pattern (k6 import)', () => {
    const result = classifyTestLayer(
      '/project/tests/perf.test.ts',
      'import http from "k6/http"',
    );
    expect(result.layer).toBe('performance');
  });

  // ─── security ───────────────────────────────────────────────────────────────

  it('should classify as security by directory pattern', () => {
    const result = classifyTestLayer('/project/security/xss.test.ts');
    expect(result.layer).toBe('security');
  });

  // ─── api ────────────────────────────────────────────────────────────────────

  it('should classify as api by content pattern (supertest import)', () => {
    const result = classifyTestLayer(
      '/project/tests/users.test.ts',
      'import supertest from "supertest"',
    );
    expect(result.layer).toBe('api');
  });

  // ─── integration ────────────────────────────────────────────────────────────

  it('should classify as integration by content pattern (@SpringBootTest)', () => {
    const result = classifyTestLayer(
      '/project/tests/db.test.ts',
      '@SpringBootTest',
    );
    expect(result.layer).toBe('integration');
  });

  // ─── component ──────────────────────────────────────────────────────────────

  it('should classify as component by content pattern (render + screen)', () => {
    const result = classifyTestLayer(
      '/project/tests/Button.test.tsx',
      'render(<Button/>); screen.getByText',
    );
    expect(result.layer).toBe('component');
  });

  // ─── unit (default) ─────────────────────────────────────────────────────────

  it('should default to unit with low confidence when no signals match', () => {
    const result = classifyTestLayer('/project/tests/utils.test.ts');
    expect(result.layer).toBe('unit');
    expect(result.confidence).toBe('low');
  });

  // ─── confidence ─────────────────────────────────────────────────────────────

  it('should return high confidence when directory AND content signals match', () => {
    const result = classifyTestLayer(
      '/project/cypress/integration/login.spec.js',
      'cy.visit("/login")',
    );
    expect(result.layer).toBe('e2e');
    expect(result.confidence).toBe('high');
  });
});
