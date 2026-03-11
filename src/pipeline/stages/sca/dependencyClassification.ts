/**
 * Dependency classification lookup table.
 *
 * Maps ~200 common dependency names to their functional category.
 * Used by the SCA stage to classify project dependencies into
 * httpClients, testFrameworks, assertionLibraries, mockingLibraries,
 * securityLibraries, performanceTools, e2eFrameworks, and frameworks.
 */

import type { DependencyCategory } from './types';

/**
 * Lookup table: dependency name (lowercased) → category.
 *
 * Entries are grouped by language ecosystem for readability.
 * When matching, we also support partial/contains matching for
 * certain patterns (e.g. "spring-security-*" → securityLibrary).
 */
export const DEPENDENCY_CLASSIFICATION: Record<string, DependencyCategory> = {
  // ─── HTTP Clients ───────────────────────────────────────────────────────────
  // JavaScript/TypeScript
  axios: 'httpClient',
  got: 'httpClient',
  'node-fetch': 'httpClient',
  'cross-fetch': 'httpClient',
  'isomorphic-fetch': 'httpClient',
  ky: 'httpClient',
  superagent: 'httpClient',
  undici: 'httpClient',
  needle: 'httpClient',
  request: 'httpClient',
  // Java/Kotlin
  'retrofit2': 'httpClient',
  'okhttp': 'httpClient',
  'okhttp3': 'httpClient',
  'httpclient': 'httpClient',
  'httpcore': 'httpClient',
  'java-http-client': 'httpClient',
  'spring-web': 'httpClient',
  'webclient': 'httpClient',
  'resttemplate': 'httpClient',
  'feign-core': 'httpClient',
  'spring-cloud-starter-openfeign': 'httpClient',
  // Python
  requests: 'httpClient',
  httpx: 'httpClient',
  aiohttp: 'httpClient',
  urllib3: 'httpClient',
  httplib2: 'httpClient',

  // ─── Test Frameworks ────────────────────────────────────────────────────────
  // JavaScript/TypeScript
  jest: 'testFramework',
  'ts-jest': 'testFramework',
  mocha: 'testFramework',
  jasmine: 'testFramework',
  'jasmine-core': 'testFramework',
  ava: 'testFramework',
  tape: 'testFramework',
  vitest: 'testFramework',
  // Java
  'junit-jupiter': 'testFramework',
  'junit-jupiter-api': 'testFramework',
  'junit-jupiter-engine': 'testFramework',
  'junit-jupiter-params': 'testFramework',
  'junit-vintage-engine': 'testFramework',
  junit: 'testFramework',
  'junit-platform-launcher': 'testFramework',
  testng: 'testFramework',
  'spring-boot-starter-test': 'testFramework',
  // Kotlin
  'kotest-runner-junit5': 'testFramework',
  'kotest-framework-engine': 'testFramework',
  'kotest-assertions-core': 'testFramework',
  // Python
  pytest: 'testFramework',
  'pytest-asyncio': 'testFramework',
  'pytest-xdist': 'testFramework',
  'pytest-cov': 'testFramework',
  unittest2: 'testFramework',
  nose2: 'testFramework',
  // Ruby
  rspec: 'testFramework',
  'rspec-core': 'testFramework',
  'rspec-rails': 'testFramework',
  minitest: 'testFramework',

  // ─── Assertion Libraries ────────────────────────────────────────────────────
  // JavaScript/TypeScript
  chai: 'assertionLibrary',
  'chai-http': 'assertionLibrary',
  'chai-as-promised': 'assertionLibrary',
  expect: 'assertionLibrary',
  'power-assert': 'assertionLibrary',
  'should': 'assertionLibrary',
  'unexpected': 'assertionLibrary',
  // Java
  assertj: 'assertionLibrary',
  'assertj-core': 'assertionLibrary',
  hamcrest: 'assertionLibrary',
  'hamcrest-core': 'assertionLibrary',
  'hamcrest-all': 'assertionLibrary',
  'truth': 'assertionLibrary',
  // Python
  'pytest-assume': 'assertionLibrary',
  'assertpy': 'assertionLibrary',

  // ─── Mocking Libraries ─────────────────────────────────────────────────────
  // JavaScript/TypeScript
  sinon: 'mockingLibrary',
  nock: 'mockingLibrary',
  'msw': 'mockingLibrary',
  'jest-mock-extended': 'mockingLibrary',
  testdouble: 'mockingLibrary',
  proxyquire: 'mockingLibrary',
  rewire: 'mockingLibrary',
  // Java
  'mockito-core': 'mockingLibrary',
  'mockito-junit-jupiter': 'mockingLibrary',
  'mockito-inline': 'mockingLibrary',
  mockito: 'mockingLibrary',
  powermock: 'mockingLibrary',
  'powermock-api-mockito2': 'mockingLibrary',
  easymock: 'mockingLibrary',
  wiremock: 'mockingLibrary',
  // Kotlin
  mockk: 'mockingLibrary',
  'mockk-android': 'mockingLibrary',
  // Python
  'pytest-mock': 'mockingLibrary',
  'responses': 'mockingLibrary',
  'requests-mock': 'mockingLibrary',
  'vcrpy': 'mockingLibrary',
  'httpretty': 'mockingLibrary',
  'freezegun': 'mockingLibrary',
  'time-machine': 'mockingLibrary',
  // Ruby
  'webmock': 'mockingLibrary',
  'vcr': 'mockingLibrary',
  'mocha-ruby': 'mockingLibrary',

  // ─── Security Libraries ─────────────────────────────────────────────────────
  // JavaScript/TypeScript
  passport: 'securityLibrary',
  'passport-jwt': 'securityLibrary',
  'passport-local': 'securityLibrary',
  helmet: 'securityLibrary',
  cors: 'securityLibrary',
  csurf: 'securityLibrary',
  'express-rate-limit': 'securityLibrary',
  jsonwebtoken: 'securityLibrary',
  bcrypt: 'securityLibrary',
  bcryptjs: 'securityLibrary',
  'jose': 'securityLibrary',
  // Java
  'spring-security-core': 'securityLibrary',
  'spring-security-web': 'securityLibrary',
  'spring-security-config': 'securityLibrary',
  'spring-security-test': 'securityLibrary',
  'spring-boot-starter-security': 'securityLibrary',
  'spring-security-oauth2': 'securityLibrary',
  'java-jwt': 'securityLibrary',
  'jjwt': 'securityLibrary',
  'jjwt-api': 'securityLibrary',
  'nimbus-jose-jwt': 'securityLibrary',
  'keycloak-spring-boot-starter': 'securityLibrary',
  // Python
  'django-cors-headers': 'securityLibrary',
  'python-jose': 'securityLibrary',
  'pyjwt': 'securityLibrary',
  'passlib': 'securityLibrary',
  'python-multipart': 'securityLibrary',
  'authlib': 'securityLibrary',

  // ─── Performance Tools ──────────────────────────────────────────────────────
  k6: 'performanceTool',
  gatling: 'performanceTool',
  'gatling-charts-highcharts': 'performanceTool',
  locust: 'performanceTool',
  artillery: 'performanceTool',
  autocannon: 'performanceTool',
  vegeta: 'performanceTool',
  wrk: 'performanceTool',
  'clinic': 'performanceTool',
  'jmeter': 'performanceTool',

  // ─── E2E Frameworks ────────────────────────────────────────────────────────
  cypress: 'e2eFramework',
  playwright: 'e2eFramework',
  '@playwright/test': 'e2eFramework',
  selenium: 'e2eFramework',
  'selenium-webdriver': 'e2eFramework',
  webdriverio: 'e2eFramework',
  puppeteer: 'e2eFramework',
  testcafe: 'e2eFramework',
  nightwatch: 'e2eFramework',
  'cucumber-js': 'e2eFramework',
  '@cucumber/cucumber': 'e2eFramework',
  // Java
  'cucumber-java': 'e2eFramework',
  'cucumber-junit': 'e2eFramework',
  'cucumber-spring': 'e2eFramework',
  'selenium-java': 'e2eFramework',
  // Python
  behave: 'e2eFramework',
  'pytest-bdd': 'e2eFramework',
  'selenium-python': 'e2eFramework',
  splinter: 'e2eFramework',
  // Ruby
  capybara: 'e2eFramework',
  'cucumber-ruby': 'e2eFramework',

  // ─── Frameworks ────────────────────────────────────────────────────────────
  // JavaScript/TypeScript
  express: 'framework',
  '@nestjs/core': 'framework',
  '@nestjs/common': 'framework',
  'fastify': 'framework',
  koa: 'framework',
  hapi: 'framework',
  '@hapi/hapi': 'framework',
  'next': 'framework',
  nuxt: 'framework',
  // Java
  'spring-boot': 'framework',
  'spring-boot-starter-web': 'framework',
  'spring-boot-starter-webflux': 'framework',
  'spring-webmvc': 'framework',
  'ktor-server-core': 'framework',
  'ktor-server-netty': 'framework',
  'ktor-server-cio': 'framework',
  'quarkus-resteasy': 'framework',
  'micronaut-http-server-netty': 'framework',
  // Python
  django: 'framework',
  'django-rest-framework': 'framework',
  'djangorestframework': 'framework',
  flask: 'framework',
  fastapi: 'framework',
  starlette: 'framework',
  tornado: 'framework',
  sanic: 'framework',
  // Ruby
  rails: 'framework',
  sinatra: 'framework',
  grape: 'framework',

  // ─── Database ────────────────────────────────────────────────────────────
  pg: 'database',
  mysql2: 'database',
  sequelize: 'database',
  typeorm: 'database',
  prisma: 'database',
  '@prisma/client': 'database',
  mongoose: 'database',
  knex: 'database',
  'better-sqlite3': 'database',

  // ─── HTTP Testing ───────────────────────────────────────────────────────
  supertest: 'testFramework',
  'rest-assured': 'testFramework',
  pactum: 'testFramework',
};

/**
 * Prefix patterns for fuzzy matching.
 * If a dependency name starts with any of these prefixes, it gets the associated category.
 */
export const DEPENDENCY_PREFIX_RULES: Array<{ prefix: string; category: DependencyCategory }> = [
  { prefix: 'spring-security', category: 'securityLibrary' },
  { prefix: 'spring-boot-starter', category: 'framework' },
  { prefix: 'junit-jupiter', category: 'testFramework' },
  { prefix: 'mockito-', category: 'mockingLibrary' },
  { prefix: 'kotest-', category: 'testFramework' },
  { prefix: 'cucumber-', category: 'e2eFramework' },
  { prefix: '@nestjs/', category: 'framework' },
  { prefix: 'passport-', category: 'securityLibrary' },
  { prefix: 'chai-', category: 'assertionLibrary' },
  { prefix: 'rspec-', category: 'testFramework' },
  { prefix: 'pytest-', category: 'testFramework' },
  { prefix: 'ktor-server', category: 'framework' },
  { prefix: 'ktor-client', category: 'httpClient' },
  { prefix: '@playwright/', category: 'e2eFramework' },
];

/**
 * Classify a dependency name into a category.
 * Returns 'unknown' if no match is found.
 */
export function classifyDependency(name: string): DependencyCategory {
  const lower = name.toLowerCase();

  // Exact match first
  const exact = DEPENDENCY_CLASSIFICATION[lower];
  if (exact) return exact;

  // Try original case for scoped packages
  const original = DEPENDENCY_CLASSIFICATION[name];
  if (original) return original;

  // Prefix matching
  for (const rule of DEPENDENCY_PREFIX_RULES) {
    if (lower.startsWith(rule.prefix)) return rule.category;
  }

  return 'unknown';
}
