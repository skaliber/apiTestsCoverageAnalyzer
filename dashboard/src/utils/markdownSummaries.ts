import type { CoverageReport, DetailSection, DetailItem } from '../types';

interface FlowItem extends DetailItem {
  steps?: number;
  coveredSteps?: number;
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

export function generateMermaidFlowchart(items: FlowItem[]): string {
  if (items.length === 0) return '';
  const lines: string[] = ['graph TD'];
  items.forEach((item) => {
    const nodeId = item.id.replace(/[^a-zA-Z0-9]/g, '_');
    const cssClass = item.covered ? 'covered' : 'uncovered';
    lines.push(`  ${nodeId}["${item.id}"]`);
    lines.push(`  class ${nodeId} ${cssClass}`);
  });
  // Link consecutive items
  for (let i = 0; i < items.length - 1; i++) {
    const a = items[i].id.replace(/[^a-zA-Z0-9]/g, '_');
    const b = items[i + 1].id.replace(/[^a-zA-Z0-9]/g, '_');
    lines.push(`  ${a} --> ${b}`);
  }
  lines.push('  classDef covered fill:#22c55e,color:#fff,stroke:#16a34a');
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
