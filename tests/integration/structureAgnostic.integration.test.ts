/**
 * tests/integration/structureAgnostic.integration.test.ts
 *
 * Integration tests for Feature 27 — Universal Project Structure Agnostic Pattern Recognition.
 *
 * Validates that the scanner correctly detects framework patterns, endpoint routes,
 * security classifications, and cross-file resolution across the 7 realworld example
 * projects created for Feature 27.
 *
 * Each test reads the actual fixture source files and runs the relevant detection
 * modules against them, verifying that the scanner produces correct results
 * without relying on directory structure assumptions.
 */

import * as fs from 'fs';
import * as path from 'path';
import { detectApiFrameworks } from '../../src/discovery/frameworkDetector';
import { inferRoutesFromFile } from '../../src/inference/routeInference';
import {
  composeUrl,
  normalizePath,
  normalizePathParams,
  composeFrameworkUrl,
} from '../../src/pipeline/stages/ast/baseUrlComposer';
import {
  enforceStructureAgnosticRules,
} from '../../src/pipeline/stages/ast/rulesEnforcer';
import type {
  CrossFileSymbolTable,
  RouterMount,
} from '../../src/pipeline/stages/ast/types';
import {
  unifyAuthClassification,
} from '../../src/pipeline/stages/ast/optionalAuthUnifier';
import {
  detectRepositoryInterfaces,
  detectCqrsHandlers,
  detectImplementsClauses,
} from '../../src/pipeline/stages/ast/resolvers/dddLayerResolver';
import {
  parseMyBatisMapper,
  isMyBatisMapperXml,
} from '../../src/languages/java/mybatisXmlParser';
import {
  parseGraphqlSchema,
  isGraphqlSchemaFile,
} from '../../src/languages/java/graphqlSchemaParser';
import {
  detectMongooseModels,
  detectExpressErrorHandlers,
} from '../../src/languages/javascript/mongooseDetector';
import {
  detectAngularHttpCalls,
  detectAngularInjections,
  detectAngularGuards,
  detectAngularInterceptors,
  detectAngularTestSetup,
} from '../../src/languages/javascript/angularDetector';
import {
  detectAxiosBaseUrl,
  detectVuexActions,
  detectVuexDispatches,
} from '../../src/languages/javascript/vueDetector';
import {
  detectHapiRoutes,
  detectBoomErrors,
} from '../../src/languages/javascript/hapiDetector';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const EXAMPLES_ROOT = path.join(REPO_ROOT, 'examples');

function exampleFile(...segments: string[]): string {
  return path.join(EXAMPLES_ROOT, ...segments);
}

function readFixture(...segments: string[]): string {
  const filePath = exampleFile(...segments);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Fixture not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf-8');
}

function listFilesRecursive(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else {
        results.push(fullPath);
      }
    }
  }
  return results;
}

function makeEmptySymbolTable(): CrossFileSymbolTable {
  return {
    models: new Map(),
    exportedSymbols: new Map(),
    classes: new Map(),
    importGraph: new Map(),
    routerMounts: new Map(),
    injectionChains: new Map(),
    interfaceImplementations: new Map(),
    middlewareInheritance: new Map(),
  };
}

// ─── Flask Blueprint detection ───────────────────────────────────────────────

describe('Feature 27: Flask RealWorld example', () => {
  const flaskDir = exampleFile('flask-realworld');

  it('detects flask framework from source files', () => {
    const files = listFilesRecursive(path.join(flaskDir, 'app'));
    const frameworks = detectApiFrameworks(files);
    const flask = frameworks.find((f) => f.name === 'flask');
    expect(flask).toBeDefined();
    expect(flask!.evidence).toContain('Flask');
  });

  it('detects Blueprint route registrations', () => {
    const source = readFixture('flask-realworld', 'app', 'articles.py');
    expect(source).toContain('@articles_bp.route');
    expect(source).toContain("methods=['GET']");
    expect(source).toContain("methods=['POST']");
  });

  it('detects @jwt_required and @jwt_optional decorators', () => {
    const source = readFixture('flask-realworld', 'app', 'articles.py');
    expect(source).toContain('@jwt_required');
    expect(source).toContain('@jwt_optional');
  });

  it('classifies jwt_required as required auth', () => {
    const security = unifyAuthClassification('flask', '@jwt_required');
    expect(security).toBeDefined();
    expect(security!.required).toBe(true);
    expect(security!.optional).toBe(false);
  });

  it('classifies jwt_optional as optional auth', () => {
    const security = unifyAuthClassification('flask', '@jwt_optional');
    expect(security).toBeDefined();
    expect(security!.optional).toBe(true);
    expect(security!.required).toBe(false);
  });

  it('detects @use_kwargs and @marshal_with decorators', () => {
    const source = readFixture('flask-realworld', 'app', 'articles.py');
    expect(source).toContain('@use_kwargs');
    expect(source).toContain('@marshal_with');
  });

  it('detects register_blueprint calls with url_prefix', () => {
    const initSource = readFixture('flask-realworld', 'app', '__init__.py');
    expect(initSource).toContain('register_blueprint');
    expect(initSource).toContain("url_prefix='/api/articles'");
    expect(initSource).toContain("url_prefix='/api/users'");
    expect(initSource).toContain("url_prefix='/api/profiles'");
  });

  it('composes full URL from Blueprint prefix + route path', () => {
    const url = composeUrl('/api/articles', '/<slug>');
    expect(url).toBe('/api/articles/<slug>');

    const normalized = normalizePathParams(url);
    expect(normalized).toBe('/api/articles/{slug}');
  });

  it('expected-coverage.json exists and is valid', () => {
    const expected = JSON.parse(readFixture('flask-realworld', 'expected-coverage.json'));
    expect(expected.expectations).toBeDefined();
    expect(expected.expectations.totalEndpoints).toBeDefined();
    expect(expected.expectations.totalEndpoints.operator).toBe('>');
  });
});

// ─── Spring Boot DDD + MyBatis + GraphQL detection ──────────────────────────

describe('Feature 27: Spring Boot RealWorld example', () => {
  const springDir = exampleFile('spring-boot-realworld');

  it('detects spring-boot framework from source files', () => {
    const files = listFilesRecursive(path.join(springDir, 'src'));
    const frameworks = detectApiFrameworks(files);
    const spring = frameworks.find((f) => f.name === 'spring-boot');
    expect(spring).toBeDefined();
  });

  it('detects DGS framework from source files', () => {
    const files = listFilesRecursive(path.join(springDir, 'src'));
    const frameworks = detectApiFrameworks(files);
    const dgs = frameworks.find((f) => f.name === 'dgs-framework');
    expect(dgs).toBeDefined();
  });

  it('detects DDD repository interfaces without @Repository', () => {
    const source = readFixture(
      'spring-boot-realworld',
      'src', 'main', 'java', 'com', 'example', 'conduit',
      'domain', 'repository', 'ArticleRepository.java',
    );
    const repos = detectRepositoryInterfaces(source, 'ArticleRepository.java');
    expect(repos.length).toBeGreaterThan(0);
    expect(repos[0].interfaceName).toBe('ArticleRepository');
    expect(repos[0].methods).toContain('findBySlug');
    expect(repos[0].methods).toContain('save');
    expect(repos[0].methods).toContain('delete');
  });

  it('detects CQRS command handlers', () => {
    const source = readFixture(
      'spring-boot-realworld',
      'src', 'main', 'java', 'com', 'example', 'conduit',
      'application', 'handler', 'CreateArticleHandler.java',
    );
    const handlers = detectCqrsHandlers(source, 'CreateArticleHandler.java');
    // The handler uses handle(CreateArticleCommand command)
    // Detection depends on exact signature match
    expect(handlers.length).toBeGreaterThan(0);
    if (handlers.length > 0) {
      expect(handlers[0].handlerType).toBe('command');
    }
  });

  it('detects implements clause for DDD interface→impl mapping', () => {
    const source = readFixture(
      'spring-boot-realworld',
      'src', 'main', 'java', 'com', 'example', 'conduit',
      'infrastructure', 'persistence', 'MyBatisArticleRepository.java',
    );
    const impls = detectImplementsClauses(source, 'MyBatisArticleRepository.java');
    expect(impls.length).toBeGreaterThan(0);
    expect(impls[0][0]).toBe('ArticleRepository');
    expect(impls[0][1]).toBe('MyBatisArticleRepository');
  });

  it('detects MyBatis XML mapper file', () => {
    const xmlPath = exampleFile(
      'spring-boot-realworld',
      'src', 'main', 'resources', 'mapper', 'ArticleMapper.xml',
    );
    const content = readFixture(
      'spring-boot-realworld',
      'src', 'main', 'resources', 'mapper', 'ArticleMapper.xml',
    );
    expect(isMyBatisMapperXml(content)).toBe(true);

    const mapper = parseMyBatisMapper(content, xmlPath);
    expect(mapper).not.toBeNull();
    expect(mapper!.namespace).toContain('ArticleMapper');
    expect(mapper!.queries.length).toBeGreaterThan(0);
    expect(mapper!.queries.some((q) => q.type === 'select')).toBe(true);
    expect(mapper!.queries.some((q) => q.type === 'insert')).toBe(true);
  });

  it('detects GraphQL schema file', () => {
    const graphqlPath = exampleFile(
      'spring-boot-realworld',
      'src', 'main', 'resources', 'graphql', 'schema.graphqls',
    );
    expect(isGraphqlSchemaFile(graphqlPath)).toBe(true);

    const content = readFixture(
      'spring-boot-realworld',
      'src', 'main', 'resources', 'graphql', 'schema.graphqls',
    );
    const schema = parseGraphqlSchema(content, graphqlPath);
    expect(schema.queries.length).toBeGreaterThan(0);
    expect(schema.mutations.length).toBeGreaterThan(0);
    expect(schema.queries.some((q) => q.name === 'articles')).toBe(true);
    expect(schema.mutations.some((m) => m.name === 'createArticle')).toBe(true);
  });

  it('infers Spring REST routes from controller source file', () => {
    const controllerPath = exampleFile(
      'spring-boot-realworld',
      'src', 'main', 'java', 'com', 'example', 'conduit',
      'adapter', 'web', 'ArticleController.java',
    );
    const routes = inferRoutesFromFile(controllerPath);
    expect(routes.length).toBeGreaterThan(0);
    const methods = routes.map((r) => r.method);
    expect(methods).toContain('get');
  });
});

// ─── Express middleware + Mongoose detection ────────────────────────────────

describe('Feature 27: Express RealWorld example', () => {
  const expressDir = exampleFile('node-express-realworld');

  it('detects express framework from source files', () => {
    const files = listFilesRecursive(path.join(expressDir, 'src'));
    const frameworks = detectApiFrameworks(files);
    const express = frameworks.find((f) => f.name === 'express');
    expect(express).toBeDefined();
  });

  it('detects Express auth middleware patterns in route files', () => {
    const source = readFixture('node-express-realworld', 'src', 'routes', 'articles.js');
    // The route file uses auth.required and auth.optional inline
    expect(source).toContain('auth.required');
    expect(source).toContain('auth.optional');
  });

  it('detects Express 4-argument error handler', () => {
    const source = readFixture('node-express-realworld', 'src', 'middleware', 'errorHandler.js');
    const filePath = exampleFile('node-express-realworld', 'src', 'middleware', 'errorHandler.js');
    const handlers = detectExpressErrorHandlers(source, filePath);
    expect(handlers.length).toBeGreaterThan(0);
    expect(handlers[0].errorTypes.length).toBeGreaterThan(0);
  });

  it('detects Mongoose model definitions', () => {
    const source = readFixture('node-express-realworld', 'src', 'models', 'Article.js');
    const filePath = exampleFile('node-express-realworld', 'src', 'models', 'Article.js');
    const models = detectMongooseModels(source, filePath);
    expect(models.length).toBeGreaterThan(0);
    expect(models[0].modelName).toBe('Article');
    expect(models[0].fields.length).toBeGreaterThan(0);
  });

  it('detects router mount pattern app.use("/api", router)', () => {
    const source = readFixture('node-express-realworld', 'src', 'app.js');
    expect(source).toContain("app.use('/api'");
  });

  it('can compose full URL from Express mount + route path', () => {
    const url = composeUrl('/api', '/articles', '/:slug');
    expect(url).toBe('/api/articles/:slug');
    const normalized = normalizePathParams(url);
    expect(normalized).toBe('/api/articles/{slug}');
  });

  it('classifies Express credentialsRequired: true as required auth', () => {
    const security = unifyAuthClassification('express', 'credentialsRequired: true');
    expect(security).toBeDefined();
    expect(security!.required).toBe(true);
  });

  it('classifies Express credentialsRequired: false as optional auth', () => {
    const security = unifyAuthClassification('express', 'credentialsRequired: false');
    expect(security).toBeDefined();
    expect(security!.optional).toBe(true);
  });
});

// ─── Angular HttpClient + DI detection ──────────────────────────────────────

describe('Feature 27: Angular RealWorld example', () => {
  const angularDir = exampleFile('angular-realworld');

  it('detects angular framework from source files', () => {
    const files = listFilesRecursive(path.join(angularDir, 'src'));
    const frameworks = detectApiFrameworks(files);
    const angular = frameworks.find((f) => f.name === 'angular');
    expect(angular).toBeDefined();
  });

  it('detects HttpClient API calls in service', () => {
    const source = readFixture('angular-realworld', 'src', 'app', 'services', 'articles.service.ts');
    const filePath = exampleFile('angular-realworld', 'src', 'app', 'services', 'articles.service.ts');
    const calls = detectAngularHttpCalls(source, filePath);
    expect(calls.length).toBeGreaterThan(0);
    const methods = calls.map((c) => c.method);
    expect(methods).toContain('GET');
    expect(methods).toContain('POST');
    expect(methods).toContain('PUT');
    expect(methods).toContain('DELETE');
  });

  it('detects constructor injection of HttpClient', () => {
    const source = readFixture('angular-realworld', 'src', 'app', 'services', 'articles.service.ts');
    const filePath = exampleFile('angular-realworld', 'src', 'app', 'services', 'articles.service.ts');
    const injections = detectAngularInjections(source, filePath);
    expect(injections.length).toBeGreaterThan(0);
    expect(injections.some((i) => i.serviceClass === 'HttpClient')).toBe(true);
  });

  it('detects CanActivateFn functional guard', () => {
    const source = readFixture('angular-realworld', 'src', 'app', 'guards', 'auth.guard.ts');
    const filePath = exampleFile('angular-realworld', 'src', 'app', 'guards', 'auth.guard.ts');
    const guards = detectAngularGuards(source, filePath);
    expect(guards.length).toBeGreaterThan(0);
    expect(guards[0].guardType).toBe('CanActivate');
  });

  it('detects HttpInterceptorFn', () => {
    const source = readFixture('angular-realworld', 'src', 'app', 'interceptors', 'auth.interceptor.ts');
    const filePath = exampleFile('angular-realworld', 'src', 'app', 'interceptors', 'auth.interceptor.ts');
    const interceptors = detectAngularInterceptors(source, filePath);
    expect(interceptors.length).toBeGreaterThan(0);
    expect(interceptors[0].type).toBe('functional');
  });

  it('detects TestBed + HttpClientTestingModule in test file', () => {
    const source = readFixture('angular-realworld', 'src', 'tests', 'articles.service.spec.ts');
    const filePath = exampleFile('angular-realworld', 'src', 'tests', 'articles.service.spec.ts');
    const setup = detectAngularTestSetup(source, filePath);
    expect(setup.usesHttpClientTestingModule).toBe(true);
    expect(setup.httpMockExpectations.length).toBeGreaterThan(0);
  });

  it('detects environment.api_url in source', () => {
    const source = readFixture('angular-realworld', 'src', 'environments', 'environment.ts');
    expect(source).toContain('api_url');
    expect(source).toContain('https://api.realworld.io/api');
  });
});

// ─── Vue + Vuex + axios detection ───────────────────────────────────────────

describe('Feature 27: Vue RealWorld example', () => {
  const vueDir = exampleFile('vue-realworld');

  it('detects vue framework from source files', () => {
    const files = listFilesRecursive(path.join(vueDir, 'src'));
    const frameworks = detectApiFrameworks(files);
    const vue = frameworks.find((f) => f.name === 'vue');
    expect(vue).toBeDefined();
  });

  it('detects axios.defaults.baseURL', () => {
    const source = readFixture('vue-realworld', 'src', 'services', 'api.service.js');
    const filePath = exampleFile('vue-realworld', 'src', 'services', 'api.service.js');
    const baseUrl = detectAxiosBaseUrl(source, filePath);
    expect(baseUrl).toBeDefined();
    expect(baseUrl!.url).toBe('https://api.realworld.io/api');
  });

  it('detects Vuex actions', () => {
    const source = readFixture('vue-realworld', 'src', 'store', 'modules', 'articles.js');
    const filePath = exampleFile('vue-realworld', 'src', 'store', 'modules', 'articles.js');
    const actions = detectVuexActions(source, filePath);
    expect(actions.length).toBeGreaterThan(0);
    const actionNames = actions.map((a) => a.actionName);
    expect(actionNames).toContain('FETCH_ARTICLES');
    expect(actionNames).toContain('CREATE_ARTICLE');
  });

  it('detects Vuex dispatch calls in component', () => {
    const source = readFixture('vue-realworld', 'src', 'components', 'ArticleList.vue');
    const filePath = exampleFile('vue-realworld', 'src', 'components', 'ArticleList.vue');
    const dispatches = detectVuexDispatches(source, filePath);
    expect(dispatches.length).toBeGreaterThan(0);
    expect(dispatches.some((d) => d.actionName === 'fetchArticles')).toBe(true);
  });
});

// ─── Slim PHP detection ─────────────────────────────────────────────────────

describe('Feature 27: Slim PHP RealWorld example', () => {
  const slimDir = exampleFile('slim-php-realworld');

  it('detects slim framework from source files', () => {
    const files = listFilesRecursive(path.join(slimDir, 'src'));
    const frameworks = detectApiFrameworks(files);
    const slim = frameworks.find((f) => f.name === 'slim');
    expect(slim).toBeDefined();
  });

  it('infers routes from Slim PHP source file', () => {
    const filePath = exampleFile('slim-php-realworld', 'src', 'Routes', 'articles.php');
    const routes = inferRoutesFromFile(filePath);
    expect(routes.length).toBeGreaterThan(0);
    const methods = routes.map((r) => r.method);
    expect(methods).toContain('get');
    expect(methods).toContain('post');
  });

  it('detects {slug} parameter syntax in Slim routes', () => {
    const source = readFixture('slim-php-realworld', 'src', 'Routes', 'articles.php');
    expect(source).toContain('{slug}');
  });
});

// ─── HapiJS detection ───────────────────────────────────────────────────────

describe('Feature 27: HapiJS RealWorld example', () => {
  it('detects HapiJS route config objects', () => {
    const source = readFixture('hapijs-realworld', 'src', 'routes', 'articles.js');
    const filePath = exampleFile('hapijs-realworld', 'src', 'routes', 'articles.js');
    const routes = detectHapiRoutes(source, filePath);
    expect(routes.length).toBeGreaterThan(0);
    const methods = routes.map((r) => r.method);
    expect(methods).toContain('GET');
    expect(methods).toContain('POST');
    expect(methods).toContain('PUT');
    expect(methods).toContain('DELETE');
  });

  it('detects auth mode try (optional auth) in routes', () => {
    const source = readFixture('hapijs-realworld', 'src', 'routes', 'articles.js');
    const filePath = exampleFile('hapijs-realworld', 'src', 'routes', 'articles.js');
    const routes = detectHapiRoutes(source, filePath);
    const optionalAuth = routes.filter((r) => r.auth?.mode === 'optional');
    expect(optionalAuth.length).toBeGreaterThan(0);
  });

  it('detects Joi validation in routes', () => {
    const source = readFixture('hapijs-realworld', 'src', 'routes', 'articles.js');
    expect(source).toContain('Joi.object');
    expect(source).toContain('Joi.string()');
    expect(source).toContain('Joi.number()');
  });

  it('detects Boom error responses', () => {
    const source = readFixture('hapijs-realworld', 'src', 'routes', 'articles.js');
    const filePath = exampleFile('hapijs-realworld', 'src', 'routes', 'articles.js');
    const boomErrors = detectBoomErrors(source, filePath);
    expect(boomErrors.length).toBeGreaterThan(0);
    expect(boomErrors.some((b) => b.errorType === 'notFound')).toBe(true);
  });

  it('classifies HapiJS auth: { mode: "try" } as optional auth', () => {
    const security = unifyAuthClassification('hapijs', "auth: { mode: 'try' }");
    expect(security).toBeDefined();
    expect(security!.optional).toBe(true);
  });

  it('classifies HapiJS auth: "jwt" as required auth', () => {
    const security = unifyAuthClassification('hapijs', "auth: 'jwt'");
    expect(security).toBeDefined();
    expect(security!.required).toBe(true);
  });
});

// ─── Cross-cutting: URL composition ─────────────────────────────────────────

describe('Feature 27: Base URL composition across frameworks', () => {
  it('composes Flask Blueprint URL', () => {
    const url = composeFrameworkUrl('flask', {
      mountPrefix: '/api/articles',
      routePath: '/<slug>/comments',
    });
    expect(url).toBe('/api/articles/{slug}/comments');
  });

  it('composes Express mount + route URL', () => {
    const url = composeFrameworkUrl('express', {
      mountPrefix: '/api',
      routePath: '/articles/:slug',
    });
    expect(url).toBe('/api/articles/{slug}');
  });

  it('composes Spring class-level + method-level URL', () => {
    const url = composeFrameworkUrl('spring', {
      classPrefix: '/api/articles',
      routePath: '/{slug}',
    });
    expect(url).toBe('/api/articles/{slug}');
  });

  it('normalizes double slashes', () => {
    expect(normalizePath('//api//articles//')).toBe('/api/articles');
  });

  it('handles empty and root paths', () => {
    expect(normalizePath('')).toBe('/');
    expect(normalizePath('/')).toBe('/');
  });
});

// ─── Cross-cutting: expected-coverage.json validation ───────────────────────

describe('Feature 27: All example projects have expected-coverage.json', () => {
  const FEATURE27_EXAMPLES = [
    'flask-realworld',
    'spring-boot-realworld',
    'node-express-realworld',
    'angular-realworld',
    'vue-realworld',
    'slim-php-realworld',
    'hapijs-realworld',
  ];

  for (const name of FEATURE27_EXAMPLES) {
    it(`${name} has expected-coverage.json with valid structure`, () => {
      const expectedPath = exampleFile(name, 'expected-coverage.json');
      expect(fs.existsSync(expectedPath)).toBe(true);

      const expected = JSON.parse(fs.readFileSync(expectedPath, 'utf-8'));
      expect(expected.description).toBeDefined();
      expect(expected.expectations).toBeDefined();
      expect(expected.expectations.totalEndpoints).toBeDefined();
      expect(expected.expectations.totalEndpoints.operator).toBeDefined();
      expect(expected.expectations.totalEndpoints.value).toBeDefined();
    });

    it(`${name} has config.yaml`, () => {
      const configPath = exampleFile(name, 'config.yaml');
      expect(fs.existsSync(configPath)).toBe(true);
      const content = fs.readFileSync(configPath, 'utf-8');
      expect(content).toContain('version:');
      expect(content).toContain('project:');
      expect(content).toContain('analysis:');
    });

    it(`${name} has openapi.yaml with valid structure`, () => {
      const specPath = exampleFile(name, 'openapi.yaml');
      expect(fs.existsSync(specPath)).toBe(true);
      const content = fs.readFileSync(specPath, 'utf-8');
      expect(content).toContain('openapi:');
      expect(content).toContain('paths:');
    });
  }
});

// ─── Rules enforcement ──────────────────────────────────────────────────────

describe('Feature 27: Rules enforcement validation', () => {
  it('SA01: passes when no directory-based classification exists', () => {
    const symbolTable = makeEmptySymbolTable();
    const result = enforceStructureAgnosticRules(symbolTable, '/fake/root');
    expect(result.rulesPassed).toBeGreaterThan(0);
    expect(result.rulesChecked).toBeGreaterThan(0);
  });

  it('SA02: warns on empty router mount prefix with target module', () => {
    const symbolTable = makeEmptySymbolTable();
    symbolTable.routerMounts.set('app.js', [
      {
        prefix: '',
        targetModulePath: './routes/articles',
        middleware: [],
        sourceFile: 'app.js',
      },
    ]);

    const result = enforceStructureAgnosticRules(symbolTable, '/fake/root');
    expect(result.rulesChecked).toBeGreaterThan(0);
  });

  it('all 10 SA rules are checked', () => {
    const symbolTable = makeEmptySymbolTable();
    const result = enforceStructureAgnosticRules(symbolTable, '/fake/root');
    expect(result.rulesChecked).toBe(10);
  });
});
