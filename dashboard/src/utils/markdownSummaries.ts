import type { CoverageReport, DetailSection, DetailItem, FlowStepDetail } from '../types';

interface FlowItem extends DetailItem {
  steps?: number;
  coveredSteps?: number;
  flowName?: string;
  rawSteps?: FlowStepDetail[];
}

function coveragePercent(section: DetailSection | undefined): number {
  if (!section || section.items.length === 0) return 0;
  const covered = section.items.filter((i) => i.covered).length;
  return Math.round((covered / section.items.length) * 100);
}

function uncoveredItems(section: DetailSection | undefined): DetailItem[] {
  if (!section) return [];
  return section.items.filter((i) => !i.covered);
}

function formatGapList(items: DetailItem[]): string {
  if (items.length === 0) return '- _None — all items are covered!_';
  return items.map((i) => `- \`${i.id}\``).join('\n');
}

export function generateEndpointSummary(report: CoverageReport): string {
  const section = report.details?.endpoint;
  if (!section) return '### Endpoints\n\n_No endpoint data available._';
  const total = section.items.length;
  const covered = section.items.filter((i) => i.covered).length;
  const pct = coveragePercent(section);
  const gaps = uncoveredItems(section);

  return `### Endpoints Coverage Summary

#### What was analysed
- Analysed **${total}** endpoint(s) from the OpenAPI specification.

#### Key Metrics
| Metric | Value |
|--------|-------|
| Total Endpoints | ${total} |
| Covered | ${covered} |
| Uncovered | ${total - covered} |
| Coverage | ${pct}% |

#### Coverage Gaps
${formatGapList(gaps)}
`;
}

export function generateParameterSummary(report: CoverageReport): string {
  const section = report.details?.parameter;
  if (!section) return '### Parameters\n\n_No parameter data available._';
  const total = section.items.length;
  const covered = section.items.filter((i) => i.covered).length;
  const pct = coveragePercent(section);
  const gaps = uncoveredItems(section);

  return `### Parameter Coverage Summary

#### What was analysed
- Analysed **${total}** parameter category/categories.

#### Key Metrics
| Metric | Value |
|--------|-------|
| Total Parameters | ${total} |
| Covered | ${covered} |
| Uncovered | ${total - covered} |
| Coverage | ${pct}% |

#### Coverage Gaps
${formatGapList(gaps)}
`;
}

export function generateBusinessRulesSummary(report: CoverageReport): string {
  const section = report.details?.business;
  if (!section) return '### Business Rules\n\n_No business rules data available._';
  const total = section.items.length;
  const covered = section.items.filter((i) => i.covered).length;
  const pct = coveragePercent(section);
  const gaps = uncoveredItems(section);

  return `### Business Rules Coverage Summary

#### What was analysed
- Analysed **${total}** business rule(s) extracted from test descriptions and annotations.

#### Key Metrics
| Metric | Value |
|--------|-------|
| Total Rules | ${total} |
| Covered | ${covered} |
| Uncovered | ${total - covered} |
| Coverage | ${pct}% |

#### Coverage Gaps
${formatGapList(gaps)}
`;
}

/** Sanitise a string so it is safe inside Mermaid double-quoted node labels. */
function safeMermaidLabel(text: string): string {
  return text
    .replace(/"/g, "'")   // no unescaped double-quotes inside labels
    .replace(/</g, '‹')   // no raw < to avoid HTML injection in some renderers
    .replace(/>/g, '›')
    .replace(/\r?\n/g, ' ');
}

/**
 * Generate a Mermaid flowchart for a single integration flow.
 * Each step is a node; covered steps are green, uncovered red.
 * Returns an empty string when no step data is available.
 */
export function generateFlowMermaid(item: FlowItem): string {
  const steps = item.rawSteps;
  if (!steps || steps.length === 0) return '';

  const lines: string[] = ['flowchart LR'];
  const coveredNodes: string[] = [];
  const uncoveredNodes: string[] = [];

  steps.forEach((step, i) => {
    const nodeId = `S${i + 1}`;
    const stepName = safeMermaidLabel(step.name || `Step ${step.stepNumber || i + 1}`);
    const endpoint = step.method && step.path
      ? `<br/>${step.method} ${safeMermaidLabel(step.path)}`
      : '';
    lines.push(`  ${nodeId}["${i + 1}. ${stepName}${endpoint}"]`);
    if (step.covered) {
      coveredNodes.push(nodeId);
    } else {
      uncoveredNodes.push(nodeId);
    }
  });

  // Connect steps sequentially
  for (let i = 0; i < steps.length - 1; i++) {
    lines.push(`  S${i + 1} --> S${i + 2}`);
  }

  if (coveredNodes.length > 0) {
    lines.push(`  class ${coveredNodes.join(',')} covered`);
  }
  if (uncoveredNodes.length > 0) {
    lines.push(`  class ${uncoveredNodes.join(',')} uncovered`);
  }
  lines.push('  classDef covered fill:#22c55e,color:#fff,stroke:#16a34a');
  lines.push('  classDef uncovered fill:#ef4444,color:#fff,stroke:#dc2626');
  return lines.join('\n');
}

/**
 * High-level overview chart showing all flows as labelled nodes.
 * Used in the AI summary markdown; per-flow detail diagrams are rendered in the page itself.
 */
export function generateMermaidFlowchart(items: FlowItem[]): string {
  if (items.length === 0) return '';
  const lines: string[] = ['flowchart TD'];
  items.forEach((item) => {
    const nodeId = item.id.replace(/[^a-zA-Z0-9]/g, '_');
    const label = safeMermaidLabel(item.flowName || item.id);
    const pct = item.steps && item.steps > 0
      ? Math.round(((item.coveredSteps ?? 0) / item.steps) * 100)
      : (item.covered ? 100 : 0);
    const stepSuffix = item.steps ? `<br/>${item.coveredSteps ?? 0}/${item.steps} steps` : '';
    lines.push(`  ${nodeId}["${label}${stepSuffix}"]`);
    lines.push(`  class ${nodeId} ${pct === 100 ? 'covered' : pct > 0 ? 'partial' : 'uncovered'}`);
  });
  lines.push('  classDef covered fill:#22c55e,color:#fff,stroke:#16a34a');
  lines.push('  classDef partial fill:#f59e0b,color:#fff,stroke:#d97706');
  lines.push('  classDef uncovered fill:#ef4444,color:#fff,stroke:#dc2626');
  return lines.join('\n');
}

export function generateIntegrationFlowsSummary(report: CoverageReport): string {
  const section = report.details?.integration;
  if (!section) return '### Integration Flows\n\n_No integration flows data available._';
  const items = section.items as FlowItem[];
  const total = items.length;
  const covered = items.filter((i) => i.covered).length;
  const pct = coveragePercent(section);
  const gaps = uncoveredItems(section);
  const mermaid = generateMermaidFlowchart(items);

  return `### Integration Flows Coverage Summary

#### What was analysed
- Analysed **${total}** integration flow(s). See the Mermaid diagram below for a visual representation.

#### Key Metrics
| Metric | Value |
|--------|-------|
| Total Flows | ${total} |
| Covered | ${covered} |
| Uncovered | ${total - covered} |
| Coverage | ${pct}% |

#### Coverage Gaps
${formatGapList(gaps)}

#### Flow Diagram
The diagram below shows covered (green) and uncovered (red) flows:

\`\`\`mermaid
${mermaid}
\`\`\`
`;
}

export function generateSecuritySummary(report: CoverageReport): string {
  const section = report.details?.security;
  if (!section) return '### Security\n\n_No security data available._';
  const total = section.items.length;
  const covered = section.items.filter((i) => i.covered).length;
  const pct = coveragePercent(section);
  const gaps = uncoveredItems(section);

  return `### Security Coverage Summary

#### What was analysed
- Analysed **${total}** security check(s) including authentication, authorisation, and input validation scenarios.

#### Key Metrics
| Metric | Value |
|--------|-------|
| Total Checks | ${total} |
| Covered | ${covered} |
| Uncovered | ${total - covered} |
| Coverage | ${pct}% |

#### Coverage Gaps
${formatGapList(gaps)}
`;
}

export function generateErrorHandlingSummary(report: CoverageReport): string {
  const section = report.details?.error;
  if (!section) return '### Error Handling\n\n_No error handling data available._';
  const total = section.items.length;
  const covered = section.items.filter((i) => i.covered).length;
  const pct = coveragePercent(section);
  const gaps = uncoveredItems(section);

  return `### Error Handling Coverage Summary

#### What was analysed
- Analysed **${total}** error scenario(s) such as 4xx/5xx responses and edge-case inputs.

#### Key Metrics
| Metric | Value |
|--------|-------|
| Total Scenarios | ${total} |
| Covered | ${covered} |
| Uncovered | ${total - covered} |
| Coverage | ${pct}% |

#### Coverage Gaps
${formatGapList(gaps)}
`;
}

export function generatePerformanceSummary(report: CoverageReport): string {
  const perfSection = report.details?.performance;
  const resSection = report.details?.resilience;
  const perfItems = perfSection?.items ?? [];
  const resItems = resSection?.items ?? [];
  const allItems = [...perfItems, ...resItems];
  if (allItems.length === 0) return '### Performance & Resilience\n\n_No performance/resilience data available._';
  const total = allItems.length;
  const covered = allItems.filter((i) => i.covered).length;
  const pct = total > 0 ? Math.round((covered / total) * 100) : 0;
  const gaps = allItems.filter((i) => !i.covered);

  return `### Performance & Resilience Coverage Summary

#### What was analysed
- Analysed **${perfItems.length}** performance metric(s) and **${resItems.length}** resilience scenario(s).

#### Key Metrics
| Metric | Value |
|--------|-------|
| Total Items | ${total} |
| Covered | ${covered} |
| Uncovered | ${total - covered} |
| Coverage | ${pct}% |

#### Coverage Gaps
${formatGapList(gaps)}
`;
}

export function generateCompatibilitySummary(report: CoverageReport): string {
  const section = report.details?.compatibility;
  if (!section) return '### Compatibility\n\n_No compatibility data available._';
  const total = section.items.length;
  const covered = section.items.filter((i) => i.covered).length;
  const pct = coveragePercent(section);
  const gaps = uncoveredItems(section);

  return `### Compatibility Coverage Summary

#### What was analysed
- Analysed **${total}** compatibility check(s) comparing spec versions or contract files.

#### Key Metrics
| Metric | Value |
|--------|-------|
| Total Checks | ${total} |
| Covered | ${covered} |
| Uncovered | ${total - covered} |
| Coverage | ${pct}% |

#### Coverage Gaps
${formatGapList(gaps)}
`;
}
