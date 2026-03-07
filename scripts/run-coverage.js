'use strict';

/**
 * run-coverage.js
 *
 * Runs all coverage analyses against the analyzer's own sample spec and tests,
 * then writes a combined summary to reports/coverage-summary.json.
 *
 * Usage:
 *   npm run coverage          (requires a prior build: npm run build)
 */

const {
  analyzeEndpoints,
  analyzeParameters,
  analyzeBusinessRules,
  analyzeIntegrationFlows,
  analyzeErrorHandling,
  analyzeSecurityControls,
  analyzePerfResilience,
  checkThresholds,
} = require('../dist/src/lib/index.js');
const fs = require('fs');

/** Map a CoverageResult to the concise summary shape written to the JSON file. */
function toSummaryEntry(result) {
  return {
    type: result.type,
    coveragePercent: result.coveragePercent,
    coveredItems: result.coveredItems,
    totalItems: result.totalItems,
  };
}

(async () => {
  const spec = 'sample/openapi.yaml';
  const testPattern = 'sample/tests/**/*.ts';
  const reportsDir = 'reports';

  console.log('Running coverage analysis…');

  const endpointResult = await analyzeEndpoints({ spec, tests: testPattern, reportsDir });
  console.log(`  endpoint   : ${endpointResult.coveragePercent.toFixed(1)}%`);

  const parameterResult = await analyzeParameters({
    spec: 'sample/openapi-parameters.yaml',
    tests: testPattern,
    reportsDir,
  });
  console.log(`  parameter  : ${parameterResult.coveragePercent.toFixed(1)}%`);

  const businessResult = await analyzeBusinessRules({
    rules: 'sample/business-rules.yaml',
    tests: testPattern,
    reportsDir,
  });
  console.log(`  business   : ${businessResult.coveragePercent.toFixed(1)}%`);

  const integrationResult = await analyzeIntegrationFlows({
    flows: 'sample/integration-flows.yaml',
    tests: testPattern,
    reportsDir,
  });
  console.log(`  integration: ${integrationResult.coveragePercent.toFixed(1)}%`);

  const errorResult = await analyzeErrorHandling({
    spec: 'sample/openapi-errors.yaml',
    tests: testPattern,
    reportsDir,
  });
  console.log(`  error      : ${errorResult.coveragePercent.toFixed(1)}%`);

  const securityResult = await analyzeSecurityControls({ spec, tests: testPattern, reportsDir });
  console.log(`  security   : ${securityResult.coveragePercent.toFixed(1)}%`);

  const [perfResult, resilienceResult] = await analyzePerfResilience({
    spec,
    tests: testPattern,
    reportsDir,
    loadResults: 'sample/load-results-jmeter.csv',
  });
  console.log(`  performance: ${perfResult.coveragePercent.toFixed(1)}%`);
  console.log(`  resilience : ${resilienceResult.coveragePercent.toFixed(1)}%`);

  const allResults = [
    endpointResult,
    parameterResult,
    businessResult,
    integrationResult,
    errorResult,
    securityResult,
    perfResult,
    resilienceResult,
  ];

  const combined = {
    generatedAt: new Date().toISOString(),
    summary: allResults.map(toSummaryEntry),
  };

  fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(`${reportsDir}/coverage-summary.json`, JSON.stringify(combined, null, 2));
  console.log(`\nCoverage analysis complete. Reports written to ${reportsDir}/`);

  // Honour threshold overrides supplied via environment variables, e.g.:
  //   THRESHOLD_ENDPOINT=80 npm run coverage
  const envThresholds = {};
  const thresholdEnvMap = {
    THRESHOLD_ENDPOINT: 'endpoint',
    THRESHOLD_PARAMETER: 'parameter',
    THRESHOLD_BUSINESS: 'business',
    THRESHOLD_INTEGRATION: 'integration',
    THRESHOLD_ERROR: 'error',
    THRESHOLD_SECURITY: 'security',
    THRESHOLD_PERFORMANCE: 'performance',
    THRESHOLD_RESILIENCE: 'resilience',
  };
  for (const [envKey, type] of Object.entries(thresholdEnvMap)) {
    const raw = process.env[envKey];
    if (raw !== undefined) {
      const value = parseFloat(raw);
      if (!isNaN(value)) {
        envThresholds[type] = value;
      }
    }
  }

  if (Object.keys(envThresholds).length > 0) {
    const violations = checkThresholds(allResults, envThresholds);
    if (violations.length > 0) {
      console.error('\nThreshold violations:');
      violations.forEach((v) => console.error(`  ✗ ${v}`));
      process.exit(1);
    }
  }
})().catch((err) => {
  console.error('Coverage analysis failed:', err);
  process.exit(1);
});

