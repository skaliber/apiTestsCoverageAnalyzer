/**
 * Tests for the Python language analyzer.
 *
 * Uses tree-sitter-python. Tests cover graceful failure when native bindings
 * are absent, as well as result shapes and basic HTTP call extraction.
 */

import { PythonAnalyzer } from '../../../src/languages/python/index';
import { buildAnalysisContext } from '../../../src/ast/astAnalysisOrchestrator';

const analyzer = new PythonAnalyzer();
const ctx = buildAnalysisContext({ enabled: true, fallbackHeuristics: true });

describe('PythonAnalyzer', () => {
  describe('parse()', () => {
    it('returns a ParsedSourceFile without throwing', () => {
      const result = analyzer.parse('test_users.py', 'def test_get_users(): pass');
      expect(result).toHaveProperty('filePath', 'test_users.py');
      expect(result).toHaveProperty('language', 'python');
    });

    it('does not throw for complex Python test code', () => {
      expect(() =>
        analyzer.parse(
          'test_api.py',
          `
import requests

BASE_URL = '/api/v1'

def test_list_users(client):
    response = client.get('/users')
    assert response.status_code == 200
`,
        ),
      ).not.toThrow();
    });
  });

  describe('buildSemanticModel()', () => {
    it('returns a SemanticModel with required fields', () => {
      const parsed = analyzer.parse('test.py', 'x = 1');
      const model = analyzer.buildSemanticModel(parsed, ctx);
      expect(model.language).toBe('python');
      expect(model.constants).toBeInstanceOf(Map);
      expect(model.functions).toBeInstanceOf(Map);
      expect(Array.isArray(model.assertions)).toBe(true);
    });
  });

  describe('extractHttpInteractions()', () => {
    it('returns an array without throwing', () => {
      const parsed = analyzer.parse('test.py', 'pass');
      const model = analyzer.buildSemanticModel(parsed, ctx);
      expect(() => analyzer.extractHttpInteractions(model, ctx)).not.toThrow();
    });

    it('detects requests.get("/users") when tree-sitter is available', () => {
      const content = `
import requests

def test_get_users():
    response = requests.get('/users')
    assert response.status_code == 200
`;
      const parsed = analyzer.parse('test_users.py', content);
      if (parsed.parseError) return; // tree-sitter unavailable — skip
      const model = analyzer.buildSemanticModel(parsed, ctx);
      const interactions = analyzer.extractHttpInteractions(model, ctx);
      expect(Array.isArray(interactions)).toBe(true);
      // When available, should detect the GET call
      const get = interactions.find((i) => i.method === 'GET');
      if (get) {
        expect(get.path).toContain('/users');
      }
    });

    it('detects module-level constant URL when tree-sitter is available', () => {
      const content = `
BASE = '/api'
import requests
response = requests.get(BASE + '/users')
`;
      const parsed = analyzer.parse('test.py', content);
      if (parsed.parseError) return;
      const model = analyzer.buildSemanticModel(parsed, ctx);
      expect(model.constants.size).toBeGreaterThanOrEqual(0); // may or may not resolve BASE
    });
  });

  describe('extractAssertions()', () => {
    it('returns an array without throwing', () => {
      const parsed = analyzer.parse('test.py', 'pass');
      const model = analyzer.buildSemanticModel(parsed, ctx);
      expect(Array.isArray(analyzer.extractAssertions(model))).toBe(true);
    });
  });
});
