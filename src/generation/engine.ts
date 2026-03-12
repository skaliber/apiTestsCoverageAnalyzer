/**
 * Feature 28 — TestGenerationEngine
 * Main orchestrator for the test generation pipeline.
 *
 * Pipeline:
 *   GapList → GapClassifier → ContextBuilder → TemplateRenderer → FileRouter → FileWriter
 */

import * as fs from 'fs';
import * as path from 'path';
import { extractGapsFromReports } from './gap-extractor';
import { buildContext, type ProjectDiscoveryInfo } from './context-builder';
import { renderTemplate } from './template-renderer';
import { routeOutputFile, sortGapsByPriority } from './file-router';
import type {
  DetectedGap,
  GeneratedFile,
  GenerationOptions,
  GenerationResult,
  GapType,
  GapPriority,
  TestType,
  FileNamingConvention,
} from './types';

// ─── Priority ordering ────────────────────────────────────────────────────────

const PRIORITY_VALUES: Record<GapPriority, number> = {
  P0: 0, P1: 1, P2: 2, P3: 3, P4: 4, P5: 5,
};

function priorityGte(a: GapPriority, b: GapPriority): boolean {
  return PRIORITY_VALUES[a] <= PRIORITY_VALUES[b];
}

// ─── Gap → test type mapping (Section 1.1 of spec) ───────────────────────────

const GAP_GENERATOR_MAP: Record<GapType, TestType[]> = {
  endpoint: ['unit', 'integration', 'cypress'],
  parameter: ['unit', 'integration'],
  error: ['unit', 'integration'],
  business: ['unit', 'integration'],
  integration: ['integration', 'cypress'],
  security: ['security', 'unit'],
  auth: ['unit', 'integration', 'security'],
};

// ─── Discovery info loader ────────────────────────────────────────────────────

function loadDiscoveryInfo(reportsDir: string): ProjectDiscoveryInfo {
  const summaryPath = path.join(reportsDir, 'coverage-summary.json');
  if (fs.existsSync(summaryPath)) {
    try {
      const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8')) as {
        discoveryInfo?: Partial<ProjectDiscoveryInfo>;
        project?: { name?: string };
      };
      const di = summary.discoveryInfo ?? {};
      return {
        name: di.name ?? summary.project?.name ?? 'my-api',
        language: di.language ?? 'typescript',
        framework: di.framework ?? 'express',
        testFramework: di.testFramework ?? 'jest',
        baseUrl: 'http://localhost:3000',
        projectRoot: process.cwd(),
        appImportPath: di.appImportPath,
      };
    } catch {
      // Fall through to defaults
    }
  }

  return {
    name: 'my-api',
    language: 'typescript',
    framework: 'express',
    testFramework: 'jest',
    baseUrl: 'http://localhost:3000',
    projectRoot: process.cwd(),
  };
}

// ─── Engine ───────────────────────────────────────────────────────────────────

export class TestGenerationEngine {
  private discovery: ProjectDiscoveryInfo;

  constructor(private opts: GenerationOptions) {
    this.discovery = loadDiscoveryInfo(opts.reportsDir);

    // Override detection with CLI options
    if (opts.language) this.discovery.language = opts.language;
    if (opts.framework) this.discovery.framework = opts.framework;
  }

  async run(): Promise<GenerationResult> {
    const result: GenerationResult = {
      files: [],
      dryRun: this.opts.dryRun ?? false,
      totalGaps: 0,
      generatedCount: 0,
      skippedCount: 0,
      errors: [],
    };

    // 1. Extract gaps from reports
    let gaps = extractGapsFromReports(this.opts.reportsDir);

    // 2. Filter by specific gap ID if requested
    if (this.opts.gapId) {
      gaps = gaps.filter(g => g.id === this.opts.gapId);
    }

    // 3. Filter by priority
    const minPriority = this.opts.priority ?? 'P1';
    gaps = gaps.filter(g => priorityGte(g.priority, minPriority));

    // 4. Filter by type
    if (this.opts.types && this.opts.types.length > 0) {
      gaps = gaps.filter(g => this.opts.types!.includes(g.type));
    }

    // 5. Sort by priority (P0 first)
    gaps = sortGapsByPriority(gaps);

    result.totalGaps = gaps.length;

    // 6. Generate files for each gap
    for (const gap of gaps) {
      try {
        const generated = this.generateForGap(gap);
        for (const file of generated) {
          result.files.push(file);
          if (!this.opts.dryRun) {
            this.writeFile(file);
          }
          result.generatedCount++;
        }
      } catch (err) {
        result.errors.push({
          gapId: gap.id,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return result;
  }

  private generateForGap(gap: DetectedGap): GeneratedFile[] {
    const files: GeneratedFile[] = [];
    const testTypes = this.getTestTypes(gap);
    const language = this.discovery.language;
    const convention: FileNamingConvention = 'kebab';

    for (const testType of testTypes) {
      const outputPath = routeOutputFile(gap, testType, this.opts.outDir, language, convention);
      const ctx = buildContext(gap, outputPath, this.discovery);
      const content = renderTemplate(ctx, { language, testType });

      files.push({
        gapId: gap.id,
        filePath: path.resolve(outputPath),
        relativePath: outputPath,
        content,
        testType,
        language,
        framework: this.discovery.testFramework,
      });
    }

    return files;
  }

  private getTestTypes(gap: DetectedGap): TestType[] {
    let types = GAP_GENERATOR_MAP[gap.type] ?? ['unit'];

    // Apply exclusion flags
    if (this.opts.noSecurity) {
      types = types.filter(t => t !== 'security');
    }
    if (this.opts.noCypress) {
      types = types.filter(t => t !== 'cypress');
    }

    return types;
  }

  private writeFile(file: GeneratedFile): void {
    const dir = path.dirname(file.relativePath);
    fs.mkdirSync(dir, { recursive: true });

    if (fs.existsSync(file.relativePath) && !this.opts.overwrite) {
      return;
    }

    fs.writeFileSync(file.relativePath, file.content, 'utf8');
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function generateTests(opts: GenerationOptions): Promise<GenerationResult> {
  const engine = new TestGenerationEngine(opts);
  return engine.run();
}
