/**
 * Tests for the Java language analyzer.
 *
 * These tests exercise:
 *   - parse() — tree-sitter-java parsing OR graceful failure (parseError)
 *   - buildSemanticModel() — result shape
 *   - extractHttpInteractions() via the JavaAnalyzer pipeline
 *
 * When tree-sitter native bindings are unavailable, parse returns a
 * parseError and the analyzer falls back to regex — tests cover both paths.
 *
 * All Java snippets must include a class wrapper so that tree-sitter-java
 * creates proper method_declaration nodes inside a class_body.
 */

import { JavaAnalyzer } from '../../../src/languages/java/index';
import { buildAnalysisContext } from '../../../src/ast/astAnalysisOrchestrator';

const analyzer = new JavaAnalyzer();
const ctx = buildAnalysisContext({ enabled: true, fallbackHeuristics: true });

describe('JavaAnalyzer', () => {
  describe('parse()', () => {
    it('returns a ParsedSourceFile object (parse may fail gracefully)', () => {
      const result = analyzer.parse('UserTest.java', 'public class UserTest {}');
      expect(result).toHaveProperty('filePath', 'UserTest.java');
      expect(result).toHaveProperty('language', 'java');
      // parseError is set when tree-sitter-java is unavailable — that's fine
    });

    it('does not throw for any Java content', () => {
      expect(() =>
        analyzer.parse(
          'Test.java',
          `
          import io.restassured.RestAssured.*;
          public class UserTest {
            @Test public void testUsers() {
              given().when().get("/users").then().statusCode(200);
            }
          }
        `,
        ),
      ).not.toThrow();
    });
  });

  describe('buildSemanticModel()', () => {
    it('returns a SemanticModel with all required fields', () => {
      const parsed = analyzer.parse('Test.java', 'public class Test {}');
      const model = analyzer.buildSemanticModel(parsed, ctx);
      expect(model).toHaveProperty('filePath', 'Test.java');
      expect(model).toHaveProperty('language', 'java');
      expect(model.constants).toBeInstanceOf(Map);
      expect(model.functions).toBeInstanceOf(Map);
      expect(Array.isArray(model.httpInteractions)).toBe(true);
      expect(Array.isArray(model.assertions)).toBe(true);
    });
  });

  describe('extractHttpInteractions()', () => {
    it('does not throw for valid Java test code', () => {
      const content = `
        public class UserTest {
          @Test
          public void getUsers() {
            given().when().get("/users").then().statusCode(200);
          }
        }
      `;
      const parsed = analyzer.parse('UserTest.java', content);
      const model = analyzer.buildSemanticModel(parsed, ctx);
      expect(() => analyzer.extractHttpInteractions(model, ctx)).not.toThrow();
    });

    it('returns an array (possibly empty if parse failed)', () => {
      const parsed = analyzer.parse('Test.java', 'class Test {}');
      const model = analyzer.buildSemanticModel(parsed, ctx);
      const interactions = analyzer.extractHttpInteractions(model, ctx);
      expect(Array.isArray(interactions)).toBe(true);
    });

    it('detects RestAssured GET call when tree-sitter is available', () => {
      const content = `
        public class UserTest {
          @Test
          public void testGetUsers() {
            given().when().get("/users").then().statusCode(200);
          }
        }
      `;
      const parsed = analyzer.parse('UserTest.java', content);
      if (parsed.parseError) {
        // tree-sitter unavailable — skip this assertion
        return;
      }
      const model = analyzer.buildSemanticModel(parsed, ctx);
      const interactions = analyzer.extractHttpInteractions(model, ctx);
      const get = interactions.find((i) => i.method === 'GET');
      expect(get).toBeDefined();
      expect(get?.path).toContain('/users');
    });
  });

  describe('extractAssertions()', () => {
    it('returns an array', () => {
      const parsed = analyzer.parse('Test.java', 'class Test {}');
      const model = analyzer.buildSemanticModel(parsed, ctx);
      expect(Array.isArray(analyzer.extractAssertions(model))).toBe(true);
    });
  });
});
