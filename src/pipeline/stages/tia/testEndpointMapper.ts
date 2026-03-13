/**
 * Test-to-endpoint mapper — maps test files to endpoints using multiple evidence sources.
 *
 * Evidence types:
 * 1. Explicit URL: Direct URL string in test file
 * 2. Resolved constant: URL from resolved constant/variable
 * 3. Import graph: Linked via import chain
 * 4. Naming convention: Test file name matches endpoint handler
 * 5. Framework metadata: Framework annotations link test to endpoint
 * 6. Helper traversal: URL resolved through helper function chain
 * 7. Page object: URL resolved through page object pattern
 */

import type { TestEndpointMapping } from './types';
import type { GraphNode, GraphEdge } from '../../types';
import type { CoverageKnowledgeGraph } from '../../graph';
import * as path from 'path';

/**
 * Map test files to endpoints using available evidence in the graph.
 *
 * @param graph - The coverage knowledge graph (from AST stage)
 * @param testFiles - List of test file paths
 */
export function mapTestsToEndpoints(
  graph: CoverageKnowledgeGraph,
  testFiles: string[],
): TestEndpointMapping[] {
  const mappings: TestEndpointMapping[] = [];

  // Get all endpoint nodes
  const endpointNodes = graph.getNodesByType('endpoint');
  if (endpointNodes.length === 0) return mappings;

  for (const testFile of testFiles) {
    const fileNodeId = `file:${testFile}`;

    // 1. Check for existing 'tests' edges from AST stage
    if (graph.hasNode(fileNodeId)) {
      const testEdges = graph.getEdgesFrom(fileNodeId).filter((e) => e.type === 'tests');
      for (const edge of testEdges) {
        mappings.push({
          testFilePath: testFile,
          endpointId: edge.targetNodeId,
          evidenceType: 'explicit-url',
          confidence: 'high',
        });
      }
    }

    // 2. Check for 'asserts' edges (higher confidence than just 'tests')
    if (graph.hasNode(fileNodeId)) {
      const assertEdges = graph.getEdgesFrom(fileNodeId).filter((e) => e.type === 'asserts');
      for (const edge of assertEdges) {
        // Don't duplicate if already mapped via 'tests'
        if (!mappings.some((m) => m.testFilePath === testFile && m.endpointId === edge.targetNodeId)) {
          mappings.push({
            testFilePath: testFile,
            endpointId: edge.targetNodeId,
            evidenceType: 'explicit-url',
            confidence: 'high',
          });
        }
      }
    }

    // 3. Naming convention matching
    const testBasename = path.basename(testFile, path.extname(testFile))
      .replace(/\.(test|spec|Test|Tests|Spec|IT)$/, '')
      .replace(/^test_|_test$/, '')
      .replace(/^Test|Test$/, '');

    for (const endpoint of endpointNodes) {
      const handlerName = (endpoint.metadata?.handlerFunction as string) ?? '';
      const endpointLabel = endpoint.label.toLowerCase();

      // Match test file name to handler/controller name
      if (testBasename.toLowerCase().includes(handlerName.toLowerCase()) && handlerName.length > 3) {
        if (!mappings.some((m) => m.testFilePath === testFile && m.endpointId === endpoint.id)) {
          mappings.push({
            testFilePath: testFile,
            endpointId: endpoint.id,
            evidenceType: 'naming-convention',
            confidence: 'low',
          });
        }
      }
    }

    // 4. Import graph traversal: follow imports from test file to find endpoint connections
    if (graph.hasNode(fileNodeId)) {
      const importEdges = graph.getEdgesFrom(fileNodeId).filter((e) => e.type === 'imports-helper');
      for (const importEdge of importEdges) {
        // Check if the imported file defines any endpoints
        const importedFileEdges = graph.getEdgesFrom(importEdge.targetNodeId);
        for (const fileEdge of importedFileEdges) {
          if (fileEdge.type === 'tests' || fileEdge.type === 'defines') {
            if (!mappings.some((m) => m.testFilePath === testFile && m.endpointId === fileEdge.targetNodeId)) {
              mappings.push({
                testFilePath: testFile,
                endpointId: fileEdge.targetNodeId,
                evidenceType: 'import-graph',
                confidence: 'medium',
              });
            }
          }
        }
      }
    }
  }

  return mappings;
}
