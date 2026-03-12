/**
 * Feature 28 — Tests for AiFlowExporter
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exportAiFlows } from '../../src/generation/ai-flow-exporter';

describe('AiFlowExporter', () => {
  let tmpDir: string;
  let reportsDir: string;
  let outDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-flow-test-'));
    reportsDir = path.join(tmpDir, 'reports');
    outDir = path.join(tmpDir, 'output');
    fs.mkdirSync(reportsDir, { recursive: true });
    fs.mkdirSync(outDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should produce ai-ready-flows.json when format is json', async () => {
    const result = await exportAiFlows({
      reportsDir,
      outDir,
      format: 'json',
    });

    expect(fs.existsSync(path.join(outDir, 'ai-ready-flows.json'))).toBe(true);
    expect(result.gaps.length).toBeGreaterThan(0);
  });

  it('should produce ai-ready-flows.md when format is markdown', async () => {
    await exportAiFlows({
      reportsDir,
      outDir,
      format: 'markdown',
    });

    expect(fs.existsSync(path.join(outDir, 'ai-ready-flows.md'))).toBe(true);
  });

  it('should produce both files when format is both', async () => {
    await exportAiFlows({
      reportsDir,
      outDir,
      format: 'both',
    });

    expect(fs.existsSync(path.join(outDir, 'ai-ready-flows.json'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'ai-ready-flows.md'))).toBe(true);
  });

  it('should include copilotPrompt for every gap (RULE-AI03)', async () => {
    const result = await exportAiFlows({
      reportsDir,
      outDir,
      format: 'json',
    });

    for (const gap of result.gaps) {
      expect(typeof gap.copilotPrompt).toBe('string');
      expect(gap.copilotPrompt.length).toBeGreaterThan(0);
    }
  });

  it('should include suggestedOutputPath for every gap (RULE-AI01)', async () => {
    const result = await exportAiFlows({
      reportsDir,
      outDir,
      format: 'json',
    });

    for (const gap of result.gaps) {
      expect(typeof gap.suggestedOutputPath).toBe('string');
      expect(gap.suggestedOutputPath).not.toBe('');
    }
  });

  it('should respect maxGaps limit', async () => {
    const result = await exportAiFlows({
      reportsDir,
      outDir,
      format: 'json',
      maxGaps: 1,
    });

    expect(result.gaps.length).toBeLessThanOrEqual(1);
  });

  it('should include project metadata', async () => {
    const result = await exportAiFlows({
      reportsDir,
      outDir,
      format: 'json',
    });

    expect(result.project).toBeDefined();
    expect(typeof result.project.name).toBe('string');
    expect(result.project.name.length).toBeGreaterThan(0);
    expect(typeof result.project.language).toBe('string');
    expect(typeof result.project.testFramework).toBe('string');
  });

  it('should have generatedAt timestamp', async () => {
    const result = await exportAiFlows({
      reportsDir,
      outDir,
      format: 'json',
    });

    expect(typeof result.generatedAt).toBe('string');
    expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(new Date(result.generatedAt).getTime()).not.toBeNaN();
  });

  it('should keep copilotPrompt under 3200 chars (~800 tokens)', async () => {
    const result = await exportAiFlows({
      reportsDir,
      outDir,
      format: 'json',
    });

    for (const gap of result.gaps) {
      expect(gap.copilotPrompt.length).toBeLessThanOrEqual(3200);
    }
  });

  it('should produce valid JSON in ai-ready-flows.json', async () => {
    await exportAiFlows({
      reportsDir,
      outDir,
      format: 'json',
    });

    const rawJson = fs.readFileSync(path.join(outDir, 'ai-ready-flows.json'), 'utf8');

    expect(() => JSON.parse(rawJson)).not.toThrow();

    const parsed = JSON.parse(rawJson) as { generatedAt: string; project: unknown; gaps: unknown[] };
    expect(parsed).toHaveProperty('generatedAt');
    expect(parsed).toHaveProperty('project');
    expect(parsed).toHaveProperty('gaps');
    expect(Array.isArray(parsed.gaps)).toBe(true);
  });
});
