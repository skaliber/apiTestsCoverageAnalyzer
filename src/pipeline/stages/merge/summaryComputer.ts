/**
 * Summary computer — computes the `PipelineSummary` from the final
 * set of coverage mappings.
 */

import type { PipelineSummary, CoverageMapping, TestLayer } from '../../types';
import type { TiaOutput } from '../tia/types';

/**
 * Compute the pipeline summary from coverage mappings.
 */
export function computeSummary(
  mappings: CoverageMapping[],
  tiaOutput: TiaOutput | undefined,
): PipelineSummary {
  const endpointMappings = mappings.filter((m) => m.itemType === 'endpoint');

  const totalEndpoints = endpointMappings.length;
  const coveredEndpoints = endpointMappings.filter((m) => m.coverageClass !== 'uncovered').length;
  const verifiedEndpoints = endpointMappings.filter((m) => m.confidence === 'verified').length;
  const uncoveredEndpoints = endpointMappings.filter((m) => m.coverageClass === 'uncovered').length;
  const mockLimitedPaths = endpointMappings.filter((m) => m.coverageClass === 'mock-covered').length;
  const unresolvedAbstractions = endpointMappings.filter(
    (m) => m.assertionSource === 'unresolved' && m.linkedTests.length > 0,
  ).length;
  const conflictCount = endpointMappings.reduce((sum, m) => sum + m.conflicts.length, 0);

  // Coverage by layer from TIA classifications
  const coverageByLayer: Record<TestLayer, number> = {
    unit: 0,
    component: 0,
    integration: 0,
    api: 0,
    e2e: 0,
    performance: 0,
    security: 0,
  };

  if (tiaOutput) {
    for (const classification of tiaOutput.classifications) {
      coverageByLayer[classification.layer] = (coverageByLayer[classification.layer] ?? 0) + 1;
    }
  }

  return {
    totalEndpoints,
    coveredEndpoints,
    verifiedEndpoints,
    uncoveredEndpoints,
    mockLimitedPaths,
    unresolvedAbstractions,
    conflictCount,
    coverageByLayer,
  };
}
