/**
 * Integration tests for the TypeScriptAnalyzer.
 *
 * TypeScriptAnalyzer extends JavaScriptAnalyzer — same pipeline, but
 * reports sourceLanguage as 'typescript' and handles TS-specifics like
 * type annotations and 'as const' patterns.
 */

import { TypeScriptAnalyzer } from '../../../src/languages/typescript/index';
import { buildAnalysisContext } from '../../../src/ast/astAnalysisOrchestrator';

const analyzer = new TypeScriptAnalyzer();
const ctx = buildAnalysisContext({ enabled: true });

describe('TypeScriptAnalyzer end-to-end', () => {
  it('parses TypeScript without error', () => {
    const parsed = analyzer.parse('test.ts', `const x: string = 'hello';`);
    expect(parsed.parseError).toBeFalsy();
  });

  it('reports sourceLanguage as "typescript"', () => {
    const content = `axios.get('/users');`;
    const parsed = analyzer.parse('test.ts', content);
    const model = analyzer.buildSemanticModel(parsed, ctx);
    const interactions = analyzer.extractHttpInteractions(model, ctx);
    expect(interactions[0]?.sourceLanguage).toBe('typescript');
  });

  it('handles TypeScript type annotations on variables', () => {
    const content = `const path: string = '/users'; axios.get(path);`;
    const parsed = analyzer.parse('test.ts', content);
    const model = analyzer.buildSemanticModel(parsed, ctx);
    const interactions = analyzer.extractHttpInteractions(model, ctx);
    expect(interactions.some((i) => i.path === '/users')).toBe(true);
  });

  it('resolves "as const" object patterns', () => {
    const content = `
      const Routes = { USERS: '/users' } as const;
      axios.get(Routes.USERS);
    `;
    const parsed = analyzer.parse('test.ts', content);
    const model = analyzer.buildSemanticModel(parsed, ctx);
    const interactions = analyzer.extractHttpInteractions(model, ctx);
    expect(interactions.some((i) => i.path === '/users')).toBe(true);
  });

  it('uses TypeScript enum members as URL paths', () => {
    const content = `
      enum Endpoints { ITEMS = '/items' }
      client.get(Endpoints.ITEMS);
    `;
    const parsed = analyzer.parse('test.ts', content);
    const model = analyzer.buildSemanticModel(parsed, ctx);
    const interactions = analyzer.extractHttpInteractions(model, ctx);
    expect(interactions.some((i) => i.path === '/items')).toBe(true);
  });

  it('extracts interactions from async test functions', () => {
    const content = `
      describe('Users API', () => {
        it('lists users', async () => {
          const res = await request(app).get('/users');
          expect(res.status).toBe(200);
        });
      });
    `;
    const parsed = analyzer.parse('users.test.ts', content);
    const model = analyzer.buildSemanticModel(parsed, ctx);
    const interactions = analyzer.extractHttpInteractions(model, ctx);
    expect(interactions.some((i) => i.path === '/users')).toBe(true);
  });
});
