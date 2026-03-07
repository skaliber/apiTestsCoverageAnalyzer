import * as core from '@actions/core';
import * as path from 'path';
import * as fs from 'fs';
import {
  analyzeEndpoints,
  analyzeParameters,
  analyzeBusinessRules,
  analyzeIntegrationFlows,
  analyzeErrorHandling,
  analyzeSecurityControls,
  runSecurityAnalysis,
  runAnalysisAndEnforceQualityGate,
  checkThresholds,
  CoverageResult,
} from '../../src/lib/index';
import { resolveConfig, mergeConfig } from '../../src/config';

async function run(): Promise<void> {
  try {
    const spec = core.getInput('spec') || 'sample/openapi.yaml';
    const tests = core.getInput('tests') || 'tests/**/*.ts';
    const format = core.getInput('format') || 'json,html';
    const coverageTypesRaw = core.getInput('coverage-types') || 'endpoint';
    const language = core.getInput('language') || 'auto';
    const reportsDirInput = core.getInput('reports-dir') || 'reports';
    const configInput = core.getInput('config') || '';
    const publishPages = core.getInput('publish-pages') === 'true';
    const siteDirInput = core.getInput('site-dir') || 'site';
    const pagesBasePath = core.getInput('pages-base-path') || '/';
    const qualityGateEnabled = core.getInput('quality-gate') !== 'false';
    const qualityGateMode = core.getInput('quality-gate-mode') || 'strict';
    const writeGitHubSummary = core.getInput('write-step-summary') !== 'false';

    // Load config file if specified, merging with CLI inputs
    const fileConfig = configInput
      ? resolveConfig(configInput)
      : resolveConfig();

    const globalThreshold = parseFloat(core.getInput('threshold-global') || '0');
    const cliThresholds: Record<string, number> = {};
    if (globalThreshold > 0) cliThresholds['global'] = globalThreshold;

    const perCategoryThresholds: Record<string, number> = {
      endpoint: parseFloat(core.getInput('threshold-endpoint') || '0'),
      parameter: parseFloat(core.getInput('threshold-parameter') || '0'),
      business: parseFloat(core.getInput('threshold-business') || '0'),
      integration: parseFloat(core.getInput('threshold-integration') || '0'),
      error: parseFloat(core.getInput('threshold-error') || '0'),
      security: parseFloat(core.getInput('threshold-security') || '0'),
    };
    // Only include non-zero per-category thresholds
    for (const [key, value] of Object.entries(perCategoryThresholds)) {
      if (value > 0) cliThresholds[key] = value;
    }

    const mergedConfig = mergeConfig(fileConfig, {
      thresholds: Object.keys(cliThresholds).length > 0 ? cliThresholds : fileConfig.thresholds,
    });

    const workspace = process.env['GITHUB_WORKSPACE'] ?? process.cwd();
    const reportsDir = path.isAbsolute(reportsDirInput)
      ? reportsDirInput
      : path.join(workspace, reportsDirInput);
    const siteDir = path.isAbsolute(siteDirInput)
      ? siteDirInput
      : path.join(workspace, siteDirInput);

    const coverageTypes = coverageTypesRaw
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    core.info(`Running coverage types: ${coverageTypes.join(', ')}`);
    core.info(`Reports will be written to: ${reportsDir}`);

    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const allResults: CoverageResult[] = [];

    for (const coverageType of coverageTypes) {
      switch (coverageType) {
        case 'endpoint': {
          core.info('Running endpoint coverage analysis...');
          const result = await analyzeEndpoints({
            spec,
            tests,
            format,
            language,
            reportsDir,
          });
          allResults.push(result);
          core.setOutput('endpoint-coverage', String(result.coveragePercent));
          core.info(`Endpoint coverage: ${result.coveredItems}/${result.totalItems} (${result.coveragePercent}%)`);
          break;
        }

        case 'parameter': {
          core.info('Running parameter coverage analysis...');
          const result = await analyzeParameters({
            spec,
            tests,
            format,
            reportsDir,
          });
          allResults.push(result);
          core.setOutput('parameter-coverage', String(result.coveragePercent));
          core.info(`Parameter coverage: ${result.coveredItems}/${result.totalItems} (${result.coveragePercent}%)`);
          break;
        }

        case 'business': {
          const rules = core.getInput('rules');
          if (!rules) {
            core.warning('Skipping business coverage: "rules" input is required');
            break;
          }
          core.info('Running business rule coverage analysis...');
          const result = await analyzeBusinessRules({
            rules,
            tests,
            format,
            reportsDir,
          });
          allResults.push(result);
          core.setOutput('business-coverage', String(result.coveragePercent));
          core.info(`Business coverage: ${result.coveredItems}/${result.totalItems} (${result.coveragePercent}%)`);
          break;
        }

        case 'integration': {
          const flows = core.getInput('flows');
          if (!flows) {
            core.warning('Skipping integration coverage: "flows" input is required');
            break;
          }
          core.info('Running integration flow coverage analysis...');
          const result = await analyzeIntegrationFlows({
            flows,
            tests,
            format,
            reportsDir,
          });
          allResults.push(result);
          core.setOutput('integration-coverage', String(result.coveragePercent));
          core.info(`Integration coverage: ${result.coveredItems}/${result.totalItems} (${result.coveragePercent}%)`);
          break;
        }

        case 'error': {
          core.info('Running error handling coverage analysis...');
          const result = await analyzeErrorHandling({
            spec,
            tests,
            format,
            reportsDir,
          });
          allResults.push(result);
          core.setOutput('error-coverage', String(result.coveragePercent));
          core.info(`Error coverage: ${result.coveredItems}/${result.totalItems} (${result.coveragePercent}%)`);
          break;
        }

        case 'security': {
          core.info('Running security coverage analysis...');
          const result = await analyzeSecurityControls({
            spec,
            tests,
            format,
            reportsDir,
          });
          allResults.push(result);
          core.setOutput('security-coverage', String(result.coveragePercent));
          core.info(`Security coverage: ${result.coveredItems}/${result.totalItems} (${result.coveragePercent}%)`);
          break;
        }

        case 'security-scan': {
          core.info('Running integrated security scan (Semgrep / Trivy / ZAP)...');

          const semgrepReport = core.getInput('semgrep-report') || undefined;
          const trivyReport = core.getInput('trivy-report') || undefined;
          const zapReport = core.getInput('zap-report') || undefined;
          const failOnCritical = core.getInput('fail-on-critical') === 'true';
          const failOnHigh = core.getInput('fail-on-high') === 'true';
          const maxSecretsRaw = core.getInput('max-secrets');
          const maxMediumRaw = core.getInput('max-medium');
          const maxMisconfigHighRaw = core.getInput('max-misconfig-high');
          const maxCriticalVulnsRaw = core.getInput('max-critical-vulns');
          const maxHighVulnsRaw = core.getInput('max-high-vulns');

          const gateConfig: Record<string, unknown> = {};
          if (failOnCritical) gateConfig['failOnCritical'] = true;
          if (failOnHigh) gateConfig['failOnHigh'] = true;
          if (maxSecretsRaw !== '') gateConfig['maxSecrets'] = parseInt(maxSecretsRaw, 10);
          if (maxMediumRaw !== '') gateConfig['maxMedium'] = parseInt(maxMediumRaw, 10);
          if (maxMisconfigHighRaw !== '') gateConfig['maxMisconfigHigh'] = parseInt(maxMisconfigHighRaw, 10);
          if (maxCriticalVulnsRaw !== '') gateConfig['maxCriticalVulns'] = parseInt(maxCriticalVulnsRaw, 10);
          if (maxHighVulnsRaw !== '') gateConfig['maxHighVulns'] = parseInt(maxHighVulnsRaw, 10);

          const scanners: Record<string, unknown> = {};
          if (semgrepReport) {
            scanners['semgrep'] = { enabled: true, mode: 'import', reportPath: semgrepReport };
          }
          if (trivyReport) {
            scanners['trivy'] = { enabled: true, mode: 'import', reportPath: trivyReport };
          }
          if (zapReport) {
            scanners['zap'] = { enabled: true, mode: 'import', reportPath: zapReport };
          }

          const summary = await runSecurityAnalysis({
            config: {
              enabled: true,
              workspace,
              scanners: scanners as Parameters<typeof runSecurityAnalysis>[0]['config']['scanners'],
              gate: Object.keys(gateConfig).length > 0
                ? gateConfig as Parameters<typeof runSecurityAnalysis>[0]['config']['gate']
                : undefined,
            },
            reportsDir,
          });

          core.setOutput('security-scan-findings', String(summary.totalFindings));
          core.setOutput('security-gate-passed', String(summary.gateResult?.passed ?? true));

          core.info(`Security scan complete: ${summary.totalFindings} findings`);
          core.info(`  CRITICAL: ${summary.bySeverity.CRITICAL}`);
          core.info(`  HIGH: ${summary.bySeverity.HIGH}`);
          core.info(`  MEDIUM: ${summary.bySeverity.MEDIUM}`);
          core.info(`  LOW: ${summary.bySeverity.LOW}`);

          if (summary.gateResult && !summary.gateResult.passed) {
            const msg = summary.gateResult.reasons.join('\n');
            core.setFailed(`Security gate failed:\n${msg}`);
            return; // exit early – gate already failed the action
          }
          break;
        }

        default:
          core.warning(`Unknown coverage type: ${coverageType}`);
      }
    }

    core.setOutput('reports-dir', reportsDir);

    // Build the effective config for quality gate + publishing
    const effectiveConfig = {
      ...mergedConfig,
      publishing: {
        enabled: publishPages,
        outputDir: siteDir,
        buildId: 'run-number',
        githubPages: {
          enabled: publishPages,
          basePath: pagesBasePath,
        },
        ...(mergedConfig.publishing ?? {}),
      },
      qualityGate: {
        enabled: qualityGateEnabled,
        failBuildOnThresholdMiss: qualityGateEnabled,
        mode: (qualityGateMode === 'warn' ? 'warn' : 'strict') as 'strict' | 'warn',
        ...(mergedConfig.qualityGate ?? {}),
      },
    };

    const repoOwner = process.env['GITHUB_REPOSITORY_OWNER'] ?? '';
    const repoName = process.env['GITHUB_REPOSITORY']?.split('/')[1] ?? '';
    const pagesUrl = publishPages && repoOwner && repoName
      ? `https://${repoOwner}.github.io/${repoName}${pagesBasePath}`
      : undefined;

    // Run quality gate + publishing (always generates reports, even on failure)
    const { reports, qualityGate, exitCode } = await runAnalysisAndEnforceQualityGate({
      results: allResults,
      config: effectiveConfig,
      branch: process.env['GITHUB_REF_NAME'],
      reportsDir,
      writeGitHubSummary,
      pagesUrl,
    });

    if (reports) {
      core.setOutput('site-dir', reports.siteDir);
      core.info(`Static site written to: ${reports.siteDir}`);
    }

    core.setOutput('quality-gate-passed', String(qualityGate.passed));

    if (exitCode !== 0) {
      const failureMessages = qualityGate.failures.map(
        (f) => `${f.category}: expected ≥ ${f.expected}%, actual ${f.actual}%, gap ${f.gap}%`,
      );
      core.setFailed(`Coverage thresholds not met:\n${failureMessages.join('\n')}`);
    } else {
      core.info('All coverage thresholds passed.');
    }

    core.info(`Reports written to: ${reportsDir}`);
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed(String(error));
    }
  }
}

void run();
