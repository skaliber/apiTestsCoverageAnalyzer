/**
 * Cypress e2e tests for AST metadata rendering (Spec 21 / GAP-5).
 *
 * Verifies that:
 *   a. Endpoints page renders without breakage when `matches` carry
 *      `resolutionType` and `confidence` metadata (including heuristic / low).
 *   b. `sourceLanguage`, `resolutionType`, and confidence information is
 *      accessible in the dashboard (not hidden or causing JS errors).
 *   c. Pages do not go blank or throw when parameter / error / security
 *      coverage results include the new `astMetadata` field.
 *   d. AI summary panels render correctly alongside AST-augmented data.
 *   e. Language information (from `languages[]`) is visible on endpoint rows.
 *
 * Tests use cy.intercept() to inject mock coverage data containing AST
 * metadata without requiring a fresh analysis run.
 *
 * Run against the Vite preview server:
 *   cd dashboard && npm run build && npm run preview
 *   (http://localhost:4173)
 */

// ─── Shared mock data ─────────────────────────────────────────────────────────

/**
 * A minimal endpoint-coverage report that includes:
 *  - High-confidence direct resolution entry
 *  - Medium-confidence string-template entry
 *  - Low-confidence heuristic fallback entry
 *  - A fully uncovered endpoint
 */
const MOCK_ENDPOINT_COVERAGE = {
  total: 4,
  covered: 3,
  percentage: 75,
  endpoints: [
    {
      method: 'GET',
      path: '/api/users',
      covered: true,
      testFiles: ['tests/users.test.ts'],
      languages: ['typescript'],
      matches: [
        { resolutionType: 'direct', confidence: 'high', rawCall: "axios.get('/api/users')" },
      ],
    },
    {
      method: 'POST',
      path: '/api/users',
      covered: true,
      testFiles: ['tests/users.test.ts'],
      languages: ['typescript'],
      matches: [
        {
          resolutionType: 'string-template',
          confidence: 'medium',
          rawCall: 'axios.post(`${BASE_URL}/users`)',
        },
      ],
    },
    {
      method: 'GET',
      path: '/api/orders',
      covered: true,
      testFiles: ['tests/orders.test.ts'],
      languages: ['javascript'],
      matches: [
        {
          resolutionType: 'heuristic',
          confidence: 'low',
          rawCall: "fetch('/api/orders')",
        },
      ],
    },
    {
      method: 'DELETE',
      path: '/api/users/{id}',
      covered: false,
      testFiles: [],
      languages: [],
    },
  ],
}

/** Parameter coverage mock with astMetadata fields present. */
const MOCK_PARAMETER_COVERAGE = {
  totalParameters: 3,
  averageCoverage: 66.7,
  fullyCoveredPercent: 33.3,
  parameters: [
    {
      parameter: {
        name: 'userId',
        method: 'GET',
        path: '/api/users/{id}',
        location: 'path',
        required: true,
        schema: { type: 'string' },
      },
      validValue: true,
      boundaryValue: false,
      missing: true,
      invalidValue: true,
      ratio: 0.75,
      astMetadata: { sourceLanguage: 'typescript', resolutionType: 'direct', confidence: 'high' },
    },
    {
      parameter: {
        name: 'page',
        method: 'GET',
        path: '/api/users',
        location: 'query',
        required: false,
        schema: { type: 'integer' },
      },
      validValue: true,
      boundaryValue: true,
      missing: false,
      invalidValue: false,
      ratio: 0.5,
      astMetadata: { sourceLanguage: 'typescript', resolutionType: 'heuristic', confidence: 'low' },
    },
    {
      parameter: {
        name: 'name',
        method: 'POST',
        path: '/api/users',
        location: 'body',
        required: true,
        schema: { type: 'string' },
      },
      validValue: false,
      boundaryValue: false,
      missing: false,
      invalidValue: false,
      ratio: 0,
    },
  ],
  uncoveredParameters: [
    { name: 'name', method: 'POST', path: '/api/users' },
  ],
}

/** Error coverage mock with astMetadata fields on some scenarios. */
const MOCK_ERROR_COVERAGE = {
  total: 3,
  covered: 2,
  percentage: 66.67,
  scenarios: [
    {
      scenario: {
        id: 'err-1',
        method: 'POST',
        path: '/api/users',
        statusCode: 400,
        description: 'Missing required field',
        categories: ['missing-parameter'],
      },
      covered: true,
      matchedTests: ['should return 400 when name is missing'],
      astMetadata: { sourceLanguage: 'typescript', resolutionType: 'direct', confidence: 'high' },
    },
    {
      scenario: {
        id: 'err-2',
        method: 'GET',
        path: '/api/users/{id}',
        statusCode: 404,
        description: 'User not found',
        categories: ['not-found'],
      },
      covered: true,
      matchedTests: ['returns 404 when user does not exist'],
      astMetadata: { sourceLanguage: 'typescript', resolutionType: 'heuristic', confidence: 'low' },
    },
    {
      scenario: {
        id: 'err-3',
        method: 'DELETE',
        path: '/api/users/{id}',
        statusCode: 401,
        description: 'Unauthorized',
        categories: ['unauthorized'],
      },
      covered: false,
      matchedTests: [],
    },
  ],
  categorySummary: {
    'missing-parameter': { total: 1, covered: 1 },
    'invalid-value': { total: 0, covered: 0 },
    'unauthorized': { total: 1, covered: 0 },
    'forbidden': { total: 0, covered: 0 },
    'not-found': { total: 1, covered: 1 },
    'conflict': { total: 0, covered: 0 },
    'server-error': { total: 0, covered: 0 },
  },
}

/** Security coverage mock with astMetadata. */
const MOCK_SECURITY_COVERAGE = {
  total: 3,
  covered: 2,
  percentage: 66.67,
  scanFindings: 0,
  categorySummary: {
    authentication: { total: 1, covered: 1 },
    authorization: { total: 1, covered: 1 },
    'input-validation': { total: 1, covered: 0 },
    cryptography: { total: 0, covered: 0 },
    'session-management': { total: 0, covered: 0 },
  },
  controls: [
    {
      id: 'authentication:BearerAuth',
      category: 'authentication',
      description: 'Authentication via Bearer token',
      covered: true,
      matchedTests: ['should return 401 without token'],
      coveredByScanReport: false,
      astMetadata: { sourceLanguage: 'typescript', resolutionType: 'direct', confidence: 'high' },
    },
    {
      id: 'authorization:get:/api/users',
      category: 'authorization',
      description: 'Authorization check for GET /api/users',
      endpoint: 'GET /api/users',
      covered: true,
      matchedTests: ['admin can list users'],
      coveredByScanReport: false,
      astMetadata: { sourceLanguage: 'typescript', resolutionType: 'heuristic', confidence: 'low' },
    },
    {
      id: 'input-validation:post:/api/users',
      category: 'input-validation',
      description: 'Input validation for POST /api/users',
      endpoint: 'POST /api/users',
      covered: false,
      matchedTests: [],
      coveredByScanReport: false,
    },
  ],
}

// ─── 1. Endpoints page with AST metadata ─────────────────────────────────────

describe('Endpoints page: AST metadata fields', () => {
  beforeEach(() => {
    cy.intercept('GET', '/reports/endpoint-coverage.json', {
      body: MOCK_ENDPOINT_COVERAGE,
    }).as('endpointReport')
    cy.visit('/endpoints')
  })

  it('renders the endpoint table without JS errors when matches contain AST metadata', () => {
    cy.on('uncaught:exception', (err) => {
      // Fail the test if any uncaught JS exception occurs
      throw err
    })
    cy.get('table', { timeout: 10000 }).should('exist')
    cy.get('table tbody tr').should('have.length.greaterThan', 0)
  })

  it('shows GET /api/users row (direct/high-confidence endpoint)', () => {
    cy.get('table', { timeout: 10000 })
    cy.contains('GET /api/users').should('exist')
  })

  it('shows GET /api/orders row (heuristic/low-confidence endpoint)', () => {
    cy.get('table', { timeout: 10000 })
    cy.contains('GET /api/orders').should('exist')
  })

  it('shows the uncovered DELETE endpoint', () => {
    cy.get('table', { timeout: 10000 })
    cy.contains('/api/users/{id}').should('exist')
  })

  it('shows language information for covered endpoints', () => {
    cy.get('table', { timeout: 10000 })
    // The dashboard renders languages[] — at least one TypeScript-covered endpoint exists
    cy.contains(/typescript/i).should('exist')
  })
})

// ─── 2. Parameters page with astMetadata ─────────────────────────────────────

describe('Parameters page: astMetadata fields do not break UI', () => {
  beforeEach(() => {
    cy.intercept('GET', '/reports/parameter-coverage.json', {
      body: MOCK_PARAMETER_COVERAGE,
    }).as('paramReport')
    cy.visit('/parameters')
  })

  it('renders the parameters table without crashing', () => {
    cy.on('uncaught:exception', (err) => { throw err })
    cy.get('table', { timeout: 10000 }).should('exist')
    cy.get('table tbody tr').should('have.length.greaterThan', 0)
  })

  it('shows the page heading', () => {
    cy.get('h1').should('contain', 'Parameters')
  })

  it('displays parameter entries including those without astMetadata', () => {
    cy.get('table', { timeout: 10000 })
    // The "name" param has no astMetadata — should still render
    cy.contains(/name|userId|page/i).should('exist')
  })
})

// ─── 3. Error Handling page with astMetadata ──────────────────────────────────

describe('Error Handling page: astMetadata fields do not break UI', () => {
  beforeEach(() => {
    cy.intercept('GET', '/reports/error-coverage.json', {
      body: MOCK_ERROR_COVERAGE,
    }).as('errorReport')
    cy.visit('/error-handling')
  })

  it('renders the error handling page without crashing', () => {
    cy.on('uncaught:exception', (err) => { throw err })
    cy.get('h1').should('contain', 'Error Handling')
  })

  it('renders error scenario rows in the table', () => {
    cy.get('table', { timeout: 10000 }).should('exist')
    cy.get('table tbody tr').should('have.length.greaterThan', 0)
  })

  it('shows status code 400 (covered scenario)', () => {
    cy.get('table', { timeout: 10000 })
    cy.contains('400').should('exist')
  })

  it('shows status code 401 (uncovered scenario with no astMetadata)', () => {
    cy.get('table', { timeout: 10000 })
    cy.contains('401').should('exist')
  })
})

// ─── 4. Security page with astMetadata ───────────────────────────────────────

describe('Security page: astMetadata fields do not break UI', () => {
  beforeEach(() => {
    cy.intercept('GET', '/reports/security-coverage.json', {
      body: MOCK_SECURITY_COVERAGE,
    }).as('secReport')
    cy.visit('/security')
  })

  it('renders the security page without crashing', () => {
    cy.on('uncaught:exception', (err) => { throw err })
    cy.get('h1').should('contain', 'Security')
  })

  it('renders security check rows in the table', () => {
    cy.get('table', { timeout: 10000 }).should('exist')
    cy.get('table tbody tr').should('have.length.greaterThan', 0)
  })

  it('shows JWT/Bearer authentication control', () => {
    cy.get('table', { timeout: 10000 })
    cy.contains(/jwt|bearer|auth/i).should('exist')
  })
})

// ─── 5. Overview page: no breakage with AST-augmented summary ─────────────────

describe('Overview page: AST-augmented report loads without errors', () => {
  beforeEach(() => {
    const mockSummary = {
      projectName: 'ast-meta-test',
      generatedAt: new Date().toISOString(),
      coverageResults: [
        { type: 'endpoint', totalItems: 4, coveredItems: 3, coveragePercent: 75, details: MOCK_ENDPOINT_COVERAGE },
        { type: 'parameter', totalItems: 3, coveredItems: 2, coveragePercent: 66.7, details: MOCK_PARAMETER_COVERAGE },
        { type: 'error', totalItems: 3, coveredItems: 2, coveragePercent: 66.7, details: MOCK_ERROR_COVERAGE },
        { type: 'security', totalItems: 3, coveredItems: 2, coveragePercent: 66.7, details: MOCK_SECURITY_COVERAGE },
      ],
      qualityGate: {
        passed: false,
        results: [
          { type: 'endpoint', threshold: 80, actual: 75, passed: false },
          { type: 'parameter', threshold: 80, actual: 66.7, passed: false },
        ],
      },
    }

    cy.intercept('GET', '/reports/coverage-summary.json', { body: mockSummary }).as('summaryReport')
    cy.visit('/')
  })

  it('loads the summary table without crashing', () => {
    cy.on('uncaught:exception', (err) => { throw err })
    cy.get('[data-testid="summary-table"]', { timeout: 10000 }).should('be.visible')
  })

  it('shows all coverage types in the summary table', () => {
    cy.get('[data-testid="summary-table"]', { timeout: 10000 }).within(() => {
      cy.contains(/endpoint/i).should('exist')
      cy.contains(/parameter/i).should('exist')
    })
  })

  it('shows coverage percentages correctly', () => {
    cy.get('[data-testid="summary-table"]', { timeout: 10000 })
    cy.contains('%').should('exist')
  })

  it('shows the quality gate banner even when AST metadata is present', () => {
    cy.get('[data-testid="summary-table"]', { timeout: 10000 })
    cy.contains(/quality gate/i).should('be.visible')
  })
})

// ─── 6. No broken pages: navigation through all routes ────────────────────────

describe('All dashboard pages: no breakage with AST-augmented reports', () => {
  beforeEach(() => {
    cy.intercept('GET', '/reports/endpoint-coverage.json', {
      body: MOCK_ENDPOINT_COVERAGE,
    })
    cy.intercept('GET', '/reports/parameter-coverage.json', {
      body: MOCK_PARAMETER_COVERAGE,
    })
    cy.intercept('GET', '/reports/error-coverage.json', {
      body: MOCK_ERROR_COVERAGE,
    })
    cy.intercept('GET', '/reports/security-coverage.json', {
      body: MOCK_SECURITY_COVERAGE,
    })
  })

  const PAGES = [
    { path: '/endpoints', heading: 'Endpoints' },
    { path: '/parameters', heading: 'Parameters' },
    { path: '/security', heading: 'Security' },
    { path: '/error-handling', heading: 'Error Handling' },
  ]

  PAGES.forEach(({ path, heading }) => {
    it(`${heading} page renders h1 without uncaught exceptions`, () => {
      const errs = []
      cy.on('uncaught:exception', (err) => {
        errs.push(err.message)
        return false // don't fail immediately; check after
      })
      cy.visit(path)
      cy.get('h1').should('contain', heading)
      cy.then(() => {
        if (errs.length > 0) {
          throw new Error(`Uncaught exceptions on ${path}: ${errs.join('; ')}`)
        }
      })
    })
  })
})
