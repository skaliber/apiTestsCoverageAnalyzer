/**
 * Cypress e2e tests for the coverage analysis dashboard.
 *
 * Covers all 9 routes and key UI interactions:
 *   - Sidebar navigation to every page
 *   - Overview: summary table, quality gate banner, bar chart, header info
 *   - Detail pages (Endpoints, Parameters, Security, Error Handling, Performance):
 *       table rendering, search/filter, pie chart
 *   - Business Rules: accordion expand / collapse, search
 *   - Integration Flows: flow cards with step counts, search, pie chart
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
  { path: '/trends',            heading: 'Coverage Trends',         navText: 'Trends'            },
]

// ─── 1. Navigation ────────────────────────────────────────────────────────────

describe('Dashboard navigation', () => {
  beforeEach(() => cy.visit('/'))

  it('shows the sidebar with "API Coverage" branding', () => {
    cy.get('nav').should('exist')
    cy.contains('API Coverage').should('be.visible')
  })

  it('shows all 9 sidebar navigation links', () => {
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

  it('renders endpoint rows in the table', () => {
    cy.get('table', { timeout: 10000 }).should('exist')
    cy.get('table tbody tr').should('have.length.greaterThan', 0)
    cy.contains('GET /api/users').should('exist')
  })

  it('shows the pie chart', () => {
    cy.get('.recharts-wrapper').should('exist')
  })

  it('filters endpoints by search term', () => {
    cy.get('table', { timeout: 10000 })
    cy.get('input[type="text"]').type('products')
    cy.get('table tbody tr').each(($row) => {
      cy.wrap($row).contains(/products/i)
    })
  })

  it('shows no rows when search matches nothing', () => {
    cy.get('table', { timeout: 10000 })
    cy.get('input[type="text"]').type('zzz-nonexistent-zzz')
    // The table renders a single placeholder row with "No results found." text
    cy.contains('No results found.').should('be.visible')
    cy.get('table tbody tr').should('have.length', 1)
  })
})

// ─── 4. Parameters page ───────────────────────────────────────────────────────

describe('Parameters page', () => {
  beforeEach(() => cy.visit('/parameters'))

  it('shows the "Parameters" heading', () => {
    cy.get('h1').should('contain', 'Parameters')
  })

  it('renders parameter rows in the table', () => {
    cy.get('table', { timeout: 10000 }).should('exist')
    cy.get('table tbody tr').should('have.length.greaterThan', 0)
  })

  it('shows the pie chart', () => {
    cy.get('.recharts-wrapper').should('exist')
  })

  it('filters parameters by search term', () => {
    cy.get('table', { timeout: 10000 })
    cy.get('input[type="text"]').type('page')
    cy.get('table tbody tr').should('have.length.greaterThan', 0)
    cy.contains(/page/i).should('exist')
  })
})

// ─── 5. Security page ─────────────────────────────────────────────────────────

describe('Security page', () => {
  beforeEach(() => cy.visit('/security'))

  it('shows the "Security" heading', () => {
    cy.get('h1').should('contain', 'Security')
  })

  it('renders security check rows in the table', () => {
    cy.get('table', { timeout: 10000 }).should('exist')
    cy.get('table tbody tr').should('have.length.greaterThan', 0)
    cy.contains('JWT').should('exist')
  })

  it('shows the pie chart', () => {
    cy.get('.recharts-wrapper').should('exist')
  })

  it('filters security items by search term', () => {
    cy.get('table', { timeout: 10000 })
    cy.get('input[type="text"]').type('JWT')
    cy.get('table tbody tr').should('have.length.greaterThan', 0)
    cy.contains(/JWT/i).should('exist')
  })
})

// ─── 6. Error Handling page ───────────────────────────────────────────────────

describe('Error Handling page', () => {
  beforeEach(() => cy.visit('/error-handling'))

  it('shows the "Error Handling" heading', () => {
    cy.get('h1').should('contain', 'Error Handling')
  })

  it('renders error scenario rows in the table', () => {
    cy.get('table', { timeout: 10000 }).should('exist')
    cy.get('table tbody tr').should('have.length.greaterThan', 0)
    cy.contains('400').should('exist')
  })

  it('shows the pie chart', () => {
    cy.get('.recharts-wrapper').should('exist')
  })

  it('filters error scenarios by search term', () => {
    cy.get('table', { timeout: 10000 })
    cy.get('input[type="text"]').type('401')
    cy.get('table tbody tr').should('have.length.greaterThan', 0)
    cy.contains(/401/i).should('exist')
  })
})

// ─── 7. Performance & Resilience page ─────────────────────────────────────────

describe('Performance & Resilience page', () => {
  beforeEach(() => cy.visit('/performance'))

  it('shows the "Performance & Resilience" heading', () => {
    cy.get('h1').should('contain', 'Performance & Resilience')
  })

  it('renders performance and resilience rows in the table', () => {
    cy.get('table', { timeout: 10000 }).should('exist')
    cy.get('table tbody tr').should('have.length.greaterThan', 0)
    // Merged section shows both performance and resilience items
    cy.contains(/response|Retry/i).should('exist')
  })

  it('shows the pie chart', () => {
    cy.get('.recharts-wrapper').should('exist')
  })

  it('filters items by search term', () => {
    cy.get('table', { timeout: 10000 })
    cy.get('input[type="text"]').type('200ms')
    cy.get('table tbody tr').should('have.length.greaterThan', 0)
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
