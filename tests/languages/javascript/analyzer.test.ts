/**
 * Integration tests for the full JavaScriptAnalyzer pipeline.
 *
 * Exercises parse → buildSemanticModel → extractHttpInteractions → extractAssertions
 * without any mocking.
 */

import { JavaScriptAnalyzer } from '../../../src/languages/javascript/index';
import { buildAnalysisContext } from '../../../src/ast/astAnalysisOrchestrator';

const analyzer = new JavaScriptAnalyzer();
const ctx = buildAnalysisContext({ enabled: true });

describe('JavaScriptAnalyzer end-to-end', () => {
  it('parses without error and returns a non-null AST', () => {
    const parsed = analyzer.parse('test.js', `axios.get('/users');`);
    expect(parsed.parseError).toBeFalsy();
    expect(parsed.ast).toBeDefined();
  });

  it('extracts a direct GET call', () => {
    const content = `axios.get('/users');`;
    const parsed = analyzer.parse('test.js', content);
    const model = analyzer.buildSemanticModel(parsed, ctx);
    const interactions = analyzer.extractHttpInteractions(model, ctx);
    const get = interactions.find((i) => i.method === 'GET');
    expect(get).toBeDefined();
    expect(get?.path).toBe('/users');
    expect(get?.resolutionType).toBe('direct');
    expect(get?.confidence).toBe('high');
  });

  it('resolves a constant-referenced URL', () => {
    const content = `
      const USERS_URL = '/users';
      axios.get(USERS_URL);
    `;
    const parsed = analyzer.parse('test.js', content);
    const model = analyzer.buildSemanticModel(parsed, ctx);
    const interactions = analyzer.extractHttpInteractions(model, ctx);
    const get = interactions.find((i) => i.method === 'GET');
    expect(get?.path).toBe('/users');
    expect(get?.resolutionType).toBe('constant');
  });

  it('resolves an enum-referenced URL', () => {
    const content = `
      enum Routes { USERS = '/users' }
      axios.get(Routes.USERS);
    `;
    const parsed = analyzer.parse('test.ts', content);
    const model = analyzer.buildSemanticModel(parsed, ctx);
    const interactions = analyzer.extractHttpInteractions(model, ctx);
    const get = interactions.find((i) => i.method === 'GET');
    expect(get?.path).toBe('/users');
  });

  it('extracts calls from inside a test function', () => {
    const content = `
      it('should list users', async () => {
        const res = await axios.get('/users');
        expect(res.status).toBe(200);
      });
    `;
    const parsed = analyzer.parse('test.js', content);
    const model = analyzer.buildSemanticModel(parsed, ctx);
    const interactions = analyzer.extractHttpInteractions(model, ctx);
    expect(interactions.some((i) => i.path === '/users')).toBe(true);
  });

  it('links an assertion to the response variable', () => {
    const content = `
      it('checks status', async () => {
        const response = await axios.get('/ping');
        expect(response.status).toBe(200);
      });
    `;
    const parsed = analyzer.parse('test.js', content);
    const model = analyzer.buildSemanticModel(parsed, ctx);
    const assertions = analyzer.extractAssertions(model);
    const linked = assertions.find((a) => a.subjectVariable === 'response');
    expect(linked).toBeDefined();
  });

  it('extracts sourceLanguage as "javascript"', () => {
    const content = `axios.get('/ping');`;
    const parsed = analyzer.parse('test.js', content);
    const model = analyzer.buildSemanticModel(parsed, ctx);
    const interactions = analyzer.extractHttpInteractions(model, ctx);
    expect(interactions[0]?.sourceLanguage).toBe('javascript');
  });

  it('deduplicates identical calls', () => {
    const content = `
      axios.get('/users');
      axios.get('/users');
    `;
    const parsed = analyzer.parse('test.js', content);
    const model = analyzer.buildSemanticModel(parsed, ctx);
    const interactions = analyzer.extractHttpInteractions(model, ctx);
    const gets = interactions.filter((i) => i.path === '/users' && i.method === 'GET');
    expect(gets.length).toBe(1);
  });
});
