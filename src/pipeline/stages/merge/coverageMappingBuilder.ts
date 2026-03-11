/**
 * Coverage mapping builder — constructs `CoverageMapping` entries for every
 * endpoint in the graph by walking its connected test files, assertions,
 * mock boundaries, and runtime confirmations.
 */

import type {
  CoverageMapping,
  CoverageMappingItemType,
  PipelineConfidence,
  AssertionSource,
  UrlResolution,
  StageName,
} from '../../types';
import type { CoverageKnowledgeGraph } from '../../graph';
import type { TiaOutput } from '../tia/types';
import type { IastOutput } from '../iast/types';
import type { DastOutput } from '../dast/types';
import { computeConfidence, buildConfidenceEvidence } from '../../confidence';
import { determineCoverageClass, mergeConfidence, mergeCoverageClass } from './mergeRules';

/**
 * Build coverage mappings for all endpoint-type nodes in the graph.
 */
export function buildCoverageMappings(
  graph: CoverageKnowledgeGraph,
  tiaOutput: TiaOutput | undefined,
  iastOutput: IastOutput | undefined,
  dastOutput: DastOutput | undefined,
  isStaticOnlyMode: boolean,
): CoverageMapping[] {
  const mappings: CoverageMapping[] = [];
  const endpointNodes = graph.getNodesByType('endpoint');

  const iastConfirmed = new Set(iastOutput?.confirmedEndpoints ?? []);
  const dastConfirmed = new Set(dastOutput?.confirmedEndpoints ?? []);
  const dastUnreachable = new Set(dastOutput?.unreachableEndpoints ?? []);

  // Build a lookup: endpointId → test classifications
  const testLayerLookup = new Map<string, string>();
  if (tiaOutput) {
    for (const classification of tiaOutput.classifications) {
      testLayerLookup.set(classification.filePath, classification.layer);
    }
  }

  // Build a lookup: endpointId → mock boundary test files
  const mockBoundaryLookup = new Map<string, Set<string>>();
  if (tiaOutput) {
    for (const boundary of tiaOutput.mockBoundaries) {
      if (!mockBoundaryLookup.has(boundary.testFilePath)) {
        mockBoundaryLookup.set(boundary.testFilePath, new Set());
      }
      mockBoundaryLookup.get(boundary.testFilePath)!.add(boundary.mockedTarget);
    }
  }

  for (const endpoint of endpointNodes) {
    // Find linked tests (incoming 'tests' and 'asserts' edges)
    const incomingEdges = graph.getEdgesTo(endpoint.id);
    const testEdges = incomingEdges.filter(
      (e) => e.type === 'tests' || e.type === 'asserts',
    );

    const linkedTests: string[] = [];
    const sourceStages = new Set<StageName>([endpoint.sourceStage]);
    let assertionConfirmed = false;
    let assertionSource: AssertionSource = 'unresolved';
    let hasMockBoundary = false;
    let bestTestLayer: string | undefined;
    let urlResolution: UrlResolution = 'literal';
    let traversalDepth = 0;

    for (const edge of testEdges) {
      // Extract file path from source node ID (format: file:/path/to/test.ts)
      const testFilePath = edge.sourceNodeId.replace(/^file:/, '');
      if (!linkedTests.includes(testFilePath)) {
        linkedTests.push(testFilePath);
      }

      sourceStages.add(edge.sourceStage);

      // Check if this test has assertions
      if (edge.type === 'asserts') {
        assertionConfirmed = true;
        assertionSource = 'direct';
      }

      // Check test layer
      const layer = testLayerLookup.get(testFilePath);
      if (layer) {
        bestTestLayer = layer;
      }

      // Check for mock boundaries on this test file
      if (mockBoundaryLookup.has(testFilePath)) {
        hasMockBoundary = true;
      }
    }

    // Check for assertion nodes linked to this file
    if (!assertionConfirmed) {
      for (const testFile of linkedTests) {
        const assertionNodeId = `assertion:${testFile}`;
        if (graph.hasNode(assertionNodeId)) {
          const assertionNode = graph.getNode(assertionNodeId);
          if (assertionNode) {
            assertionConfirmed = true;
            assertionSource = (assertionNode.metadata?.assertionSource as AssertionSource) ?? 'direct';
            traversalDepth = (assertionNode.metadata?.traversalDepth as number) ?? 0;
          }
        }
      }
    }

    // Determine URL resolution type from endpoint metadata
    const resolutionType = endpoint.metadata?.resolutionType as string;
    if (resolutionType === 'heuristic' || resolutionType === 'string-template' || resolutionType === 'interpolated-path') {
      urlResolution = 'symbolic';
    } else if (resolutionType === 'direct' || resolutionType === 'constant' || resolutionType === 'enum') {
      urlResolution = 'literal';
    } else if (!resolutionType) {
      urlResolution = 'unresolved';
    }

    // Check mock boundaries on path
    const pathNodeIds = [endpoint.id, ...linkedTests.map((t) => `file:${t}`)];
    const mockBoundaryOnPath = hasMockBoundary;

    // Build confidence evidence
    const evidence = buildConfidenceEvidence(
      graph,
      pathNodeIds,
      isStaticOnlyMode,
    );

    // Compute confidence
    const confidence = computeConfidence(evidence);

    // Determine coverage class
    const coverageClass = linkedTests.length > 0
      ? determineCoverageClass(bestTestLayer as any, mockBoundaryOnPath)
      : 'uncovered';

    // Check DAST reachability
    const dastReachable = dastConfirmed.has(endpoint.id)
      ? true
      : dastUnreachable.has(endpoint.id)
      ? false
      : 'not-probed' as const;

    // Check runtime confirmation
    const runtimeConfirmed = iastConfirmed.has(endpoint.id) || dastConfirmed.has(endpoint.id);

    // Collect conflict IDs linked to this endpoint
    const conflictEdges = graph.getEdgesTo(endpoint.id).filter((e) => e.type === 'conflicts-with');
    const conflicts = conflictEdges.map((e) => e.sourceNodeId);

    mappings.push({
      itemId: endpoint.id,
      itemType: 'endpoint',
      linkedTests,
      sourceStages: Array.from(sourceStages),
      confidence,
      coverageClass,
      mockBoundaries: mockBoundaryOnPath
        ? linkedTests
            .filter((t) => mockBoundaryLookup.has(t))
            .flatMap((t) => Array.from(mockBoundaryLookup.get(t)!))
        : [],
      assertionSource,
      assertionConfirmed,
      dastReachable,
      runtimeConfirmed,
      urlResolution,
      conflicts,
      traversalDepth,
    });
  }

  return mappings;
}
