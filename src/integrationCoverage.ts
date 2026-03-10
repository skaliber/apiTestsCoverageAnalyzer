import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import fg from 'fast-glob';

// ─── Data structures ──────────────────────────────────────────────────────────

export type FlowStepType = 'api' | 'event' | 'external';

export interface FlowStep {
  /** Unique step ID, e.g. "FLOW001-step1" */
  id: string;
  /** Human-readable description of what this step does */
  description: string;
  /** The type of interaction: api call, published event, external service, etc. */
  type?: FlowStepType;
  /** HTTP method for api-type steps, e.g. "GET" */
  method?: string;
  /** URL path for api-type steps, e.g. "/users/{id}" */
  path?: string;
  /**
   * Keywords used to detect this step in a test's description or body.
   * A test trace is matched to a step when at least one keyword appears.
   */
  keywords: string[];
}

export interface IntegrationFlow {
  /** Unique flow ID, e.g. "FLOW001" */
  id: string;
  /** Short human-readable name for the flow */
  name: string;
  /** Detailed description of the end-to-end business scenario */
  description: string;
  /** The ordered list of steps that make up this flow */
  steps: FlowStep[];
}

export interface IntegrationFlowsFile {
  flows: IntegrationFlow[];
}

export interface StepCoverage {
  step: FlowStep;
  covered: boolean;
  matchedTests: string[];
}

export interface FlowCoverage {
  flow: IntegrationFlow;
  /** "complete" if all steps covered, "partial" if some steps covered, "missing" if none covered */
  status: 'complete' | 'partial' | 'missing';
  /** Test files that contain at least one matching trace for this flow */
  testFiles: string[];
  /** Coverage detail for each individual step */
  steps: StepCoverage[];
}

export interface IntegrationCoverageReport {
  total: number;
  complete: number;
  partial: number;
  missing: number;
  percentage: number;
  flows: FlowCoverage[];
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

/**
 * Parse a YAML or JSON integration flows definition file.
 * The file must contain a top-level `flows` array.
 */
export function parseIntegrationFlows(flowsPath: string): IntegrationFlow[] {
  const raw = fs.readFileSync(flowsPath, 'utf-8');
  const ext = path.extname(flowsPath).toLowerCase();

  let parsed: unknown;
  if (ext === '.json') {
    parsed = JSON.parse(raw);
  } else {
    parsed = yaml.load(raw);
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !Array.isArray((parsed as IntegrationFlowsFile).flows)
  ) {
    throw new Error(
      `Invalid integration flows file: expected a top-level "flows" array in ${flowsPath}`,
    );
  }

  return (parsed as IntegrationFlowsFile).flows.map((flow) => ({
    ...flow,
    steps: (flow.steps ?? []).map((step) => ({
      ...step,
      keywords: step.keywords ?? [],
    })),
  }));
}

// ─── Coverage detection ───────────────────────────────────────────────────────

interface TestEntry {
  description: string;
  content: string;
  filePath: string;
}

/**
 * Extract all test/it declarations from a file, together with their
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
 * Determine whether a test entry matches a given step via keywords or step-ID annotation.
 *
 * A match occurs when:
 *   1. The test description or content contains `@step <stepId>` (case-insensitive), OR
 *   2. The test description (lowercased) contains at least one of the keywords, OR
 *   3. The test is annotated with `@flow <flowId>` AND a keyword appears anywhere in the content.
 *
 * Keywords are checked against the description for general matching to avoid false positives.
 * When a @flow annotation is present, content-based keyword matching is also allowed since
 * the test explicitly declares it exercises that flow.
 */
function testMatchesStep(entry: TestEntry, step: FlowStep, flowId: string): boolean {
  const descLower = entry.description.toLowerCase();

  // Annotation-based match: @step FLOW001-step1
  const stepAnnotationPattern = new RegExp(`@step\\s+${step.id}`, 'i');
  if (stepAnnotationPattern.test(entry.description) || stepAnnotationPattern.test(entry.content)) {
    return true;
  }

  // Keyword-based match (checked against description only for precision)
  for (const kw of step.keywords) {
    if (descLower.includes(kw.toLowerCase())) {
      return true;
    }
  }

  // When a test is annotated with @flow <flowId>, also match keywords against content
  const flowAnnotationPattern = new RegExp(`@flow\\s+${flowId}`, 'i');
  if (
    flowAnnotationPattern.test(entry.description) ||
    flowAnnotationPattern.test(entry.content)
  ) {
    const contentLower = entry.content.toLowerCase();
    for (const kw of step.keywords) {
      if (contentLower.includes(kw.toLowerCase())) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Analyse test files matching the given glob pattern and determine which
 * integration flows are covered, partially covered, or missing.
 */
export async function analyzeIntegrationCoverage(
  flows: IntegrationFlow[],
  testGlob: string,
): Promise<FlowCoverage[]> {
  const testFiles = await fg(testGlob, { onlyFiles: true });

  // Pre-read all test files and extract test entries
  const allEntries: TestEntry[] = [];
  for (const filePath of testFiles) {
    const contents = fs.readFileSync(filePath, 'utf-8');
    allEntries.push(...extractTestEntries(filePath, contents));
  }

  return flows.map((flow) => {
    const matchedFiles = new Set<string>();

    // For each step, find the tests that exercise it
    const stepCoverages: StepCoverage[] = flow.steps.map((step) => {
      const matchedTests: string[] = [];

      for (const entry of allEntries) {
        // A test matches a step if:
        //   - the test is annotated with @flow <flowId> AND matches step keywords/annotation, OR
        //   - the test matches step keywords/annotation regardless of flow annotation
        if (testMatchesStep(entry, step, flow.id)) {
          matchedTests.push(entry.description);
          matchedFiles.add(entry.filePath);
        }
      }

      return {
        step,
        covered: matchedTests.length > 0,
        matchedTests,
      };
    });

    const coveredSteps = stepCoverages.filter((s) => s.covered).length;
    const totalSteps = stepCoverages.length;

    let status: FlowCoverage['status'];
    if (totalSteps === 0 || coveredSteps === 0) {
      status = 'missing';
    } else if (coveredSteps === totalSteps) {
      status = 'complete';
    } else {
      status = 'partial';
    }

    return {
      flow,
      status,
      testFiles: Array.from(matchedFiles),
      steps: stepCoverages,
    };
  });
}

// ─── Report building ──────────────────────────────────────────────────────────

/**
 * Build the coverage summary from a list of per-flow coverages.
 */
export function buildIntegrationCoverageReport(
  coverages: FlowCoverage[],
): IntegrationCoverageReport {
  const total = coverages.length;
  const complete = coverages.filter((c) => c.status === 'complete').length;
  const partial = coverages.filter((c) => c.status === 'partial').length;
  const missing = coverages.filter((c) => c.status === 'missing').length;
  const percentage = total === 0 ? 0 : Math.round((complete / total) * 10000) / 100;

  return { total, complete, partial, missing, percentage, flows: coverages };
}

// ─── Report generation ────────────────────────────────────────────────────────

/**
 * Write JSON and HTML integration-coverage reports to the given directory.
 */
export function generateIntegrationReports(
  report: IntegrationCoverageReport,
  reportsDir: string,
): void {
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  // ── JSON ─────────────────────────────────────────────────────────────────
  const jsonPath = path.join(reportsDir, 'integration-coverage.json');

  const jsonReport = {
    total: report.total,
    complete: report.complete,
    partial: report.partial,
    missing: report.missing,
    percentage: report.percentage,
    flows: report.flows.map(({ flow, status, testFiles, steps }) => ({
      id: flow.id,
      name: flow.name,
      description: flow.description,
      status,
      testFiles,
      steps: steps.map(({ step, covered, matchedTests }) => ({
        id: step.id,
        description: step.description,
        type: step.type,
        method: step.method,
        path: step.path,
        covered,
        matchedTests,
      })),
    })),
  };

  fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2), 'utf-8');

  // ── HTML ─────────────────────────────────────────────────────────────────
  const htmlPath = path.join(reportsDir, 'integration-coverage.html');

  const statusIcon = (s: FlowCoverage['status']): string => {
    if (s === 'complete') return '✅ Complete';
    if (s === 'partial') return '⚠️ Partial';
    return '❌ Missing';
  };

  const flowRows = report.flows
    .map(({ flow, status, steps }) => {
      const rowClass =
        status === 'complete' ? 'complete' : status === 'partial' ? 'partial' : 'missing';

      const stepRows = steps
        .map(({ step, covered, matchedTests }) => {
          const stepClass = covered ? 'covered' : 'uncovered';
          const stepStatus = covered ? '✅' : '❌';
          const tests = matchedTests.length > 0 ? matchedTests.join('<br>') : '—';
          const methodPath =
            step.method && step.path ? `${step.method} ${step.path}` : step.type ?? '—';
          return `      <tr class="step ${stepClass}">
        <td></td>
        <td class="step-id">${step.id}</td>
        <td>${step.description}</td>
        <td>${methodPath}</td>
        <td>${stepStatus}</td>
        <td>${tests}</td>
      </tr>`;
        })
        .join('\n');

      return `    <tr class="flow ${rowClass}">
      <td><strong>${flow.id}</strong></td>
      <td>${flow.name}</td>
      <td>${flow.description}</td>
      <td>${statusIcon(status)}</td>
      <td></td>
      <td></td>
    </tr>
${stepRows}`;
    })
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Integration Flow Coverage Report</title>
  <style>
    body { font-family: sans-serif; padding: 2rem; }
    h1 { margin-bottom: 0.5rem; }
    .summary { margin-bottom: 1.5rem; font-size: 1.1rem; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ccc; padding: 0.5rem 1rem; text-align: left; }
    th { background: #f0f0f0; }
    tr.flow.complete { background: #e6ffe6; font-weight: bold; }
    tr.flow.partial { background: #fff9e6; font-weight: bold; }
    tr.flow.missing { background: #ffe6e6; font-weight: bold; }
    tr.step { font-size: 0.9rem; }
    tr.step td { padding: 0.3rem 1rem; }
    tr.step.covered { background: #f0fff0; }
    tr.step.uncovered { background: #fff0f0; }
    td.step-id { font-style: italic; padding-left: 2rem; }
  </style>
</head>
<body>
  <h1>Integration Flow Coverage Report</h1>
  <div class="summary">
    Total flows: <strong>${report.total}</strong> &nbsp;|&nbsp;
    Complete: <strong>${report.complete}</strong> &nbsp;|&nbsp;
    Partial: <strong>${report.partial}</strong> &nbsp;|&nbsp;
    Missing: <strong>${report.missing}</strong> &nbsp;|&nbsp;
    Coverage: <strong>${report.percentage}%</strong>
  </div>
  <table>
    <thead>
      <tr>
        <th>Flow ID</th>
        <th>Name</th>
        <th>Description</th>
        <th>Status</th>
        <th>Step</th>
        <th>Matched Tests</th>
      </tr>
    </thead>
    <tbody>
${flowRows}
    </tbody>
  </table>
</body>
</html>`;

  fs.writeFileSync(htmlPath, html, 'utf-8');
}
