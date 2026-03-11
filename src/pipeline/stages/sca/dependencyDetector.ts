/**
 * Dependency detector — parses manifest files to extract dependency names and versions.
 *
 * Supports:
 * - package.json (JavaScript/TypeScript)
 * - pom.xml (Java/Kotlin Maven)
 * - build.gradle / build.gradle.kts (Java/Kotlin Gradle)
 * - requirements.txt (Python)
 * - pyproject.toml (Python)
 * - Pipfile (Python)
 * - Gemfile (Ruby)
 * - go.mod (Go)
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ParsedDependency, DependencyParseResult } from './types';

/** Manifest file names this detector handles. */
export const MANIFEST_FILES = [
  'package.json',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'requirements.txt',
  'pyproject.toml',
  'Pipfile',
  'Gemfile',
  'go.mod',
] as const;

/**
 * Scan a project root for manifest files and parse all dependencies.
 */
export function detectDependencies(projectRoot: string): DependencyParseResult {
  const dependencies: ParsedDependency[] = [];
  const manifestFiles: string[] = [];

  for (const manifest of MANIFEST_FILES) {
    const fullPath = path.join(projectRoot, manifest);
    if (!fs.existsSync(fullPath)) continue;

    manifestFiles.push(manifest);
    let content: string;
    try {
      content = fs.readFileSync(fullPath, 'utf-8');
    } catch {
      continue;
    }

    const parsed = parseManifest(manifest, content, manifest);
    dependencies.push(...parsed);
  }

  return { dependencies, manifestFiles };
}

/**
 * Parse a single manifest file and return dependency entries.
 */
export function parseManifest(
  fileName: string,
  content: string,
  sourceFile: string,
): ParsedDependency[] {
  const base = path.basename(fileName);

  switch (base) {
    case 'package.json':
      return parsePackageJson(content, sourceFile);
    case 'pom.xml':
      return parsePomXml(content, sourceFile);
    case 'build.gradle':
    case 'build.gradle.kts':
      return parseBuildGradle(content, sourceFile);
    case 'requirements.txt':
      return parseRequirementsTxt(content, sourceFile);
    case 'pyproject.toml':
      return parsePyprojectToml(content, sourceFile);
    case 'Pipfile':
      return parsePipfile(content, sourceFile);
    case 'Gemfile':
      return parseGemfile(content, sourceFile);
    case 'go.mod':
      return parseGoMod(content, sourceFile);
    default:
      return [];
  }
}

// ─── package.json ───────────────────────────────────────────────────────────

function parsePackageJson(content: string, sourceFile: string): ParsedDependency[] {
  const deps: ParsedDependency[] = [];
  let pkg: Record<string, unknown>;

  try {
    pkg = JSON.parse(content);
  } catch {
    return deps;
  }

  const sections: Array<{ key: string; scope: ParsedDependency['scope'] }> = [
    { key: 'dependencies', scope: 'production' },
    { key: 'devDependencies', scope: 'development' },
    { key: 'peerDependencies', scope: 'production' },
    { key: 'optionalDependencies', scope: 'production' },
  ];

  for (const { key, scope } of sections) {
    const section = pkg[key] as Record<string, string> | undefined;
    if (!section || typeof section !== 'object') continue;

    for (const [name, version] of Object.entries(section)) {
      if (typeof version === 'string') {
        deps.push({ name, version, scope, sourceFile });
      }
    }
  }

  return deps;
}

// ─── pom.xml ────────────────────────────────────────────────────────────────

function parsePomXml(content: string, sourceFile: string): ParsedDependency[] {
  const deps: ParsedDependency[] = [];

  // Extract dependencies using regex (avoids XML parser dependency)
  const depBlockRegex = /<dependency>([\s\S]*?)<\/dependency>/g;
  let match: RegExpExecArray | null;

  while ((match = depBlockRegex.exec(content)) !== null) {
    const block = match[1];

    const groupId = extractXmlTag(block, 'groupId');
    const artifactId = extractXmlTag(block, 'artifactId');
    const version = extractXmlTag(block, 'version') ?? 'managed';
    const scopeTag = extractXmlTag(block, 'scope');

    if (!artifactId) continue;

    const name = groupId ? `${groupId}:${artifactId}` : artifactId;
    const scope = mapMavenScope(scopeTag);

    deps.push({ name, version, scope, sourceFile });
  }

  return deps;
}

function extractXmlTag(xml: string, tag: string): string | undefined {
  const regex = new RegExp(`<${tag}>\\s*([^<]+?)\\s*</${tag}>`);
  const match = regex.exec(xml);
  return match?.[1];
}

function mapMavenScope(scope: string | undefined): ParsedDependency['scope'] {
  switch (scope) {
    case 'test':
      return 'test';
    case 'provided':
    case 'compile':
    case 'runtime':
      return 'production';
    case 'system':
    case 'import':
      return 'build';
    default:
      return 'production'; // Maven default is compile
  }
}

// ─── build.gradle / build.gradle.kts ────────────────────────────────────────

function parseBuildGradle(content: string, sourceFile: string): ParsedDependency[] {
  const deps: ParsedDependency[] = [];

  // Match patterns like:
  //   implementation 'group:artifact:version'
  //   implementation "group:artifact:version"
  //   testImplementation("group:artifact:version")
  //   api "group:artifact:version"
  const depRegex =
    /(?:implementation|testImplementation|testRuntimeOnly|runtimeOnly|compileOnly|api|annotationProcessor|kapt)\s*[\(]?\s*['"]([\w./-]+):([\w./-]+)(?::([\w.+\-]+))?['"]\s*[\)]?/g;
  let match: RegExpExecArray | null;

  while ((match = depRegex.exec(content)) !== null) {
    const group = match[1];
    const artifact = match[2];
    const version = match[3] ?? 'unspecified';
    const line = content.substring(0, match.index).split('\n').length - 1;
    const configLine = content.split('\n')[line] ?? '';

    const name = `${group}:${artifact}`;
    const scope = mapGradleScope(configLine);

    deps.push({ name, version, scope, sourceFile });
  }

  return deps;
}

function mapGradleScope(line: string): ParsedDependency['scope'] {
  const trimmed = line.trim();
  if (trimmed.startsWith('testImplementation') || trimmed.startsWith('testRuntimeOnly')) {
    return 'test';
  }
  if (trimmed.startsWith('annotationProcessor') || trimmed.startsWith('kapt')) {
    return 'build';
  }
  return 'production';
}

// ─── requirements.txt ───────────────────────────────────────────────────────

function parseRequirementsTxt(content: string, sourceFile: string): ParsedDependency[] {
  const deps: ParsedDependency[] = [];

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    // Skip comments, empty lines, -r/-e/--flags
    if (!line || line.startsWith('#') || line.startsWith('-')) continue;

    // Handle extras: package[extra1,extra2]
    // Match: package==version, package>=version, package~=version, package (no version)
    const match = /^([a-zA-Z0-9_][a-zA-Z0-9_.+-]*)(?:\[[^\]]*\])?\s*(?:([=><~!]+)\s*(.+))?$/.exec(line);
    if (!match) continue;

    const name = match[1];
    const version = match[3] ?? 'unspecified';

    deps.push({ name, version, scope: 'unknown', sourceFile });
  }

  return deps;
}

// ─── pyproject.toml ─────────────────────────────────────────────────────────

function parsePyprojectToml(content: string, sourceFile: string): ParsedDependency[] {
  const deps: ParsedDependency[] = [];

  // Extract [project.dependencies] section
  const projectDepsMatch = /\[project\]\s[\s\S]*?dependencies\s*=\s*\[([\s\S]*?)\]/m.exec(content);
  if (projectDepsMatch) {
    parsePyprojectDependencyArray(projectDepsMatch[1], 'production', sourceFile, deps);
  }

  // Extract [project.optional-dependencies] sections
  const optionalMatch = /\[project\.optional-dependencies\]\s*([\s\S]*?)(?=\n\[|\n$|$)/m.exec(content);
  if (optionalMatch) {
    const block = optionalMatch[1];
    const sectionRegex = /(\w+)\s*=\s*\[([\s\S]*?)\]/g;
    let sMatch: RegExpExecArray | null;
    while ((sMatch = sectionRegex.exec(block)) !== null) {
      const sectionName = sMatch[1].toLowerCase();
      const scope: ParsedDependency['scope'] =
        sectionName === 'dev' || sectionName === 'test' || sectionName === 'testing'
          ? 'development'
          : 'production';
      parsePyprojectDependencyArray(sMatch[2], scope, sourceFile, deps);
    }
  }

  // Also try [tool.poetry.dependencies] for Poetry projects
  const poetryDepsMatch = /\[tool\.poetry\.dependencies\]\s*([\s\S]*?)(?=\n\[|\n$|$)/m.exec(content);
  if (poetryDepsMatch) {
    parseTomlDependencyBlock(poetryDepsMatch[1], 'production', sourceFile, deps);
  }

  const poetryDevMatch = /\[tool\.poetry\.(?:dev-dependencies|group\.dev\.dependencies)\]\s*([\s\S]*?)(?=\n\[|\n$|$)/m.exec(content);
  if (poetryDevMatch) {
    parseTomlDependencyBlock(poetryDevMatch[1], 'development', sourceFile, deps);
  }

  return deps;
}

function parsePyprojectDependencyArray(
  block: string,
  scope: ParsedDependency['scope'],
  sourceFile: string,
  deps: ParsedDependency[],
): void {
  // Lines look like: "requests>=2.20", "fastapi~=0.100"
  const lineRegex = /["']([a-zA-Z0-9_][a-zA-Z0-9_.+-]*)(?:\[[^\]]*\])?\s*(?:([=><~!]+)\s*([^"']+))?["']/g;
  let match: RegExpExecArray | null;
  while ((match = lineRegex.exec(block)) !== null) {
    deps.push({
      name: match[1],
      version: match[3] ?? 'unspecified',
      scope,
      sourceFile,
    });
  }
}

function parseTomlDependencyBlock(
  block: string,
  scope: ParsedDependency['scope'],
  sourceFile: string,
  deps: ParsedDependency[],
): void {
  // Lines look like: flask = "^2.0" or requests = {version = ">=2.20", optional = true}
  for (const line of block.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('[')) continue;

    const kvMatch = /^([a-zA-Z0-9_][a-zA-Z0-9_.-]*)\s*=\s*(.+)$/.exec(trimmed);
    if (!kvMatch) continue;

    const name = kvMatch[1];
    if (name.toLowerCase() === 'python') continue; // Skip python version spec

    const valueStr = kvMatch[2].trim();
    let version = 'unspecified';

    if (valueStr.startsWith('"') || valueStr.startsWith("'")) {
      // Simple version string
      version = valueStr.replace(/["']/g, '');
    } else if (valueStr.startsWith('{')) {
      // Table form: {version = ">=2.0", ...}
      const versionMatch = /version\s*=\s*["']([^"']+)["']/.exec(valueStr);
      if (versionMatch) version = versionMatch[1];
    }

    deps.push({ name, version, scope, sourceFile });
  }
}

// ─── Pipfile ─────────────────────────────────────────────────────────────────

function parsePipfile(content: string, sourceFile: string): ParsedDependency[] {
  const deps: ParsedDependency[] = [];

  // Parse [packages] and [dev-packages] sections
  const sections: Array<{ regex: RegExp; scope: ParsedDependency['scope'] }> = [
    { regex: /\[packages\]\s*([\s\S]*?)(?=\n\[|\n$|$)/m, scope: 'production' },
    { regex: /\[dev-packages\]\s*([\s\S]*?)(?=\n\[|\n$|$)/m, scope: 'development' },
  ];

  for (const { regex, scope } of sections) {
    const match = regex.exec(content);
    if (!match) continue;

    for (const line of match[1].split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('[')) continue;

      const kvMatch = /^([a-zA-Z0-9_][a-zA-Z0-9_.-]*)\s*=\s*(.+)$/.exec(trimmed);
      if (!kvMatch) continue;

      const name = kvMatch[1];
      const valueStr = kvMatch[2].trim();
      let version = '*';

      if (valueStr.startsWith('"') || valueStr.startsWith("'")) {
        version = valueStr.replace(/["']/g, '');
      } else if (valueStr.startsWith('{')) {
        const versionMatch = /version\s*=\s*["']([^"']+)["']/.exec(valueStr);
        if (versionMatch) version = versionMatch[1];
      }

      deps.push({ name, version, scope, sourceFile });
    }
  }

  return deps;
}

// ─── Gemfile ────────────────────────────────────────────────────────────────

function parseGemfile(content: string, sourceFile: string): ParsedDependency[] {
  const deps: ParsedDependency[] = [];
  let currentGroup: ParsedDependency['scope'] = 'production';

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    // Track group blocks: group :development do ... end
    const groupMatch = /^group\s+:(\w+)/.exec(line);
    if (groupMatch) {
      const group = groupMatch[1];
      currentGroup =
        group === 'development' || group === 'test' ? 'development' : 'production';
      continue;
    }
    if (line === 'end') {
      currentGroup = 'production';
      continue;
    }

    // Match: gem 'name', '~> version'
    const gemMatch = /^gem\s+['"]([a-zA-Z0-9_.-]+)['"](?:\s*,\s*['"]([^'"]+)['"])?/.exec(line);
    if (!gemMatch) continue;

    deps.push({
      name: gemMatch[1],
      version: gemMatch[2] ?? '*',
      scope: currentGroup,
      sourceFile,
    });
  }

  return deps;
}

// ─── go.mod ─────────────────────────────────────────────────────────────────

function parseGoMod(content: string, sourceFile: string): ParsedDependency[] {
  const deps: ParsedDependency[] = [];

  // Match require block: require ( ... )
  const requireBlockRegex = /require\s*\(([\s\S]*?)\)/g;
  let blockMatch: RegExpExecArray | null;

  while ((blockMatch = requireBlockRegex.exec(content)) !== null) {
    const block = blockMatch[1];
    for (const line of block.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//')) continue;

      const parts = trimmed.split(/\s+/);
      if (parts.length >= 2) {
        deps.push({
          name: parts[0],
          version: parts[1],
          scope: 'production',
          sourceFile,
        });
      }
    }
  }

  // Match single-line require: require module/path v1.2.3
  const singleRegex = /^require\s+(\S+)\s+(\S+)/gm;
  let singleMatch: RegExpExecArray | null;
  while ((singleMatch = singleRegex.exec(content)) !== null) {
    deps.push({
      name: singleMatch[1],
      version: singleMatch[2],
      scope: 'production',
      sourceFile,
    });
  }

  return deps;
}
