/**
 * Vuex action cross-file resolver (Feature 27, Sub-PR 8)
 *
 * Resolves Vuex dispatch → action → ApiService → axios → URL chain:
 * 1. Find all this.$store.dispatch('actionName') calls
 * 2. Find the Vuex action definition with that name
 * 3. Follow ApiService.get('resource') calls inside the action
 * 4. Compose full URL from baseURL + resource path
 */

import type {
  CrossFileResolver,
  CrossFileResolutionContext,
  CrossFileResolutionResult,
} from '../types';
import type { DetectedApiFramework } from '../../../../discovery/frameworkDetector';

export class VuexActionResolver implements CrossFileResolver {
  readonly name = 'vuex-action';

  appliesTo(frameworks: DetectedApiFramework[]): boolean {
    return frameworks.some((f) => f.name === 'vue');
  }

  resolve(ctx: CrossFileResolutionContext): CrossFileResolutionResult {
    let entriesAdded = 0;
    const diagnostics: string[] = [];
    const unresolvedRefs: Array<{ ref: string; reason: string }> = [];

    // Collect Vuex store files: files with functions that have API calls (actions)
    const actionFiles = new Map<string, string[]>(); // filePath → action function names

    for (const [filePath, model] of ctx.symbolTable.models) {
      const actionNames: string[] = [];
      for (const [funcName, func] of model.functions) {
        if (func.bodyHttpCalls.length > 0) {
          actionNames.push(funcName);
        }
      }
      if (actionNames.length > 0) {
        actionFiles.set(filePath, actionNames);
      }
    }

    // Find dispatch calls and link them to actions
    for (const [filePath, model] of ctx.symbolTable.models) {
      for (const [funcName, func] of model.functions) {
        for (const calledFunc of func.calledFunctions) {
          if (!calledFunc.includes('dispatch')) continue;

          // Try to match dispatched action name to a known action function
          // dispatch('getArticles') → match to 'getArticles' action in a store file
          // Extract the action name from the dispatch call if possible
          // Since we only have function names from calledFunctions, look for action names
          // across all store files
          for (const [storeFile, actionNames] of actionFiles) {
            if (storeFile === filePath) continue; // Don't link a file to itself

            for (const actionName of actionNames) {
              // Check if the current file references this action name
              if (func.calledFunctions.some((f) => f.includes(actionName))) {
                if (!ctx.symbolTable.injectionChains.has(filePath)) {
                  ctx.symbolTable.injectionChains.set(filePath, []);
                }
                ctx.symbolTable.injectionChains.get(filePath)!.push({
                  consumerFile: filePath,
                  consumerClass: funcName,
                  serviceClass: actionName,
                  serviceFile: storeFile,
                  injectionStyle: 'property',
                });
                entriesAdded++;
              }
            }
          }
        }
      }
    }

    if (actionFiles.size > 0) {
      diagnostics.push(`Found ${actionFiles.size} Vuex store file(s) with actions`);
    }
    if (entriesAdded > 0) {
      diagnostics.push(`Linked ${entriesAdded} Vuex dispatch→action chain(s)`);
    }

    return { entriesAdded, diagnostics, unresolvedRefs };
  }
}
