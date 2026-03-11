/**
 * Python test pattern detector (Feature 27, Sub-PR 4)
 *
 * Detects:
 * 1. Factory Boy factories (factory.Factory subclasses, SubFactory, Meta.model)
 * 2. webtest API calls (TestApp, testapp.get/post_json/put_json/delete)
 * 3. pytest fixture chains (@pytest.fixture, fixture dependencies)
 */

import type { SemanticHttpCall, ConfidenceLevel } from '../../ast/astTypes';
import { findNodes, firstChildOfType, type TsNode } from '../shared/treeSitterUtils';

// ─── Factory Boy Detection ──────────────────────────────────────────────────

export interface FactoryBoyFactory {
  /** The factory class name (e.g. 'ArticleFactory') */
  className: string;
  /** The model the factory creates (from Meta.model) */
  modelName?: string;
  /** SubFactory references */
  subFactories: string[];
  /** RelatedFactoryList references */
  relatedFactoryLists: string[];
  sourceFile: string;
  line?: number;
}

/**
 * Detect Factory Boy factory classes from source text.
 * Looks for `class XFactory(factory.Factory):` and parses Meta.model, SubFactory, RelatedFactoryList.
 */
export function detectFactoryBoyFactories(sourceText: string, filePath: string): FactoryBoyFactory[] {
  const factories: FactoryBoyFactory[] = [];
  const lines = sourceText.split('\n');

  // Regex for class definition inheriting from factory.Factory or factory.DjangoModelFactory etc.
  const classPattern = /^class\s+(\w+)\s*\(\s*(?:factory\.(?:Factory|DjangoModelFactory|SQLAlchemyModelFactory|MongoEngineFactory)|Factory)\s*\)/;
  const metaModelPattern = /model\s*=\s*(\w+)/;
  const subFactoryPattern = /=\s*(?:factory\.)?SubFactory\s*\(\s*['"]?(\w+)/g;
  const relatedFactoryPattern = /=\s*(?:factory\.)?RelatedFactoryList\s*\(\s*['"]?(\w+)/g;

  let currentFactory: FactoryBoyFactory | null = null;
  let classIndent = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const indent = line.search(/\S/);

    // If we're inside a factory class, check for end of class
    if (currentFactory && indent >= 0 && indent <= classIndent && line.trim().length > 0) {
      factories.push(currentFactory);
      currentFactory = null;
      classIndent = -1;
    }

    const classMatch = line.match(classPattern);
    if (classMatch) {
      if (currentFactory) factories.push(currentFactory);
      currentFactory = {
        className: classMatch[1],
        subFactories: [],
        relatedFactoryLists: [],
        sourceFile: filePath,
        line: i + 1,
      };
      classIndent = indent;
      continue;
    }

    if (currentFactory) {
      // Meta.model
      const metaMatch = line.match(metaModelPattern);
      if (metaMatch) {
        currentFactory.modelName = metaMatch[1];
      }

      // SubFactory
      let sfMatch;
      subFactoryPattern.lastIndex = 0;
      while ((sfMatch = subFactoryPattern.exec(line)) !== null) {
        currentFactory.subFactories.push(sfMatch[1]);
      }

      // RelatedFactoryList
      let rfMatch;
      relatedFactoryPattern.lastIndex = 0;
      while ((rfMatch = relatedFactoryPattern.exec(line)) !== null) {
        currentFactory.relatedFactoryLists.push(rfMatch[1]);
      }
    }
  }

  // Push last factory if still open
  if (currentFactory) factories.push(currentFactory);

  return factories;
}

// ─── webtest API Call Detection ─────────────────────────────────────────────

export interface WebtestApiCall {
  method: string;
  path: string;
  sourceFile: string;
  line?: number;
}

/** Map webtest methods to HTTP methods */
const WEBTEST_METHOD_MAP: Record<string, string> = {
  get: 'GET',
  post: 'POST',
  post_json: 'POST',
  put: 'PUT',
  put_json: 'PUT',
  patch: 'PATCH',
  patch_json: 'PATCH',
  delete: 'DELETE',
  delete_json: 'DELETE',
  head: 'HEAD',
  options: 'OPTIONS',
};

/**
 * Detect webtest HTTP calls from source text.
 * Looks for `testapp.get('/path')`, `testapp.post_json('/path', {...})`, etc.
 */
export function detectWebtestCalls(sourceText: string, filePath: string): WebtestApiCall[] {
  const calls: WebtestApiCall[] = [];
  const lines = sourceText.split('\n');

  // Pattern: any_var.METHOD('/path'...) where METHOD is a webtest HTTP method
  const webtestMethods = Object.keys(WEBTEST_METHOD_MAP).join('|');
  const callPattern = new RegExp(
    `\\w+\\.(${webtestMethods})\\s*\\(\\s*['"]([^'"]+)['"]`,
    'g',
  );

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    callPattern.lastIndex = 0;
    let match;
    while ((match = callPattern.exec(line)) !== null) {
      const method = WEBTEST_METHOD_MAP[match[1]];
      if (method) {
        calls.push({
          method,
          path: match[2],
          sourceFile: filePath,
          line: i + 1,
        });
      }
    }
  }

  return calls;
}

/**
 * Convert webtest API calls into SemanticHttpCall objects.
 */
export function webtestCallsToHttpCalls(calls: WebtestApiCall[]): SemanticHttpCall[] {
  return calls.map((call) => ({
    method: call.method,
    rawPathArg: call.path,
    resolvedPath: call.path,
    normalizedPath: call.path.startsWith('/') ? call.path : undefined,
    resolutionType: 'direct' as const,
    confidence: 'high' as ConfidenceLevel,
    line: call.line,
  }));
}

// ─── pytest Fixture Detection ───────────────────────────────────────────────

export interface PytestFixture {
  /** Name of the fixture function */
  name: string;
  /** Scope: 'function' (default), 'class', 'module', 'session' */
  scope: string;
  /** Parameter names that are dependencies on other fixtures */
  dependencies: string[];
  sourceFile: string;
  line?: number;
}

/**
 * Detect @pytest.fixture functions and their parameter dependencies.
 */
export function detectPytestFixtures(sourceText: string, filePath: string): PytestFixture[] {
  const fixtures: PytestFixture[] = [];
  const lines = sourceText.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // @pytest.fixture or @pytest.fixture(scope='...')
    const fixtureMatch = line.match(/@pytest\.fixture(?:\s*\(([^)]*)\))?/);
    if (!fixtureMatch) continue;

    // Parse scope from decorator args
    let scope = 'function';
    if (fixtureMatch[1]) {
      const scopeMatch = fixtureMatch[1].match(/scope\s*=\s*['"](\w+)['"]/);
      if (scopeMatch) scope = scopeMatch[1];
    }

    // Find the next def line (typically the line right after the decorator)
    for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
      const defMatch = lines[j].match(/def\s+(\w+)\s*\(([^)]*)\)/);
      if (defMatch) {
        const name = defMatch[1];
        const params = defMatch[2]
          .split(',')
          .map((p) => p.trim().split(':')[0].split('=')[0].trim())
          .filter((p) => p.length > 0 && p !== 'request');

        fixtures.push({
          name,
          scope,
          dependencies: params,
          sourceFile: filePath,
          line: j + 1,
        });
        break;
      }
    }
  }

  return fixtures;
}

// ─── TestApp Detection ──────────────────────────────────────────────────────

/**
 * Detect if a file creates a webtest TestApp instance.
 * Looks for `TestApp(app)` or `TestApp(...)`.
 */
export function hasWebtestTestApp(sourceText: string): boolean {
  return /TestApp\s*\(/.test(sourceText);
}

/**
 * Check if a file uses real DB fixtures (not mocked).
 * Looks for pytest fixtures that reference db, database, session, engine, etc.
 */
export function hasRealDbFixtures(sourceText: string): boolean {
  // Check for DB fixture names in function parameters
  const dbFixturePattern = /def\s+\w+\s*\([^)]*\b(db|database|dbsession|db_session|engine|session|connection)\b/;
  // Also check for common DB setup patterns
  const dbSetupPattern = /(?:create_all|Base\.metadata|sessionmaker|create_engine|init_db|setup_database)/;

  return dbFixturePattern.test(sourceText) || dbSetupPattern.test(sourceText);
}

/**
 * Check if a file uses Factory Boy factories.
 */
export function usesFactoryBoy(sourceText: string): boolean {
  return /(?:import\s+factory|from\s+factory\s+import|factory\.Factory|factory\.SubFactory)/.test(sourceText);
}
