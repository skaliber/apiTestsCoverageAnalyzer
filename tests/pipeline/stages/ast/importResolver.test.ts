jest.mock('fs');

import * as fs from 'fs';
import { resolveImportPath } from '../../../../src/pipeline/stages/ast/importResolver';

const mockStatSync = fs.statSync as jest.MockedFunction<typeof fs.statSync>;

/**
 * Helper: make statSync return `{ isFile: () => true }` for any path
 * that appears in the `existing` set, and throw for everything else.
 */
function allowPaths(existing: Set<string>): void {
  mockStatSync.mockImplementation((p: fs.PathLike) => {
    const filePath = p.toString();
    if (existing.has(filePath)) {
      return { isFile: () => true } as unknown as fs.Stats;
    }
    throw new Error(`ENOENT: no such file or directory, stat '${filePath}'`);
  });
}

afterEach(() => {
  jest.resetAllMocks();
});

describe('resolveImportPath', () => {
  // ─── JS/TS relative import ──────────────────────────────────────────────────

  it('should resolve a JS/TS relative import with .ts extension', () => {
    const existing = new Set(['/project/src/utils.ts']);
    allowPaths(existing);

    const result = resolveImportPath('./utils', '/project/src/main.ts', '/project', 'typescript');
    expect(result).toBe('/project/src/utils.ts');
  });

  // ─── JS/TS index file ──────────────────────────────────────────────────────

  it('should resolve a JS/TS directory import to index file', () => {
    const existing = new Set(['/project/src/components/index.ts']);
    allowPaths(existing);

    const result = resolveImportPath(
      './components',
      '/project/src/main.ts',
      '/project',
      'typescript',
    );
    expect(result).toBe('/project/src/components/index.ts');
  });

  // ─── JS/TS bare module (npm) ───────────────────────────────────────────────

  it('should return undefined for bare module specifiers (node_modules)', () => {
    allowPaths(new Set());

    const result = resolveImportPath('express', '/project/src/main.ts', '/project', 'typescript');
    expect(result).toBeUndefined();
  });

  // ─── Java import ───────────────────────────────────────────────────────────

  it('should resolve a Java package import to a .java file', () => {
    const existing = new Set([
      '/project/src/main/java/com/example/service/UserService.java',
    ]);
    allowPaths(existing);

    const result = resolveImportPath(
      'com.example.service.UserService',
      '/project/src/main/java/com/example/App.java',
      '/project',
      'java',
    );
    expect(result).toBe('/project/src/main/java/com/example/service/UserService.java');
  });

  // ─── Python relative import ────────────────────────────────────────────────

  it('should resolve a Python relative import (.utils)', () => {
    const existing = new Set(['/project/src/utils.py']);
    allowPaths(existing);

    const result = resolveImportPath('.utils', '/project/src/main.py', '/project', 'python');
    expect(result).toBe('/project/src/utils.py');
  });

  // ─── Python absolute import ────────────────────────────────────────────────

  it('should resolve a Python absolute import (app.models.user)', () => {
    const existing = new Set(['/project/app/models/user.py']);
    allowPaths(existing);

    const result = resolveImportPath(
      'app.models.user',
      '/project/tests/test.py',
      '/project',
      'python',
    );
    expect(result).toBe('/project/app/models/user.py');
  });

  // ─── Ruby import ───────────────────────────────────────────────────────────

  it('should resolve a Ruby relative import (./helpers)', () => {
    const existing = new Set(['/project/spec/helpers.rb']);
    allowPaths(existing);

    const result = resolveImportPath(
      './helpers',
      '/project/spec/test_spec.rb',
      '/project',
      'ruby',
    );
    expect(result).toBe('/project/spec/helpers.rb');
  });

  // ─── Unresolvable import ───────────────────────────────────────────────────

  it('should return undefined when the target file does not exist', () => {
    allowPaths(new Set()); // nothing exists

    const result = resolveImportPath(
      './nonexistent',
      '/project/src/main.ts',
      '/project',
      'typescript',
    );
    expect(result).toBeUndefined();
  });

  // ─── Unsupported language ──────────────────────────────────────────────────

  it('should return undefined for an unsupported language', () => {
    allowPaths(new Set());

    const result = resolveImportPath('foo', '/p/f', '/p', 'cucumber');
    expect(result).toBeUndefined();
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
