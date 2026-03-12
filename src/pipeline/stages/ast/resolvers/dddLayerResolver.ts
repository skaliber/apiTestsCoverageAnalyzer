/**
 * DDD / CQRS / Hexagonal layer resolver (Feature 27, Sub-PR 5)
 *
 * Resolves DDD-structured Java projects without requiring @Service/@Repository annotations.
 * Detects:
 * 1. Repository interfaces (findBy*, save, delete methods)
 * 2. Interface → implementation mapping (implements InterfaceName)
 * 3. CQRS command/query handlers (execute/handle/apply taking *Command/*Query)
 * 4. Package-name layer hints (domain, application, infrastructure, adapter) as tie-breakers only
 */

import type {
  CrossFileResolver,
  CrossFileResolutionContext,
  CrossFileResolutionResult,
} from '../types';
import type { DetectedApiFramework } from '../../../../discovery/frameworkDetector';

export interface DddRepositoryInterface {
  interfaceName: string;
  methods: string[];
  sourceFile: string;
  line?: number;
}

export interface DddCqrsHandler {
  className: string;
  handlerType: 'command' | 'query' | 'event';
  handleMethodName: string;
  parameterType: string;
  sourceFile: string;
  line?: number;
}

export class DddLayerResolver implements CrossFileResolver {
  readonly name = 'ddd-layer';

  appliesTo(frameworks: DetectedApiFramework[]): boolean {
    return frameworks.some((f) =>
      f.name === 'spring-boot' || f.name === 'spring-graphql' || f.name === 'dgs-framework',
    );
  }

  resolve(ctx: CrossFileResolutionContext): CrossFileResolutionResult {
    let entriesAdded = 0;
    const diagnostics: string[] = [];
    const unresolvedRefs: Array<{ ref: string; reason: string }> = [];

    const repoInterfaces: DddRepositoryInterface[] = [];
    const cqrsHandlers: DddCqrsHandler[] = [];
    const implementations = new Map<string, string[]>();

    // ----- Detect from class registry and semantic models -----

    // 1. Detect repository interfaces from class registry
    for (const [className, classDecl] of ctx.symbolTable.classes) {
      const isRepoByName = /(?:Repository|Repo|Store|Gateway)$/.test(className);
      const repoMethods = classDecl.methods.filter(m =>
        /^(?:findBy\w+|find\w+|save|saveAll|delete|deleteById|existsBy\w+|countBy\w+|getBy\w+)$/.test(m),
      );

      if (isRepoByName && repoMethods.length > 0) {
        repoInterfaces.push({
          interfaceName: className,
          methods: repoMethods,
          sourceFile: classDecl.filePath,
          line: classDecl.line,
        });
      } else if (!isRepoByName && repoMethods.length >= 2) {
        // Generic interface with enough repository-like methods
        repoInterfaces.push({
          interfaceName: className,
          methods: repoMethods,
          sourceFile: classDecl.filePath,
          line: classDecl.line,
        });
      }
    }

    // 2. Detect CQRS handlers from class registry + semantic models
    for (const [className, classDecl] of ctx.symbolTable.classes) {
      const model = ctx.symbolTable.models.get(classDecl.filePath);
      if (!model) continue;

      for (const methodName of classDecl.methods) {
        if (methodName !== 'execute' && methodName !== 'handle' && methodName !== 'apply') continue;

        // Determine handler type from class name or method context
        let handlerType: 'command' | 'query' | 'event' = 'command';
        if (/Query/.test(className)) handlerType = 'query';
        else if (/Event/.test(className)) handlerType = 'event';

        // Try to get parameter type from the function's annotations or the class name
        const func = model.functions.get(methodName);
        let parameterType = `${className.replace(/Handler$/, '')}`;
        if (func?.annotations) {
          // Check for annotations that hint at the command/query type
          for (const ann of func.annotations) {
            const typeMatch = ann.match(/(\w+(?:Command|Query|Event))/);
            if (typeMatch) {
              parameterType = typeMatch[1];
              if (/Command$/.test(parameterType)) handlerType = 'command';
              else if (/Query$/.test(parameterType)) handlerType = 'query';
              else if (/Event$/.test(parameterType)) handlerType = 'event';
            }
          }
        }

        cqrsHandlers.push({
          className,
          handlerType,
          handleMethodName: methodName,
          parameterType,
          sourceFile: classDecl.filePath,
          line: classDecl.line,
        });
      }
    }

    // 3. Detect implements clauses from class registry (already parsed by tree-sitter)
    for (const [className, classDecl] of ctx.symbolTable.classes) {
      if (!classDecl.implementsInterfaces || classDecl.implementsInterfaces.length === 0) continue;
      for (const iface of classDecl.implementsInterfaces) {
        if (!implementations.has(iface)) {
          implementations.set(iface, []);
        }
        implementations.get(iface)!.push(className);
      }
    }

    // Map interface → implementation in symbolTable
    for (const [ifaceName, implNames] of implementations) {
      for (const implName of implNames) {
        const ifaceFile = findFileForClass(ifaceName, ctx);
        const implFile = findFileForClass(implName, ctx);

        if (ifaceFile && implFile) {
          if (!ctx.symbolTable.interfaceImplementations.has(ifaceFile)) {
            ctx.symbolTable.interfaceImplementations.set(ifaceFile, []);
          }
          ctx.symbolTable.interfaceImplementations.get(ifaceFile)!.push({
            interfaceName: ifaceName,
            interfaceFile: ifaceFile,
            implName,
            implFile,
          });
          entriesAdded++;
        } else if (!implFile) {
          unresolvedRefs.push({
            ref: implName,
            reason: `Implementation class '${implName}' not found in parsed models`,
          });
        }
      }
    }

    // Write repository interfaces into symbolTable (Section 5.3)
    for (const repo of repoInterfaces) {
      const key = repo.sourceFile;
      if (!ctx.symbolTable.interfaceImplementations.has(key)) {
        ctx.symbolTable.interfaceImplementations.set(key, []);
      }
      const existing = ctx.symbolTable.interfaceImplementations.get(key)!;
      const alreadyMapped = existing.some(e => e.interfaceName === repo.interfaceName);
      if (!alreadyMapped) {
        existing.push({
          interfaceName: repo.interfaceName,
          interfaceFile: repo.sourceFile,
          implName: '',
          implFile: '',
        });
        entriesAdded++;
      }
    }

    // Write CQRS handlers as service-layer entries into symbolTable (Section 5.2)
    for (const handler of cqrsHandlers) {
      const key = handler.sourceFile;
      if (!ctx.symbolTable.interfaceImplementations.has(key)) {
        ctx.symbolTable.interfaceImplementations.set(key, []);
      }
      ctx.symbolTable.interfaceImplementations.get(key)!.push({
        interfaceName: handler.parameterType,
        interfaceFile: handler.sourceFile,
        implName: handler.className,
        implFile: handler.sourceFile,
      });
      entriesAdded++;
    }

    if (repoInterfaces.length > 0) {
      diagnostics.push(`Found ${repoInterfaces.length} repository interface(s)`);
    }
    if (cqrsHandlers.length > 0) {
      diagnostics.push(`Found ${cqrsHandlers.length} CQRS handler(s)`);
    }
    if (implementations.size > 0) {
      diagnostics.push(`Found ${implementations.size} interface→implementation mapping(s)`);
    }

    return { entriesAdded, diagnostics, unresolvedRefs };
  }
}

/**
 * Detect repository interfaces: interfaces with findBy*, save, delete, etc.
 * No @Repository annotation required (RULE-SA03).
 */
export function detectRepositoryInterfaces(source: string, filePath: string): DddRepositoryInterface[] {
  const repos: DddRepositoryInterface[] = [];
  const lines = source.split('\n');

  // Find interfaces
  const interfacePattern = /(?:public\s+)?interface\s+(\w+(?:Repository|Repo|Store|Gateway))\b/;
  let currentInterface: DddRepositoryInterface | null = null;
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!currentInterface) {
      const match = line.match(interfacePattern);
      if (match) {
        currentInterface = {
          interfaceName: match[1],
          methods: [],
          sourceFile: filePath,
          line: i + 1,
        };
        braceDepth = 0;
      }
    }

    if (currentInterface) {
      braceDepth += (line.match(/\{/g) || []).length;
      braceDepth -= (line.match(/\}/g) || []).length;

      // Detect repository methods: findByX, save, delete, existsBy, countBy
      const methodMatch = line.match(/\b(findBy\w+|find\w+|save|saveAll|delete|deleteById|existsBy\w+|countBy\w+|getBy\w+)\s*\(/);
      if (methodMatch) {
        currentInterface.methods.push(methodMatch[1]);
      }

      if (braceDepth <= 0 && currentInterface.methods.length > 0) {
        repos.push(currentInterface);
        currentInterface = null;
      } else if (braceDepth <= 0) {
        currentInterface = null;
      }
    }
  }

  // Also detect interfaces with standard CRUD method signatures without naming convention
  const genericInterfacePattern = /(?:public\s+)?interface\s+(\w+)\b/g;
  let genMatch;
  while ((genMatch = genericInterfacePattern.exec(source)) !== null) {
    const name = genMatch[1];
    // Skip if already detected
    if (repos.some((r) => r.interfaceName === name)) continue;

    // Check if this interface has findBy, save, delete methods
    const startIdx = genMatch.index;
    const braceIdx = source.indexOf('{', startIdx);
    if (braceIdx < 0) continue;

    let depth = 1;
    let endIdx = braceIdx + 1;
    while (endIdx < source.length && depth > 0) {
      if (source[endIdx] === '{') depth++;
      if (source[endIdx] === '}') depth--;
      endIdx++;
    }

    const body = source.substring(braceIdx, endIdx);
    const methods: string[] = [];
    const repoMethodPattern = /\b(findBy\w+|save|delete|deleteById)\s*\(/g;
    let rm;
    while ((rm = repoMethodPattern.exec(body)) !== null) {
      methods.push(rm[1]);
    }

    if (methods.length >= 2) {
      const lineNum = source.substring(0, startIdx).split('\n').length;
      repos.push({ interfaceName: name, methods, sourceFile: filePath, line: lineNum });
    }
  }

  return repos;
}

/**
 * Detect CQRS command/query handlers.
 * Looks for classes with execute/handle/apply methods that take *Command/*Query parameters.
 */
export function detectCqrsHandlers(source: string, filePath: string): DddCqrsHandler[] {
  const handlers: DddCqrsHandler[] = [];
  const lines = source.split('\n');

  // Pattern: handle(CreateArticleCommand cmd)  or  execute(GetArticlesQuery query)
  const handlerMethodPattern = /(?:public\s+\S+\s+)?(execute|handle|apply)\s*\(\s*(\w+(Command|Query|Event))\s+\w+\s*\)/;

  // Find the enclosing class name
  let currentClass = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const classMatch = line.match(/class\s+(\w+)/);
    if (classMatch) {
      currentClass = classMatch[1];
    }

    const methodMatch = line.match(handlerMethodPattern);
    if (methodMatch && currentClass) {
      const handlerType = methodMatch[3].toLowerCase() as 'command' | 'query' | 'event';
      handlers.push({
        className: currentClass,
        handlerType,
        handleMethodName: methodMatch[1],
        parameterType: methodMatch[2],
        sourceFile: filePath,
        line: i + 1,
      });
    }
  }

  return handlers;
}

/**
 * Detect implements clauses from Java/Kotlin source.
 */
export function detectImplementsClauses(source: string, filePath: string): Array<[string, string]> {
  const impls: Array<[string, string]> = [];
  const pattern = /class\s+(\w+)(?:\s+extends\s+\w+)?\s+implements\s+([\w,\s]+)/g;

  let match;
  while ((match = pattern.exec(source)) !== null) {
    const className = match[1];
    const interfaces = match[2].split(',').map((s) => s.trim()).filter((s) => s.length > 0);
    for (const iface of interfaces) {
      impls.push([iface, className]);
    }
  }

  return impls;
}

function findFileForClass(className: string, ctx: CrossFileResolutionContext): string | undefined {
  // Search through exported symbols and class registry
  const classInfo = ctx.symbolTable.classes.get(className);
  if (classInfo) return classInfo.filePath;

  // Search through models for any mention
  for (const [filePath, model] of ctx.symbolTable.models) {
    if (model.functions.has(className)) return filePath;
  }

  return undefined;
}
