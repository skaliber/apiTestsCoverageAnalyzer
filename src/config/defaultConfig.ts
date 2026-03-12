/**
 * Central config — built-in default values.
 *
 * Every config field has a default here.  No scanning module may use an
 * inline fallback; all defaults live in this single file.
 */

import type { AnalyzerConfig } from './types';
import {
  VALID_COVERAGE_TYPES,
  VALID_INTELLIGENCE_TYPES,
  VALID_SECURITY_SCANNERS,
} from './schema';

export const DEFAULT_CONFIG: AnalyzerConfig = {
  version: 1,

  project: {
    name: undefined,
  },

  analysis: {
    defaultMode: 'full',
    failOnConfigMissing: false,
    warnOnConfigMissing: true,
    agnosticDiscovery: true,
    inferBusinessRules: true,
    inferIntegrationFlows: true,
    ast: {
      enabled: true,
      fallbackHeuristics: true,
      maxCallDepth: 4,
      assertionAware: true,
      languages: {
        java: { enabled: true },
        kotlin: { enabled: true },
        python: { enabled: true },
        ruby: { enabled: true },
        javascript: { enabled: true },
        typescript: { enabled: true },
        cucumber: { enabled: true },
      },
    },
  },

  scans: {
    coverage: {
      enabled: true,
      types: [...VALID_COVERAGE_TYPES],
      deepAnalysis: {
        enabled: true,
        maxCallDepth: 4,
        resolveConstants: true,
        resolveEnums: true,
        resolveStringTemplates: true,
        resolveWrappers: true,
        resolveRequestBuilders: true,
        resolveClientMappings: true,
        assertionAware: true,
        clientMappings: [],
      },
    },
    security: {
      enabled: true,
      scanners: [...VALID_SECURITY_SCANNERS],
    },
    intelligence: {
      enabled: true,
      types: [...VALID_INTELLIGENCE_TYPES],
    },
  },

  mcp: {
    // MCP is disabled by default when config is missing to avoid unexpected
    // network calls.  Users must explicitly opt in via config.yaml.
    enabled: false,
    defaultTransport: 'stdio',
    timeoutMs: 30_000,
    servers: {},
  },

  thresholds: {
    global: 80,
  },

  qualityGate: {
    enabled: true,
    failBuildOnThresholdMiss: false,
    mode: 'warn',
  },

  reports: {
    outputDir: 'reports',
    formats: ['json'],
  },

  publishing: {
    enabled: false,
    githubPages: {
      enabled: false,
    },
  },

  dashboard: {
    aiSummary: {
      enabled: true,
      collapsedByDefault: true,
    },
  },
  generation: {
    enabled: true,
    outputDir: 'generated-tests/',
    dryRun: false,
    overwrite: false,
    minPriority: 'P1',
    unitFramework: 'auto',
    integrationFramework: 'auto',
    e2eFramework: 'cypress',
    fileNaming: 'kebab',
    includeTypes: ['endpoint', 'error', 'security', 'integration', 'business'],
    securityTests: {
      enabled: true,
      includeInjection: true,
      includeAuthBypass: true,
      includeRateLimit: false,
    },
    fixtures: {
      authTokenPlaceholder: '<your-test-token>',
      baseUrl: 'http://localhost:3000',
    },
  },
  testQuality: {
    enabled: true,
    minimumScore: 0,
    enforceOnGlob: 'tests/**/*.test.ts',
    excludeGlob: 'generated-tests/**',
    outputPath: 'reports/test-quality.json',
  },
  aiFlows: {
    enabled: true,
    outputDir: 'reports/',
    maxGapsPerExport: 50,
    minPriority: 'P3',
    includeGeneratedCode: true,
    copilotPromptMaxTokens: 800,
  },
};
