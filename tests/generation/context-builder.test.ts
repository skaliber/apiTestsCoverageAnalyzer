/**
 * Feature 28 — Tests for ContextBuilder
 */

import { buildContext } from '../../src/generation/context-builder';
import type { DetectedGap } from '../../src/generation/types';

const SAMPLE_GAP: DetectedGap = {
  id: 'endpoint:POST:/api/articles:uncovered',
  type: 'endpoint',
  priority: 'P1',
  riskScore: 85,
  endpoint: {
    method: 'POST',
    path: '/api/articles',
    operationId: 'createArticle',
    summary: 'Create Article',
    auth: {
      required: true,
      optional: false,
      type: 'jwt',
      headerName: 'Authorization',
      scheme: 'Bearer',
    },
  },
  parameters: [
    {
      name: 'title',
      in: 'body',
      required: true,
      schema: { type: 'string', minLength: 1 },
      missingCases: ['missing-required'],
    },
  ],
  responses: [
    { statusCode: 201, description: 'Created' },
    { statusCode: 401, description: 'Unauthorized' },
  ],
};

const DISCOVERY = {
  name: 'test-api',
  language: 'typescript',
  framework: 'express',
  testFramework: 'jest',
  baseUrl: 'http://localhost:3000',
  projectRoot: '/project',
};

describe('ContextBuilder', () => {
  describe('buildContext', () => {
    it('should build a valid GenerationContext from a DetectedGap', () => {
      const ctx = buildContext(SAMPLE_GAP, '/project/generated-tests/api/articles.test.ts', DISCOVERY);

      expect(ctx.gap.id).toBe(SAMPLE_GAP.id);
      expect(ctx.gap.type).toBe('endpoint');
      expect(ctx.gap.priority).toBe('P1');
      expect(ctx.gap.riskScore).toBe(85);
    });

    it('should normalize OpenAPI path params to Express style', () => {
      const gap: DetectedGap = {
        ...SAMPLE_GAP,
        endpoint: {
          ...SAMPLE_GAP.endpoint,
          path: '/api/articles/{slug}/comments/{id}',
        },
      };

      const ctx = buildContext(gap, '/project/generated-tests/test.ts', DISCOVERY);

      expect(ctx.endpoint.pathNormalized).toBe('/api/articles/:slug/comments/:id');
    });

    it('should preserve original path in endpoint.path', () => {
      const ctx = buildContext(SAMPLE_GAP, '/project/generated-tests/test.ts', DISCOVERY);

      expect(ctx.endpoint.path).toBe('/api/articles');
      expect(ctx.endpoint.pathNormalized).toBe('/api/articles');
    });

    it('should pass through auth config correctly', () => {
      const ctx = buildContext(SAMPLE_GAP, '/project/generated-tests/test.ts', DISCOVERY);

      expect(ctx.endpoint.auth.required).toBe(true);
      expect(ctx.endpoint.auth.type).toBe('jwt');
      expect(ctx.endpoint.auth.scheme).toBe('Bearer');
    });

    it('should build pathParams fixtures for path parameters', () => {
      const gap: DetectedGap = {
        ...SAMPLE_GAP,
        endpoint: {
          ...SAMPLE_GAP.endpoint,
          path: '/api/articles/{slug}',
        },
      };

      const ctx = buildContext(gap, '/project/generated-tests/test.ts', DISCOVERY);

      expect(ctx.fixtures.pathParams).toHaveProperty('slug');
      expect(typeof ctx.fixtures.pathParams['slug']).toBe('string');
    });

    it('should compute import prefix relative to output file location', () => {
      const ctx = buildContext(
        SAMPLE_GAP,
        '/project/generated-tests/api/articles.test.ts',
        DISCOVERY,
      );

      expect(ctx.project.importPrefix).toBeTruthy();
      expect(ctx.project.importPrefix).toContain('..');
    });

    it('should include project metadata in context', () => {
      const ctx = buildContext(SAMPLE_GAP, '/project/generated-tests/test.ts', DISCOVERY);

      expect(ctx.project.name).toBe('test-api');
      expect(ctx.project.language).toBe('typescript');
      expect(ctx.project.testFramework).toBe('jest');
    });
  });
});

describe('ContextBuilder – edge cases and error handling', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should handle gap with empty/no parameters array (boundary: min params)', () => {
    const gap: DetectedGap = { ...SAMPLE_GAP, parameters: [] };
    const ctx = buildContext(gap, '/project/generated-tests/test.ts', DISCOVERY);
    expect(Array.isArray(ctx.parameters)).toBe(true);
    expect(ctx.parameters).toHaveLength(0);
  });

  it('should handle gap with empty/no responses array (boundary: null status codes)', () => {
    const gap: DetectedGap = { ...SAMPLE_GAP, responses: [] };
    const ctx = buildContext(gap, '/project/generated-tests/test.ts', DISCOVERY);
    expect(Array.isArray(ctx.responses)).toBe(true);
    expect(ctx.responses).toHaveLength(0);
  });

  it('should handle missing/undefined auth on endpoint without throwing', () => {
    const gap: DetectedGap = {
      ...SAMPLE_GAP,
      endpoint: {
        ...SAMPLE_GAP.endpoint,
        auth: undefined as any,
      },
    };
    expect(() => buildContext(gap, '/project/generated-tests/test.ts', DISCOVERY)).not.toThrow();
  });

  it('should handle invalid path param syntax with no braces (boundary: plain path)', () => {
    const gap: DetectedGap = {
      ...SAMPLE_GAP,
      endpoint: { ...SAMPLE_GAP.endpoint, path: '/api/articles' },
    };
    const ctx = buildContext(gap, '/project/generated-tests/test.ts', DISCOVERY);
    expect(ctx.endpoint.pathNormalized).toBe('/api/articles');
    expect(ctx.fixtures.pathParams).toEqual({});
  });

  it('should set authToken fixture to non-empty string when auth is required', () => {
    const ctx = buildContext(SAMPLE_GAP, '/project/generated-tests/test.ts', DISCOVERY);
    expect(typeof ctx.fixtures.authToken).toBe('string');
    expect(ctx.fixtures.authToken.length).toBeGreaterThan(0);
  });

  it('should set validPayload fixture as an object (not null/undefined)', () => {
    const ctx = buildContext(SAMPLE_GAP, '/project/generated-tests/test.ts', DISCOVERY);
    expect(ctx.fixtures.validPayload).not.toBeNull();
    expect(typeof ctx.fixtures.validPayload).toBe('object');
  });

  it('should handle min boundary riskScore of 0 correctly', () => {
    const gap: DetectedGap = { ...SAMPLE_GAP, riskScore: 0 };
    const ctx = buildContext(gap, '/project/generated-tests/test.ts', DISCOVERY);
    expect(ctx.gap.riskScore).toBe(0);
  });

  it('should handle max boundary riskScore of 100 correctly', () => {
    const gap: DetectedGap = { ...SAMPLE_GAP, riskScore: 100 };
    const ctx = buildContext(gap, '/project/generated-tests/test.ts', DISCOVERY);
    expect(ctx.gap.riskScore).toBe(100);
  });
});
