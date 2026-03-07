import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'API Test Coverage Analyzer',
  description: 'Comprehensive documentation for the API Test Coverage Analyzer – analyse endpoint, parameter, business-logic, security, and more against your OpenAPI specs.',
  base: '/apiTestsCoverageAnalyzer/',
  cleanUrls: true,

  ignoreDeadLinks: [
    /^http:\/\/localhost/,
  ],

  themeConfig: {
    logo: '/logo.svg',
    siteTitle: 'Coverage Analyzer',

    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'CLI Reference', link: '/reference/cli' },
      { text: 'Architecture', link: '/reference/architecture' },
      { text: 'Contributing', link: '/reference/contributing' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'What is this?', link: '/guide/introduction' },
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Installation', link: '/guide/installation' },
          ],
        },
        {
          text: 'Workflows',
          items: [
            { text: 'CI/CD Integration', link: '/guide/ci-cd' },
            { text: 'Multi-Language Support', link: '/guide/multi-language' },
            { text: 'Security Scanning', link: '/guide/security-scanning' },
            { text: 'MCP Integration', link: '/guide/mcp-integration' },
            { text: 'Interpreting Reports', link: '/guide/interpreting-reports' },
            { text: 'Writing Effective Tests', link: '/guide/writing-tests' },
            { text: 'Extending via Plugins', link: '/guide/plugins' },
          ],
        },
        {
          text: 'Help',
          items: [
            { text: 'Troubleshooting & FAQ', link: '/guide/troubleshooting' },
            { text: 'Glossary', link: '/guide/glossary' },
          ],
        },
      ],
      '/reference/': [
        {
          text: 'Reference',
          items: [
            { text: 'CLI Reference', link: '/reference/cli' },
            { text: 'Architecture', link: '/reference/architecture' },
            { text: 'Configuration Schema', link: '/reference/configuration' },
            { text: 'Plugin API', link: '/reference/plugin-api' },
            { text: 'Contributing', link: '/reference/contributing' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/skaliber/apiTestsCoverageAnalyzer' },
    ],

    search: {
      provider: 'local',
    },

    editLink: {
      pattern: 'https://github.com/skaliber/apiTestsCoverageAnalyzer/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2024-present skaliber',
    },
  },

  markdown: {
    theme: {
      light: 'github-light',
      dark: 'github-dark',
    },
  },
})
