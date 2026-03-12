# Feature 28 — Test Generation & Quality Intelligence Engine
## AI-Ready Test Scaffolding, Quality Scoring, and Gap-to-Code Pipeline

**Version:** 1.0
**Status:** Authoritative
**Companion to:** Feature 24 (Cascaded Scanning), Feature 27 (Structure-Agnostic Pattern Recognition)
**Scope:** Closes the final gap between *gap detection* and *gap remediation*

> **The core problem this feature solves:** Features 24 and 27 detect every coverage gap with high confidence. Feature 28 turns those gaps into runnable test code. The analyzer currently stops at "you are missing a test for POST /api/articles with auth=required". Feature 28 produces the actual Jest unit test, Cypress E2E test, and integration test skeleton — in the correct framework, for the correct language, with correct imports, correct assertion patterns, and correct fixture data — ready for a developer or Copilot to complete.

---

## Table of Contents

1. [Gap Taxonomy — What Gets Generated](#1-gap-taxonomy--what-gets-generated)
2. [Test Scaffolding Engine](#2-test-scaffolding-engine)
3. [Unit Test Generation — All Languages](#3-unit-test-generation--all-languages)
4. [Integration Test Generation — Jest + Supertest](#4-integration-test-generation--jest--supertest)
5. [Cypress E2E Test Generation](#5-cypress-e2e-test-generation)
6. [Security Test Generation](#6-security-test-generation)
7. [Test Quality Scoring Engine](#7-test-quality-scoring-engine)
8. [AI-Ready Flow Export](#8-ai-ready-flow-export)
9. [Dashboard — Gap-to-Code UI](#9-dashboard--gap-to-code-ui)
10. [CLI Commands](#10-cli-commands)
11. [Config Schema Extensions](#11-config-schema-extensions)
12. [Self-Analysis Integration](#12-self-analysis-integration)
13. [Copilot Integration Layer](#13-copilot-integration-layer)
14. [Acceptance Criteria](#14-acceptance-criteria)

---

## 1. Gap Taxonomy — What Gets Generated

Every gap detected by the coverage pipeline maps to one or more generation targets. The mapping is non-negotiable.

### 1.1 Gap-to-Generator Mapping

| Gap Type | Source Stage | Unit Test | Integration Test | Cypress Test | Security Test |
|---|---|---|---|---|---|
| Endpoint not covered | AST/TIA | ✅ | ✅ | ✅ | if auth-required |
| Parameter not tested (boundary) | AST | ✅ | ✅ | — | — |
| Parameter not tested (invalid) | AST | ✅ | ✅ | — | — |
| Error scenario not covered | AST/IAST | ✅ | ✅ | — | ✅ |
| Business rule not covered | TIA | ✅ | ✅ | — | — |
| Integration flow missing step | TIA | — | ✅ | ✅ | — |
| Security control not tested | DAST/AST | — | — | — | ✅ |
| Auth not tested (401/403 path) | AST | ✅ | ✅ | — | ✅ |
| Optional-auth not tested (both paths) | AST | ✅ | ✅ | — | — |
| Performance threshold not tested | IAST | — | — | — | — |

### 1.2 Generation Priority

Generators run in priority order. A gap may generate tests at multiple levels. Priority determines which is emitted first in the output.

```
P0 — Security gaps (auth bypass, injection, 401/403 missing) → security test + unit test
P1 — Uncovered endpoint (zero tests) → integration test + unit test
P2 — Error scenario missing (4xx/5xx not tested) → unit test
P3 — Business rule not covered → unit test
P4 — Parameter boundary/invalid missing → unit test
P5 — Flow step missing → integration test + Cypress test
```

### 1.3 Gap Identity

Each gap has a stable `gapId` derived from the endpoint + type + condition. The same gap always produces the same scaffold skeleton (content is deterministic given the same gap). This allows diffs between runs to show only new gaps.

```typescript
// Gap ID format: {type}:{method}:{path}:{condition}
// Examples:
// "endpoint:POST:/api/articles:uncovered"
// "error:POST:/api/articles:401"
// "parameter:GET:/api/articles:limit:boundary-upper"
// "business:auth-required:POST:/api/articles:no-auth-test"
// "security:POST:/api/articles:missing-sql-injection-test"
```

---

## 2. Test Scaffolding Engine

### 2.1 Architecture

```
GapList (from coverage pipeline)
    ↓
GapClassifier — determines language, framework, test type per gap
    ↓
TemplateSelector — selects the correct template for language × framework × test type
    ↓
ContextBuilder — assembles endpoint data, parameter schemas, auth config, fixture seeds
    ↓
CodeRenderer — renders the template with context → raw TypeScript/JavaScript/Python/Java/etc.
    ↓
ImportResolver — computes correct import paths relative to target test file location
    ↓
FileRouter — determines the output path for each generated file
    ↓
FileWriter — writes files to disk (or dry-run mode: prints to stdout)
```

### 2.2 Language + Framework Detection

The scaffolding engine reads `discoveryInfo` from `coverage-summary.json` (set by the `analyze` command using Feature 27's detection results). It uses this to select templates.

**Language → Test Framework mapping (default):**

| Language | Default Unit Framework | Default Integration Framework | Default E2E |
|---|---|---|---|
| TypeScript / JavaScript | Jest | Jest + Supertest | Cypress |
| Python | pytest | pytest | — |
| Java | JUnit 5 | Spring Boot Test / RestAssured | — |
| Kotlin | JUnit 5 + Kotest | Spring Boot Test | — |
| Ruby | RSpec | RSpec + rack-test | — |
| PHP | PHPUnit | PHPUnit | — |

**Override via config:**
```yaml
# config.yaml
generation:
  unitFramework: jest          # override default
  integrationFramework: supertest
  e2eFramework: cypress
  outputDir: generated-tests/
  dryRun: false
  fileNamingConvention: kebab  # kebab | camelCase | snake_case
```

### 2.3 Template System

Templates are stored in `src/generation/templates/{language}/{framework}/{testType}.hbs` (Handlebars format).

**Required template set (all must exist at launch):**

```
src/generation/templates/
├── typescript/
│   ├── jest/
│   │   ├── unit.hbs
│   │   ├── integration-supertest.hbs
│   │   ├── error-scenario.hbs
│   │   ├── security.hbs
│   │   └── business-rule.hbs
│   └── cypress/
│       ├── e2e-endpoint.hbs
│       ├── e2e-flow.hbs
│       └── e2e-auth.hbs
├── python/
│   └── pytest/
│       ├── unit.hbs
│       ├── integration.hbs
│       ├── error-scenario.hbs
│       └── security.hbs
├── java/
│   └── junit5/
│       ├── unit.hbs
│       ├── integration-restassured.hbs
│       ├── spring-mockmvc.hbs
│       └── security.hbs
└── shared/
    └── fixture-seed.hbs     # Language-agnostic fixture JSON
```

### 2.4 Context Object Schema

Every template receives a `GenerationContext` object:

```typescript
interface GenerationContext {
  gap: {
    id: string;               // stable gapId
    type: GapType;
    priority: 'P0'|'P1'|'P2'|'P3'|'P4'|'P5';
    riskScore: number;        // 0–100 from intelligence engine
  };
  endpoint: {
    method: string;           // 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
    path: string;             // '/api/articles/{slug}'
    pathNormalized: string;   // '/api/articles/:slug' (framework-native format)
    operationId?: string;     // from OpenAPI if available
    summary?: string;         // human-readable name
    tags?: string[];
    auth: {
      required: boolean;
      optional: boolean;
      type?: 'jwt' | 'basic' | 'oauth2' | 'apikey';
      headerName?: string;    // e.g. 'Authorization'
      scheme?: string;        // e.g. 'Bearer'
    };
  };
  parameters: Array<{
    name: string;
    in: 'query' | 'path' | 'header' | 'body';
    required: boolean;
    schema: {
      type: string;
      format?: string;
      minimum?: number;
      maximum?: number;
      minLength?: number;
      maxLength?: number;
      enum?: unknown[];
      pattern?: string;
    };
    missingCases: Array<'boundary-min' | 'boundary-max' | 'invalid-type' | 'missing-required' | 'sql-injection' | 'xss'>;
  }>;
  responses: Array<{
    statusCode: number;
    description?: string;
    schema?: unknown;
  }>;
  fixtures: {
    validPayload: Record<string, unknown>;    // auto-generated from schema
    invalidPayload: Record<string, unknown>;  // deliberately invalid
    authToken: string;                        // placeholder token constant
    pathParams: Record<string, string>;       // e.g. { slug: 'test-article-slug' }
  };
  project: {
    name: string;
    language: string;
    framework: string;
    testFramework: string;
    baseUrl: string;          // e.g. 'http://localhost:3000'
    importPrefix: string;     // relative path from output file to src/
  };
  businessRule?: {
    id: string;
    description: string;
    condition: string;
    acceptanceCriteria: string[];
  };
  securityControl?: {
    type: 'sql-injection' | 'xss' | 'auth-bypass' | 'rate-limit' | 'mass-assignment';
    description: string;
    attackVector: string;
    expectedStatusCode: number;
  };
  flow?: {
    id: string;
    name: string;
    steps: Array<{ method: string; path: string; description: string }>;
    missingStepIndex: number;
  };
}
```

---

## 3. Unit Test Generation — All Languages

### 3.1 TypeScript / JavaScript (Jest)

**Template renders a complete Jest test file.** Rules:

- One `describe()` block per endpoint, named after the operationId or `{METHOD} {path}`
- One `it()` block per missing test case
- Imports are resolved relative to the output file path
- `beforeEach()` sets up mock server or supertest app if integration-level
- Auth setup uses the `fixtures.authToken` placeholder with a `TODO` comment
- All assertions use `expect()` with specific matchers — never generic `toBeTruthy()`

**Example output for gap `endpoint:POST:/api/articles:uncovered`:**

```typescript
// generated-tests/api/articles.post.test.ts
// AUTO-GENERATED by api-test-coverage-analyzer (Feature 28)
// Gap: endpoint:POST:/api/articles:uncovered | Risk: 85 | Priority: P1
// TODO: Review generated assertions and replace placeholder values

import request from 'supertest';
import { app } from '../../src/app';

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000';

// TODO: Replace with a valid JWT token from your test auth setup
const VALID_AUTH_TOKEN = 'Bearer <your-test-token>';

describe('POST /api/articles', () => {
  describe('happy path', () => {
    it('should create an article and return 201 with the created article', async () => {
      const payload = {
        article: {
          title: 'Test Article Title',      // TODO: Replace with realistic test data
          description: 'Test description',
          body: 'Test article body content',
          tagList: ['test', 'generated'],
        },
      };

      const response = await request(app)
        .post('/api/articles')
        .set('Authorization', VALID_AUTH_TOKEN)
        .send(payload);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('article');
      expect(response.body.article).toHaveProperty('slug');
      expect(response.body.article.title).toBe(payload.article.title);
    });
  });

  describe('authentication', () => {
    it('should return 401 when no auth token is provided', async () => {
      const response = await request(app)
        .post('/api/articles')
        .send({ article: { title: 'Test', body: 'Body', description: 'Desc' } });

      expect(response.status).toBe(401);
    });

    it('should return 401 when an invalid auth token is provided', async () => {
      const response = await request(app)
        .post('/api/articles')
        .set('Authorization', 'Bearer invalid-token-value')
        .send({ article: { title: 'Test', body: 'Body', description: 'Desc' } });

      expect(response.status).toBe(401);
    });
  });

  describe('validation', () => {
    it('should return 422 when title is missing', async () => {
      const response = await request(app)
        .post('/api/articles')
        .set('Authorization', VALID_AUTH_TOKEN)
        .send({ article: { body: 'Body without title', description: 'Desc' } });

      expect(response.status).toBe(422);
      expect(response.body).toHaveProperty('errors');
    });

    it('should return 422 when body is missing', async () => {
      const response = await request(app)
        .post('/api/articles')
        .set('Authorization', VALID_AUTH_TOKEN)
        .send({ article: { title: 'Title without body', description: 'Desc' } });

      expect(response.status).toBe(422);
    });
  });
});
```

**Non-negotiable rules for TypeScript/Jest output:**
- `RULE-GEN01` — Every generated file MUST start with the `// AUTO-GENERATED` comment block with gapId, risk score, and priority.
- `RULE-GEN02` — Every placeholder value (tokens, IDs, URLs) MUST have a `// TODO:` comment explaining what to replace it with.
- `RULE-GEN03` — Auth tests (401, 403) are ALWAYS generated when `auth.required === true` — they are never optional.
- `RULE-GEN04` — `expect(response.status).toBe(N)` MUST be the first assertion in every test — never assert on body without asserting on status first.
- `RULE-GEN05` — Never use `expect(response.body).toBeTruthy()` — always assert on specific properties.
- `RULE-GEN06` — Generated files MUST compile with `tsc --noEmit` without errors. If the template cannot produce valid TypeScript, it must emit a compile error comment and fail generation for that gap.

### 3.2 Python (pytest)

**Example output for gap `endpoint:POST:/api/articles:uncovered` in Flask project:**

```python
# generated-tests/test_articles_post.py
# AUTO-GENERATED by api-test-coverage-analyzer (Feature 28)
# Gap: endpoint:POST:/api/articles:uncovered | Risk: 85 | Priority: P1
# TODO: Review generated assertions and replace placeholder values

import pytest

# TODO: Import your app factory and configure for testing
# from conduit.app import create_app

VALID_AUTH_TOKEN = 'Token <your-test-token>'  # TODO: Replace


@pytest.fixture
def client(app):
    """TODO: Configure this fixture for your Flask test setup."""
    return app.test_client()


class TestPostArticles:
    """Tests for POST /api/articles"""

    def test_create_article_happy_path(self, client):
        """Should create an article and return 201."""
        payload = {
            'article': {
                'title': 'Test Article Title',  # TODO: Replace
                'description': 'Test description',
                'body': 'Test article body',
                'tagList': ['test'],
            }
        }

        response = client.post(
            '/api/articles',
            json=payload,
            headers={'Authorization': VALID_AUTH_TOKEN},
        )

        assert response.status_code == 201
        data = response.get_json()
        assert 'article' in data
        assert 'slug' in data['article']
        assert data['article']['title'] == payload['article']['title']

    def test_create_article_requires_auth(self, client):
        """Should return 401 when no auth token is provided."""
        response = client.post(
            '/api/articles',
            json={'article': {'title': 'Test', 'body': 'Body', 'description': 'Desc'}},
        )

        assert response.status_code == 401

    def test_create_article_invalid_token(self, client):
        """Should return 401 when an invalid token is provided."""
        response = client.post(
            '/api/articles',
            json={'article': {'title': 'Test', 'body': 'Body', 'description': 'Desc'}},
            headers={'Authorization': 'Token invalid-token'},
        )

        assert response.status_code == 401

    def test_create_article_missing_title(self, client):
        """Should return 422 when title is missing."""
        response = client.post(
            '/api/articles',
            json={'article': {'body': 'Body without title', 'description': 'Desc'}},
            headers={'Authorization': VALID_AUTH_TOKEN},
        )

        assert response.status_code == 422
        data = response.get_json()
        assert 'errors' in data
```

### 3.3 Java (JUnit 5 + Spring Boot Test)

**Example output for gap `endpoint:POST:/api/articles:uncovered` in Spring Boot project:**

```java
// src/test/java/io/spring/generated/ArticlesApiPostTest.java
// AUTO-GENERATED by api-test-coverage-analyzer (Feature 28)
// Gap: endpoint:POST:/api/articles:uncovered | Risk: 85 | Priority: P1
// TODO: Review generated assertions and replace placeholder values

package io.spring.generated;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
public class ArticlesApiPostTest {

    @Autowired
    private MockMvc mockMvc;

    // TODO: Replace with a valid JWT from your test auth setup
    private static final String VALID_TOKEN = "Token <your-test-token>";

    @Test
    void createArticle_happyPath_returns201() throws Exception {
        String payload = """
            {
              "article": {
                "title": "Test Article Title",
                "description": "Test description",
                "body": "Test article body"
              }
            }
            """;  // TODO: Replace with realistic test data

        mockMvc.perform(post("/api/articles")
                .header("Authorization", VALID_TOKEN)
                .contentType(MediaType.APPLICATION_JSON)
                .content(payload))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.article").exists())
            .andExpect(jsonPath("$.article.slug").exists())
            .andExpect(jsonPath("$.article.title").value("Test Article Title"));
    }

    @Test
    void createArticle_noAuth_returns401() throws Exception {
        mockMvc.perform(post("/api/articles")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"article\":{\"title\":\"T\",\"body\":\"B\",\"description\":\"D\"}}"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void createArticle_invalidToken_returns401() throws Exception {
        mockMvc.perform(post("/api/articles")
                .header("Authorization", "Token invalid-token")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"article\":{\"title\":\"T\",\"body\":\"B\",\"description\":\"D\"}}"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void createArticle_missingTitle_returns422() throws Exception {
        mockMvc.perform(post("/api/articles")
                .header("Authorization", VALID_TOKEN)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"article\":{\"body\":\"Body without title\",\"description\":\"D\"}}"))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.errors").exists());
    }
}
```

---

## 4. Integration Test Generation — Jest + Supertest

### 4.1 Multi-Step Flow Tests

When a gap is `flow-step-missing`, the generator produces a single test that covers ALL steps of the flow including the missing one.

**Example for gap `integration:create-and-publish-article:step-3-missing`:**

```typescript
// generated-tests/flows/create-and-publish-article.flow.test.ts
// AUTO-GENERATED by api-test-coverage-analyzer (Feature 28)
// Gap: integration:create-and-publish-article:step-3-missing | Risk: 72 | Priority: P5

import request from 'supertest';
import { app } from '../../src/app';

describe('Integration Flow: Create and Publish Article', () => {
  let authToken: string;
  let createdSlug: string;

  // Step 1: Register/Login to get auth token
  beforeAll(async () => {
    // TODO: Replace with your test user credentials
    const loginResponse = await request(app)
      .post('/api/users/login')
      .send({ user: { email: 'test@example.com', password: 'testpassword' } });

    expect(loginResponse.status).toBe(200);
    authToken = `Token ${loginResponse.body.user.token}`;
  });

  it('Step 1: should create an article', async () => {
    const response = await request(app)
      .post('/api/articles')
      .set('Authorization', authToken)
      .send({
        article: {
          title: 'Flow Test Article',
          description: 'Created in integration flow test',
          body: 'Article body for flow test',
        },
      });

    expect(response.status).toBe(201);
    createdSlug = response.body.article.slug;
    expect(createdSlug).toBeTruthy();
  });

  it('Step 2: should retrieve the created article', async () => {
    const response = await request(app)
      .get(`/api/articles/${createdSlug}`);

    expect(response.status).toBe(200);
    expect(response.body.article.slug).toBe(createdSlug);
  });

  // ⚠️ MISSING STEP — This step was detected as uncovered by the analyzer
  it('Step 3: should update the article (MISSING COVERAGE)', async () => {
    // TODO: This step was identified as missing. Implement the test.
    const response = await request(app)
      .put(`/api/articles/${createdSlug}`)
      .set('Authorization', authToken)
      .send({
        article: {
          body: 'Updated article body',
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.article.body).toBe('Updated article body');
  });

  it('Step 4: should delete the article', async () => {
    const response = await request(app)
      .delete(`/api/articles/${createdSlug}`)
      .set('Authorization', authToken);

    expect(response.status).toBe(204);
  });
});
```

### 4.2 Integration Test Rules

- `RULE-INT01` — Flow tests MUST use sequential `it()` blocks (not nested `describe`) so that each step can be independently reported.
- `RULE-INT02` — State shared between steps (tokens, created IDs, slugs) MUST use `let` declarations above the test blocks, not `const` inside them.
- `RULE-INT03` — The missing step MUST be marked with `// ⚠️ MISSING STEP` comment and a `// TODO` explaining what needs to be implemented.
- `RULE-INT04` — `beforeAll()` is used for auth setup, NOT `beforeEach()`, because flow tests are stateful by design.
- `RULE-INT05` — Cleanup (DELETE the created resource) MUST be included as the final step when the endpoint supports it.

---

## 5. Cypress E2E Test Generation

### 5.1 Endpoint E2E Tests

Cypress tests are generated for gaps where `cy:true` is set in the gap mapping (Section 1.1).

**Example for gap `endpoint:POST:/api/articles:uncovered` (Cypress):**

```javascript
// cypress/e2e/generated/articles-post.cy.js
// AUTO-GENERATED by api-test-coverage-analyzer (Feature 28)
// Gap: endpoint:POST:/api/articles:uncovered | Risk: 85 | Priority: P1

describe('POST /api/articles — E2E', () => {
  let authToken;

  before(() => {
    // TODO: Replace with your Cypress login command or fixture
    cy.request('POST', '/api/users/login', {
      user: { email: Cypress.env('TEST_USER_EMAIL'), password: Cypress.env('TEST_USER_PASSWORD') },
    }).then((response) => {
      expect(response.status).to.eq(200);
      authToken = `Token ${response.body.user.token}`;
    });
  });

  it('should create an article successfully', () => {
    cy.request({
      method: 'POST',
      url: '/api/articles',
      headers: { Authorization: authToken },
      body: {
        article: {
          title: 'Cypress E2E Test Article',
          description: 'Created by generated Cypress test',
          body: 'Article body from Cypress E2E test',
        },
      },
    }).then((response) => {
      expect(response.status).to.eq(201);
      expect(response.body).to.have.property('article');
      expect(response.body.article).to.have.property('slug');
    });
  });

  it('should return 401 without auth token', () => {
    cy.request({
      method: 'POST',
      url: '/api/articles',
      body: { article: { title: 'Test', body: 'Body', description: 'Desc' } },
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.eq(401);
    });
  });
});
```

### 5.2 Cypress Flow Tests

For `flow-step-missing` gaps, Cypress generates a `cy.session()`-based multi-step test.

**Rules for Cypress generation:**
- `RULE-CY01` — All generated Cypress tests use `cy.request()`, not `cy.visit()`, unless explicitly testing UI interactions. The tool generates API-level Cypress tests.
- `RULE-CY02` — Auth tokens are set via `cy.session()` in `before()` hooks — never hardcoded.
- `RULE-CY03` — `failOnStatusCode: false` is used for negative-path tests (4xx/5xx) so Cypress does not fail on the request itself.
- `RULE-CY04` — Generated Cypress tests MUST be placed in `cypress/e2e/generated/` — never in `cypress/e2e/` root (to separate generated from handwritten tests).
- `RULE-CY05` — The Cypress config `specPattern` MUST NOT be modified by the generator. The generator adds a `// NOTE: add generated/ to your specPattern` comment to the generated file if it cannot detect that the pattern already includes `generated/`.

---

## 6. Security Test Generation

### 6.1 Auth Bypass Tests

Generated for every endpoint with `auth.required === true` that has no test asserting a 401 or 403 response.

```typescript
// generated-tests/security/articles-post.security.test.ts
// AUTO-GENERATED by api-test-coverage-analyzer (Feature 28)
// Gap: security:POST:/api/articles:auth-bypass | Risk: 95 | Priority: P0

import request from 'supertest';
import { app } from '../../src/app';

describe('Security: POST /api/articles — Auth Controls', () => {
  it('[SEC-AUTH-01] should reject requests with no Authorization header', async () => {
    const response = await request(app)
      .post('/api/articles')
      .send({ article: { title: 'Test', body: 'Body', description: 'Desc' } });

    expect(response.status).toBe(401);
  });

  it('[SEC-AUTH-02] should reject requests with malformed token', async () => {
    const response = await request(app)
      .post('/api/articles')
      .set('Authorization', 'malformed-token-without-scheme')
      .send({ article: { title: 'Test', body: 'Body', description: 'Desc' } });

    expect(response.status).toBe(401);
  });

  it('[SEC-AUTH-03] should reject requests with expired token', async () => {
    // TODO: Generate or use a known-expired JWT for your test environment
    const expiredToken = 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJpYXQiOjE2MDAwMDAwMDAsImV4cCI6MTYwMDAwMDAwMX0.TODO';

    const response = await request(app)
      .post('/api/articles')
      .set('Authorization', expiredToken)
      .send({ article: { title: 'Test', body: 'Body', description: 'Desc' } });

    expect(response.status).toBe(401);
  });

  it('[SEC-AUTH-04] should reject requests with a token for a different user role', async () => {
    // TODO: Get a token for a user WITHOUT the required permissions
    const lowPrivToken = 'Bearer <low-privilege-token>';

    const response = await request(app)
      .post('/api/articles')
      .set('Authorization', lowPrivToken)
      .send({ article: { title: 'Test', body: 'Body', description: 'Desc' } });

    // Expect either 401 (unauthenticated) or 403 (unauthorized)
    expect([401, 403]).toContain(response.status);
  });
});
```

### 6.2 Injection Tests

Generated for every endpoint with body/query parameters when the gap type is `security:injection-not-tested`.

```typescript
// generated-tests/security/articles-injection.security.test.ts
// AUTO-GENERATED by api-test-coverage-analyzer (Feature 28)
// Gap: security:POST:/api/articles:injection | Risk: 88 | Priority: P0

describe('Security: POST /api/articles — Injection Prevention', () => {
  it('[SEC-INJ-01] should not execute SQL injection in title field', async () => {
    const response = await request(app)
      .post('/api/articles')
      .set('Authorization', VALID_AUTH_TOKEN)
      .send({
        article: {
          title: "'; DROP TABLE articles; --",
          body: 'Body',
          description: 'Desc',
        },
      });

    // Should either succeed (sanitized) or return 422 (rejected) — never 500
    expect(response.status).not.toBe(500);
    expect(response.status).not.toBe(503);
  });

  it('[SEC-INJ-02] should not execute XSS in title field', async () => {
    const response = await request(app)
      .post('/api/articles')
      .set('Authorization', VALID_AUTH_TOKEN)
      .send({
        article: {
          title: '<script>alert("xss")</script>',
          body: 'Body',
          description: 'Desc',
        },
      });

    expect(response.status).not.toBe(500);

    if (response.status === 201) {
      // If the server accepted it, it must have been sanitized
      expect(response.body.article.title).not.toContain('<script>');
    }
  });

  it('[SEC-INJ-03] should handle oversized payload gracefully', async () => {
    const oversizedBody = 'x'.repeat(10_000_000); // 10 MB

    const response = await request(app)
      .post('/api/articles')
      .set('Authorization', VALID_AUTH_TOKEN)
      .send({ article: { title: 'Test', body: oversizedBody, description: 'Desc' } });

    // Must not crash — 413 or 422 are acceptable
    expect([413, 422, 400]).toContain(response.status);
  });
});
```

### 6.3 Security Test Rules

- `RULE-SEC01` — Security test IDs (`[SEC-AUTH-01]`, `[SEC-INJ-01]`) MUST be included in the `it()` label. These are used for traceability in the security coverage report.
- `RULE-SEC02` — Injection tests MUST use `not.toBe(500)` as the primary assertion — a 500 response to injection input is always a defect.
- `RULE-SEC03` — XSS tests that get a 2xx response MUST additionally assert that the returned value does not contain the injected script tag.
- `RULE-SEC04` — NEVER generate tests that use real SQL or shell commands that could cause actual damage. Use canonical OWASP test strings only (the generator has a hardcoded allowlist).
- `RULE-SEC05` — Rate limit tests are NOT generated unless `config.yaml` explicitly sets `generation.securityTests.includeRateLimit: true`. Rate limit behavior is too environment-specific to generate safely by default.

---

## 7. Test Quality Scoring Engine

### 7.1 Overview

The Quality Scoring Engine evaluates EXISTING tests (not generated ones) and assigns each test file a quality score from 0–100. It runs as part of the coverage pipeline and adds `testQuality` data to `coverage-summary.json`.

This answers the question: **"We have 80% endpoint coverage, but how GOOD are those tests?"**

### 7.2 Quality Dimensions

Each test file is scored on 5 dimensions (20 points each = 100 total):

| Dimension | What is measured | Max points |
|---|---|---|
| **Assertion Depth** | Does the test assert on specific values, or just status codes? | 20 |
| **Negative Path Coverage** | Does the test cover error paths (4xx, exceptions)? | 20 |
| **Auth Coverage** | Does the test cover both authed and unauthed paths for secured endpoints? | 20 |
| **Boundary Coverage** | Does the test cover min/max/empty/null for parameters? | 20 |
| **Test Independence** | Does the test clean up after itself? Are tests ordered-independent? | 20 |

### 7.3 Assertion Depth Scoring

```
+20 — Asserts on specific field values (e.g. expect(body.user.email).toBe('test@example.com'))
+15 — Asserts on field existence + type (e.g. expect(body).toHaveProperty('user'))
+10 — Asserts only on status code (e.g. expect(status).toBe(200))
 +5 — Asserts using toBeTruthy() / toBeDefined() (weak assertions)
 +0 — No assertions (test just calls the endpoint and checks it doesn't throw)
```

### 7.4 Quality Score Output

The quality scorer adds to `coverage-summary.json`:

```json
{
  "testQuality": {
    "overallScore": 67,
    "byFile": [
      {
        "file": "tests/articles.test.ts",
        "score": 85,
        "dimensions": {
          "assertionDepth": 18,
          "negativePathCoverage": 20,
          "authCoverage": 15,
          "boundaryCoverage": 12,
          "testIndependence": 20
        },
        "issues": [
          "Missing boundary tests for 'limit' parameter (max value not tested)",
          "Auth coverage incomplete: optional-auth path not tested"
        ],
        "strengths": [
          "Good assertion depth on response body fields",
          "All error scenarios covered"
        ]
      }
    ],
    "lowestQualityFiles": ["tests/users.test.ts", "tests/profiles.test.ts"],
    "highestRiskLowQualityGaps": [
      {
        "endpoint": "POST /api/articles",
        "qualityScore": 35,
        "riskScore": 85,
        "primaryIssue": "Only status code assertions, no body validation"
      }
    ]
  }
}
```

### 7.5 Quality Gate Integration

```yaml
# config.yaml
qualityGate:
  enabled: true
  minimumTestQualityScore: 70    # Fail CI if any test file scores below this
  enforceOnFiles:
    - "tests/**/*.test.ts"
  excludeFromQualityGate:
    - "tests/fixtures/**"
    - "generated-tests/**"        # Generated tests are excluded from quality gate
```

---

## 8. AI-Ready Flow Export

### 8.1 Purpose

The `ai-ready-flows` export produces a structured document optimized for consumption by AI coding assistants (Copilot, Cursor, Claude, etc.). It is NOT a report — it is a **prompt-ready context document** that an AI can use to generate tests without needing to analyze the codebase itself.

### 8.2 Output Format

```
reports/ai-ready-flows.md        — Primary Markdown document (human + AI readable)
reports/ai-ready-flows.json      — Structured JSON for programmatic AI consumption
```

### 8.3 AI-Ready Flows Markdown Structure

```markdown
# AI-Ready Test Generation Context
> Generated by api-test-coverage-analyzer | Project: my-api | Analyzed: 2026-03-12

## How to Use This Document
This document contains structured context for an AI assistant to generate missing tests.
For each gap section below, instruct your AI: "Generate tests for this gap using the context provided."

---

## Gap 1: POST /api/articles — No Test Coverage [PRIORITY: P1 | RISK: 85]

### What Needs Testing
Endpoint `POST /api/articles` has zero test coverage. Tests are needed for:
- Happy path: valid article creation (expect 201)
- Auth missing: no token provided (expect 401)
- Auth invalid: bad token (expect 401)
- Validation: missing required fields (expect 422)

### Endpoint Contract
- **Method:** POST
- **Path:** `/api/articles`
- **Auth:** Required (JWT Bearer token)
- **Content-Type:** application/json

### Request Schema
```json
{
  "article": {
    "title": "string (required, min 1 char)",
    "description": "string (required)",
    "body": "string (required)",
    "tagList": "string[] (optional)"
  }
}
```

### Response Schema (201 Created)
```json
{
  "article": {
    "slug": "string",
    "title": "string",
    "description": "string",
    "body": "string",
    "createdAt": "ISO8601 string",
    "updatedAt": "ISO8601 string",
    "author": { "username": "string", "bio": "string|null", "image": "string|null" }
  }
}
```

### Project Context
- **Language:** TypeScript
- **Test Framework:** Jest + Supertest
- **App Import:** `import { app } from '../../src/app'`
- **Auth Setup:** Use `POST /api/users/login` to get a JWT token before the test
- **Existing Similar Tests:** See `tests/users.test.ts` for auth setup pattern

### Copilot Instructions
Generate a Jest + Supertest test file at `tests/articles.post.test.ts` covering all cases listed above.
Follow the pattern in `tests/users.test.ts` for auth setup.
Use `expect(response.status).toBe(N)` before asserting on body.
```

---

## Gap 2: ...
```

### 8.4 AI-Ready Flows JSON Structure

```json
{
  "generatedAt": "2026-03-12T10:00:00Z",
  "project": {
    "name": "my-api",
    "language": "typescript",
    "testFramework": "jest",
    "appImportPath": "../../src/app"
  },
  "gaps": [
    {
      "gapId": "endpoint:POST:/api/articles:uncovered",
      "priority": "P1",
      "riskScore": 85,
      "type": "endpoint",
      "endpoint": {
        "method": "POST",
        "path": "/api/articles",
        "auth": { "required": true, "type": "jwt", "scheme": "Bearer" }
      },
      "missingTestCases": [
        { "id": "happy-path", "description": "valid article creation", "expectedStatus": 201 },
        { "id": "no-auth", "description": "missing auth token", "expectedStatus": 401 },
        { "id": "invalid-auth", "description": "invalid token", "expectedStatus": 401 },
        { "id": "missing-title", "description": "missing required field", "expectedStatus": 422 }
      ],
      "requestSchema": { ... },
      "responseSchema": { ... },
      "copilotPrompt": "Generate a Jest + Supertest test file at tests/articles.post.test.ts ...",
      "suggestedOutputPath": "tests/articles.post.test.ts",
      "existingSimilarTests": ["tests/users.test.ts"]
    }
  ]
}
```

### 8.5 Copilot Prompt Generation Rules

The `copilotPrompt` field in `ai-ready-flows.json` is a ready-to-paste prompt for GitHub Copilot Chat. Rules:

- `RULE-AI01` — The prompt MUST specify the exact output file path.
- `RULE-AI02` — The prompt MUST reference an existing similar test file for style guidance.
- `RULE-AI03` — The prompt MUST list every test case that needs to be generated (not just "add tests").
- `RULE-AI04` — The prompt MUST specify the exact import statement for the app under test.
- `RULE-AI05` — The prompt MUST NOT exceed 800 tokens (to fit within Copilot context limits). If the gap requires more context, split into multiple prompts.
- `RULE-AI06` — The prompt MUST be in English regardless of the project's documentation language.

---

## 9. Dashboard — Gap-to-Code UI

### 9.1 New Dashboard Page: Test Generator

A new React page `TestGeneratorPage.tsx` is added to the dashboard. It is accessible at `/generator`.

**Page layout:**

```
┌─────────────────────────────────────────────────────────────┐
│  🧪 Test Generator                          [Generate All]  │
├──────────────────┬──────────────────────────────────────────┤
│ Filter:          │                                          │
│ [All Priorities] │  Gap: POST /api/articles                │
│ [All Types    ]  │  Priority: P1 | Risk: 85 | Type: endpoint│
│ [All Languages]  │                                          │
│                  │  Missing: 4 test cases                   │
│ ── Gaps (12) ──  │  ┌────────────────────────────────────┐ │
│                  │  │ // AUTO-GENERATED                   │ │
│ ● POST /api/art… │  │ import request from 'supertest'    │ │
│   P1 | Risk: 85  │  │ ...                                │ │
│                  │  │ describe('POST /api/articles', () =>│ │
│ ● GET /api/profi │  │   it('happy path ...', async () => │ │
│   P2 | Risk: 71  │  └────────────────────────────────────┘ │
│                  │                                          │
│ ● DELETE /api/a… │  [📋 Copy to Clipboard]  [💾 Download] │
│   P2 | Risk: 68  │  [🤖 Copy Copilot Prompt]              │
│                  │                                          │
└──────────────────┴──────────────────────────────────────────┘
```

### 9.2 Page Behavior

- Clicking a gap in the left panel renders the generated test code in the right panel with syntax highlighting.
- **"Copy to Clipboard"** copies the raw test code.
- **"Download"** downloads the file with the correct filename.
- **"Copy Copilot Prompt"** copies the `copilotPrompt` from `ai-ready-flows.json` for that gap.
- **"Generate All"** button triggers a download of a ZIP containing all generated test files at their correct paths.
- The page reads from `reports/ai-ready-flows.json` — it does NOT call any backend; all generation logic runs at analysis time and is baked into the JSON.

### 9.3 Test Quality Page Enhancement

The existing dashboard is extended with a `TestQualityPage.tsx` at `/quality`.

**Page layout:**

```
┌──────────────────────────────────────────────────────────────┐
│  📊 Test Quality Score                    Overall: 67/100   │
├──────────────────────────────────────────────────────────────┤
│  Quality Distribution          │ Lowest Quality Files        │
│  ████████░░ 67/100             │ tests/users.test.ts    42  │
│                                │ tests/profiles.test.ts 45  │
│  Assertion Depth    ████ 18/20 │ tests/comments.test.ts 51  │
│  Negative Paths     ████ 20/20 │                             │
│  Auth Coverage      ███░ 15/20 │ High Risk + Low Quality     │
│  Boundary Tests     ██░░ 12/20 │ POST /api/articles    35   │
│  Test Independence  ████ 20/20 │  → Only status code asserts │
└──────────────────────────────────────────────────────────────┘
```

---

## 10. CLI Commands

### 10.1 `generate-tests` command

```bash
api-tests-coverage-analyzer generate-tests [options]
```

| Option | Description | Default |
|---|---|---|
| `--reports-dir <dir>` | Directory with coverage reports | `reports/` |
| `--out-dir <dir>` | Output directory for generated tests | `generated-tests/` |
| `--language <lang>` | Target language override | auto-detected |
| `--framework <fw>` | Test framework override | auto-detected |
| `--priority <p>` | Only generate for gaps at this priority or higher | `P1` |
| `--dry-run` | Print generated tests to stdout, do not write files | `false` |
| `--overwrite` | Overwrite existing generated files | `false` |
| `--gap-id <id>` | Generate tests for a single specific gap | all gaps |
| `--types <list>` | Comma-separated gap types to generate | `all` |
| `--no-security` | Skip security test generation | `false` |
| `--no-cypress` | Skip Cypress test generation | `false` |

```bash
# Examples:
api-tests-coverage-analyzer generate-tests
api-tests-coverage-analyzer generate-tests --priority P0 --dry-run
api-tests-coverage-analyzer generate-tests --gap-id "endpoint:POST:/api/articles:uncovered"
api-tests-coverage-analyzer generate-tests --types unit,integration --no-cypress
```

### 10.2 `export-ai-flows` command

```bash
api-tests-coverage-analyzer export-ai-flows [options]
```

| Option | Description | Default |
|---|---|---|
| `--reports-dir <dir>` | Directory with coverage reports | `reports/` |
| `--out-dir <dir>` | Output directory for AI flow files | `reports/` |
| `--format <fmt>` | Output format: `markdown`, `json`, `both` | `both` |
| `--max-gaps <n>` | Maximum number of gaps to include | `50` |
| `--priority <p>` | Only include gaps at this priority or higher | `P3` |

### 10.3 `score-tests` command

```bash
api-tests-coverage-analyzer score-tests [options]
```

| Option | Description | Default |
|---|---|---|
| `--tests <glob>` | Glob pattern for test files to score | auto-detected |
| `--reports-dir <dir>` | Directory to write quality score output | `reports/` |
| `--fail-below <score>` | Exit non-zero if any file scores below this | `0` (disabled) |

### 10.4 `make` targets

```makefile
generate-tests:          ## Generate test scaffolds for all detected gaps
	api-tests-coverage-analyzer generate-tests

generate-tests-dry-run:  ## Preview generated tests without writing files
	api-tests-coverage-analyzer generate-tests --dry-run

export-ai-flows:         ## Export AI-ready flow documentation
	api-tests-coverage-analyzer export-ai-flows

score-tests:             ## Score quality of existing test suite
	api-tests-coverage-analyzer score-tests

ci-with-generation: ci export-ai-flows score-tests  ## Full CI + generation pipeline
```

---

## 11. Config Schema Extensions

```yaml
# config.yaml — new generation section

generation:
  enabled: true                    # Master switch — default true
  outputDir: generated-tests/      # Where to write generated test files
  dryRun: false                    # If true, print to stdout only
  overwrite: false                 # If true, overwrite existing generated files
  minPriority: P1                  # Only generate for P0 and P1 gaps by default
  unitFramework: auto              # jest | pytest | junit5 | rspec | phpunit | auto
  integrationFramework: auto       # supertest | restassured | rack-test | auto
  e2eFramework: cypress            # cypress | auto | none
  fileNaming: kebab                # kebab | camelCase | snake_case
  includeTypes:                    # Which gap types to generate tests for
    - endpoint
    - error
    - security
    - integration
    - business
  securityTests:
    enabled: true
    includeInjection: true
    includeAuthBypass: true
    includeRateLimit: false        # Off by default — too environment-specific
  fixtures:
    authTokenPlaceholder: "<your-test-token>"
    baseUrl: "http://localhost:3000"

testQuality:
  enabled: true
  minimumScore: 0                  # Failing threshold — 0 = disabled
  enforceOnGlob: "tests/**/*.test.ts"
  excludeGlob: "generated-tests/**"
  outputPath: reports/test-quality.json

aiFlows:
  enabled: true
  outputDir: reports/
  maxGapsPerExport: 50
  minPriority: P3
  includeGeneratedCode: true       # Embed generated test code in ai-ready-flows.json
  copilotPromptMaxTokens: 800
```

---

## 12. Self-Analysis Integration

Feature 28 adds the following self-analysis requirements:

### 12.1 New Self-Analysis Targets

```makefile
# New targets in Makefile
self-analysis-generation:
	api-tests-coverage-analyzer generate-tests \
	  --reports-dir reports/ \
	  --dry-run \
	  --priority P1

self-analysis-quality:
	api-tests-coverage-analyzer score-tests \
	  --tests "tests/**/*.test.ts" \
	  --fail-below 70

self-analysis-ai-flows:
	api-tests-coverage-analyzer export-ai-flows

# Update existing self-analysis-all to include new targets
self-analysis-all: \
  self-analysis-endpoint \
  self-analysis-parameter \
  self-analysis-business \
  self-analysis-integration \
  self-analysis-error \
  self-analysis-security \
  self-analysis-perf \
  self-analysis-compatibility \
  self-analysis-generation \
  self-analysis-quality \
  self-analysis-ai-flows
```

### 12.2 Self-Analysis Quality Gate

The project's own test suite must score ≥ 80/100 on the quality scorer. This is enforced in CI via `self-analysis-quality`.

### 12.3 Self-Analysis Generation Smoke Test

`self-analysis-generation` runs `generate-tests --dry-run` against this project's own gaps. The command must:
1. Exit 0 (no crash)
2. Produce at least one generated test skeleton (even if there are no gaps, the command must be exercised)
3. The generated skeleton must be valid TypeScript (checked with `tsc --noEmit`)

---

## 13. Copilot Integration Layer

### 13.1 copilot-instructions.md Extensions

The following sections MUST be added to `.github/copilot-instructions.md` as part of Feature 28:

---

**Addition to "Architecture Overview" section:**

```markdown
## Test Generation Engine (Feature 28)

`src/generation/` — generates test scaffolds from coverage gaps.

**Key directories:**
- `src/generation/engine.ts` — main `TestGenerationEngine` class
- `src/generation/templates/` — Handlebars templates per language × framework × test type
- `src/generation/context-builder.ts` — assembles `GenerationContext` from gap + endpoint data
- `src/generation/file-router.ts` — computes output file paths from gap context
- `src/generation/quality-scorer.ts` — scores existing tests on 5 dimensions (0–100)
- `src/generation/ai-flow-exporter.ts` — produces `ai-ready-flows.md` and `ai-ready-flows.json`
```

**Addition to "Adding a New Coverage Metric Type" section:**

```markdown
8. Add a gap-to-generator mapping entry in `src/generation/engine.ts` `GAP_GENERATOR_MAP`
9. Add a template in `src/generation/templates/{language}/{framework}/{testType}.hbs`
10. Add quality scorer rules for the new test type in `src/generation/quality-scorer.ts`
```

**New section: "Test Generation Rules (Non-Negotiable)":**

```markdown
## Test Generation Rules — Non-Negotiable

When implementing or modifying `src/generation/`:

1. **Generated files ALWAYS start with the AUTO-GENERATED comment block** — gapId, risk, priority.
2. **Placeholder values ALWAYS have TODO comments** — auth tokens, URLs, test data.
3. **Auth tests ALWAYS generated** for auth-required endpoints — never skipped.
4. **Status code assertion BEFORE body assertion** in every generated test.
5. **No weak assertions** — never `toBeTruthy()`, always specific matchers.
6. **Generated TypeScript MUST compile** — run `tsc --noEmit` on generated output in tests.
7. **Cypress tests go in `cypress/e2e/generated/`** — never in root `cypress/e2e/`.
8. **Security test IDs in labels** — `[SEC-AUTH-01]`, `[SEC-INJ-01]` etc.
9. **Injection tests use `not.toBe(500)`** as primary assertion — a 500 is always a defect.
10. **AI prompt max 800 tokens** — split into multiple prompts if needed.

Violating these rules requires updating tests to match the new intentional behavior,
not relaxing the rules.
```

### 13.2 Copilot Behavior Constraints

The following constraints apply when Copilot works on `src/generation/`:

- **DO NOT** change the template variable names without updating all templates that use them. The `GenerationContext` interface is the contract between the engine and the templates.
- **DO NOT** add logic to templates that should be in the context builder. Templates are dumb renderers — all intelligence lives in `ContextBuilder`.
- **DO NOT** generate tests that import from `dist/` — always import from `src/`.
- **DO NOT** hardcode language detection in the engine — always read from `discoveryInfo` in `coverage-summary.json`.
- **DO NOT** write files outside `generation.outputDir` without explicit user config. The engine must respect the configured output directory.
- **DO NOT** modify `copilot-instructions.md` unless explicitly instructed — it is a system-level file.

---

## 14. Acceptance Criteria

Feature 28 is complete when ALL of the following pass.

### Core Generation

- [ ] `generate-tests` command exists and is registered in `src/index.ts`
- [ ] `export-ai-flows` command exists and produces `ai-ready-flows.md` and `ai-ready-flows.json`
- [ ] `score-tests` command exists and produces `reports/test-quality.json`
- [ ] Templates exist for: TypeScript/Jest unit, TypeScript/Jest integration-supertest, TypeScript/Cypress, Python/pytest, Java/JUnit5
- [ ] Generated TypeScript files pass `tsc --noEmit` without errors
- [ ] Generated files always start with the `AUTO-GENERATED` comment block
- [ ] Auth tests (401/403) are always generated when `auth.required === true`
- [ ] Security test IDs (`[SEC-AUTH-01]`) are present in all generated security test labels
- [ ] Injection tests assert `not.toBe(500)` as primary assertion

### Integration Test Generation

- [ ] Multi-step flow tests use sequential `it()` blocks (not nested `describe`)
- [ ] Missing flow steps are marked with `// ⚠️ MISSING STEP` comment
- [ ] `beforeAll()` is used for auth setup in flow tests (not `beforeEach`)

### Cypress Generation

- [ ] Cypress tests use `cy.request()`, not `cy.visit()`
- [ ] Negative path Cypress tests use `failOnStatusCode: false`
- [ ] Generated Cypress tests are placed in `cypress/e2e/generated/`

### Quality Scorer

- [ ] Quality scorer runs on the project's own test suite in self-analysis
- [ ] Project's own tests score ≥ 80/100
- [ ] Quality scores appear in `coverage-summary.json` under `testQuality`
- [ ] `TestQualityPage.tsx` renders quality scores in the dashboard

### AI Flows

- [ ] `ai-ready-flows.json` includes `copilotPrompt` for every gap
- [ ] `copilotPrompt` specifies exact output file path
- [ ] `copilotPrompt` references an existing similar test file
- [ ] `copilotPrompt` is ≤ 800 tokens
- [ ] All prompts are in English

### Dashboard

- [ ] `TestGeneratorPage.tsx` exists at route `/generator`
- [ ] Page renders generated code with syntax highlighting
- [ ] "Copy Copilot Prompt" button copies the `copilotPrompt` from `ai-ready-flows.json`
- [ ] "Generate All" triggers a ZIP download of all generated test files

### CLI & Config

- [ ] `make generate-tests` target exists and works
- [ ] `make score-tests` target exists and enforces `fail-below 80` for self-analysis
- [ ] `make ci-with-generation` target exists
- [ ] `config.yaml` accepts `generation:` section and schema validates it
- [ ] `--dry-run` flag prints to stdout and does not write files

### Self-Analysis

- [ ] `self-analysis-all` includes `self-analysis-generation`, `self-analysis-quality`, `self-analysis-ai-flows`
- [ ] `self-analysis-quality` fails if project's own tests score < 80
- [ ] `self-analysis-generation --dry-run` exits 0 and produces valid TypeScript

### Testing

- [ ] Unit tests exist for `TestGenerationEngine`, `ContextBuilder`, `QualityScorer`, `AiFlowExporter`
- [ ] Integration test exists: given a known gap, the generator produces the expected file content
- [ ] Snapshot test: `ai-ready-flows.json` shape matches the defined schema
- [ ] All new tests pass in `make test`
- [ ] `make self-analysis-all` passes at 100%
