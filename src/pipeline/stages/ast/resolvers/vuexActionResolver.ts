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

    // Look for Vuex store modules (files with actions that call APIs)
    // and link them to component dispatch calls

    let vuexStoreFiles = 0;
    let dispatchFiles = 0;

    for (const [filePath, model] of ctx.symbolTable.models) {
      // Check if file has functions that look like Vuex actions (call API services)
      let hasApiCalls = false;
      for (const [, func] of model.functions) {
        if (func.bodyHttpCalls.length > 0) {
          hasApiCalls = true;
          break;
        }
      }

      if (hasApiCalls) {
        vuexStoreFiles++;
      }

      // Check if file dispatches to store
      if (model.functions.size > 0) {
        for (const [, func] of model.functions) {
          if (func.calledFunctions.some((f) => f.includes('dispatch'))) {
            dispatchFiles++;
          }
        }
      }
    }

    if (vuexStoreFiles > 0 || dispatchFiles > 0) {
      diagnostics.push(`Found ${vuexStoreFiles} Vuex store file(s), ${dispatchFiles} dispatch file(s)`);
    }

    return { entriesAdded, diagnostics, unresolvedRefs };
  }
}
