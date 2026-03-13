/**
 * Flask Blueprint cross-file resolver (Feature 27)
 *
 * Resolves Flask Blueprint route URLs across files by:
 * 1. Finding all Blueprint() constructor calls → blueprint registry
 * 2. Finding all app.register_blueprint() calls with url_prefix
 * 3. Matching blueprint vars across files via import resolution
 * 4. Composing final URL: url_prefix + route_path
 */

import type {
  CrossFileResolver,
  CrossFileResolutionContext,
  CrossFileResolutionResult,
  RouterMount,
} from '../types';
import type { DetectedApiFramework } from '../../../../discovery/frameworkDetector';
import type { RouteRegistration } from '../../../../ast/astTypes';

export class FlaskBlueprintResolver implements CrossFileResolver {
  readonly name = 'flask-blueprint';

  appliesTo(frameworks: DetectedApiFramework[]): boolean {
    return frameworks.some((f) => f.name === 'flask' || f.name === 'fastapi');
  }

  resolve(ctx: CrossFileResolutionContext): CrossFileResolutionResult {
    let entriesAdded = 0;
    const diagnostics: string[] = [];
    const unresolvedRefs: Array<{ ref: string; reason: string }> = [];

    // Step 1: Collect all Blueprint constructor calls (gives us var name → prefix mapping)
    const blueprintVars = new Map<string, { prefix: string; sourceFile: string; line?: number }>();

    // Step 2: Collect all register_blueprint calls (gives us mount points)
    const registerCalls: Array<{ targetVar: string; prefix: string; sourceFile: string; line?: number }> = [];

    // Step 3: Collect all route registrations
    const routesByRegistrar = new Map<string, RouteRegistration[]>();

    for (const [filePath, model] of ctx.symbolTable.models) {
      if (!model.routeRegistrations) continue;

      for (const reg of model.routeRegistrations) {
        // Blueprint constructor: bp = Blueprint('name', __name__, url_prefix='/api')
        if (!reg.targetModule && !reg.methods) {
          blueprintVars.set(reg.registrarName, {
            prefix: reg.path,
            sourceFile: filePath,
            line: reg.line,
          });
        }

        // register_blueprint call
        if (reg.targetModule) {
          registerCalls.push({
            targetVar: reg.targetModule,
            prefix: reg.path,
            sourceFile: filePath,
            line: reg.line,
          });
        }

        // Route registration (@blueprint.route)
        if (reg.methods) {
          if (!routesByRegistrar.has(reg.registrarName)) {
            routesByRegistrar.set(reg.registrarName, []);
          }
          routesByRegistrar.get(reg.registrarName)!.push(reg);
        }
      }
    }

    // Step 4: Compose router mounts from register_blueprint calls
    for (const call of registerCalls) {
      // Try to find the Blueprint variable
      const bp = blueprintVars.get(call.targetVar);
      // The final prefix is: register_blueprint url_prefix overrides Blueprint url_prefix
      const finalPrefix = call.prefix || bp?.prefix || '';

      if (finalPrefix) {
        const sourceFile = call.sourceFile;
        if (!ctx.symbolTable.routerMounts.has(sourceFile)) {
          ctx.symbolTable.routerMounts.set(sourceFile, []);
        }
        ctx.symbolTable.routerMounts.get(sourceFile)!.push({
          prefix: finalPrefix,
          targetModulePath: bp?.sourceFile ?? call.targetVar,
          middleware: [],
          sourceFile,
          line: call.line,
        });
        entriesAdded++;
      } else if (!bp) {
        unresolvedRefs.push({
          ref: call.targetVar,
          reason: `Blueprint variable '${call.targetVar}' not found in parsed models`,
        });
      }
    }

    // Step 5: For blueprints with inline url_prefix in the constructor,
    // add them as router mounts even without register_blueprint
    for (const [varName, bp] of blueprintVars) {
      if (bp.prefix) {
        const alreadyRegistered = registerCalls.some((c) => c.targetVar === varName);
        if (!alreadyRegistered) {
          if (!ctx.symbolTable.routerMounts.has(bp.sourceFile)) {
            ctx.symbolTable.routerMounts.set(bp.sourceFile, []);
          }
          ctx.symbolTable.routerMounts.get(bp.sourceFile)!.push({
            prefix: bp.prefix,
            targetModulePath: bp.sourceFile,
            middleware: [],
            sourceFile: bp.sourceFile,
            line: bp.line,
          });
          entriesAdded++;
        }
      }
    }

    if (blueprintVars.size > 0) {
      diagnostics.push(`Found ${blueprintVars.size} Blueprint(s), ${registerCalls.length} register_blueprint() call(s)`);
    }

    return { entriesAdded, diagnostics, unresolvedRefs };
  }
}
