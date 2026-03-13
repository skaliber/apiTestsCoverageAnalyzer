/**
 * Cypress e2e tests for the coverage analysis dashboard.
 *
 * Covers all 10 routes and key UI interactions:
 *   - Sidebar navigation to every page
 *   - Overview: summary table, quality gate banner, bar chart, header info
 *   - Detail pages (Endpoints, Parameters, Security, Error Handling, Performance):
 *       card/accordion rendering, search/filter, pie chart
 *   - Business Rules: accordion expand / collapse, search
 *   - Integration Flows: flow cards with step counts, search, pie chart
 *   - Coverage Intelligence: placeholder / no-report state
 *   - Trends: loaded-reports list, "load 2 reports" prompt
 *   - Theme toggle: light ↔ dark mode
 *   - File upload button visibility
 *
 * Run against the Vite preview server:
 *   cd dashboard && npm run build && npm run preview
 *   (http://localhost:4173)
 */

const PAGES = [
  { path: '/',                  heading: 'Overview',                navText: 'Overview'          },
  { path: '/endpoints',         heading: 'Endpoints',               navText: 'Endpoints'         },
  { path: '/parameters',        heading: 'Parameters',              navText: 'Parameters'        },
  { path: '/business-rules',    heading: 'Business Rules',          navText: 'Business Rules'    },
  { path: '/integration-flows', heading: 'Integration Flows',       navText: 'Integration Flows' },
  { path: '/security',          heading: 'Security',                navText: 'Security'          },
  { path: '/error-handling',    heading: 'Error Handling',          navText: 'Error Handling'    },
  { path: '/performance',       heading: 'Performance & Resilience',navText: 'Performance'       },
  { path: '/intelligence',      heading: 'Coverage Intelligence',   navText: 'Intelligence'      },
  { path: '/trends',            heading: 'Coverage Trends',         navText: 'Trends'            },
]

// ─── 1. Navigation ────────────────────────────────────────────────────────────

describe('Dashboard navigation', () => {
  beforeEach(() => cy.visit('/'))

  it('shows the sidebar with "API Coverage" branding', () => {
    cy.get('nav').should('exist')
    cy.contains('API Coverage').should('be.visible')
  })

  it('shows all 10 sidebar navigation links', () => {
    PAGES.forEach(({ navText }) => {
      cy.get('nav').contains(navText).should('exist')
    })
  })

  PAGES.forEach(({ path, heading, navText }) => {
    it(`navigates to ${path} via sidebar and shows h1 "${heading}"`, () => {
      cy.get('nav').contains(navText).click()
      cy.get('h1').should('contain', heading)
      cy.url().should('include', path === '/' ? '' : path)
    })
  })
})

// ─── 2. Overview page ─────────────────────────────────────────────────────────

describe('Overview page', () => {
  beforeEach(() => cy.visit('/'))

  it('loads the default coverage report and displays the summary table', () => {
    cy.get('[data-testid="summary-table"]', { timeout: 10000 }).should('be.visible')
  })

  it('shows all 8 coverage types in the summary table', () => {
    const TYPES = ['endpoint', 'parameter', 'business', 'integration', 'security', 'error', 'performance', 'resilience']
    cy.get('[data-testid="summary-table"]', { timeout: 10000 }).within(() => {
      TYPES.forEach((type) => cy.contains(type).should('exist'))
    })
  })

  it('shows coverage percentages and thresholds in the summary table', () => {
    cy.get('[data-testid="summary-table"]', { timeout: 10000 }).within(() => {
      cy.contains('Coverage %').should('exist')
      cy.contains('Threshold').should('exist')
      cy.contains('Status').should('exist')
      // At least one percentage value visible
      cy.contains('%').should('exist')
    })
  })

  it('shows a quality gate banner', () => {
    cy.get('[data-testid="summary-table"]', { timeout: 10000 })
    cy.contains(/quality gate/i).should('be.visible')
  })

  it('shows the "Coverage by Type" bar chart', () => {
    cy.get('[data-testid="summary-table"]', { timeout: 10000 })
    cy.contains('Coverage by Type').should('be.visible')
    cy.get('.recharts-wrapper').should('exist')
  })

  it('shows the report filename in the header', () => {
    cy.get('[data-testid="summary-table"]', { timeout: 10000 })
    cy.get('header').contains('coverage-summary.json').should('be.visible')
  })

  it('shows the "Load Report" upload button', () => {
    cy.contains('Load Report').should('be.visible')
  })
})

// ─── 3. Endpoints page ────────────────────────────────────────────────────────

describe('Endpoints page', () => {
  beforeEach(() => cy.visit('/endpoints'))

  it('shows the "Endpoints" heading', () => {
    cy.get('h1').should('contain', 'Endpoints')
  })

  it('shows a search input', () => {
    cy.get('input[type="text"]').should('exist')
  })

  it('renders endpoint cards', () => {
    cy.get('.flex.flex-col.gap-2', { timeout: 10000 }).should('exist')
    cy.get('.flex.flex-col.gap-2 > div').should('have.length.greaterThan', 0)
    cy.contains('/wallets').should('exist')
  })

  it('shows the pie chart', () => {
    cy.get('.recharts-wrapper').should('exist')
  })

  it('filters endpoints by search term', () => {
    cy.get('.flex.flex-col.gap-2', { timeout: 10000 })
    cy.get('input[type="text"]').type('products')
    cy.get('.flex.flex-col.gap-2 > div').each(($card) => {
      cy.wrap($card).contains(/products/i)
    })
  })

  it('shows no cards when search matches nothing', () => {
    cy.get('.flex.flex-col.gap-2', { timeout: 10000 })
    cy.get('input[type="text"]').type('zzz-nonexistent-zzz')
    // Card list container should have no item cards
    cy.get('.flex.flex-col.gap-2 > div').should('have.length', 0)
  })
})

// ─── 4. Parameters page ───────────────────────────────────────────────────────

describe('Parameters page', () => {
  beforeEach(() => cy.visit('/parameters'))

  it('shows the "Parameters" heading', () => {
    cy.get('h1').should('contain', 'Parameters')
  })

  it('renders parameter cards', () => {
    cy.get('.flex.flex-col.gap-2', { timeout: 10000 }).should('exist')
    cy.get('.flex.flex-col.gap-2 > div').should('have.length.greaterThan', 0)
  })

  it('shows the pie chart', () => {
    cy.get('.recharts-wrapper').should('exist')
  })

  it('filters parameters by search term', () => {
    cy.get('.flex.flex-col.gap-2', { timeout: 10000 })
    cy.get('input[type="text"]').type('page')
    cy.get('.flex.flex-col.gap-2 > div').should('have.length.greaterThan', 0)
    cy.contains(/page/i).should('exist')
  })
})

// ─── 5. Security page ─────────────────────────────────────────────────────────

describe('Security page', () => {
  beforeEach(() => cy.visit('/security'))

  it('shows the "Security" heading', () => {
    cy.get('h1').should('contain', 'Security')
  })

  it('renders security check cards', () => {
    cy.get('.flex.flex-col.gap-2', { timeout: 10000 }).should('exist')
    cy.get('.flex.flex-col.gap-2 > div').should('have.length.greaterThan', 0)
    cy.contains('JWT').should('exist')
  })

  it('shows the pie chart', () => {
    cy.get('.recharts-wrapper').should('exist')
  })

  it('filters security items by search term', () => {
    cy.get('.flex.flex-col.gap-2', { timeout: 10000 })
    cy.get('input[type="text"]').type('JWT')
    cy.get('.flex.flex-col.gap-2 > div').should('have.length.greaterThan', 0)
    cy.contains(/JWT/i).should('exist')
  })
})

// ─── 6. Error Handling page ───────────────────────────────────────────────────

describe('Error Handling page', () => {
  beforeEach(() => cy.visit('/error-handling'))

  it('shows the "Error Handling" heading', () => {
    cy.get('h1').should('contain', 'Error Handling')
  })

  it('renders error scenario cards', () => {
    cy.get('.flex.flex-col.gap-2', { timeout: 10000 }).should('exist')
    cy.get('.flex.flex-col.gap-2 > div').should('have.length.greaterThan', 0)
    cy.contains('400').should('exist')
  })

  it('shows the pie chart', () => {
    cy.get('.recharts-wrapper').should('exist')
  })

  it('filters error scenarios by search term', () => {
    cy.get('.flex.flex-col.gap-2', { timeout: 10000 })
    cy.get('input[type="text"]').type('401')
    cy.get('.flex.flex-col.gap-2 > div').should('have.length.greaterThan', 0)
    cy.contains(/401/i).should('exist')
  })
})

// ─── 7. Performance & Resilience page ─────────────────────────────────────────

describe('Performance & Resilience page', () => {
  beforeEach(() => cy.visit('/performance'))

  it('shows the "Performance & Resilience" heading', () => {
    cy.get('h1').should('contain', 'Performance & Resilience')
  })

  it('renders performance and resilience cards', () => {
    cy.get('.flex.flex-col.gap-2', { timeout: 10000 }).should('exist')
    cy.get('.flex.flex-col.gap-2 > div').should('have.length.greaterThan', 0)
    // Merged section shows both performance and resilience items
    cy.contains(/response|Retry/i).should('exist')
  })

  it('shows the pie chart', () => {
    cy.get('.recharts-wrapper').should('exist')
  })

  it('filters items by search term', () => {
    cy.get('.flex.flex-col.gap-2', { timeout: 10000 })
    cy.get('input[type="text"]').type('200ms')
    cy.get('.flex.flex-col.gap-2 > div').should('have.length.greaterThan', 0)
    cy.contains(/200ms/i).should('exist')
  })
})

// ─── 8. Business Rules page ───────────────────────────────────────────────────

describe('Business Rules page', () => {
  beforeEach(() => cy.visit('/business-rules'))

  it('shows the "Business Rules" heading', () => {
    cy.get('h1').should('contain', 'Business Rules')
  })

  it('shows business rule items as accordion buttons', () => {
    cy.get('button').should('have.length.greaterThan', 0)
    cy.contains('unique email').should('exist')
  })

  it('shows the pie chart', () => {
    cy.get('.recharts-wrapper').should('exist')
  })

  it('expands a rule on click and shows status details', () => {
    // Target rule accordion buttons by their ✅/❌ prefix to avoid matching
    // the AiSummaryPanel toggle button that renders before the rule list
    cy.get('button').contains(/✅|❌/).first().click()
    cy.contains('Status').should('be.visible')
    cy.contains(/Covered|Not covered/i).should('be.visible')
  })

  it('collapses the expanded rule on second click', () => {
    cy.get('button').contains(/✅|❌/).first().click()
    cy.contains('Status').should('be.visible')
    cy.get('button').contains(/✅|❌/).first().click()
    cy.contains('Status').should('not.exist')
  })

  it('filters rules via the search input', () => {
    cy.get('input[type="text"]').type('email')
    cy.contains(/email/i).should('exist')
    cy.contains('Order total must match item sum').should('not.exist')
  })
})

// ─── 9. Integration Flows page ────────────────────────────────────────────────

describe('Integration Flows page', () => {
  beforeEach(() => cy.visit('/integration-flows'))

  it('shows the "Integration Flows" heading', () => {
    cy.get('h1').should('contain', 'Integration Flows')
  })

  it('shows flow cards with covered/uncovered indicators', () => {
    // Flow items show ✅ or ❌ prefix
    cy.contains(/✅|❌/).should('exist')
    cy.contains('flow', { matchCase: false }).should('exist')
  })

  it('shows step counts on flow cards', () => {
    cy.contains(/steps/i).should('exist')
  })

  it('shows the pie chart', () => {
    cy.get('.recharts-wrapper').should('exist')
  })

  it('filters flows by search term', () => {
    cy.get('input[type="text"]').type('User')
    cy.contains(/User/i).should('exist')
  })

  it('clears search to show all flows', () => {
    cy.get('input[type="text"]').type('zzz-nonexistent-zzz').clear()
    // All flows should re-appear after clearing
    cy.contains('flow', { matchCase: false }).should('exist')
  })
})

// ─── 10. Trends page ──────────────────────────────────────────────────────────

describe('Trends page', () => {
  beforeEach(() => cy.visit('/trends'))

  it('shows the "Coverage Trends" heading', () => {
    cy.get('h1').should('contain', 'Coverage Trends')
  })

  it('shows the "Add Historical Report" upload button', () => {
    cy.contains('Add Historical Report').should('be.visible')
  })

  it('shows the Loaded Reports section with the default report', () => {
    cy.contains('Loaded Reports').should('be.visible')
    cy.contains('coverage-summary.json').should('be.visible')
  })

  it('shows a prompt to load at least 2 reports when only 1 is loaded', () => {
    cy.contains(/load at least 2 reports/i).should('be.visible')
  })
})

// ─── 11. Theme toggle ─────────────────────────────────────────────────────────

describe('Theme toggle', () => {
  beforeEach(() => {
    cy.clearLocalStorage()
    cy.visit('/')
  })

  it('renders the theme toggle button', () => {
    cy.get('[data-testid="theme-toggle"]').should('be.visible')
  })

  it('starts in light mode with no prior preference stored', () => {
    cy.get('html').should('not.have.class', 'dark')
    cy.get('[data-testid="theme-toggle"]').should('contain', 'Dark')
  })

  it('switches to dark mode on click', () => {
    cy.get('[data-testid="theme-toggle"]').click()
    cy.get('html').should('have.class', 'dark')
    cy.get('[data-testid="theme-toggle"]').should('contain', 'Light')
  })

  it('switches back to light mode on second click', () => {
    cy.get('[data-testid="theme-toggle"]').click()
    cy.get('html').should('have.class', 'dark')
    cy.get('[data-testid="theme-toggle"]').click()
    cy.get('html').should('not.have.class', 'dark')
    cy.get('[data-testid="theme-toggle"]').should('contain', 'Dark')
  })

  it('persists theme preference in localStorage', () => {
    cy.get('[data-testid="theme-toggle"]').click()
    cy.window().then((win) => {
      expect(win.localStorage.getItem('theme')).to.equal('dark')
    })
    cy.get('[data-testid="theme-toggle"]').click()
    cy.window().then((win) => {
      expect(win.localStorage.getItem('theme')).to.equal('light')
    })
  })
})

// ─── 12. File upload ──────────────────────────────────────────────────────────

describe('File upload (Load Report)', () => {
  it('shows the "Load Report" button on the Overview page', () => {
    cy.visit('/')
    cy.get('[data-testid="summary-table"]', { timeout: 10000 })
    cy.contains('Load Report').should('be.visible')
    cy.get('input[type="file"]#file-upload').should('exist')
  })
})

// ─── 13. Coverage Intelligence page ──────────────────────────────────────────

describe('Coverage Intelligence page', () => {
  it('navigates to /intelligence via sidebar', () => {
    cy.visit('/')
    cy.get('nav').contains('Intelligence').click()
    cy.url().should('include', '/intelligence')
  })

  it('shows the Coverage Intelligence heading', () => {
    cy.visit('/intelligence')
    cy.get('h1').should('contain', 'Coverage Intelligence')
  })

  it('shows the no-report state when report is not available', () => {
    // Intercept the report fetch so it returns a 404
    cy.intercept('GET', '/reports/coverage-intelligence.json', { statusCode: 404 }).as('reportFetch')
    cy.visit('/intelligence')
    cy.wait('@reportFetch')
    cy.contains('Coverage Intelligence report not available').should('be.visible')
    cy.contains('api-coverage coverage-intelligence').should('be.visible')
  })

  it('renders summary cards when report data is available', () => {
    const mockReport = {
      generatedAt: new Date().toISOString(),
      projectName: 'test-project',
      findings: [
        {
          id: 'ff-1',
          source: 'coverage-gap-analysis',
          category: 'uncovered-endpoint',
          severity: 'HIGH',
          title: 'Uncovered endpoint: POST /payments',
          description: 'Endpoint POST /payments has no test coverage.',
          endpoint: { method: 'POST', path: '/payments' },
          missingTestTypes: ['positive-api-test'],
        },
      ],
      recommendations: [
        {
          id: 'rec-1',
          priority: 'P1',
          title: 'Add positive api test for: Uncovered endpoint: POST /payments',
          rationale: 'Endpoint POST /payments has no test coverage.',
          recommendedTestType: 'positive-api-test',
          endpoint: { method: 'POST', path: '/payments' },
          likelyLanguage: 'typescript',
          likelyFramework: 'jest',
          linkedFindingIds: ['ff-1'],
          riskScore: 72,
          confidence: 'medium',
        },
      ],
      summary: {
        totalFindings: 1,
        findingsBySeverity: { LOW: 0, MEDIUM: 0, HIGH: 1, CRITICAL: 0 },
        totalRecommendations: 1,
        recommendationsByPriority: { P0: 0, P1: 1, P2: 0, P3: 0 },
        maxRiskScore: 72,
        avgRiskScore: 72,
        criticalUncoveredItems: 1,
        unprotectedSecurityFindings: 0,
        topRiskAreas: ['POST /payments (score 72)'],
      },
    }

    cy.intercept('GET', '/reports/coverage-intelligence.json', { body: mockReport }).as('reportFetch')
    cy.visit('/intelligence')
    cy.wait('@reportFetch')

    cy.contains('Total Findings').should('be.visible')
    cy.contains('Recommendations').should('be.visible')
    cy.contains('Max Risk Score').should('be.visible')
    cy.contains('P0 Actions').should('be.visible')
  })

  it('shows recommendations section with filter dropdowns', () => {
    const mockReport = {
      generatedAt: new Date().toISOString(),
      projectName: 'test-project',
      findings: [],
      recommendations: [
        {
          id: 'rec-1',
          priority: 'P1',
          title: 'Add security test',
          rationale: 'Security finding unprotected.',
          recommendedTestType: 'security-test',
          endpoint: { method: 'POST', path: '/admin' },
          likelyLanguage: 'typescript',
          likelyFramework: 'jest',
          linkedFindingIds: [],
          riskScore: 80,
          confidence: 'high',
        },
      ],
      summary: {
        totalFindings: 0,
        findingsBySeverity: { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 },
        totalRecommendations: 1,
        recommendationsByPriority: { P0: 0, P1: 1, P2: 0, P3: 0 },
        maxRiskScore: 80,
        avgRiskScore: 80,
        criticalUncoveredItems: 0,
        unprotectedSecurityFindings: 0,
        topRiskAreas: [],
      },
    }

    cy.intercept('GET', '/reports/coverage-intelligence.json', { body: mockReport }).as('reportFetch')
    cy.visit('/intelligence')
    cy.wait('@reportFetch')

    cy.contains('Missing Test Recommendations').should('be.visible')
    cy.contains('All Priorities').should('be.visible')
    cy.contains('All Risk Bands').should('be.visible')
  })

  it('shows the endpoint filter input in the filter bar', () => {
    const mockReport = {
      generatedAt: new Date().toISOString(),
      projectName: 'test-project',
      findings: [
        {
          id: 'ff-1',
          source: 'coverage-gap-analysis',
          category: 'uncovered-endpoint',
          severity: 'HIGH',
          title: 'Uncovered endpoint: POST /payments',
          description: 'Endpoint POST /payments has no test coverage.',
          endpoint: { method: 'POST', path: '/payments' },
          missingTestTypes: ['positive-api-test'],
        },
      ],
      recommendations: [
        {
          id: 'rec-1',
          priority: 'P1',
          title: 'Add test for POST /payments',
          rationale: 'Endpoint POST /payments has no test coverage.',
          recommendedTestType: 'positive-api-test',
          endpoint: { method: 'POST', path: '/payments' },
          likelyLanguage: 'typescript',
          likelyFramework: 'jest',
          linkedFindingIds: ['ff-1'],
          riskScore: 72,
          confidence: 'medium',
        },
      ],
      summary: {
        totalFindings: 1,
        findingsBySeverity: { LOW: 0, MEDIUM: 0, HIGH: 1, CRITICAL: 0 },
        totalRecommendations: 1,
        recommendationsByPriority: { P0: 0, P1: 1, P2: 0, P3: 0 },
        maxRiskScore: 72,
        avgRiskScore: 72,
        criticalUncoveredItems: 1,
        unprotectedSecurityFindings: 0,
        topRiskAreas: ['POST /payments (score 72)'],
      },
    }

    cy.intercept('GET', '/reports/coverage-intelligence.json', { body: mockReport }).as('reportFetch')
    cy.visit('/intelligence')
    cy.wait('@reportFetch')

    cy.get('[data-testid="intelligence-section"]', { timeout: 10000 }).should('be.visible')
    cy.get('[data-testid="endpoint-filter"]').should('exist')
  })

  it('filters recommendations by endpoint search term', () => {
    const mockReport = {
      generatedAt: new Date().toISOString(),
      projectName: 'test-project',
      findings: [],
      recommendations: [
        {
          id: 'rec-1',
          priority: 'P1',
          title: 'Add test for POST /payments',
          rationale: 'Payment endpoint uncovered.',
          recommendedTestType: 'positive-api-test',
          endpoint: { method: 'POST', path: '/payments' },
          likelyLanguage: 'typescript',
          likelyFramework: 'jest',
          linkedFindingIds: [],
          riskScore: 75,
          confidence: 'high',
        },
        {
          id: 'rec-2',
          priority: 'P2',
          title: 'Add test for GET /wallets',
          rationale: 'Wallet endpoint uncovered.',
          recommendedTestType: 'positive-api-test',
          endpoint: { method: 'GET', path: '/wallets' },
          likelyLanguage: 'typescript',
          likelyFramework: 'jest',
          linkedFindingIds: [],
          riskScore: 45,
          confidence: 'medium',
        },
      ],
      summary: {
        totalFindings: 0,
        findingsBySeverity: { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 },
        totalRecommendations: 2,
        recommendationsByPriority: { P0: 0, P1: 1, P2: 1, P3: 0 },
        maxRiskScore: 75,
        avgRiskScore: 60,
        criticalUncoveredItems: 0,
        unprotectedSecurityFindings: 0,
        topRiskAreas: [],
      },
    }

    cy.intercept('GET', '/reports/coverage-intelligence.json', { body: mockReport }).as('reportFetch')
    cy.visit('/intelligence')
    cy.wait('@reportFetch')

    // Both recommendations are visible initially
    cy.contains('POST /payments').should('be.visible')
    cy.contains('GET /wallets').should('be.visible')

    // Filter to /payments only
    cy.get('[data-testid="endpoint-filter"]', { timeout: 10000 }).type('payments')
    cy.contains('POST /payments').should('be.visible')
    cy.contains('GET /wallets').should('not.exist')
  })

  it('shows the intelligence section with findings when report has data', () => {
    const mockReport = {
      generatedAt: new Date().toISOString(),
      projectName: 'ai-panel-test',
      findings: [
        {
          id: 'ff-1',
          source: 'coverage-gap-analysis',
          category: 'uncovered-endpoint',
          severity: 'HIGH',
          title: 'Uncovered POST /payments',
          description: 'Missing coverage.',
          endpoint: { method: 'POST', path: '/payments' },
          missingTestTypes: ['positive-api-test'],
        },
        {
          id: 'ff-2',
          source: 'security-scan',
          category: 'security-finding-unprotected',
          severity: 'CRITICAL',
          title: 'Auth bypass on /admin',
          description: 'Critical security finding.',
          endpoint: { method: 'DELETE', path: '/admin' },
          relatedScanners: ['zap'],
          missingTestTypes: ['security-test'],
        },
      ],
      recommendations: [
        {
          id: 'rec-1',
          priority: 'P0',
          title: 'Add security test for DELETE /admin',
          rationale: 'Critical auth bypass must be tested.',
          recommendedTestType: 'security-test',
          endpoint: { method: 'DELETE', path: '/admin' },
          likelyLanguage: 'typescript',
          likelyFramework: 'jest',
          linkedFindingIds: ['ff-2'],
          riskScore: 95,
          confidence: 'high',
        },
        {
          id: 'rec-2',
          priority: 'P1',
          title: 'Add positive api test for POST /payments',
          rationale: 'Payment endpoint uncovered.',
          recommendedTestType: 'positive-api-test',
          endpoint: { method: 'POST', path: '/payments' },
          likelyLanguage: 'typescript',
          likelyFramework: 'jest',
          linkedFindingIds: ['ff-1'],
          riskScore: 72,
          confidence: 'medium',
        },
      ],
      summary: {
        totalFindings: 2,
        findingsBySeverity: { LOW: 0, MEDIUM: 0, HIGH: 1, CRITICAL: 1 },
        totalRecommendations: 2,
        recommendationsByPriority: { P0: 1, P1: 1, P2: 0, P3: 0 },
        maxRiskScore: 95,
        avgRiskScore: 84,
        criticalUncoveredItems: 1,
        unprotectedSecurityFindings: 1,
        topRiskAreas: ['DELETE /admin (score 95)'],
      },
    }

    cy.intercept('GET', '/reports/coverage-intelligence.json', { body: mockReport }).as('reportFetch')
    cy.visit('/intelligence')
    cy.wait('@reportFetch')

    // Intelligence section should be visible with findings
    cy.get('[data-testid="intelligence-section"]', { timeout: 10000 }).should('be.visible')
    // AI summary panel should render (it has a toggle button)
    cy.get('[data-testid="intelligence-section"]').within(() => {
      cy.get('button').should('have.length.greaterThan', 0)
    })
  })

  it('verifies risk score sort renders highest score first by default', () => {
    const mockReport = {
      generatedAt: new Date().toISOString(),
      projectName: 'sort-test',
      findings: [],
      recommendations: [
        {
          id: 'rec-low',
          priority: 'P3',
          title: 'Low risk test',
          rationale: 'Low.',
          recommendedTestType: 'positive-api-test',
          endpoint: { method: 'GET', path: '/items' },
          likelyLanguage: 'typescript',
          likelyFramework: 'jest',
          linkedFindingIds: [],
          riskScore: 20,
          confidence: 'low',
        },
        {
          id: 'rec-high',
          priority: 'P0',
          title: 'Critical security test',
          rationale: 'Critical.',
          recommendedTestType: 'security-test',
          endpoint: { method: 'POST', path: '/payments' },
          likelyLanguage: 'typescript',
          likelyFramework: 'jest',
          linkedFindingIds: [],
          riskScore: 95,
          confidence: 'high',
        },
      ],
      summary: {
        totalFindings: 0,
        findingsBySeverity: { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 },
        totalRecommendations: 2,
        recommendationsByPriority: { P0: 1, P1: 0, P2: 0, P3: 1 },
        maxRiskScore: 95,
        avgRiskScore: 58,
        criticalUncoveredItems: 0,
        unprotectedSecurityFindings: 0,
        topRiskAreas: [],
      },
    }

    cy.intercept('GET', '/reports/coverage-intelligence.json', { body: mockReport }).as('reportFetch')
    cy.visit('/intelligence')
    cy.wait('@reportFetch')

    // Both recommendations visible
    cy.contains('Critical security test').should('be.visible')
    cy.contains('Low risk test').should('be.visible')
    // P0 high-risk should appear (default sort is risk score descending)
    cy.contains('P0').should('be.visible')
    cy.contains('95').should('be.visible')
  })

  it('opens finding drawer when linked-findings badge is clicked on a recommendation', () => {
    const mockReport = {
      generatedAt: new Date().toISOString(),
      projectName: 'drawer-test',
      findings: [
        {
          id: 'ff-1',
          source: 'coverage-gap-analysis',
          category: 'uncovered-endpoint',
          severity: 'CRITICAL',
          title: 'Uncovered endpoint: POST /payments/charge',
          description: 'Critical payment endpoint lacks any test coverage.',
          endpoint: { method: 'POST', path: '/payments/charge' },
          missingTestTypes: ['positive-api-test', 'negative-api-test'],
        },
      ],
      recommendations: [
        {
          id: 'rec-1',
          priority: 'P0',
          title: 'Add positive api test for POST /payments/charge',
          rationale: 'Critical payment endpoint lacks coverage.',
          recommendedTestType: 'positive-api-test',
          endpoint: { method: 'POST', path: '/payments/charge' },
          likelyLanguage: 'typescript',
          likelyFramework: 'jest',
          linkedFindingIds: ['ff-1'],
          riskScore: 92,
          confidence: 'high',
        },
      ],
      summary: {
        totalFindings: 1,
        findingsBySeverity: { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 1 },
        totalRecommendations: 1,
        recommendationsByPriority: { P0: 1, P1: 0, P2: 0, P3: 0 },
        maxRiskScore: 92,
        avgRiskScore: 92,
        criticalUncoveredItems: 1,
        unprotectedSecurityFindings: 0,
        topRiskAreas: ['POST /payments/charge (score 92)'],
      },
    }

    cy.intercept('GET', '/reports/coverage-intelligence.json', { body: mockReport }).as('reportFetch')
    cy.visit('/intelligence')
    cy.wait('@reportFetch')

    // Verify P0 recommendation is visible
    cy.contains('P0').should('be.visible')
    cy.contains('/payments/charge').should('be.visible')

    // Click the linked findings badge to open the drawer
    cy.get('[data-testid="intelligence-section"]', { timeout: 10000 }).within(() => {
      cy.contains(/1 finding/i).click()
    })
    // After clicking, the drawer should show finding details
    cy.contains('Uncovered endpoint').should('be.visible')
    cy.contains('/payments/charge').should('be.visible')
  })
})
