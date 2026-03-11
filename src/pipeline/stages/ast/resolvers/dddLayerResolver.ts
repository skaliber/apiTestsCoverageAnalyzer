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

    for (const [filePath, model] of ctx.symbolTable.models) {
      const sourceText = getSourceText(filePath, ctx);
      if (!sourceText) continue;

      // Detect repository interfaces
      const repos = detectRepositoryInterfaces(sourceText, filePath);
      repoInterfaces.push(...repos);

      // Detect CQRS handlers
      const handlers = detectCqrsHandlers(sourceText, filePath);
      cqrsHandlers.push(...handlers);

      // Detect implements clauses
      const impls = detectImplementsClauses(sourceText, filePath);
      for (const [ifaceName, implName] of impls) {
        if (!implementations.has(ifaceName)) {
          implementations.set(ifaceName, []);
        }
        implementations.get(ifaceName)!.push(implName);
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

function getSourceText(filePath: string, ctx: CrossFileResolutionContext): string | undefined {
  // Try to get content from models (stored as raw source in semantic model)
  // For now, we scan from the model's functions and other extracted data
  // to detect patterns. In practice, we use regex on the raw source.

  // If the model has functions, we have some content available.
  const model = ctx.symbolTable.models.get(filePath);
  if (!model) return undefined;

  // We return a synthetic source text reconstructed from available data.
  // In a full implementation, we'd cache the raw source from the parse stage.
  // For now, return undefined to indicate we can't access raw source from the symbol table.
  return undefined;
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
