/**
 * Express router cross-file resolver (Feature 27, Sub-PR 6)
 *
 * Resolves Express `app.use('/prefix', router)` mount paths across files:
 * 1. Find all app.use('/path', require('./routes')) calls → mount registry
 * 2. Follow require('./routes') to resolve sub-router files
 * 3. Propagate auth middleware through nested routers
 * 4. Build complete URL: base mount + sub-router mount + route path
 */

import type {
  CrossFileResolver,
  CrossFileResolutionContext,
  CrossFileResolutionResult,
} from '../types';
import type { DetectedApiFramework } from '../../../../discovery/frameworkDetector';

export class ExpressRouterResolver implements CrossFileResolver {
  readonly name = 'express-router';

  appliesTo(frameworks: DetectedApiFramework[]): boolean {
    return frameworks.some((f) =>
      f.name === 'express' || f.name === 'nestjs' || f.name === 'koa' || f.name === 'fastify',
    );
  }

  resolve(ctx: CrossFileResolutionContext): CrossFileResolutionResult {
    let entriesAdded = 0;
    const diagnostics: string[] = [];
    const unresolvedRefs: Array<{ ref: string; reason: string }> = [];

    // Scan models for Express router mount patterns
    for (const [filePath, model] of ctx.symbolTable.models) {
      if (!model.routeRegistrations) continue;

      for (const reg of model.routeRegistrations) {
        // app.use('/prefix', require('./router'))
        if (reg.targetModule && reg.path) {
          if (!ctx.symbolTable.routerMounts.has(filePath)) {
            ctx.symbolTable.routerMounts.set(filePath, []);
          }

          ctx.symbolTable.routerMounts.get(filePath)!.push({
            prefix: reg.path,
            targetModulePath: reg.targetModule,
            middleware: [],
            sourceFile: filePath,
            line: reg.line,
          });
          entriesAdded++;
        }
      }
    }

    // Propagate middleware from router mounts to sub-routes
    for (const [filePath, mounts] of ctx.symbolTable.routerMounts) {
      for (const mount of mounts) {
        // Check if auth middleware is applied to this mount
        const middleware = ctx.symbolTable.middlewareInheritance.get(filePath);
        if (middleware) {
          for (const mw of middleware) {
            if (mw.appliedTo === 'router') {
              mount.middleware.push(mw);
            }
          }
        }
      }
    }

    if (entriesAdded > 0) {
      diagnostics.push(`Resolved ${entriesAdded} Express router mount(s)`);
    }

    return { entriesAdded, diagnostics, unresolvedRefs };
  }
}
