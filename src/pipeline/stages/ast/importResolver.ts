/**
 * Import resolver — resolves import paths to absolute file paths.
 *
 * Supports:
 * - TypeScript/JavaScript: relative paths, index files, .ts/.js extension resolution
 * - Java: package-based imports to file paths
 * - Kotlin: same as Java
 * - Python: relative and absolute module imports
 * - Ruby: require/require_relative
 */

import * as path from 'path';
import * as fs from 'fs';
import type { SupportedLanguage } from '../../../ast/astTypes';

/**
 * Resolve an import source to an absolute file path.
 *
 * @param importSource - The import specifier (e.g. './utils', 'express', 'com.example.Service')
 * @param fromFile - The absolute path of the file containing the import
 * @param projectRoot - The project root directory
 * @param language - The language of the importing file
 * @returns The resolved absolute file path, or undefined if unresolvable
 */
export function resolveImportPath(
  importSource: string,
  fromFile: string,
  projectRoot: string,
  language: SupportedLanguage,
): string | undefined {
  switch (language) {
    case 'typescript':
    case 'javascript':
      return resolveJsTsImport(importSource, fromFile, projectRoot);
    case 'java':
    case 'kotlin':
      return resolveJavaKotlinImport(importSource, fromFile, projectRoot, language);
    case 'python':
      return resolvePythonImport(importSource, fromFile, projectRoot);
    case 'ruby':
      return resolveRubyImport(importSource, fromFile, projectRoot);
    default:
      return undefined;
  }
}

// ─── JS/TS Import Resolution ─────────────────────────────────────────────────

const JS_TS_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

function resolveJsTsImport(
  importSource: string,
  fromFile: string,
  projectRoot: string,
): string | undefined {
  // Skip bare module specifiers (node_modules packages)
  if (!importSource.startsWith('.') && !importSource.startsWith('/')) {
    return undefined;
  }

  const fromDir = path.dirname(fromFile);
  const basePath = path.resolve(fromDir, importSource);

  // Try exact match first
  if (existsAsFile(basePath)) return basePath;

  // Try with extensions
  for (const ext of JS_TS_EXTENSIONS) {
    const withExt = basePath + ext;
    if (existsAsFile(withExt)) return withExt;
  }

  // Try as directory with index file
  for (const ext of JS_TS_EXTENSIONS) {
    const indexFile = path.join(basePath, `index${ext}`);
    if (existsAsFile(indexFile)) return indexFile;
  }

  return undefined;
}

// ─── Java/Kotlin Import Resolution ───────────────────────────────────────────

function resolveJavaKotlinImport(
  importSource: string,
  _fromFile: string,
  projectRoot: string,
  language: 'java' | 'kotlin',
): string | undefined {
  // Java import: com.example.service.UserService → src/main/java/com/example/service/UserService.java
  // Handle wildcard imports: com.example.service.* → directory
  const cleanImport = importSource.replace(/\.\*$/, '');
  const pathParts = cleanImport.split('.');

  const extensions = language === 'kotlin' ? ['.kt', '.kts', '.java'] : ['.java', '.kt'];
  const sourceDirs = ['src/main/java', 'src/main/kotlin', 'src/test/java', 'src/test/kotlin', 'src'];

  for (const sourceDir of sourceDirs) {
    for (const ext of extensions) {
      const filePath = path.join(projectRoot, sourceDir, ...pathParts) + ext;
      if (existsAsFile(filePath)) return filePath;
    }
  }

  return undefined;
}

// ─── Python Import Resolution ────────────────────────────────────────────────

function resolvePythonImport(
  importSource: string,
  fromFile: string,
  projectRoot: string,
): string | undefined {
  // Relative import: .utils or ..models
  const dotMatch = /^(\.+)(.*)$/.exec(importSource);
  if (dotMatch) {
    const dots = dotMatch[1].length;
    const rest = dotMatch[2];
    let baseDir = path.dirname(fromFile);
    for (let i = 1; i < dots; i++) {
      baseDir = path.dirname(baseDir);
    }
    const parts = rest ? rest.split('.') : [];
    return resolvePythonPath(path.join(baseDir, ...parts));
  }

  // Absolute import: package.module
  const parts = importSource.split('.');

  // Try from project root and common source directories
  const searchDirs = [projectRoot, path.join(projectRoot, 'src'), path.join(projectRoot, 'tests')];
  for (const dir of searchDirs) {
    const result = resolvePythonPath(path.join(dir, ...parts));
    if (result) return result;
  }

  return undefined;
}

function resolvePythonPath(basePath: string): string | undefined {
  // Try as .py file
  const asFile = basePath + '.py';
  if (existsAsFile(asFile)) return asFile;

  // Try as package (__init__.py)
  const asPackage = path.join(basePath, '__init__.py');
  if (existsAsFile(asPackage)) return asPackage;

  return undefined;
}

// ─── Ruby Import Resolution ─────────────────────────────────────────────────

function resolveRubyImport(
  importSource: string,
  fromFile: string,
  projectRoot: string,
): string | undefined {
  // require_relative './utils' → relative to current file
  // require 'app/models/user' → relative to project root / lib

  if (importSource.startsWith('.')) {
    const fromDir = path.dirname(fromFile);
    const basePath = path.resolve(fromDir, importSource);
    return tryRubyExtensions(basePath);
  }

  const searchDirs = [projectRoot, path.join(projectRoot, 'lib'), path.join(projectRoot, 'app')];
  for (const dir of searchDirs) {
    const result = tryRubyExtensions(path.join(dir, importSource));
    if (result) return result;
  }

  return undefined;
}

function tryRubyExtensions(basePath: string): string | undefined {
  if (existsAsFile(basePath)) return basePath;
  const withRb = basePath + '.rb';
  if (existsAsFile(withRb)) return withRb;
  return undefined;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function existsAsFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}
