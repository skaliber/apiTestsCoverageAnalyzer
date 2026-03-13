/**
 * Cross-file resolution pass (Feature 27)
 *
 * Orchestrates all registered cross-file resolvers after the initial AST
 * parsing pass. Each resolver enriches the CrossFileSymbolTable with
 * framework-specific resolution data (Blueprint prefixes, Angular injection
 * chains, DDD interface mappings, etc.).
 *
 * Resolvers are registered via `registerCrossFileResolver()` and discovered
 * via `getCrossFileResolvers()`. Each resolver implements the `CrossFileResolver`
 * interface and self-declares which API frameworks it applies to.
 */

import type {
  CrossFileResolver,
  CrossFileResolutionContext,
  CrossFileResolutionResult,
  CrossFileSymbolTable,
} from './types';
import type { DetectedApiFramework } from '../../../discovery/frameworkDetector';

// ─── Resolver registry ────────────────────────────────────────────────────────

const resolverRegistry: CrossFileResolver[] = [];

/**
 * Register a cross-file resolver. Resolvers are run in registration order.
 */
export function registerCrossFileResolver(resolver: CrossFileResolver): void {
  // Avoid duplicate registrations
  if (!resolverRegistry.some((r) => r.name === resolver.name)) {
    resolverRegistry.push(resolver);
  }
}

/**
 * Return all registered cross-file resolvers.
 */
export function getCrossFileResolvers(): readonly CrossFileResolver[] {
  return resolverRegistry;
}

/**
 * Clear all registered resolvers (for testing).
 */
export function clearCrossFileResolvers(): void {
  resolverRegistry.length = 0;
}

// ─── Resolution pass orchestration ───────────────────────────────────────────

export interface CrossFileResolutionPassResult {
  /** Per-resolver diagnostics */
  resolverResults: Array<{
    resolverName: string;
    entriesAdded: number;
    diagnostics: string[];
    unresolvedRefs: Array<{ ref: string; reason: string }>;
  }>;
  /** Total entries added across all resolvers */
  totalEntriesAdded: number;
}

/**
 * Run all applicable cross-file resolvers against the symbol table.
 *
 * Each resolver mutates the symbol table in place, adding router mounts,
 * injection chains, interface implementations, and middleware inheritance data.
 *
 * @param symbolTable - The cross-file symbol table to enrich
 * @param projectRoot - Project root directory
 * @param apiFrameworks - Detected API frameworks
 * @param allSourceFiles - All source file paths
 * @returns Aggregated diagnostics from all resolvers
 */
export function runCrossFileResolution(
  symbolTable: CrossFileSymbolTable,
  projectRoot: string,
  apiFrameworks: DetectedApiFramework[],
  allSourceFiles: string[],
): CrossFileResolutionPassResult {
  const ctx: CrossFileResolutionContext = {
    symbolTable,
    projectRoot,
    apiFrameworks,
    allSourceFiles,
  };

  const resolverResults: CrossFileResolutionPassResult['resolverResults'] = [];
  let totalEntriesAdded = 0;

  for (const resolver of resolverRegistry) {
    // Only run resolvers that apply to the detected frameworks
    if (!resolver.appliesTo(apiFrameworks)) continue;

    try {
      const result = resolver.resolve(ctx);
      resolverResults.push({
        resolverName: resolver.name,
        entriesAdded: result.entriesAdded,
        diagnostics: result.diagnostics,
        unresolvedRefs: result.unresolvedRefs,
      });
      totalEntriesAdded += result.entriesAdded;
    } catch (err) {
      // Never let a resolver crash the pipeline
      resolverResults.push({
        resolverName: resolver.name,
        entriesAdded: 0,
        diagnostics: [`resolver-error: ${err instanceof Error ? err.message : String(err)}`],
        unresolvedRefs: [],
      });
    }
  }

  return { resolverResults, totalEntriesAdded };
}
