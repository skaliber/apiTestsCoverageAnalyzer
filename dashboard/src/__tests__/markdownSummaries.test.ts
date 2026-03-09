import {
  generateEndpointSummary,
  generateParameterSummary,
  generateBusinessRulesSummary,
  generateIntegrationFlowsSummary,
  generateSecuritySummary,
  generateErrorHandlingSummary,
  generatePerformanceSummary,
  generateCompatibilitySummary,
  generateMermaidFlowchart,
} from '../utils/markdownSummaries';
import type { CoverageReport } from '../types';

const makeReport = (overrides: Partial<CoverageReport['details']> = {}): CoverageReport => ({
  generatedAt: '2024-01-01T00:00:00.000Z',
  summary: [],
  details: overrides as Record<string, import('../types').DetailSection>,
});

describe('generateEndpointSummary', () => {
  it('returns no-data message when endpoint section is missing', () => {
    const result = generateEndpointSummary(makeReport());
    expect(result).toContain('No endpoint data available');
  });

  it('includes totals and coverage percent', () => {
    const report = makeReport({
      endpoint: {
        items: [
          { id: 'GET /users', covered: true },
          { id: 'POST /users', covered: false },
          { id: 'DELETE /users/{id}', covered: true },
        ],
      },
    });
    const result = generateEndpointSummary(report);
    expect(result).toContain('3');
    expect(result).toContain('67%');
    expect(result).toContain('Endpoints Coverage Summary');
  });

  it('lists uncovered endpoints', () => {
    const report = makeReport({
      endpoint: {
        items: [
          { id: 'GET /users', covered: true },
          { id: 'POST /orders', covered: false },
        ],
      },
    });
    const result = generateEndpointSummary(report);
    expect(result).toContain('`POST /orders`');
  });

  it('shows all covered message when no gaps', () => {
    const report = makeReport({
      endpoint: {
        items: [{ id: 'GET /users', covered: true }],
      },
    });
    const result = generateEndpointSummary(report);
    expect(result).toContain('all items are covered');
  });
});

describe('generateParameterSummary', () => {
  it('returns no-data message when parameter section is missing', () => {
    const result = generateParameterSummary(makeReport());
    expect(result).toContain('No parameter data available');
  });

  it('includes key metrics', () => {
    const report = makeReport({
      parameter: {
        items: [
          { id: 'query', covered: true },
          { id: 'body', covered: false },
        ],
      },
    });
    const result = generateParameterSummary(report);
    expect(result).toContain('Parameter Coverage Summary');
    expect(result).toContain('2');
    expect(result).toContain('50%');
  });
});

describe('generateBusinessRulesSummary', () => {
  it('returns no-data message when section is missing', () => {
    const result = generateBusinessRulesSummary(makeReport());
    expect(result).toContain('No business rules data available');
  });

  it('includes correct metrics', () => {
    const report = makeReport({
      business: {
        items: [
          { id: 'rule-1', covered: true },
          { id: 'rule-2', covered: true },
          { id: 'rule-3', covered: false },
        ],
      },
    });
    const result = generateBusinessRulesSummary(report);
    expect(result).toContain('Business Rules Coverage Summary');
    expect(result).toContain('67%');
  });
});

describe('generateMermaidFlowchart', () => {
  it('returns empty string for empty items', () => {
    expect(generateMermaidFlowchart([])).toBe('');
  });

  it('generates valid mermaid with covered/uncovered classes', () => {
    const items = [
      { id: 'POST /orders', covered: true },
      { id: 'POST /payments', covered: false },
    ];
    const result = generateMermaidFlowchart(items);
    expect(result).toContain('graph TD');
    expect(result).toContain('classDef covered');
    expect(result).toContain('classDef uncovered');
    expect(result).toContain('POST__orders');
    expect(result).toContain('POST__payments');
    expect(result).toContain('-->');
  });

  it('assigns correct CSS class per coverage status', () => {
    const items = [
      { id: 'step1', covered: true },
      { id: 'step2', covered: false },
    ];
    const result = generateMermaidFlowchart(items);
    expect(result).toContain('class step1 covered');
    expect(result).toContain('class step2 uncovered');
  });
});

describe('generateIntegrationFlowsSummary', () => {
  it('returns no-data message when section is missing', () => {
    const result = generateIntegrationFlowsSummary(makeReport());
    expect(result).toContain('No integration flows data available');
  });

  it('includes mermaid code block', () => {
    const report = makeReport({
      integration: {
        items: [
          { id: 'flow-a', covered: true },
          { id: 'flow-b', covered: false },
        ],
      },
    });
    const result = generateIntegrationFlowsSummary(report);
    expect(result).toContain('```mermaid');
    expect(result).toContain('Flow Diagram');
    expect(result).toContain('Integration Flows Coverage Summary');
  });
});

describe('generateSecuritySummary', () => {
  it('returns no-data message when section is missing', () => {
    expect(generateSecuritySummary(makeReport())).toContain('No security data available');
  });

  it('includes security metrics', () => {
    const report = makeReport({
      security: { items: [{ id: 'auth-check', covered: true }] },
    });
    const result = generateSecuritySummary(report);
    expect(result).toContain('Security Coverage Summary');
    expect(result).toContain('100%');
  });
});

describe('generateErrorHandlingSummary', () => {
  it('returns no-data message when section is missing', () => {
    expect(generateErrorHandlingSummary(makeReport())).toContain('No error handling data available');
  });

  it('includes error handling metrics', () => {
    const report = makeReport({
      error: {
        items: [
          { id: '404 not found', covered: false },
          { id: '500 internal error', covered: false },
        ],
      },
    });
    const result = generateErrorHandlingSummary(report);
    expect(result).toContain('Error Handling Coverage Summary');
    expect(result).toContain('0%');
    expect(result).toContain('`404 not found`');
  });
});

describe('generatePerformanceSummary', () => {
  it('returns no-data message when both sections are missing', () => {
    expect(generatePerformanceSummary(makeReport())).toContain(
      'No performance/resilience data available',
    );
  });

  it('combines performance and resilience items', () => {
    const report = makeReport({
      performance: { items: [{ id: 'p95 latency', covered: true }] },
      resilience: { items: [{ id: 'circuit-breaker', covered: false }] },
    });
    const result = generatePerformanceSummary(report);
    expect(result).toContain('Performance & Resilience Coverage Summary');
    expect(result).toContain('1');
    expect(result).toContain('50%');
  });
});

describe('generateCompatibilitySummary', () => {
  it('returns no-data message when section is missing', () => {
    expect(generateCompatibilitySummary(makeReport())).toContain('No compatibility data available');
  });

  it('includes compatibility metrics', () => {
    const report = makeReport({
      compatibility: {
        items: [
          { id: 'contract-v1', covered: true },
          { id: 'contract-v2', covered: true },
        ],
      },
    });
    const result = generateCompatibilitySummary(report);
    expect(result).toContain('Compatibility Coverage Summary');
    expect(result).toContain('100%');
  });
});
