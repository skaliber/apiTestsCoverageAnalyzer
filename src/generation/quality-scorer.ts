/**
 * Feature 28 — QualityScorer
 * Scores existing test files on 5 dimensions (0–100 total).
 *
 * Dimensions (20 pts each):
 *   1. Assertion Depth
 *   2. Negative Path Coverage
 *   3. Auth Coverage
 *   4. Boundary Coverage
 *   5. Test Independence
 */

import * as fs from 'fs';
import * as path from 'path';
import FastGlob from 'fast-glob';
import type {
  FileQualityScore,
  QualityDimensions,
  TestQualityReport,
  QualityScorerOptions,
  HighRiskLowQualityGap,
} from './types';

// ─── Assertion depth scoring ──────────────────────────────────────────────────

function scoreAssertionDepth(content: string): number {
  // +20 — specific field value assertions
  if (/expect\([^)]+\)\.(toBe|toEqual|toStrictEqual|toContain|toHaveProperty)\(/.test(content)) {
    // Check if it's a specific value (not just existence)
    if (/\.toBe\([^)]{3,}\)/.test(content) || /\.toEqual\([^)]{3,}\)/.test(content)) {
      return 20;
    }
    // toHaveProperty with a value
    if (/\.toHaveProperty\('[^']+',/.test(content)) {
      return 20;
    }
    return 15;
  }

  // +10 — only status code assertions
  if (/expect\(response\.status\)\.toBe\(/.test(content) && !/expect\(response\.body\)/.test(content)) {
    return 10;
  }

  // +5 — weak assertions
  if (/\.toBeTruthy\(\)|\.toBeDefined\(\)/.test(content)) {
    return 5;
  }

  // +15 — property existence checks
  if (/\.toHaveProperty\(/.test(content)) {
    return 15;
  }

  // +10 — has some assertions
  if (/expect\(/.test(content)) {
    return 10;
  }

  return 0;
}

// ─── Negative path coverage ───────────────────────────────────────────────────

function scoreNegativePathCoverage(content: string): number {
  const has4xx = /toBe\(4\d{2}\)|toBe\(401\)|toBe\(403\)|toBe\(404\)|toBe\(422\)|toBe\(400\)/.test(content);
  const has5xx = /toBe\(5\d{2}\)|toBe\(500\)/.test(content);
  const hasErrorPath = /error|invalid|fail|missing|unauthorized|forbidden|not.found/i.test(content);

  if (has4xx && (has5xx || hasErrorPath)) return 20;
  if (has4xx) return 15;
  if (hasErrorPath) return 10;
  return 0;
}

// ─── Auth coverage ────────────────────────────────────────────────────────────

function scoreAuthCoverage(content: string): number {
  const hasAuthTest = /401|403|Authorization|auth.*token|token.*auth/i.test(content);
  const hasBothPaths = /401/.test(content) && /200|201/.test(content);
  const hasOptionalAuth = /optional.*auth|without.*auth|with.*auth/i.test(content);

  if (hasBothPaths && hasOptionalAuth) return 20;
  if (hasBothPaths) return 15;
  if (hasAuthTest) return 10;
  return 0;
}

// ─── Boundary coverage ────────────────────────────────────────────────────────

function scoreBoundaryCoverage(content: string): number {
  const hasBoundaryMax = /max|maximum|overflow|too.long|too.large/i.test(content);
  const hasBoundaryMin = /min|minimum|empty|too.short|too.small/i.test(content);
  const hasNullTest = /null|undefined|missing.*required/i.test(content);

  if (hasBoundaryMax && hasBoundaryMin && hasNullTest) return 20;
  if ((hasBoundaryMax || hasBoundaryMin) && hasNullTest) return 15;
  if (hasBoundaryMax || hasBoundaryMin) return 10;
  if (hasNullTest) return 8;
  return 0;
}

// ─── Test independence ────────────────────────────────────────────────────────

function scoreTestIndependence(content: string): number {
  // Deduct points for ordered dependencies
  const hasAfterEach = /afterEach|afterAll/.test(content);
  const hasBeforeEach = /beforeEach/.test(content);
  const hasSharedMutableState = /let\s+\w+\s*;/.test(content) && !/beforeAll/.test(content);

  // Has cleanup
  if (hasAfterEach) return 20;

  // Uses beforeEach for isolation (good pattern for unit tests)
  if (hasBeforeEach && !hasSharedMutableState) return 18;

  // Shared mutable state without cleanup (risky for parallelism)
  if (hasSharedMutableState) return 10;

  // Simple independent tests
  return 15;
}

// ─── Issue detection ──────────────────────────────────────────────────────────

function detectIssues(content: string, dimensions: QualityDimensions): string[] {
  const issues: string[] = [];

  if (dimensions.assertionDepth < 10) {
    issues.push('No meaningful assertions found — tests may pass even if the endpoint is broken');
  } else if (dimensions.assertionDepth < 15) {
    issues.push('Only status code assertions, no body validation');
  }

  if (dimensions.negativePathCoverage < 10) {
    issues.push('No error path coverage — 4xx/5xx scenarios not tested');
  }

  if (dimensions.authCoverage < 10 && /Authorization|auth.*token/i.test(content)) {
    issues.push('Auth coverage incomplete: only happy path tested, no 401 scenario');
  } else if (dimensions.authCoverage < 15) {
    issues.push('Auth coverage incomplete: optional-auth path not tested');
  }

  if (dimensions.boundaryCoverage < 8) {
    issues.push('No boundary tests found (min/max/null/empty values not tested)');
  }

  if (dimensions.testIndependence < 15) {
    issues.push('Tests may have ordering dependencies — shared mutable state without cleanup');
  }

  return issues;
}

function detectStrengths(content: string, dimensions: QualityDimensions): string[] {
  const strengths: string[] = [];

  if (dimensions.assertionDepth >= 18) {
    strengths.push('Good assertion depth on response body fields');
  }
  if (dimensions.negativePathCoverage >= 18) {
    strengths.push('All error scenarios covered');
  }
  if (dimensions.authCoverage >= 18) {
    strengths.push('Both authenticated and unauthenticated paths tested');
  }
  if (dimensions.boundaryCoverage >= 18) {
    strengths.push('Comprehensive boundary testing');
  }
  if (dimensions.testIndependence >= 18) {
    strengths.push('Tests are well-isolated and independent');
  }

  return strengths;
}

// ─── File scorer ──────────────────────────────────────────────────────────────

export function scoreFile(filePath: string): FileQualityScore {
  const content = fs.readFileSync(filePath, 'utf8');

  const dimensions: QualityDimensions = {
    assertionDepth: scoreAssertionDepth(content),
    negativePathCoverage: scoreNegativePathCoverage(content),
    authCoverage: scoreAuthCoverage(content),
    boundaryCoverage: scoreBoundaryCoverage(content),
    testIndependence: scoreTestIndependence(content),
  };

  const score = Object.values(dimensions).reduce((sum, v) => sum + v, 0);

  return {
    file: filePath,
    score,
    dimensions,
    issues: detectIssues(content, dimensions),
    strengths: detectStrengths(content, dimensions),
  };
}

// ─── Report builder ───────────────────────────────────────────────────────────

export async function scoreTests(opts: QualityScorerOptions): Promise<TestQualityReport> {
  const testsGlob = opts.testsGlob ?? 'tests/**/*.test.ts';
  const reportsDir = opts.reportsDir ?? 'reports';

  const files = await FastGlob(testsGlob, { cwd: process.cwd(), absolute: true });

  const byFile: FileQualityScore[] = [];

  for (const file of files) {
    try {
      byFile.push(scoreFile(file));
    } catch {
      // Skip unreadable files
    }
  }

  const overallScore =
    byFile.length > 0
      ? Math.round(byFile.reduce((sum, f) => sum + f.score, 0) / byFile.length)
      : 0;

  const sorted = [...byFile].sort((a, b) => a.score - b.score);
  const lowestQualityFiles = sorted.slice(0, 3).map(f => path.relative(process.cwd(), f.file));

  // Build high-risk + low-quality gaps (stub — would cross-reference with gap data)
  const highestRiskLowQualityGaps: HighRiskLowQualityGap[] = sorted
    .filter(f => f.score < 60)
    .slice(0, 5)
    .map(f => ({
      endpoint: path.relative(process.cwd(), f.file),
      qualityScore: f.score,
      riskScore: 70,
      primaryIssue: f.issues[0] ?? 'Low quality score',
    }));

  const report: TestQualityReport = {
    overallScore,
    byFile: byFile.map(f => ({ ...f, file: path.relative(process.cwd(), f.file) })),
    lowestQualityFiles,
    highestRiskLowQualityGaps,
  };

  // Write output
  fs.mkdirSync(reportsDir, { recursive: true });
  const outputPath = path.join(reportsDir, 'test-quality.json');
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');

  // Also update coverage-summary.json if present
  const summaryPath = path.join(reportsDir, 'coverage-summary.json');
  if (fs.existsSync(summaryPath)) {
    try {
      const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8')) as Record<string, unknown>;
      summary['testQuality'] = report;
      fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
    } catch {
      // Non-fatal
    }
  }

  if (opts.failBelow && opts.failBelow > 0) {
    const failing = byFile.filter(f => f.score < opts.failBelow!);
    if (failing.length > 0) {
      throw new Error(
        `Quality gate failed: ${failing.length} test file(s) scored below ${opts.failBelow}.\n` +
          failing.map(f => `  ${path.relative(process.cwd(), f.file)}: ${f.score}/100`).join('\n'),
      );
    }
  }

  return report;
}
