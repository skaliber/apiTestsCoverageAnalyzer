/**
 * MCP integration – prompt builders.
 *
 * Each builder produces a deterministic, structured prompt for a specific
 * analysis category.  All prompts include analysis scope, metrics, gate
 * status, and a request for structured output.
 */

import type { McpPromptRequest } from '../types';
import type { CoverageResult } from '../../reporting';
import type { SecurityScanSummary } from '../../security/types';

// ─── Coverage summary prompt ──────────────────────────────────────────────────

export interface CoverageSummaryPromptInput {
  results: CoverageResult[];
  thresholds?: Record<string, number | undefined>;
  projectName?: string;
  branch?: string;
  commitSha?: string;
  gatePassed?: boolean;
  failedCategories?: string[];
}

export function buildCoverageSummaryPrompt(input: CoverageSummaryPromptInput): McpPromptRequest {
  const lines: string[] = [
    'Analyze the following API test coverage results.',
    '',
    '## Context',
  ];
  if (input.projectName) lines.push(`Project: ${input.projectName}`);
  if (input.branch) lines.push(`Branch: ${input.branch}`);
  if (input.commitSha) lines.push(`Commit: ${input.commitSha}`);
  lines.push('');

  lines.push('## Coverage Metrics');
  for (const r of input.results) {
    const threshold = input.thresholds?.[r.type];
    const status = threshold !== undefined
      ? r.coveragePercent >= threshold ? 'PASS' : 'FAIL'
      : 'no gate';
    lines.push(
      `- ${r.type}: ${r.coveragePercent.toFixed(2)}% ` +
      `(${r.coveredItems}/${r.totalItems} covered) [${status}]` +
      (threshold !== undefined ? ` threshold=${threshold}%` : ''),
    );
  }
  lines.push('');

  if ((input.failedCategories?.length ?? 0) > 0) {
    lines.push(`## Failed Gates`);
    lines.push(input.failedCategories!.join(', '));
    lines.push('');
  }

  lines.push('## Required Output');
  lines.push('Provide a JSON response with the following fields:');
  lines.push('- summary (string): one-paragraph executive summary');
  lines.push('- keyFindings (string[]): bullet-point key findings');
  lines.push('- topRisks (string[]): top risk items ordered by severity');
  lines.push('- recommendedActions (string[]): concrete recommended actions');
  lines.push('- missingCoverageAreas (string[]): specific coverage gaps');
  lines.push('- confidence ("low"|"medium"|"high")');

  return {
    category: 'coverage',
    prompt: lines.join('\n'),
    context: {
      projectName: input.projectName,
      branch: input.branch,
      commitSha: input.commitSha,
      results: input.results.map((r) => ({
        type: r.type,
        coveragePercent: r.coveragePercent,
        coveredItems: r.coveredItems,
        totalItems: r.totalItems,
        threshold: input.thresholds?.[r.type],
      })),
      gatePassed: input.gatePassed,
      failedCategories: input.failedCategories ?? [],
    },
  };
}

// ─── Security scan interpretation prompt ──────────────────────────────────────

export interface SecurityScanPromptInput {
  scanSummary: SecurityScanSummary;
  projectName?: string;
  branch?: string;
  commitSha?: string;
}

export function buildSecurityScanPrompt(input: SecurityScanPromptInput): McpPromptRequest {
  const s = input.scanSummary;
  const lines: string[] = [
    'Analyze the following security scan results for an API project.',
    '',
    '## Context',
  ];
  if (input.projectName) lines.push(`Project: ${input.projectName}`);
  if (input.branch) lines.push(`Branch: ${input.branch}`);
  if (input.commitSha) lines.push(`Commit: ${input.commitSha}`);
  lines.push('');

  lines.push('## Security Findings');
  lines.push(`Total findings: ${s.totalFindings}`);
  lines.push(`Critical: ${s.bySeverity.CRITICAL}`);
  lines.push(`High: ${s.bySeverity.HIGH}`);
  lines.push(`Medium: ${s.bySeverity.MEDIUM}`);
  lines.push(`Low: ${s.bySeverity.LOW}`);
  lines.push(`Scanners run: ${s.scannersRun.join(', ')}`);
  lines.push(`Gate passed: ${s.gateResult?.passed ?? 'not evaluated'}`);
  lines.push('');

  const blocking = s.findings
    .filter((f) => f.severity === 'HIGH' || f.severity === 'CRITICAL')
    .slice(0, 10);

  if (blocking.length > 0) {
    lines.push('## High / Critical Findings');
    for (const f of blocking) {
      lines.push(`- [${f.severity}] ${f.title} — ${f.category}`);
    }
    lines.push('');
  }

  lines.push('## Required Output');
  lines.push('Provide a JSON response with:');
  lines.push('- summary (string): executive summary of security posture');
  lines.push('- keyFindings (string[]): key security findings');
  lines.push('- topRisks (string[]): top risks by severity');
  lines.push('- recommendedActions (string[]): remediation steps');
  lines.push('- likelyRootCauses (string[]): probable root causes');
  lines.push('- confidence ("low"|"medium"|"high")');

  return {
    category: 'security',
    prompt: lines.join('\n'),
    context: {
      projectName: input.projectName,
      branch: input.branch,
      commitSha: input.commitSha,
      totalFindings: s.totalFindings,
      bySeverity: s.bySeverity,
      byCategory: s.byCategory,
      scannersRun: s.scannersRun,
      gatePassed: s.gateResult?.passed,
    },
  };
}

// ─── Performance analysis prompt ──────────────────────────────────────────────

export interface PerformancePromptInput {
  coveragePercent: number;
  totalScenarios: number;
  coveredScenarios: number;
  uncoveredScenarios?: string[];
  projectName?: string;
  branch?: string;
}

export function buildPerformancePrompt(input: PerformancePromptInput): McpPromptRequest {
  const lines: string[] = [
    'Analyze the following performance and resilience test coverage.',
    '',
    '## Metrics',
    `Coverage: ${input.coveragePercent.toFixed(2)}%`,
    `Scenarios: ${input.coveredScenarios}/${input.totalScenarios} covered`,
  ];

  if ((input.uncoveredScenarios?.length ?? 0) > 0) {
    lines.push('');
    lines.push('## Uncovered Scenarios');
    for (const s of input.uncoveredScenarios!.slice(0, 10)) {
      lines.push(`- ${s}`);
    }
  }

  lines.push('');
  lines.push('## Required Output');
  lines.push('Provide a JSON response with: summary, keyFindings, topRisks, recommendedActions, confidence');

  return {
    category: 'performance',
    prompt: lines.join('\n'),
    context: {
      projectName: input.projectName,
      branch: input.branch,
      coveragePercent: input.coveragePercent,
      totalScenarios: input.totalScenarios,
      coveredScenarios: input.coveredScenarios,
      uncoveredScenarios: input.uncoveredScenarios ?? [],
    },
  };
}

// ─── Compatibility analysis prompt ────────────────────────────────────────────

export interface CompatibilityPromptInput {
  compatibilityPercent: number;
  breakingChanges: number;
  totalEndpoints: number;
  projectName?: string;
  branch?: string;
}

export function buildCompatibilityPrompt(input: CompatibilityPromptInput): McpPromptRequest {
  const lines: string[] = [
    'Analyze the following API compatibility and contract coverage results.',
    '',
    '## Metrics',
    `Compatibility: ${input.compatibilityPercent.toFixed(2)}%`,
    `Breaking changes: ${input.breakingChanges}`,
    `Endpoints analyzed: ${input.totalEndpoints}`,
    '',
    '## Required Output',
    'Provide a JSON response with: summary, keyFindings, topRisks, recommendedActions, confidence',
  ];

  return {
    category: 'compatibility',
    prompt: lines.join('\n'),
    context: {
      projectName: input.projectName,
      branch: input.branch,
      compatibilityPercent: input.compatibilityPercent,
      breakingChanges: input.breakingChanges,
      totalEndpoints: input.totalEndpoints,
    },
  };
}

// ─── PR / Build summary prompt ────────────────────────────────────────────────

export interface CiSummaryPromptInput {
  overallPassed: boolean;
  coverageResults: CoverageResult[];
  failedGates: string[];
  projectName?: string;
  branch?: string;
  commitSha?: string;
  buildId?: string;
}

export function buildCiSummaryPrompt(input: CiSummaryPromptInput): McpPromptRequest {
  const lines: string[] = [
    'Summarize the following CI API coverage analysis for a PR/build comment.',
    '',
    '## Build Context',
  ];
  if (input.projectName) lines.push(`Project: ${input.projectName}`);
  if (input.branch) lines.push(`Branch: ${input.branch}`);
  if (input.commitSha) lines.push(`Commit: ${input.commitSha}`);
  if (input.buildId) lines.push(`Build ID: ${input.buildId}`);
  lines.push(`Overall gate: ${input.overallPassed ? 'PASSED' : 'FAILED'}`);
  lines.push('');

  if (input.failedGates.length > 0) {
    lines.push('## Failed Gates');
    lines.push(input.failedGates.join(', '));
    lines.push('');
  }

  lines.push('## Coverage Summary');
  for (const r of input.coverageResults) {
    lines.push(`- ${r.type}: ${r.coveragePercent.toFixed(2)}%`);
  }

  lines.push('');
  lines.push('## Required Output');
  lines.push('Provide a concise JSON summary suitable for a PR comment:');
  lines.push('summary, keyFindings, topRisks, recommendedActions, confidence');

  return {
    category: 'ci-summary',
    prompt: lines.join('\n'),
    context: {
      overallPassed: input.overallPassed,
      projectName: input.projectName,
      branch: input.branch,
      commitSha: input.commitSha,
      buildId: input.buildId,
      failedGates: input.failedGates,
      coverageResults: input.coverageResults.map((r) => ({
        type: r.type,
        coveragePercent: r.coveragePercent,
      })),
    },
  };
}
