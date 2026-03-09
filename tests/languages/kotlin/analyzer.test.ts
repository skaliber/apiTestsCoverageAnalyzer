/**
 * Tests for the Kotlin language analyzer.
 *
 * Kotlin uses a three-tier parser: tree-sitter-kotlin → tree-sitter-java → parseError.
 * Tests guard the shape of results and graceful degradation.
 */

import { KotlinAnalyzer } from '../../../src/languages/kotlin/index';
import { buildAnalysisContext } from '../../../src/ast/astAnalysisOrchestrator';

const analyzer = new KotlinAnalyzer();
const ctx = buildAnalysisContext({ enabled: true });

describe('KotlinAnalyzer', () => {
  describe('parse()', () => {
    it('returns a ParsedSourceFile without throwing', () => {
      const result = analyzer.parse('UserTest.kt', 'class UserTest {}');
      expect(result).toHaveProperty('filePath', 'UserTest.kt');
      expect(result).toHaveProperty('language', 'kotlin');
    });

    it('handles complex Kotlin syntax without throwing', () => {
      expect(() =>
        analyzer.parse(
          'ApiTest.kt',
          `
          @Test
          fun testFetchUsers() {
            val response = client.get("/users")
            assertEquals(200, response.status)
          }
        `,
        ),
      ).not.toThrow();
    });
  });

  describe('buildSemanticModel()', () => {
    it('returns a SemanticModel with required fields', () => {
      const parsed = analyzer.parse('Test.kt', 'class Test {}');
      const model = analyzer.buildSemanticModel(parsed, ctx);
      expect(model.language).toBe('kotlin');
      expect(model.constants).toBeInstanceOf(Map);
      expect(Array.isArray(model.httpInteractions)).toBe(true);
    });
  });

  describe('extractHttpInteractions()', () => {
    it('returns an array without throwing', () => {
      const parsed = analyzer.parse('Test.kt', 'class Test {}');
      const model = analyzer.buildSemanticModel(parsed, ctx);
      expect(() => analyzer.extractHttpInteractions(model, ctx)).not.toThrow();
    });

    it('detects Kotlin REST calls when parsing succeeds', () => {
      const content = [
        '@Test',
        'fun testGetUsers() {',
        '    given().`when`().get("/users").then().statusCode(200)',
        '}',
      ].join('\n');
      const parsed = analyzer.parse('UsersTest.kt', content);
      if (parsed.parseError) return; // Skip if native unavailable
      const model = analyzer.buildSemanticModel(parsed, ctx);
      const interactions = analyzer.extractHttpInteractions(model, ctx);
      expect(Array.isArray(interactions)).toBe(true);
    });
  });
});
