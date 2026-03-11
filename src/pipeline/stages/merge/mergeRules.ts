/**
 * Merge rules — defines how graph nodes and edges from different stages
 * are reconciled during the final merge stage.
 *
 * Core principle (RULE-09): A later stage may raise a node's confidence
 * or enrich its test evidence, but MUST NOT demote it.
 */

import type { PipelineConfidence, CoverageClass, TestLayer, StageName } from '../../types';

/**
 * RULE-09: Confidence can only be raised, never demoted.
 *
 * Returns the higher of two confidence levels.
 */
export function mergeConfidence(
  existing: PipelineConfidence,
  incoming: PipelineConfidence,
): PipelineConfidence {
  const order: PipelineConfidence[] = ['low', 'medium', 'high', 'verified'];
  const existingIdx = order.indexOf(existing);
  const incomingIdx = order.indexOf(incoming);
  return existingIdx >= incomingIdx ? existing : incoming;
}

/**
 * Merge test evidence arrays (de-duplicate).
 */
export function mergeTestEvidence(existing: string[], incoming: string[]): string[] {
  const set = new Set(existing);
  for (const item of incoming) set.add(item);
  return Array.from(set);
}

/**
 * Merge source stages (de-duplicate).
 */
export function mergeSourceStages(existing: StageName[], incoming: StageName[]): StageName[] {
  const set = new Set(existing);
  for (const item of incoming) set.add(item);
  return Array.from(set);
}

/**
 * Determine coverage class from test layer and mock boundary presence.
 *
 * RULE-03: If a mock boundary exists on the path, the coverage class
 * is 'mock-covered' regardless of the test layer.
 */
export function determineCoverageClass(
  testLayer: TestLayer | undefined,
  hasMockBoundary: boolean,
): CoverageClass {
  if (hasMockBoundary) return 'mock-covered';
  if (!testLayer) return 'uncovered';

  const layerToCoverageClass: Record<TestLayer, CoverageClass> = {
    unit: 'unit-covered',
    component: 'component-covered',
    integration: 'integration-covered',
    api: 'api-covered',
    e2e: 'e2e-covered',
    performance: 'api-covered',    // Performance tests are API-level coverage
    security: 'api-covered',       // Security tests are API-level coverage
  };

  return layerToCoverageClass[testLayer] ?? 'uncovered';
}

/**
 * Rank coverage classes for comparison (higher is better).
 */
export function coverageClassRank(cls: CoverageClass): number {
  const ranks: Record<CoverageClass, number> = {
    uncovered: 0,
    'mock-covered': 1,
    'unit-covered': 2,
    'component-covered': 3,
    'integration-covered': 4,
    'api-covered': 5,
    'e2e-covered': 6,
  };
  return ranks[cls] ?? 0;
}

/**
 * Merge two coverage classes — keep the highest rank.
 * RULE-09: Never demote coverage class.
 */
export function mergeCoverageClass(existing: CoverageClass, incoming: CoverageClass): CoverageClass {
  return coverageClassRank(existing) >= coverageClassRank(incoming) ? existing : incoming;
}
