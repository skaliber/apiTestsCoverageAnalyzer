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
  '/guide/mcp-integration',
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

      // cy.url() always returns a fully-qualified http://... URL after cy.visit(),
      // making it reliable for resolving relative hrefs and determining same-origin.
      cy.url().then((pageUrl) => {
        const serverOrigin = new URL(pageUrl).origin  // e.g. http://localhost:4173

        cy.get('a[href]').then(($anchors) => {
          const seen = new Set()
          const hrefs = []

          $anchors.each((_i, el) => {
            const rawHref = el.getAttribute('href')
            // Skip missing or fragment-only links
            if (!rawHref || rawHref.startsWith('#')) return

            // Resolve the href to a fully-qualified URL using the current page URL
            // as the base. new URL() handles absolute (/path), relative (./path,
            // ../path), and already-qualified (http://…) hrefs correctly.
            let resolved
            try {
              resolved = new URL(rawHref, pageUrl).href.split('#')[0]
            } catch {
              return  // skip unparseable hrefs
            }

            // Only test same-origin links (skip external URLs)
            if (!resolved.startsWith(serverOrigin)) return

            if (resolved && !seen.has(resolved)) {
              seen.add(resolved)
              hrefs.push(resolved)
            }
          })

          hrefs.forEach((url) => {
            cy.request({ url, failOnStatusCode: false }).then((res) => {
              expect(
                res.status,
                `Expected link "${url}" found on "${route}" to return 2xx, got ${res.status}`
              ).to.be.lessThan(400)
            })
          })
        })
      })
    })
  })
})
