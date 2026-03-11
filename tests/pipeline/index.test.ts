import * as pipeline from '../../src/pipeline/index';

describe('pipeline barrel export', () => {
  it('exports runPipeline function', () => {
    expect(pipeline.runPipeline).toBeInstanceOf(Function);
  });

  it('exports createPipelineContext function', () => {
    expect(pipeline.createPipelineContext).toBeInstanceOf(Function);
  });

  it('exports CoverageKnowledgeGraph class', () => {
    expect(pipeline.CoverageKnowledgeGraph).toBeInstanceOf(Function);
  });

  it('exports confidence functions', () => {
    expect(pipeline.computeConfidence).toBeInstanceOf(Function);
    expect(pipeline.computeBaseConfidence).toBeInstanceOf(Function);
    expect(pipeline.applyConfidenceCaps).toBeInstanceOf(Function);
    expect(pipeline.capConfidence).toBeInstanceOf(Function);
    expect(pipeline.compareConfidence).toBeInstanceOf(Function);
    expect(pipeline.minConfidence).toBeInstanceOf(Function);
    expect(pipeline.hasMockBoundaryOnPath).toBeInstanceOf(Function);
    expect(pipeline.hasPartialResolution).toBeInstanceOf(Function);
    expect(pipeline.buildConfidenceEvidence).toBeInstanceOf(Function);
  });

  it('exports stage classes', () => {
    expect(pipeline.ScaStage).toBeInstanceOf(Function);
    expect(pipeline.AstStage).toBeInstanceOf(Function);
    expect(pipeline.TiaStage).toBeInstanceOf(Function);
    expect(pipeline.IastStage).toBeInstanceOf(Function);
    expect(pipeline.DastStage).toBeInstanceOf(Function);
    expect(pipeline.MergeStage).toBeInstanceOf(Function);
  });

  it('exports DEFAULT_PIPELINE_CONFIG with correct default values', () => {
    expect(pipeline.DEFAULT_PIPELINE_CONFIG).toBeDefined();
    expect(pipeline.DEFAULT_PIPELINE_CONFIG.enableIast).toBe(false);
    expect(pipeline.DEFAULT_PIPELINE_CONFIG.enableDast).toBe(false);
    expect(pipeline.DEFAULT_PIPELINE_CONFIG.dastRateLimit).toBe(10);
    expect(pipeline.DEFAULT_PIPELINE_CONFIG.traversalDepthCap).toBe(5);
    expect(pipeline.DEFAULT_PIPELINE_CONFIG.fileTimeoutMs).toBe(30_000);
  });
});
