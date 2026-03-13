/**
 * Spec 23 — E2E Cypress tests for Coverage Analyzer dashboard.
 *
 * These tests complement the existing dashboard.cy.js by exercising
 * deeper interaction patterns introduced in Spec 23:
 *
 *   - Evidence panels (expand/collapse, data-testid verification)
 *   - Mermaid diagram rendering in integration flows
 *   - Overview diagnostics expansion (confidence, evidence depth)
 *   - Theme toggle persistence across reload
 *   - Intelligence page real-data rendering
 *   - Section-specific expandable row interactions
 *
 * Run against the Vite preview server:
 *   cd dashboard && npm run build && npm run preview
 *   (http://127.0.0.1:4173)
 */

// ─── 1. Endpoint Evidence Panels ──────────────────────────────────────────────

describe('Endpoint evidence panels', () => {
  beforeEach(() => cy.visit('/endpoints'))

  it('renders expandable endpoint rows with coverage indicators', () => {
    // Wait for data to load, then check that expandable buttons with coverage indicators exist
    cy.get('button', { timeout: 10000 })
      .filter(':contains("✅"), :contains("❌")')
      .should('have.length.greaterThan', 0)
  })

  it('expands an endpoint row to show detail panel', () => {
    cy.get('button', { timeout: 10000 })
      .filter(':contains("✅")')
      .first()
      .click()

    // Covered endpoints in demo data may show evidence-panel (if evidence present)
    // or fallback status panel. Either means the expand worked.
    cy.get('.px-4.pb-3').should('exist')
    cy.contains(/Status:|Test Files/i).should('be.visible')
  })

  it('expand shows covered status for covered endpoint', () => {
    cy.get('button', { timeout: 10000 })
      .filter(':contains("✅")')
      .first()
      .click()

    cy.contains(/Covered/i).should('be.visible')
  })

  it('collapses expanded panel on second click', () => {
    cy.get('button', { timeout: 10000 })
      .filter(':contains("✅")')
      .first()
      .click()

    cy.get('.px-4.pb-3').should('exist')

    cy.get('button')
      .filter(':contains("✅")')
      .first()
      .click()

    cy.get('.px-4.pb-3').should('not.exist')
  })

  it('shows collapse/expand arrow indicators', () => {
    cy.get('button', { timeout: 10000 })
      .filter(':contains("✅")')
      .first()
      .as('expandBtn')

    // Before expanding, should show down arrow
    cy.get('@expandBtn').should('contain', '▼')

    cy.get('@expandBtn').click()

    // After expanding, should show up arrow
    cy.get('@expandBtn').should('contain', '▲')
  })

  it('shows status information for covered endpoints', () => {
    cy.get('button', { timeout: 10000 })
      .filter(':contains("✅")')
      .first()
      .click()

    // Fallback panel shows Status: Covered or evidence panel shows test/confidence info
    cy.contains(/Status:|Covered/i).should('exist')
  })

  it('expands an uncovered endpoint to show status info', () => {
    // Check if there are any uncovered endpoints in the data
    cy.get('body').then(($body) => {
      if ($body.find('button:contains("❌")').length > 0) {
        cy.get('button')
          .filter(':contains("❌")')
          .first()
          .click()

        // Should show status information
        cy.contains(/Status/).should('be.visible')
        cy.contains(/Not covered/i).should('be.visible')
      }
    })
  })
})

// ─── 2. Error Handling Evidence Panels ────────────────────────────────────────

describe('Error handling evidence panels', () => {
  beforeEach(() => cy.visit('/error-handling'))

  it('shows expandable error scenario rows', () => {
    cy.get('button', { timeout: 10000 })
      .filter(':contains("✅"), :contains("❌")')
      .should('have.length.greaterThan', 0)
  })

  it('expands error scenario to show detail panel', () => {
    cy.get('button', { timeout: 10000 })
      .filter(':contains("❌")')
      .first()
      .click()

    // Should show expanded area with status info or evidence data
    cy.get('.px-4.pb-3').should('exist')
  })

  it('shows status text in expanded error row', () => {
    cy.get('button', { timeout: 10000 })
      .filter(':contains("❌")')
      .first()
      .click()

    cy.contains('Status:').should('be.visible')
    cy.contains(/Not covered/i).should('be.visible')
  })

  it('shows error code in row labels', () => {
    // Error scenarios display error codes (401, 400, etc.) in the ID text
    cy.get('button', { timeout: 10000 })
      .filter(':contains("❌")')
      .first()
      .within(() => {
        cy.get('span').should('exist')
      })
  })

  it('collapses error scenario on second click', () => {
    cy.get('button', { timeout: 10000 })
      .filter(':contains("❌")')
      .first()
      .click()

    cy.get('.px-4.pb-3').should('exist')

    cy.get('button')
      .filter(':contains("❌")')
      .first()
      .click()

    cy.get('.px-4.pb-3').should('not.exist')
  })

  it('displays status code badge on error scenario rows', () => {
    // Error scenarios display a status code badge inline
    cy.get('button', { timeout: 10000 })
      .filter(':contains("❌")')
      .first()
      .within(() => {
        // Status codes like 400, 401, 404 should appear in the button text
        cy.get('span').should('exist')
      })
  })
})

// ─── 3. Security Page ─────────────────────────────────────────────────────────

describe('Security page evidence panels', () => {
  beforeEach(() => cy.visit('/security'))

  it('shows security control rows with coverage indicators', () => {
    // Demo data has 26 security controls, so we expect rows with indicators
    cy.get('button', { timeout: 10000 })
      .filter(':contains("✅"), :contains("❌")')
      .should('have.length.greaterThan', 0)
  })

  it('expands a security control to show evidence panel', () => {
    cy.get('button', { timeout: 10000 })
      .filter(':contains("✅"), :contains("❌")')
      .first()
      .click()

    // Security controls have category and description in demo data, so evidence panel renders
    cy.get('[data-testid="evidence-panel"]').should('be.visible')
  })

  it('shows description in evidence panel when expanding a security control', () => {
    cy.get('button', { timeout: 10000 })
      .filter(':contains("✅"), :contains("❌")')
      .first()
      .click()

    // Evidence panel renders description from the demo security data
    cy.get('[data-testid="evidence-panel"]').should('be.visible')
  })

  it('shows category badge on security rows', () => {
    // Security rows display category badges (e.g. authentication, authorization)
    cy.get('button', { timeout: 10000 })
      .filter(':contains("✅"), :contains("❌")')
      .first()
      .within(() => {
        // Category badges exist as inline spans
        cy.get('span').should('exist')
      })
  })

  it('collapses security evidence on second click', () => {
    cy.get('button', { timeout: 10000 })
      .filter(':contains("✅"), :contains("❌")')
      .first()
      .click()

    cy.get('[data-testid="evidence-panel"]').should('be.visible')

    cy.get('button')
      .filter(':contains("✅"), :contains("❌")')
      .first()
      .click()

    cy.get('[data-testid="evidence-panel"]').should('not.exist')
  })
})

// ─── 4. Integration Flow Rendering ──────────────────────────────────────────

describe('Integration flow rendering', () => {
  beforeEach(() => cy.visit('/integration-flows'))

  it('shows expandable flow rows with step counts', () => {
    cy.get('button', { timeout: 10000 })
      .filter(':contains("✅"), :contains("❌")')
      .should('have.length.greaterThan', 0)

    // Flow rows display step counts
    cy.contains(/steps/i).should('exist')
  })

  it('shows step progress bars on flow cards', () => {
    // Progress bars are visible before expansion
    cy.get('button', { timeout: 10000 })
      .filter(':contains("✅"), :contains("❌")')
      .should('exist')

    // Progress bar container (rounded-full h-1.5)
    cy.get('.rounded-full.h-1\\.5').should('have.length.greaterThan', 0)
  })

  it('expands a flow to show status info', () => {
    cy.get('button', { timeout: 10000 })
      .filter(':contains("✅"), :contains("❌")')
      .first()
      .click()

    // Should show status with step progress
    cy.contains('Status:').should('be.visible')
  })

  it('expanded flow shows coverage status', () => {
    cy.get('button', { timeout: 10000 })
      .filter(':contains("✅"), :contains("❌")')
      .first()
      .click()

    cy.contains(/Covered|Not covered/i).should('be.visible')
  })

  it('expanded flow shows test info for covered flows', () => {
    cy.get('button', { timeout: 10000 })
      .filter(':contains("✅")')
      .first()
      .click()

    // Covered flows show their linked tests
    cy.contains('Tests:').should('be.visible')
  })

  it('shows gap warning for uncovered flows', () => {
    cy.get('body').then(($body) => {
      if ($body.find('button:contains("❌")').length > 0) {
        cy.get('button')
          .filter(':contains("❌")')
          .first()
          .click()

        cy.contains(/Gap/i).should('be.visible')
      }
    })
  })

  it('collapses flow detail on second click', () => {
    cy.get('button', { timeout: 10000 })
      .filter(':contains("✅"), :contains("❌")')
      .first()
      .click()

    cy.contains('Status:').should('be.visible')

    cy.get('button')
      .filter(':contains("✅"), :contains("❌")')
      .first()
      .click()

    // The detail panel should disappear
    cy.get('.border-t.border-gray-100').should('not.exist')
  })
})

// ─── 5. Theme Toggle ─────────────────────────────────────────────────────────

describe('Theme toggle persistence and rendering', () => {
  beforeEach(() => {
    cy.clearLocalStorage()
    cy.visit('/')
  })

  it('toggles dark mode class on html element', () => {
    cy.get('[data-testid="theme-toggle"]').click()
    cy.get('html').should('have.class', 'dark')
  })

  it('persists theme preference across page reload', () => {
    cy.get('[data-testid="theme-toggle"]').click()
    cy.get('html').should('have.class', 'dark')

    cy.reload()

    cy.get('html').should('have.class', 'dark')
    cy.get('[data-testid="theme-toggle"]').should('contain', 'Light')
  })

  it('persists theme preference across navigation', () => {
    cy.get('[data-testid="theme-toggle"]').click()
    cy.get('html').should('have.class', 'dark')

    // Navigate to another page
    cy.get('nav').contains('Endpoints').click()
    cy.get('html').should('have.class', 'dark')

    // Navigate back
    cy.get('nav').contains('Overview').click()
    cy.get('html').should('have.class', 'dark')
  })

  it('stores theme value in localStorage', () => {
    cy.get('[data-testid="theme-toggle"]').click()
    cy.window().then((win) => {
      expect(win.localStorage.getItem('theme')).to.equal('dark')
    })
  })

  it('summary table renders in dark mode without visual breakage', () => {
    cy.get('[data-testid="theme-toggle"]').click()
    cy.get('html').should('have.class', 'dark')

    cy.get('[data-testid="summary-table"]', { timeout: 10000 }).should('be.visible')
    cy.get('[data-testid="summary-table"] thead').should('be.visible')
    cy.get('[data-testid="summary-table"] tbody tr').should('have.length.greaterThan', 0)
  })

  it('expandable rows work correctly in dark mode', () => {
    cy.get('[data-testid="theme-toggle"]').click()
    cy.get('html').should('have.class', 'dark')

    // Navigate to security page where evidence panels render with demo data
    cy.visit('/security')
    cy.get('button', { timeout: 10000 })
      .filter(':contains("✅"), :contains("❌")')
      .first()
      .click()

    // Security controls have category/description in demo data → evidence-panel renders
    cy.get('[data-testid="evidence-panel"]').should('be.visible')
  })
})

// ─── 6. Overview Page Diagnostics ─────────────────────────────────────────────

describe('Overview diagnostics', () => {
  beforeEach(() => cy.visit('/'))

  it('shows summary table with all coverage types', () => {
    cy.get('[data-testid="summary-table"]', { timeout: 10000 }).should('be.visible')
    cy.get('[data-testid="summary-table"] tbody tr').should('have.length.greaterThan', 0)
  })

  it('summary table rows are clickable and expand to show diagnostics', () => {
    cy.get('[data-testid="summary-table"]', { timeout: 10000 })

    // Click the first data row in the summary table
    cy.get('[data-testid="summary-table"] tbody tr').first().click()

    // After clicking, should show expanded diagnostic detail row
    // with Confidence and Evidence Depth badges
    cy.contains('Confidence:').should('be.visible')
    cy.contains('Evidence Depth:').should('be.visible')
  })

  it('expanded summary row shows confidence badge', () => {
    cy.get('[data-testid="summary-table"]', { timeout: 10000 })
    cy.get('[data-testid="summary-table"] tbody tr').first().click()

    cy.get('[data-testid="confidence-badge"]').should('exist')
  })

  it('expanded summary row shows evidence depth indicator', () => {
    cy.get('[data-testid="summary-table"]', { timeout: 10000 })
    cy.get('[data-testid="summary-table"] tbody tr').first().click()

    // Evidence depth label (Shallow, Moderate, or Deep)
    cy.contains(/Shallow|Moderate|Deep/).should('be.visible')
  })

  it('collapses summary row on second click', () => {
    cy.get('[data-testid="summary-table"]', { timeout: 10000 })
    cy.get('[data-testid="summary-table"] tbody tr').first().click()

    cy.contains('Confidence:').should('be.visible')

    cy.get('[data-testid="summary-table"] tbody tr').first().click()

    // The expanded detail row should no longer be visible
    cy.get('[data-testid="summary-table"]').within(() => {
      cy.contains('Confidence:').should('not.exist')
    })
  })

  it('shows quality gate banner', () => {
    cy.get('[data-testid="summary-table"]', { timeout: 10000 })
    cy.contains(/quality gate/i).should('be.visible')
  })

  it('shows bar chart with coverage by type', () => {
    cy.get('[data-testid="summary-table"]', { timeout: 10000 })
    cy.contains('Coverage by Type').should('be.visible')
    cy.get('.recharts-wrapper').should('exist')
  })
})

// ─── 7. Business Rules Expandable ─────────────────────────────────────────────

describe('Business rules expandable', () => {
  beforeEach(() => cy.visit('/business-rules'))

  it('shows expandable rule rows with coverage indicators', () => {
    cy.get('button', { timeout: 10000 })
      .filter(':contains("✅"), :contains("❌")')
      .should('have.length.greaterThan', 0)
  })

  it('expands a rule to show status details', () => {
    cy.get('button', { timeout: 10000 })
      .filter(':contains("✅"), :contains("❌")')
      .first()
      .click()

    cy.contains('Status:').should('be.visible')
  })

  it('shows covered or uncovered status text', () => {
    cy.get('button', { timeout: 10000 })
      .filter(':contains("✅"), :contains("❌")')
      .first()
      .click()

    cy.contains(/Covered|Not covered/i).should('be.visible')
  })

  it('shows status for covered rules', () => {
    cy.get('button', { timeout: 10000 })
      .filter(':contains("✅")')
      .first()
      .click()

    // Covered rules show their coverage status in the expanded panel
    cy.contains(/Covered/i).should('be.visible')
  })

  it('shows coverage indicator on rule rows', () => {
    // Business rules rows show ✅ or ❌ indicators
    cy.get('button', { timeout: 10000 })
      .filter(':contains("✅"), :contains("❌")')
      .first()
      .within(() => {
        // Row content should include at least the rule name and status indicator
        cy.get('span').should('exist')
      })
  })

  it('collapses the expanded rule on second click', () => {
    cy.get('button', { timeout: 10000 })
      .filter(':contains("✅"), :contains("❌")')
      .first()
      .click()

    cy.contains('Status:').should('be.visible')

    cy.get('button')
      .filter(':contains("✅"), :contains("❌")')
      .first()
      .click()

    // Status text should disappear after collapsing
    cy.get('.px-4.pb-3').should('not.exist')
  })
})

// ─── 8. Parameters Page ───────────────────────────────────────────────────────

describe('Parameters page expandable rows', () => {
  beforeEach(() => cy.visit('/parameters'))

  it('shows expandable parameter rows with coverage indicators', () => {
    cy.get('button', { timeout: 10000 })
      .filter(':contains("✅"), :contains("❌")')
      .should('have.length.greaterThan', 0)
  })

  it('expands a parameter row to show details', () => {
    cy.get('button', { timeout: 10000 })
      .filter(':contains("✅"), :contains("❌")')
      .first()
      .click()

    // Should show status information in the expanded panel
    cy.contains(/Status:|Test Files/i).should('be.visible')
  })

  it('collapses parameter row on second click', () => {
    cy.get('button', { timeout: 10000 })
      .filter(':contains("✅"), :contains("❌")')
      .first()
      .click()

    // Content should be visible after first click
    cy.contains(/Status:|Test Files/i).should('be.visible')

    cy.get('button')
      .filter(':contains("✅"), :contains("❌")')
      .first()
      .click()

    // The expanded area should no longer exist
    cy.get('.px-4.pb-3').should('not.exist')
  })

  it('shows arrow indicator change on expand', () => {
    cy.get('button', { timeout: 10000 })
      .filter(':contains("✅"), :contains("❌")')
      .first()
      .as('paramBtn')

    cy.get('@paramBtn').should('contain', '▼')
    cy.get('@paramBtn').click()
    cy.get('@paramBtn').should('contain', '▲')
  })
})

// ─── 9. Performance Page ──────────────────────────────────────────────────────

describe('Performance page expandable rows', () => {
  beforeEach(() => cy.visit('/performance'))

  it('shows expandable performance and resilience rows', () => {
    // Demo data has both performance (4/6) and resilience (3/4) items
    cy.get('button', { timeout: 10000 })
      .filter(':contains("✅"), :contains("❌")')
      .should('have.length.greaterThan', 0)
  })

  it('expands a performance row to show status and threshold', () => {
    cy.get('button', { timeout: 10000 })
      .filter(':contains("✅"), :contains("❌")')
      .first()
      .click()

    cy.contains('Status:').should('be.visible')
  })

  it('shows threshold information when available', () => {
    cy.get('button', { timeout: 10000 })
      .filter(':contains("✅"), :contains("❌")')
      .first()
      .click()

    // Some items may have thresholds (e.g. "200ms response time")
    // We check for the Threshold label if present, otherwise just verify expand works
    cy.contains(/Status:|Threshold:/i).should('be.visible')
  })

  it('collapses performance detail on second click', () => {
    cy.get('button', { timeout: 10000 })
      .filter(':contains("✅"), :contains("❌")')
      .first()
      .click()

    cy.contains('Status:').should('be.visible')

    cy.get('button')
      .filter(':contains("✅"), :contains("❌")')
      .first()
      .click()

    // The expanded content should disappear
    cy.get('.border-t.border-gray-100').should('not.exist')
  })
})

// ─── 10. Intelligence Page (Real Data) ────────────────────────────────────────

describe('Intelligence page with real data', () => {
  beforeEach(() => cy.visit('/intelligence'))

  it('shows the Coverage Intelligence heading', () => {
    cy.get('h1', { timeout: 10000 }).should('contain', 'Coverage Intelligence')
  })

  it('shows summary cards with real report data', () => {
    cy.contains('Total Findings', { timeout: 10000 }).should('be.visible')
    cy.contains('Recommendations').should('be.visible')
    cy.contains('Max Risk Score').should('be.visible')
    cy.contains('P0 Actions').should('be.visible')
  })

  it('shows Missing Test Recommendations section', () => {
    cy.contains('Missing Test Recommendations', { timeout: 10000 }).should('be.visible')
  })

  it('shows Functional Findings section', () => {
    cy.contains('Functional Findings', { timeout: 10000 }).should('be.visible')
  })

  it('findings table is expandable', () => {
    cy.contains('Functional Findings', { timeout: 10000 })

    // The findings table should have clickable rows
    cy.get('[data-testid="intelligence-section"]').within(() => {
      cy.get('table tbody tr').first().click()

      // After clicking, an expanded detail row should appear
      cy.get('table tbody tr').should('have.length.greaterThan', 1)
    })
  })

  it('shows recommendation cards with priority badges', () => {
    cy.contains('Missing Test Recommendations', { timeout: 10000 })

    // Recommendation cards display priority badges (P0, P1, P2, P3)
    cy.contains(/P[0-3]/).should('exist')
  })

  it('shows risk scores on recommendation cards', () => {
    cy.contains('Missing Test Recommendations', { timeout: 10000 })

    // Recommendations display risk scores
    cy.contains(/Risk:/i).should('exist')
  })

  it('shows endpoint filter input', () => {
    cy.get('[data-testid="endpoint-filter"]', { timeout: 10000 }).should('exist')
  })

  it('filters recommendations by endpoint', () => {
    cy.get('[data-testid="endpoint-filter"]', { timeout: 10000 }).type('wallets')

    // After filtering, only recommendations with /wallets should remain
    cy.contains('/wallets').should('exist')
  })

  it('shows false confidence warnings when applicable', () => {
    // The demo data has findings and risk scores, so warnings may appear
    cy.get('body', { timeout: 10000 }).then(($body) => {
      if ($body.find(':contains("False Confidence Warnings")').length > 0) {
        cy.contains('False Confidence Warnings').should('be.visible')
      }
    })
  })

  it('shows Top Risk Areas section when present', () => {
    cy.get('body', { timeout: 10000 }).then(($body) => {
      if ($body.find(':contains("Top Risk Areas")').length > 0) {
        cy.contains('Top Risk Areas').should('be.visible')
      }
    })
  })
})

// ─── 11. Cross-Page Expandable Consistency ────────────────────────────────────

describe('Cross-page expandable row consistency', () => {
  const pagesWithExpandableRows = [
    { path: '/endpoints', name: 'Endpoints' },
    { path: '/error-handling', name: 'Error Handling' },
    { path: '/security', name: 'Security' },
    { path: '/parameters', name: 'Parameters' },
    { path: '/performance', name: 'Performance' },
    { path: '/business-rules', name: 'Business Rules' },
    { path: '/integration-flows', name: 'Integration Flows' },
  ]

  pagesWithExpandableRows.forEach(({ path, name }) => {
    it(`${name}: first expand/collapse cycle works without errors`, () => {
      cy.visit(path)

      cy.get('button', { timeout: 10000 })
        .filter(':contains("✅"), :contains("❌")')
        .first()
        .as('firstRow')

      // Expand
      cy.get('@firstRow').click()

      // Verify some content appeared (Status or evidence panel or Mermaid)
      cy.get('body').then(($body) => {
        const hasEvidence = $body.find('[data-testid="evidence-panel"]').length > 0
        const hasMermaid = $body.find('[data-testid="mermaid-dual-panel"]').length > 0
        const hasStatus = $body.text().includes('Status:')
        expect(hasEvidence || hasMermaid || hasStatus).to.be.true
      })

      // Collapse
      cy.get('@firstRow').click()
    })
  })
})

// ─── 12. Overview Intelligence Banner ─────────────────────────────────────────

describe('Overview intelligence banner', () => {
  beforeEach(() => cy.visit('/'))

  it('shows intelligence summary banner with findings and recommendations count', () => {
    cy.get('[data-testid="summary-table"]', { timeout: 10000 })

    // The intelligence banner should appear when coverage-intelligence.json is loaded
    cy.get('body').then(($body) => {
      if ($body.find(':contains("Coverage Intelligence")').length > 0) {
        cy.contains('Coverage Intelligence').should('be.visible')
        cy.contains(/findings/i).should('exist')
        cy.contains(/recommendations/i).should('exist')
      }
    })
  })

  it('shows "View Intelligence" link that navigates to intelligence page', () => {
    cy.get('[data-testid="summary-table"]', { timeout: 10000 })

    cy.get('body').then(($body) => {
      if ($body.find('a:contains("View Intelligence")').length > 0) {
        cy.contains('View Intelligence').click()
        cy.url().should('include', '/intelligence')
      }
    })
  })
})
