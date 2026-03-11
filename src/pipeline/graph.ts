/**
 * Coverage Knowledge Graph — the central data structure for the pipeline.
 *
 * Stores typed nodes and edges accumulated across all 6 pipeline stages.
 * Provides lookup, traversal, merge, and serialization operations.
 */

import type {
  GraphNode,
  GraphEdge,
  GraphNodeType,
  GraphEdgeType,
  ConflictNode,
  StageName,
} from './types';

export class CoverageKnowledgeGraph {
  private nodes: Map<string, GraphNode> = new Map();
  private edges: Map<string, GraphEdge> = new Map();

  // ─── Node operations ────────────────────────────────────────────────

  addNode(node: GraphNode): void {
    this.nodes.set(node.id, node);
  }

  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  hasNode(id: string): boolean {
    return this.nodes.has(id);
  }

  removeNode(id: string): boolean {
    return this.nodes.delete(id);
  }

  getNodesByType(type: GraphNodeType): GraphNode[] {
    return Array.from(this.nodes.values()).filter((n) => n.type === type);
  }

  getNodesByStage(stage: StageName): GraphNode[] {
    return Array.from(this.nodes.values()).filter((n) => n.sourceStage === stage);
  }

  getAllNodes(): GraphNode[] {
    return Array.from(this.nodes.values());
  }

  get nodeCount(): number {
    return this.nodes.size;
  }

  // ─── Edge operations ────────────────────────────────────────────────

  addEdge(edge: GraphEdge): void {
    this.edges.set(edge.id, edge);
  }

  getEdge(id: string): GraphEdge | undefined {
    return this.edges.get(id);
  }

  hasEdge(id: string): boolean {
    return this.edges.has(id);
  }

  removeEdge(id: string): boolean {
    return this.edges.delete(id);
  }

  /** Get all edges originating from a given node. */
  getEdgesFrom(nodeId: string): GraphEdge[] {
    return Array.from(this.edges.values()).filter((e) => e.sourceNodeId === nodeId);
  }

  /** Get all edges pointing to a given node. */
  getEdgesTo(nodeId: string): GraphEdge[] {
    return Array.from(this.edges.values()).filter((e) => e.targetNodeId === nodeId);
  }

  /** Get all edges between two specific nodes (in either direction). */
  getEdgesBetween(nodeIdA: string, nodeIdB: string): GraphEdge[] {
    return Array.from(this.edges.values()).filter(
      (e) =>
        (e.sourceNodeId === nodeIdA && e.targetNodeId === nodeIdB) ||
        (e.sourceNodeId === nodeIdB && e.targetNodeId === nodeIdA),
    );
  }

  /** Get all edges of a specific type. */
  getEdgesByType(type: GraphEdgeType): GraphEdge[] {
    return Array.from(this.edges.values()).filter((e) => e.type === type);
  }

  getAllEdges(): GraphEdge[] {
    return Array.from(this.edges.values());
  }

  get edgeCount(): number {
    return this.edges.size;
  }

  // ─── Traversal helpers ──────────────────────────────────────────────

  /**
   * Get all nodes reachable from `startId` by following edges of the given types.
   * BFS traversal, returns nodes in visit order. Cycle-safe.
   */
  getReachableNodes(startId: string, edgeTypes?: GraphEdgeType[]): GraphNode[] {
    const visited = new Set<string>();
    const queue: string[] = [startId];
    const result: GraphNode[] = [];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const node = this.nodes.get(currentId);
      if (node && currentId !== startId) {
        result.push(node);
      }

      const outEdges = this.getEdgesFrom(currentId);
      for (const edge of outEdges) {
        if (!edgeTypes || edgeTypes.includes(edge.type)) {
          if (!visited.has(edge.targetNodeId)) {
            queue.push(edge.targetNodeId);
          }
        }
      }
    }

    return result;
  }

  /**
   * Check whether a path from `startId` to `endId` passes through any node
   * of the given type. Used by confidence scoring to detect mock boundaries.
   */
  hasNodeTypeOnPath(
    startId: string,
    endId: string,
    nodeType: GraphNodeType,
  ): boolean {
    const visited = new Set<string>();
    const queue: string[][] = [[startId]];

    while (queue.length > 0) {
      const path = queue.shift()!;
      const currentId = path[path.length - 1];

      if (visited.has(currentId)) continue;
      visited.add(currentId);

      if (currentId === endId) {
        // Check interior nodes (not start or end)
        for (let i = 1; i < path.length - 1; i++) {
          const node = this.nodes.get(path[i]);
          if (node?.type === nodeType) return true;
        }
        return false;
      }

      const outEdges = this.getEdgesFrom(currentId);
      for (const edge of outEdges) {
        if (!visited.has(edge.targetNodeId)) {
          queue.push([...path, edge.targetNodeId]);
        }
      }
    }

    return false;
  }

  // ─── Merge ──────────────────────────────────────────────────────────

  /**
   * Merge another graph into this one. Returns conflicts for any nodes
   * that exist in both graphs with different types (RULE: stage-disagreement).
   */
  merge(other: CoverageKnowledgeGraph): ConflictNode[] {
    const conflicts: ConflictNode[] = [];
    let conflictCounter = 0;

    for (const node of other.getAllNodes()) {
      const existing = this.nodes.get(node.id);
      if (existing) {
        if (existing.type !== node.type) {
          conflicts.push({
            conflictId: `conflict-merge-${conflictCounter++}`,
            nodeId: node.id,
            type: 'stage-disagreement',
            stages: [existing.sourceStage, node.sourceStage],
            stageOutputs: {
              [existing.sourceStage]: { type: existing.type, label: existing.label },
              [node.sourceStage]: { type: node.type, label: node.label },
            },
            detail: `Node '${node.id}' has type '${existing.type}' from stage '${existing.sourceStage}' but type '${node.type}' from stage '${node.sourceStage}'`,
            suggestedAction: `Review both stage outputs for node '${node.id}' and determine the correct classification. Check if the node serves dual roles (e.g., a service that also defines endpoints).`,
            severity: 'warning',
          });
        }
        // Merge metadata from the newer stage
        existing.metadata = { ...existing.metadata, ...node.metadata };
      } else {
        this.nodes.set(node.id, { ...node });
      }
    }

    for (const edge of other.getAllEdges()) {
      if (!this.edges.has(edge.id)) {
        this.edges.set(edge.id, { ...edge });
      }
    }

    return conflicts;
  }

  // ─── Serialization ──────────────────────────────────────────────────

  toSerializable(): { nodes: GraphNode[]; edges: GraphEdge[] } {
    return {
      nodes: this.getAllNodes(),
      edges: this.getAllEdges(),
    };
  }

  static fromSerializable(data: { nodes: GraphNode[]; edges: GraphEdge[] }): CoverageKnowledgeGraph {
    const graph = new CoverageKnowledgeGraph();
    for (const node of data.nodes) {
      graph.addNode(node);
    }
    for (const edge of data.edges) {
      graph.addEdge(edge);
    }
    return graph;
  }

  // ─── Clear ──────────────────────────────────────────────────────────

  clear(): void {
    this.nodes.clear();
    this.edges.clear();
  }
}
