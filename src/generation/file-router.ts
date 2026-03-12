/**
 * Feature 28 — FileRouter
 * Determines output file paths for generated test files.
 */

import * as path from 'path';
import type { DetectedGap, TestType, FileNamingConvention } from './types';

const PRIORITY_ORDER: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4, P5: 5 };

function toKebab(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function toCamel(s: string): string {
  return toKebab(s)
    .split('-')
    .map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join('');
}

function toSnake(s: string): string {
  return toKebab(s).replace(/-/g, '_');
}

function applyNaming(name: string, convention: FileNamingConvention): string {
  switch (convention) {
    case 'camelCase': return toCamel(name);
    case 'snake_case': return toSnake(name);
    case 'kebab':
    default: return toKebab(name);
  }
}

function pathToFileName(method: string, apiPath: string, convention: FileNamingConvention): string {
  const parts = apiPath
    .split('/')
    .filter(Boolean)
    .map(p => p.replace(/[{}]/g, '').replace(/[^a-zA-Z0-9]/g, '-'));
  const base = [...parts, method.toLowerCase()].join('-');
  return applyNaming(base, convention);
}

export function routeOutputFile(
  gap: DetectedGap,
  testType: TestType,
  outDir: string,
  language: string,
  convention: FileNamingConvention = 'kebab',
): string {
  const method = gap.endpoint.method.toLowerCase();
  const apiPath = gap.endpoint.path;
  const baseName = pathToFileName(method, apiPath, convention);

  switch (testType) {
    case 'security':
      return path.join(outDir, 'security', `${baseName}.security.test.ts`);
    case 'cypress':
      return path.join('cypress', 'e2e', 'generated', `${baseName}.cy.js`);
    case 'integration':
      if (gap.flow) {
        const flowName = applyNaming(gap.flow.name, convention);
        return path.join(outDir, 'flows', `${flowName}.flow.test.ts`);
      }
      return path.join(outDir, `${baseName}.integration.test.ts`);
    case 'unit':
    default:
      return path.join(outDir, `${baseName}.test.ts`);
  }
}

export function sortGapsByPriority(gaps: DetectedGap[]): DetectedGap[] {
  return [...gaps].sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99));
}
