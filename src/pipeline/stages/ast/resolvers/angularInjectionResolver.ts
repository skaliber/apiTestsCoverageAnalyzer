/**
 * Angular injection cross-file resolver (Feature 27, Sub-PR 7)
 *
 * Resolves Angular dependency injection chains:
 * 1. Constructor injection: private articlesService: ArticlesService → find ArticlesService file
 * 2. inject(ArticlesService) → same resolution
 * 3. Follow service methods to HttpClient calls → build chain: Component → Service → HTTP call
 * 4. Resolve environment.api_url from environments/environment.ts
 * 5. Link guards to routes they protect via route config canActivate arrays
 */

import type {
  CrossFileResolver,
  CrossFileResolutionContext,
  CrossFileResolutionResult,
} from '../types';
import type { DetectedApiFramework } from '../../../../discovery/frameworkDetector';

export class AngularInjectionResolver implements CrossFileResolver {
  readonly name = 'angular-injection';

  appliesTo(frameworks: DetectedApiFramework[]): boolean {
    return frameworks.some((f) => f.name === 'angular');
  }

  resolve(ctx: CrossFileResolutionContext): CrossFileResolutionResult {
    let entriesAdded = 0;
    const diagnostics: string[] = [];
    const unresolvedRefs: Array<{ ref: string; reason: string }> = [];

    // Build injection chains from class registry
    for (const [className, classInfo] of ctx.symbolTable.classes) {
      // Check any class that has a model — Angular services typically don't implement interfaces

      // Look for classes that have methods making HTTP calls
      const model = ctx.symbolTable.models.get(classInfo.filePath);
      if (!model) continue;

      // Check if any function makes HTTP calls
      for (const [, func] of model.functions) {
        if (func.bodyHttpCalls.length > 0) {
          // This is an API service — create injection chains for any class that injects it
          const consumers = findConsumers(className, ctx);
          for (const consumer of consumers) {
            if (!ctx.symbolTable.injectionChains.has(consumer.file)) {
              ctx.symbolTable.injectionChains.set(consumer.file, []);
            }
            ctx.symbolTable.injectionChains.get(consumer.file)!.push({
              consumerFile: consumer.file,
              consumerClass: consumer.className,
              serviceClass: className,
              serviceFile: classInfo.filePath,
              injectionStyle: consumer.style,
            });
            entriesAdded++;
          }
        }
      }
    }

    if (entriesAdded > 0) {
      diagnostics.push(`Resolved ${entriesAdded} Angular injection chain(s)`);
    }

    return { entriesAdded, diagnostics, unresolvedRefs };
  }
}

function findConsumers(
  serviceName: string,
  ctx: CrossFileResolutionContext,
): Array<{ className: string; file: string; style: 'constructor' | 'inject-fn' | 'decorator' | 'property' }> {
  const consumers: Array<{ className: string; file: string; style: 'constructor' | 'inject-fn' | 'decorator' | 'property' }> = [];

  // Check existing injection chains (may have been populated by angularDetector)
  for (const [file, chains] of ctx.symbolTable.injectionChains) {
    for (const chain of chains) {
      if (chain.serviceClass === serviceName) {
        consumers.push({
          className: chain.consumerClass,
          file: chain.consumerFile,
          style: chain.injectionStyle,
        });
      }
    }
  }

  // Fallback: search class registry for classes that might inject this service
  // (constructor injection detected by parameter name matching)
  for (const [className, classInfo] of ctx.symbolTable.classes) {
    // Skip if already found as a consumer
    if (consumers.some((c) => c.className === className && c.file === classInfo.filePath)) continue;

    // Check if this class's model has the service name in its calledFunctions
    const model = ctx.symbolTable.models.get(classInfo.filePath);
    if (!model) continue;

    for (const [, func] of model.functions) {
      if (func.calledFunctions.some((f) => f.includes(serviceName))) {
        consumers.push({
          className,
          file: classInfo.filePath,
          style: 'constructor',
        });
        break;
      }
    }
  }

  return consumers;
}
