import type { CoverageReport, DetailSection, DetailItem, FlowStepDetail, DiscoveryInfo } from '../types';

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

function coveredItems(section: DetailSection | undefined): DetailItem[] {
  if (!section) return [];
  return section.items.filter((i) => i.covered);
}

function formatGapList(items: DetailItem[]): string {
  if (items.length === 0) return '- _None — all items are covered!_';
  return items.map((i) => `- \`${i.id}\``).join('\n');
}

function confidenceLabel(pct: number): string {
  if (pct >= 80) return 'High';
  if (pct >= 50) return 'Medium';
  if (pct >= 20) return 'Low';
  return 'Very Low';
}

function formatStrongEvidence(items: DetailItem[]): string {
  if (items.length === 0) return '- _No items with strong direct evidence detected._';
  const withTests = items.filter((i) => i.tests && i.tests.length > 0);
  if (withTests.length === 0) return '- _Covered items exist but no linked test files were recorded._';
  return withTests
    .slice(0, 10)
    .map((i) => `- \`${i.id}\` — matched by ${i.tests!.length} test file(s)`)
    .join('\n');
}

function formatWeakEvidence(items: DetailItem[]): string {
  if (items.length === 0) return '- _All items have coverage evidence._';
  return items
    .slice(0, 10)
    .map((i) => `- \`${i.id}\` — no matching test evidence found`)
    .join('\n');
}

function riskItems(gaps: DetailItem[]): string {
  if (gaps.length === 0) return '- _No significant risks identified — all items are covered._';
  const lines: string[] = [];
  if (gaps.length >= 5) {
    lines.push(`- ${gaps.length} uncovered items represent a broad coverage gap that may hide regressions.`);
  }
  gaps.slice(0, 5).forEach((g) => {
    lines.push(`- \`${g.id}\` is untested and could fail silently in production.`);
  });
  return lines.join('\n');
}

function nextActions(gaps: DetailItem[], sectionLabel: string): string {
  if (gaps.length === 0) return '- Maintain current coverage level and add tests for any new additions.';
  const lines: string[] = [];
  lines.push(`- Write tests targeting the ${gaps.length} uncovered ${sectionLabel} item(s).`);
  if (gaps.length > 3) {
    lines.push('- Prioritise items that are publicly accessible or handle sensitive data.');
  }
  lines.push('- Re-run the analyzer after adding tests to verify coverage improvement.');
  return lines.join('\n');
}

export function generateEndpointSummary(report: CoverageReport): string {
  const section = report.details?.endpoint;
  if (!section) return '### Endpoints\n\n_No endpoint data available._';
  const total = section.items.length;
  const covered = section.items.filter((i) => i.covered).length;
  const pct = coveragePercent(section);
  const gaps = uncoveredItems(section);
  const strong = coveredItems(section);

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

#### How it was analysed
- Detection method: AST parsing + test correlation
- Source/test files were scanned and matched by path, method, and assertion patterns.
- Route definitions were extracted from controller annotations and router registrations.

#### Strong evidence
${formatStrongEvidence(strong)}

#### Weak or missing evidence
${formatWeakEvidence(gaps)}

#### Coverage Gaps
${formatGapList(gaps)}

#### Confidence and caveats
- Overall confidence: **${confidenceLabel(pct)}** (${pct}% coverage)
- Endpoints detected only via heuristic path matching may have lower individual confidence.
- Dynamic or programmatic route registration may not be fully captured by static analysis.

#### Likely risks
${riskItems(gaps)}

#### Recommended next actions
${nextActions(gaps, 'endpoint')}

#### AI handoff notes
- ${total} endpoints were evaluated; ${covered} matched test evidence.
- ${gaps.length > 0 ? `Focus investigation on the ${gaps.length} uncovered endpoint(s) listed above.` : 'All endpoints appear covered; verify assertion depth in tests.'}
- Consider checking for parameterised route variants that may not have been normalised correctly.
`;
}

export function generateParameterSummary(report: CoverageReport): string {
  const section = report.details?.parameter;
  if (!section) return '### Parameters\n\n_No parameter data available._';
  const total = section.items.length;
  const covered = section.items.filter((i) => i.covered).length;
  const pct = coveragePercent(section);
  const gaps = uncoveredItems(section);
  const strong = coveredItems(section);

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

#### How it was analysed
- Detection method: AST parsing + test correlation
- Parameters were extracted from route definitions, DTOs, and request body schemas.
- Test files were scanned for explicit parameter usage in request construction.

#### Strong evidence
${formatStrongEvidence(strong)}

#### Weak or missing evidence
${formatWeakEvidence(gaps)}

#### Coverage Gaps
${formatGapList(gaps)}

#### Confidence and caveats
- Overall confidence: **${confidenceLabel(pct)}** (${pct}% coverage)
- Parameter validation coverage (boundary values, type checks) may not be fully reflected in presence-only analysis.
- Optional parameters with defaults may appear uncovered even when implicit behaviour is tested.

#### Likely risks
${riskItems(gaps)}

#### Recommended next actions
${nextActions(gaps, 'parameter')}
- Consider adding negative-path tests for required parameters (missing, invalid type, boundary values).

#### AI handoff notes
- ${total} parameters evaluated; ${covered} had matching test evidence.
- ${gaps.length > 0 ? `Investigate the ${gaps.length} uncovered parameter(s) for potential validation gaps.` : 'All parameters appear covered; verify edge-case and negative-path testing.'}
`;
}

export function generateBusinessRulesSummary(report: CoverageReport): string {
  const section = report.details?.business;
  if (!section) return '### Business Rules\n\n_No business rules data available._';
  const total = section.items.length;
  const covered = section.items.filter((i) => i.covered).length;
  const pct = coveragePercent(section);
  const gaps = uncoveredItems(section);
  const strong = coveredItems(section);

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

#### How it was analysed
- Detection method: AST parsing + test correlation
- Business rules were inferred from conditional branches, domain validators, custom exceptions, and test descriptions.
- Rules were matched to tests by keyword correlation and assertion pattern analysis.

#### Strong evidence
${formatStrongEvidence(strong)}

#### Weak or missing evidence
${formatWeakEvidence(gaps)}

#### Coverage Gaps
${formatGapList(gaps)}

#### Confidence and caveats
- Overall confidence: **${confidenceLabel(pct)}** (${pct}% coverage)
- Business rules identified heuristically may not capture all domain logic.
- Rules embedded in service-layer conditionals without explicit annotations are harder to detect.

#### Likely risks
${riskItems(gaps)}

#### Recommended next actions
${nextActions(gaps, 'business rule')}
- Review inferred rules for accuracy and add explicit test annotations where appropriate.

#### AI handoff notes
- ${total} business rules evaluated; ${covered} matched test evidence.
- ${gaps.length > 0 ? `${gaps.length} rule(s) lack test coverage and may represent domain logic gaps.` : 'All rules appear covered; verify that assertions test business outcomes, not just status codes.'}
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
  const strong = coveredItems(section);
  const mermaid = generateMermaidFlowchart(items);

  const totalSteps = items.reduce((sum, i) => sum + (i.steps ?? 0), 0);
  const totalCoveredSteps = items.reduce((sum, i) => sum + (i.coveredSteps ?? 0), 0);

  return `### Integration Flows Coverage Summary

#### What was analysed
- Analysed **${total}** integration flow(s). See the Mermaid diagram below for a visual representation.
${totalSteps > 0 ? `- Total steps across all flows: **${totalSteps}** (${totalCoveredSteps} covered).` : ''}

#### Key Metrics
| Metric | Value |
|--------|-------|
| Total Flows | ${total} |
| Covered | ${covered} |
| Uncovered | ${total - covered} |
| Coverage | ${pct}% |

#### How it was analysed
- Detection method: AST parsing + test correlation
- Integration flows were detected from controller-to-service-to-repository call chains and event-driven patterns.
- Steps were matched to tests by tracing method invocations and verifying assertions on downstream state.

#### Strong evidence
${formatStrongEvidence(strong)}

#### Weak or missing evidence
${formatWeakEvidence(gaps)}

#### Coverage Gaps
${formatGapList(gaps)}

#### Confidence and caveats
- Overall confidence: **${confidenceLabel(pct)}** (${pct}% coverage)
- Multi-step flows inferred from naming conventions alone have lower confidence.
- Flows involving asynchronous or event-driven steps may not be fully traced by static analysis.

#### Likely risks
${riskItems(gaps)}

#### Recommended next actions
${nextActions(gaps, 'integration flow')}
- For partially covered flows, add tests that exercise the full end-to-end path.

#### AI handoff notes
- ${total} flows evaluated; ${covered} had coverage evidence.
- ${gaps.length > 0 ? `${gaps.length} flow(s) are uncovered and may represent untested integration paths.` : 'All flows appear covered; verify that downstream side-effects are asserted.'}

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
  const strong = coveredItems(section);

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

#### How it was analysed
- Detection method: AST parsing + test correlation
- Security controls were extracted from framework config (filters, guards, interceptors), annotations, and middleware.
- Tests were matched by looking for auth header setup, role-based assertions, and security exception handling.

#### Strong evidence
${formatStrongEvidence(strong)}

#### Weak or missing evidence
${formatWeakEvidence(gaps)}

#### Coverage Gaps
${formatGapList(gaps)}

#### Confidence and caveats
- Overall confidence: **${confidenceLabel(pct)}** (${pct}% coverage)
- Presence of security configuration does not imply security test coverage.
- Controls detected only via file presence (e.g. a security config file) without matching tests are marked as uncovered.

#### Likely risks
${riskItems(gaps)}
${gaps.length > 0 ? '- Uncovered security controls may expose authentication or authorisation bypass vulnerabilities.' : ''}

#### Recommended next actions
${nextActions(gaps, 'security')}
- Ensure negative-path security tests exist (missing tokens, expired tokens, insufficient roles).

#### AI handoff notes
- ${total} security controls evaluated; ${covered} matched test evidence.
- ${gaps.length > 0 ? `${gaps.length} control(s) lack test coverage and represent potential security risks.` : 'All controls appear covered; verify that tests assert both allow and deny paths.'}
`;
}

export function generateErrorHandlingSummary(report: CoverageReport): string {
  const section = report.details?.error;
  if (!section) return '### Error Handling\n\n_No error handling data available._';
  const total = section.items.length;
  const covered = section.items.filter((i) => i.covered).length;
  const pct = coveragePercent(section);
  const gaps = uncoveredItems(section);
  const strong = coveredItems(section);

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

#### How it was analysed
- Detection method: AST parsing + test correlation
- Error scenarios were extracted from exception handlers, guard clauses, validation logic, and framework error mappings.
- Tests were matched by looking for expected error status assertions and exception assertions.

#### Strong evidence
${formatStrongEvidence(strong)}

#### Weak or missing evidence
${formatWeakEvidence(gaps)}

#### Coverage Gaps
${formatGapList(gaps)}

#### Confidence and caveats
- Overall confidence: **${confidenceLabel(pct)}** (${pct}% coverage)
- Error paths in catch-all handlers or generic exception mappers may not be individually identified.
- Infrastructure failure paths (timeouts, connection errors) are harder to detect from source code alone.

#### Likely risks
${riskItems(gaps)}
${gaps.length > 0 ? '- Untested error paths may produce unexpected responses or leak internal details in production.' : ''}

#### Recommended next actions
${nextActions(gaps, 'error scenario')}
- Add tests for common negative paths: missing auth, invalid payloads, resource not found, conflict states.

#### AI handoff notes
- ${total} error scenarios evaluated; ${covered} matched test evidence.
- ${gaps.length > 0 ? `${gaps.length} scenario(s) lack test coverage — prioritise those on public-facing endpoints.` : 'All scenarios appear covered; verify that error response bodies and status codes are asserted.'}
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
  const strong = allItems.filter((i) => i.covered);

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

#### How it was analysed
- Detection method: AST parsing + test correlation
- Performance signals were extracted from load testing tools, timeout configurations, and caching annotations.
- Resilience signals were extracted from retry policies, circuit breakers, and fallback handlers.

#### Strong evidence
${formatStrongEvidence(strong)}

#### Weak or missing evidence
${formatWeakEvidence(gaps)}

#### Coverage Gaps
${formatGapList(gaps)}

#### Confidence and caveats
- Overall confidence: **${confidenceLabel(pct)}** (${pct}% coverage)
- Presence of timeout or retry configuration does not constitute test evidence.
- Load test coverage may exist outside the scanned repository (e.g. in a separate performance test project).

#### Likely risks
${riskItems(gaps)}
${gaps.length > 0 ? '- Untested resilience patterns may fail unexpectedly under production load or downstream failures.' : ''}

#### Recommended next actions
${nextActions(gaps, 'performance/resilience')}
- Consider adding load tests (Gatling, k6, artillery) for high-traffic endpoints.
- Verify that retry and timeout behaviour is tested under simulated failure conditions.

#### AI handoff notes
- ${perfItems.length} performance and ${resItems.length} resilience items were evaluated; ${covered} had test evidence.
- ${gaps.length > 0 ? `${gaps.length} item(s) lack coverage — check whether performance tests live in a separate repository or CI pipeline.` : 'All items appear covered; verify that tests assert latency thresholds and failure recovery.'}
`;
}

export function generateCompatibilitySummary(report: CoverageReport): string {
  const section = report.details?.compatibility;
  if (!section) return '### Compatibility\n\n_No compatibility data available._';
  const total = section.items.length;
  const covered = section.items.filter((i) => i.covered).length;
  const pct = coveragePercent(section);
  const gaps = uncoveredItems(section);
  const strong = coveredItems(section);

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

#### How it was analysed
- Detection method: AST parsing + test correlation
- Compatibility checks were extracted from contract tests, schema validation, and API version comparisons.

#### Strong evidence
${formatStrongEvidence(strong)}

#### Weak or missing evidence
${formatWeakEvidence(gaps)}

#### Coverage Gaps
${formatGapList(gaps)}

#### Confidence and caveats
- Overall confidence: **${confidenceLabel(pct)}** (${pct}% coverage)
- Compatibility checks may depend on external contract files or registries not visible to the scanner.

#### Likely risks
${riskItems(gaps)}

#### Recommended next actions
${nextActions(gaps, 'compatibility')}

#### AI handoff notes
- ${total} compatibility checks evaluated; ${covered} matched test evidence.
- ${gaps.length > 0 ? `${gaps.length} check(s) lack coverage and may allow breaking changes to go undetected.` : 'All checks appear covered.'}
`;
}

/**
 * Generate a rich fallback analysis when a section has no data.
 * Provides context about what was searched, why data might be missing,
 * and what to do next.
 */
export function generateFallbackAnalysis(sectionName: string, discoveryInfo?: DiscoveryInfo): string {
  const languages = discoveryInfo?.languages ?? [];
  const frameworks = discoveryInfo?.frameworks ?? [];
  const serviceFiles = discoveryInfo?.serviceFilesCount ?? 0;
  const testFiles = discoveryInfo?.testFilesCount ?? 0;
  const specFiles = discoveryInfo?.specFilesCount ?? 0;
  const analysisMode = discoveryInfo?.analysisMode ?? 'unknown';

  const langStr = languages.length > 0 ? languages.join(', ') : 'none detected';
  const fwStr = frameworks.length > 0 ? frameworks.join(', ') : 'none detected';

  const sectionSpecificGuidance: Record<string, string> = {
    endpoint: `- The analyzer looks for route definitions in controller annotations, router registrations, and framework-specific patterns.
- If endpoints exist but were not detected, the project may use dynamic routing, code generation, or a framework adapter not yet supported.
- Check that an OpenAPI spec or route-defining source files are present in the scanned directory.`,
    parameter: `- Parameters are extracted from route definitions, DTOs, request body schemas, and validation annotations.
- If no parameters were found, the project may define them inline or via code generation.
- Ensure that controller method signatures or request model classes are accessible to the scanner.`,
    business: `- Business rules are inferred from conditional branches, domain validators, custom exceptions, and test descriptions.
- This detection is heuristic and may miss rules that are deeply embedded in service logic without clear naming patterns.
- Consider adding explicit test annotations or descriptions that mention the business rule being verified.`,
    error: `- Error scenarios are extracted from exception handlers, guard clauses, and framework error mappings.
- If no scenarios were found, the project may use a global error handler or the error patterns may not match known heuristics.
- Check for \`@ExceptionHandler\`, \`catch\` blocks, or middleware error handlers in the source.`,
    integration: `- Integration flows are detected from controller-to-service-to-repository call chains and event-driven patterns.
- Multi-step flows require clear method invocation chains to be traced.
- If flows exist but were not detected, they may use asynchronous messaging or external orchestration not visible to static analysis.`,
    security: `- Security controls are extracted from framework configuration (Spring Security, auth middleware, route guards), annotations, and interceptors.
- If no controls were found, security may be handled at the infrastructure level (API gateway, WAF) rather than in application code.
- Check for authentication filters, authorization annotations, or security test utilities in the codebase.`,
    performance: `- Performance signals are extracted from load testing tool configurations, timeout settings, caching annotations, and resilience libraries.
- If no signals were found, performance and resilience testing may live in a separate repository or CI pipeline.
- Look for Gatling, k6, artillery, or resilience4j configurations in the project.`,
    resilience: `- Resilience patterns are detected from retry policies, circuit breaker configurations, fallback handlers, and timeout settings.
- These signals may be configured via external files (application.yml, environment variables) not visible to source scanning.`,
    compatibility: `- Compatibility checks are extracted from contract tests, schema validation, and API version comparison files.
- If no checks were found, contract testing may not be implemented or may use an unsupported tool.`,
  };

  const guidance = sectionSpecificGuidance[sectionName] ?? `- No specific detection guidance available for the "${sectionName}" section.`;

  return `### ${sectionName.charAt(0).toUpperCase() + sectionName.slice(1)} — Fallback Analysis

#### What was searched
- The analyzer scanned the project for **${sectionName}** coverage evidence.
- Analysis mode: **${analysisMode}**
- Languages detected: **${langStr}**
- Frameworks detected: **${fwStr}**
- Source files scanned: **${serviceFiles}** | Test files: **${testFiles}** | Spec files: **${specFiles}**

#### Why no data was found
${guidance}

#### What this means
- The absence of data does **not** necessarily mean the project lacks ${sectionName} coverage.
- It may indicate that the analyzer's detection heuristics do not cover the patterns used in this project.
- Manual review or a more targeted scan configuration may surface additional evidence.

#### Recommended next steps
- Verify that the relevant source and test files are included in the scan path.
- Check the analyzer's supported framework list against this project's stack (${fwStr}).
- If coverage exists but is undetected, consider contributing a detection rule or filing an issue.
- Re-run the analyzer with verbose logging to see which files were inspected and which patterns were attempted.

#### AI handoff notes
- Section "${sectionName}" produced no items during analysis.
- Project context: languages=[${langStr}], frameworks=[${fwStr}], ${serviceFiles} source files, ${testFiles} test files.
- An engineer or AI continuing this investigation should start by checking whether ${sectionName}-related patterns exist in the codebase but were not recognised by the current parser set.
`;
}
