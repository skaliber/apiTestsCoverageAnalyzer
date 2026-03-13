const { defineConfig } = require('cypress')

module.exports = defineConfig({
  e2e: {
    baseUrl: 'http://127.0.0.1:4173',
    specPattern: ['cypress/e2e/dashboard.cy.js', 'cypress/e2e/spec23-dashboard.cy.js'],
    supportFile: false,
    video: false,
    screenshotOnRunFailure: false,
    defaultCommandTimeout: 10000,
    pageLoadTimeout: 30000,
  },
})
