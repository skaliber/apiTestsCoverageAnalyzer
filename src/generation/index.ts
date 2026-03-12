/**
 * Feature 28 — Test Generation & Quality Intelligence Engine
 * Public API exports
 */

export { TestGenerationEngine, generateTests } from './engine';
export { scoreTests, scoreFile } from './quality-scorer';
export { exportAiFlows } from './ai-flow-exporter';
export type {
  DetectedGap,
  GeneratedFile,
  GenerationResult,
  GenerationOptions,
  TestQualityReport,
  FileQualityScore,
  AiReadyFlows,
  AiFlowGap,
  AiFlowExporterOptions,
  GenerationConfig,
  TestQualityConfig,
  AiFlowsConfig,
} from './types';
