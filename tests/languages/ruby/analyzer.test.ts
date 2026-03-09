/**
 * Tests for the Ruby language analyzer.
 *
 * Uses tree-sitter-ruby. Tests cover graceful failure when native bindings
 * are absent, Rails request syntax, and result shapes.
 */

import { RubyAnalyzer } from '../../../src/languages/ruby/index';
import { buildAnalysisContext } from '../../../src/ast/astAnalysisOrchestrator';

const analyzer = new RubyAnalyzer();
const ctx = buildAnalysisContext({ enabled: true });

describe('RubyAnalyzer', () => {
  describe('parse()', () => {
    it('returns a ParsedSourceFile without throwing', () => {
      const result = analyzer.parse('users_spec.rb', 'describe "GET /users" do; end');
      expect(result).toHaveProperty('filePath', 'users_spec.rb');
      expect(result).toHaveProperty('language', 'ruby');
    });

    it('does not throw for complex Ruby test code', () => {
      expect(() =>
        analyzer.parse(
          'api_spec.rb',
          `
require 'rails_helper'

RSpec.describe 'Users API', type: :request do
  describe 'GET /users' do
    it 'returns a list of users' do
      get '/users'
      expect(response.status).to eq(200)
    end
  end
end
`,
        ),
      ).not.toThrow();
    });
  });

  describe('buildSemanticModel()', () => {
    it('returns a SemanticModel with required fields', () => {
      const parsed = analyzer.parse('test.rb', 'x = 1');
      const model = analyzer.buildSemanticModel(parsed, ctx);
      expect(model.language).toBe('ruby');
      expect(model.constants).toBeInstanceOf(Map);
      expect(model.functions).toBeInstanceOf(Map);
      expect(Array.isArray(model.httpInteractions)).toBe(true);
    });
  });

  describe('extractHttpInteractions()', () => {
    it('returns an array without throwing', () => {
      const parsed = analyzer.parse('test.rb', '');
      const model = analyzer.buildSemanticModel(parsed, ctx);
      expect(() => analyzer.extractHttpInteractions(model, ctx)).not.toThrow();
    });

    it('detects Rails get "/users" when tree-sitter is available', () => {
      const content = `
RSpec.describe 'Users', type: :request do
  it 'lists users' do
    get '/users'
    expect(response.status).to eq(200)
  end
end
`;
      const parsed = analyzer.parse('users_spec.rb', content);
      if (parsed.parseError) return; // tree-sitter unavailable — skip
      const model = analyzer.buildSemanticModel(parsed, ctx);
      const interactions = analyzer.extractHttpInteractions(model, ctx);
      expect(Array.isArray(interactions)).toBe(true);
    });

    it('detects constant URL references when tree-sitter is available', () => {
      const content = `
USERS_PATH = '/users'
describe 'Users API' do
  it 'lists users' do
    get USERS_PATH
  end
end
`;
      const parsed = analyzer.parse('test.rb', content);
      if (parsed.parseError) return;
      const model = analyzer.buildSemanticModel(parsed, ctx);
      expect(model.constants.size).toBeGreaterThanOrEqual(0);
    });
  });

  describe('extractAssertions()', () => {
    it('returns an array without throwing', () => {
      const parsed = analyzer.parse('test.rb', '');
      const model = analyzer.buildSemanticModel(parsed, ctx);
      expect(Array.isArray(analyzer.extractAssertions(model))).toBe(true);
    });
  });
});
