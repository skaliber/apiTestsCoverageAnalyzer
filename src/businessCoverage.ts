import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import fg from 'fast-glob';

// ─── Data structures ──────────────────────────────────────────────────────────

export interface BusinessRuleScenario {
  /** Unique scenario ID, e.g. "BL001-success" */
  id: string;
  /** Human-readable description of this scenario */
  description: string;
  /** Keywords used to detect this scenario in test names/content */
  keywords?: string[];
}

export interface BusinessRule {
  /** Unique rule ID, e.g. "BL001" */
  id: string;
  /** Human-readable description of the business rule */
  description: string;
  /** API endpoints involved in this rule, e.g. ["POST /users"] */
  endpoints?: string[];
  /**
   * Keywords used to detect this rule in test names/content.
   * A test is mapped to a rule when any keyword appears in its description.
   */
  keywords: string[];
  /** Optional list of sub-scenarios (success path, failure path, etc.) */
  scenarios?: BusinessRuleScenario[];
}

export interface BusinessRulesFile {
  rules: BusinessRule[];
}

export interface ScenarioCoverage {
  scenario: BusinessRuleScenario;
  covered: boolean;
  matchedTests: string[];
}

export interface BusinessRuleCoverage {
  rule: BusinessRule;
  /** True if at least one test maps to this rule */
  covered: boolean;
  /** Test file paths that contain at least one matching test */
  testFiles: string[];
  /** Test description strings that matched the rule */
  matchedTests: string[];
  /** Coverage for each defined scenario */
  scenarios: ScenarioCoverage[];
}

export interface BusinessCoverageReport {
  total: number;
  covered: number;
  percentage: number;
  uncoveredRules: BusinessRule[];
  rules: BusinessRuleCoverage[];
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

/**
 * Parse a YAML or JSON business-rules definition file.
 * The file must contain a top-level `rules` array.
 */
export function parseBusinessRules(rulesPath: string): BusinessRule[] {
  const raw = fs.readFileSync(rulesPath, 'utf-8');
  const ext = path.extname(rulesPath).toLowerCase();

  let parsed: unknown;
  if (ext === '.json') {
    parsed = JSON.parse(raw);
  } else {
    // Default to YAML (also handles .yaml and .yml)
    parsed = yaml.load(raw);
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !Array.isArray((parsed as BusinessRulesFile).rules)
  ) {
    throw new Error(
      `Invalid business rules file: expected a top-level "rules" array in ${rulesPath}`,
    );
  }

  return (parsed as BusinessRulesFile).rules;
}

// ─── Coverage detection ───────────────────────────────────────────────────────

interface TestEntry {
  description: string;
  content: string;
  filePath: string;
}

/**
 * Extract all test / it declarations from a file, together with their
 * description string and the surrounding code up to the next declaration.
 */
function extractTestEntries(filePath: string, fileContents: string): TestEntry[] {
  const entries: TestEntry[] = [];
  const declPattern = /\b(?:test|it)\s*\(\s*(['"`])([\s\S]*?)\1/g;
  const positions: Array<{ start: number; desc: string }> = [];

  let m: RegExpExecArray | null;
  while ((m = declPattern.exec(fileContents)) !== null) {
    positions.push({ start: m.index, desc: m[2] });
  }

  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].start;
    const end = i + 1 < positions.length ? positions[i + 1].start : fileContents.length;
    entries.push({
      description: positions[i].desc,
      content: fileContents.slice(start, end),
      filePath,
    });
  }

  return entries;
}

/**
 * Determine whether a test entry matches a given set of keywords or rule ID annotation.
 *
 * A match occurs when:
 *   1. The test description contains `@rule <ruleId>` (case-insensitive), OR
 *   2. The test description (lowercased) contains at least one of the keywords.
 */
function testMatchesKeywords(
  entry: TestEntry,
  ruleId: string,
  keywords: string[],
): boolean {
  const descLower = entry.description.toLowerCase();

  // Annotation-based match: @rule BL001
  const annotationPattern = new RegExp(`@rule\\s+${ruleId}`, 'i');
  if (annotationPattern.test(entry.description) || annotationPattern.test(entry.content)) {
    return true;
  }

  // Keyword-based match (checked against description only for precision)
  for (const kw of keywords) {
    if (descLower.includes(kw.toLowerCase())) {
      return true;
    }
  }

  return false;
}

/**
 * Analyse test files matching the given glob pattern and determine which
 * business rules are covered.
 */
export async function analyzeBusinessCoverage(
  rules: BusinessRule[],
  testGlob: string,
): Promise<BusinessRuleCoverage[]> {
  const testFiles = await fg(testGlob, { onlyFiles: true });

  // Pre-read all test files and extract test entries
  const allEntries: TestEntry[] = [];
  for (const filePath of testFiles) {
    const contents = fs.readFileSync(filePath, 'utf-8');
    allEntries.push(...extractTestEntries(filePath, contents));
  }

  return rules.map((rule) => {
    const matchedTests: string[] = [];
    const matchedFiles = new Set<string>();

    for (const entry of allEntries) {
      if (testMatchesKeywords(entry, rule.id, rule.keywords)) {
        matchedTests.push(entry.description);
        matchedFiles.add(entry.filePath);
      }
    }

    const covered = matchedTests.length > 0;

    // Scenario-level coverage
    const scenarios: ScenarioCoverage[] = (rule.scenarios ?? []).map((scenario) => {
      const scenarioMatches: string[] = [];
      const scenarioKeywords = [
        scenario.id,
        ...(scenario.keywords ?? []),
      ];

      for (const entry of allEntries) {
        // A test matches a scenario if it already matched the rule AND
        // matches the scenario keywords/ID
        if (
          testMatchesKeywords(entry, rule.id, rule.keywords) &&
          testMatchesKeywords(entry, scenario.id, scenarioKeywords)
        ) {
          scenarioMatches.push(entry.description);
        }
      }

      return {
        scenario,
        covered: scenarioMatches.length > 0,
        matchedTests: scenarioMatches,
      };
    });

    return {
      rule,
      covered,
      testFiles: Array.from(matchedFiles),
      matchedTests,
      scenarios,
    };
  });
}

// ─── Report building ──────────────────────────────────────────────────────────

/**
 * Build the coverage summary from a list of per-rule coverages.
 */
export function buildBusinessCoverageReport(
  coverages: BusinessRuleCoverage[],
): BusinessCoverageReport {
  const total = coverages.length;
  const coveredCount = coverages.filter((c) => c.covered).length;
  const percentage = total === 0 ? 0 : Math.round((coveredCount / total) * 10000) / 100;
  const uncoveredRules = coverages.filter((c) => !c.covered).map((c) => c.rule);

  return { total, covered: coveredCount, percentage, uncoveredRules, rules: coverages };
}

// ─── Report generation ────────────────────────────────────────────────────────

/**
 * Write JSON and HTML business-coverage reports to the given directory.
 */
export function generateBusinessReports(
  report: BusinessCoverageReport,
  reportsDir: string,
): void {
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  // ── JSON ─────────────────────────────────────────────────────────────────
  const jsonPath = path.join(reportsDir, 'business-coverage.json');

  const jsonReport = {
    total: report.total,
    covered: report.covered,
    percentage: report.percentage,
    uncoveredRules: report.uncoveredRules.map(({ id, description }) => ({ id, description })),
    rules: report.rules.map(({ rule, covered, testFiles, matchedTests, scenarios }) => ({
      id: rule.id,
      description: rule.description,
      endpoints: rule.endpoints ?? [],
      covered,
      testFiles,
      matchedTests,
      scenarios: scenarios.map(({ scenario, covered: sCovered, matchedTests: sTests }) => ({
        id: scenario.id,
        description: scenario.description,
        covered: sCovered,
        matchedTests: sTests,
      })),
    })),
  };

  fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2), 'utf-8');

  // ── HTML ─────────────────────────────────────────────────────────────────
  const htmlPath = path.join(reportsDir, 'business-coverage.html');

  const rows = report.rules
    .map(({ rule, covered, matchedTests, scenarios }) => {
      const rowClass = covered ? 'covered' : 'uncovered';
      const status = covered ? '✅ Covered' : '❌ Not covered';
      const tests = matchedTests.length > 0 ? matchedTests.join('<br>') : '—';
      const endpoints = (rule.endpoints ?? []).join(', ') || '—';

      const scenarioRows =
        scenarios.length > 0
          ? scenarios
              .map(({ scenario, covered: sc, matchedTests: st }) => {
                const scStatus = sc ? '✅' : '❌';
                const scTests = st.length > 0 ? st.join('<br>') : '—';
                return `      <tr class="scenario ${sc ? 'covered' : 'uncovered'}">
        <td></td>
        <td class="scenario-id">${scenario.id}</td>
        <td>${scenario.description}</td>
        <td>${scStatus}</td>
        <td>${scTests}</td>
      </tr>`;
              })
              .join('\n')
          : '';

      return `    <tr class="${rowClass}">
      <td><strong>${rule.id}</strong></td>
      <td>${rule.description}</td>
      <td>${endpoints}</td>
      <td>${status}</td>
      <td>${tests}</td>
    </tr>
${scenarioRows}`;
    })
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Business Logic Coverage Report</title>
  <style>
    body { font-family: sans-serif; padding: 2rem; }
    h1 { margin-bottom: 0.5rem; }
    .summary { margin-bottom: 1.5rem; font-size: 1.1rem; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ccc; padding: 0.5rem 1rem; text-align: left; }
    th { background: #f0f0f0; }
    tr.covered { background: #e6ffe6; }
    tr.uncovered { background: #ffe6e6; }
    tr.scenario { font-size: 0.9rem; }
    tr.scenario td { padding: 0.3rem 1rem; }
    td.scenario-id { font-style: italic; padding-left: 2rem; }
  </style>
</head>
<body>
  <h1>Business Logic Coverage Report</h1>
  <div class="summary">
    Covered: <strong>${report.covered}/${report.total}</strong> business rules
    (<strong>${report.percentage}%</strong>)
  </div>
  <table>
    <thead>
      <tr>
        <th>Rule ID</th>
        <th>Description</th>
        <th>Endpoints</th>
        <th>Status</th>
        <th>Matched Tests</th>
      </tr>
    </thead>
    <tbody>
${rows}
    </tbody>
  </table>
</body>
</html>`;

  fs.writeFileSync(htmlPath, html, 'utf-8');
}
