/**
 * Graph builder — converts SemanticModels, cross-file results, and traversal
 * results into GraphNode[] and GraphEdge[] for the Coverage Knowledge Graph.
 */

import type { SemanticModel, SemanticHttpCall, ResolvedHttpInteraction } from '../../../ast/astTypes';
import type { GraphNode, GraphEdge } from '../../types';
import type { CrossFileSymbolTable, TraversalResult } from './types';
import { isTestFile } from '../../../discovery/fileClassifier';
import * as path from 'path';

/**
 * Build graph nodes and edges from parsed semantic models and analysis results.
 */
export function buildAstGraph(
  models: Map<string, SemanticModel>,
  crossFileTable: CrossFileSymbolTable,
  traversalResults: Map<string, TraversalResult>,
  interactions: Map<string, ResolvedHttpInteraction[]>,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const addedNodeIds = new Set<string>();
  const addedEdgeIds = new Set<string>();

  function addNode(node: GraphNode): void {
    if (addedNodeIds.has(node.id)) return;
    addedNodeIds.add(node.id);
    nodes.push(node);
  }

  function addEdge(edge: GraphEdge): void {
    if (addedEdgeIds.has(edge.id)) return;
    addedEdgeIds.add(edge.id);
    edges.push(edge);
  }

  // 1. Create file nodes for every parsed file
  for (const [filePath, model] of models) {
    const basename = path.basename(filePath);
    const isTest = isTestFile(basename);
    const fileNodeType = isTest ? 'test-file' : 'file';

    addNode({
      id: `file:${filePath}`,
      type: fileNodeType as any,
      label: basename,
      sourceStage: 'ast',
      filePath,
      metadata: { language: model.language, isTestFile: isTest },
    });
  }

  // 2. Create endpoint nodes from HTTP interactions
  for (const [filePath, fileInteractions] of interactions) {
    for (const interaction of fileInteractions) {
      const endpointId = `endpoint:${interaction.method}:${interaction.path}`;

      addNode({
        id: endpointId,
        type: 'endpoint',
        label: `${interaction.method} ${interaction.path}`,
        sourceStage: 'ast',
        filePath: interaction.sourceFile,
        metadata: {
          method: interaction.method,
          path: interaction.path,
          normalizedPath: interaction.normalizedPath,
          resolutionType: interaction.resolutionType,
          confidence: interaction.confidence,
        },
      });

      // Create 'tests' edge from test file to endpoint
      const basename = path.basename(filePath);
      if (isTestFile(basename)) {
        addEdge({
          id: `file:${filePath}->tests->${endpointId}`,
          type: 'tests',
          sourceNodeId: `file:${filePath}`,
          targetNodeId: endpointId,
          sourceStage: 'ast',
          metadata: {
            resolutionType: interaction.resolutionType,
            confidence: interaction.confidence,
          },
        });
      }

      // Create 'asserts' edge if assertion-linked
      if (interaction.assertionLinked && interaction.assertionType && interaction.assertionType !== 'none') {
        addEdge({
          id: `file:${filePath}->asserts->${endpointId}`,
          type: 'asserts',
          sourceNodeId: `file:${filePath}`,
          targetNodeId: endpointId,
          sourceStage: 'ast',
          metadata: { assertionType: interaction.assertionType },
        });
      }
    }
  }

  // 3. Create function/class nodes from semantic models
  for (const [filePath, model] of models) {
    for (const [funcName, func] of model.functions) {
      const funcNodeId = `function:${filePath}:${funcName}`;

      addNode({
        id: funcNodeId,
        type: 'function',
        label: funcName,
        sourceStage: 'ast',
        filePath,
        metadata: {
          parameters: func.parameters,
          annotations: func.annotations,
          httpCallCount: func.bodyHttpCalls.length,
          calledFunctions: func.calledFunctions,
        },
      });

      // Create 'calls' edges to other functions
      for (const calledFunc of func.calledFunctions) {
        // Try to find the called function in the same file or imported files
        const targetFile = findFunctionFile(calledFunc, filePath, crossFileTable);
        if (targetFile) {
          const targetId = `function:${targetFile}:${calledFunc}`;
          addEdge({
            id: `${funcNodeId}->calls->${targetId}`,
            type: 'calls',
            sourceNodeId: funcNodeId,
            targetNodeId: targetId,
            sourceStage: 'ast',
            metadata: {},
          });
        }
      }

      // Create edges from function to endpoints it defines (for controller methods)
      for (const httpCall of func.bodyHttpCalls) {
        if (httpCall.resolvedPath) {
          const endpointId = `endpoint:${httpCall.method}:${httpCall.resolvedPath}`;
          if (addedNodeIds.has(endpointId)) {
            addEdge({
              id: `${funcNodeId}->defines->${endpointId}`,
              type: 'defines',
              sourceNodeId: funcNodeId,
              targetNodeId: endpointId,
              sourceStage: 'ast',
              metadata: {},
            });
          }
        }
      }
    }
  }

  // 4. Create class nodes from cross-file table
  for (const [className, classDecl] of crossFileTable.classes) {
    const classNodeId = `class:${classDecl.filePath}:${className}`;
    addNode({
      id: classNodeId,
      type: 'class',
      label: className,
      sourceStage: 'ast',
      filePath: classDecl.filePath,
      line: classDecl.line,
      metadata: {
        methods: classDecl.methods,
        extendsClass: classDecl.extendsClass,
        implementsInterfaces: classDecl.implementsInterfaces,
      },
    });

    // Create 'extends' edge if there's a base class
    if (classDecl.extendsClass) {
      const baseDecl = crossFileTable.classes.get(classDecl.extendsClass);
      if (baseDecl) {
        const baseNodeId = `class:${baseDecl.filePath}:${classDecl.extendsClass}`;
        addEdge({
          id: `${classNodeId}->extends->${baseNodeId}`,
          type: 'extends',
          sourceNodeId: classNodeId,
          targetNodeId: baseNodeId,
          sourceStage: 'ast',
          metadata: {},
        });
      }
    }
  }

  // 5. Create assertion nodes from traversal results
  for (const [filePath, result] of traversalResults) {
    if (result.resolvedAssertions.length > 0) {
      const assertionNodeId = `assertion:${filePath}`;
      addNode({
        id: assertionNodeId,
        type: 'assertion',
        label: `Assertions (${result.assertionSource})`,
        sourceStage: 'ast',
        filePath,
        metadata: {
          assertionSource: result.assertionSource,
          assertionCount: result.resolvedAssertions.length,
          traversalDepth: result.traversalDepth,
          resolution: result.resolution,
        },
      });
    }
  }

  // 6. Create import edges from the import graph
  for (const [filePath, importedFiles] of crossFileTable.importGraph) {
    const sourceId = `file:${filePath}`;
    if (!addedNodeIds.has(sourceId)) continue;

    for (const importedFile of importedFiles) {
      const targetId = `file:${importedFile}`;
      if (!addedNodeIds.has(targetId)) continue;

      addEdge({
        id: `${sourceId}->imports-helper->${targetId}`,
        type: 'imports-helper',
        sourceNodeId: sourceId,
        targetNodeId: targetId,
        sourceStage: 'ast',
        metadata: {},
      });
    }
  }

  return { nodes, edges };
}

/**
 * Find the file containing a function definition.
 */
function findFunctionFile(
  funcName: string,
  fromFile: string,
  table: CrossFileSymbolTable,
): string | undefined {
  // Check current file first
  const currentModel = table.models.get(fromFile);
  if (currentModel?.functions.has(funcName)) return fromFile;

  // Check imported files
  const importedFiles = table.importGraph.get(fromFile) ?? [];
  for (const importedFile of importedFiles) {
    const model = table.models.get(importedFile);
    if (model?.functions.has(funcName)) return importedFile;
  }

  // Search all models as fallback
  for (const [filePath, model] of table.models) {
    if (model.functions.has(funcName)) return filePath;
  }

  return undefined;
}
