/**
 * Cypress e2e tests for documentation links.
 *
 * Visits every documentation page and asserts that:
 *   1. The page loads successfully (no 404 / error state).
 *   2. Every internal anchor link on the page resolves to a page that also
 *      loads successfully.
 *
 * The suite runs against the VitePress preview server
 * (npm run docs:preview → http://localhost:4173/apiTestsCoverageAnalyzer).
 */

/** All documentation routes (relative to baseUrl). */
const DOC_PAGES = [
  '/',
  '/guide/introduction',
  '/guide/getting-started',
  '/guide/installation',
  '/guide/ci-cd',
  '/guide/multi-language',
  '/guide/security-scanning',
  '/guide/interpreting-reports',
  '/guide/writing-tests',
  '/guide/plugins',
  '/guide/troubleshooting',
  '/guide/glossary',
  '/reference/cli',
  '/reference/architecture',
  '/reference/configuration',
  '/reference/plugin-api',
  '/reference/contributing',
]

// ─── Main test suite ────────────────────────────────────────────────────────

describe('Documentation pages load without errors', () => {
  DOC_PAGES.forEach((route) => {
    it(`loads ${route}`, () => {
      cy.visit(route)
      // VitePress renders either #VPContent (all layouts) or <main> (doc layout).
      // The home page uses layout: home which renders <div id="VPContent"> not <main>.
      cy.get('#VPContent, main').should('exist')
      // The title should not contain "404"
      cy.title().should('not.include', '404')
    })
  })
})

describe('Documentation internal links are not broken', () => {
  DOC_PAGES.forEach((route) => {
    it(`all internal links on ${route} resolve correctly`, () => {
      cy.visit(route)
      cy.get('#VPContent, main').should('exist')

      // Collect all unique internal hrefs from the page.
      // Strip fragment identifiers so we test the page itself, not just an anchor.
      cy.get('a[href]').then(($anchors) => {
        const base = Cypress.config('baseUrl')
        // Use server origin (protocol + host + port) for cy.request URL resolution.
        // This ensures hrefs like /apiTestsCoverageAnalyzer/ are resolved to
        // http://localhost:4173/apiTestsCoverageAnalyzer/ rather than being
        // concatenated onto the full baseUrl path.
        const origin = new URL(base).origin
        const seen = new Set()
        const hrefs = []

        $anchors.each((_i, el) => {
          const href = el.getAttribute('href')
          // Skip missing, external, or fragment-only links
          if (!href || href.startsWith('#')) return
          // Keep links that are same-origin / relative (skip external URLs)
          if (
            href.startsWith('/') ||
            href.startsWith('./') ||
            href.startsWith('../') ||
            href.startsWith(base)
          ) {
            const withoutFragment = href.split('#')[0]
            if (withoutFragment && !seen.has(withoutFragment)) {
              seen.add(withoutFragment)
              hrefs.push(withoutFragment)
            }
          }
        })

        hrefs.forEach((href) => {
          // Resolve to a full URL using the server origin so that
          // base-path-prefixed hrefs (e.g. /apiTestsCoverageAnalyzer/) are
          // requested correctly instead of being doubled onto the baseUrl.
          const fullUrl = href.startsWith('http') ? href : origin + href
          cy.request({ url: fullUrl, failOnStatusCode: false }).then((res) => {
            expect(
              res.status,
              `Expected link "${href}" found on "${route}" to return 2xx, got ${res.status}`
            ).to.be.lessThan(400)
          })
        })
      })
    })
  })
})
