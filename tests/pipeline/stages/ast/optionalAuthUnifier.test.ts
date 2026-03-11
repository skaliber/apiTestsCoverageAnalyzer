import {
  unifyAuthClassification,
  detectAuthCoverageGaps,
} from '../../../../src/pipeline/stages/ast/optionalAuthUnifier';

describe('unifyAuthClassification', () => {
  // Flask patterns
  it('classifies Flask @jwt_required as required auth', () => {
    const result = unifyAuthClassification('flask', '@jwt_required');
    expect(result).toBeDefined();
    expect(result!.required).toBe(true);
    expect(result!.optional).toBe(false);
  });

  it('classifies Flask @jwt_optional as optional auth', () => {
    const result = unifyAuthClassification('flask', '@jwt_optional');
    expect(result).toBeDefined();
    expect(result!.required).toBe(false);
    expect(result!.optional).toBe(true);
  });

  it('classifies Flask @login_required as session auth', () => {
    const result = unifyAuthClassification('flask', '@login_required');
    expect(result).toBeDefined();
    expect(result!.type).toBe('session');
    expect(result!.required).toBe(true);
  });

  // Express patterns
  it('classifies Express auth.required as required auth', () => {
    const result = unifyAuthClassification('express', 'auth.required');
    expect(result).toBeDefined();
    expect(result!.required).toBe(true);
  });

  it('classifies Express auth.optional as optional auth', () => {
    const result = unifyAuthClassification('express', 'auth.optional');
    expect(result).toBeDefined();
    expect(result!.optional).toBe(true);
  });

  it('classifies Express passport.authenticate as required auth', () => {
    const result = unifyAuthClassification('express', 'passport.authenticate');
    expect(result).toBeDefined();
    expect(result!.required).toBe(true);
  });

  // HapiJS patterns
  it('classifies HapiJS auth mode try as optional auth', () => {
    const result = unifyAuthClassification('hapi', 'auth: { mode: try }');
    expect(result).toBeDefined();
    expect(result!.optional).toBe(true);
  });

  it('classifies HapiJS auth jwt as required auth', () => {
    const result = unifyAuthClassification('hapi', 'auth: jwt');
    expect(result).toBeDefined();
    expect(result!.required).toBe(true);
  });

  // Spring patterns
  it('classifies Spring @PreAuthorize as required auth', () => {
    const result = unifyAuthClassification('spring', '@PreAuthorize');
    expect(result).toBeDefined();
    expect(result!.required).toBe(true);
  });

  // Unknown patterns
  it('returns undefined for unknown patterns', () => {
    expect(unifyAuthClassification('unknown', 'random-pattern')).toBeUndefined();
  });
});

describe('detectAuthCoverageGaps', () => {
  it('detects missing 401 test for required auth endpoint', () => {
    const endpoints = [
      {
        path: '/api/articles',
        security: { type: 'jwt' as const, required: true, optional: false },
        sourceFile: '/fake/routes.py',
      },
    ];
    const testPaths = new Set<string>();

    const gaps = detectAuthCoverageGaps(endpoints, testPaths);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].type).toBe('missing-401-test');
  });

  it('detects missing dual-path test for optional auth endpoint', () => {
    const endpoints = [
      {
        path: '/api/articles',
        security: { type: 'jwt' as const, required: false, optional: true },
        sourceFile: '/fake/routes.py',
      },
    ];
    const testPaths = new Set<string>();

    const gaps = detectAuthCoverageGaps(endpoints, testPaths);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].type).toBe('missing-optional-dual-path');
  });

  it('returns no gaps when tests cover the endpoint', () => {
    const endpoints = [
      {
        path: '/api/articles',
        security: { type: 'jwt' as const, required: true, optional: false },
        sourceFile: '/fake/routes.py',
      },
    ];
    const testPaths = new Set(['/api/articles']);

    const gaps = detectAuthCoverageGaps(endpoints, testPaths);
    expect(gaps).toHaveLength(0);
  });

  it('ignores endpoints without security classification', () => {
    const endpoints = [
      { path: '/api/public', sourceFile: '/fake/routes.py' },
    ];
    const testPaths = new Set<string>();

    const gaps = detectAuthCoverageGaps(endpoints, testPaths);
    expect(gaps).toHaveLength(0);
  });
});
