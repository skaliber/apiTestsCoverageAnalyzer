/**
 * TIA (Test Impact Analysis) stage types.
 */

import type { TestLayer, MockType, GraphNodeType, StageName } from '../../types';

/**
 * Classification result for a single test file.
 */
export interface TestClassification {
  filePath: string;
  layer: TestLayer;
  confidence: 'high' | 'medium' | 'low';
  signals: string[];
}

/**
 * Detected mock boundary in a test file.
 */
export interface DetectedMockBoundary {
  testFilePath: string;
  mockingLibrary: string;
  mockType: MockType;
  mockedTarget: string;
  line?: number;
}

/**
 * Result of parameterized test expansion.
 */
export interface ExpandedParameterizedTest {
  testFilePath: string;
  testName: string;
  variantCount: number | 'unresolvable';
  pattern: string;
  line?: number;
}

/**
 * Mapping from a test file to endpoints it covers.
 */
export interface TestEndpointMapping {
  testFilePath: string;
  endpointId: string;
  evidenceType: 'explicit-url' | 'resolved-constant' | 'import-graph' | 'naming-convention' | 'framework-metadata' | 'helper-traversal' | 'page-object';
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Output of the TIA pipeline stage.
 */
export interface TiaOutput {
  classifications: TestClassification[];
  mockBoundaries: DetectedMockBoundary[];
  parameterizedTests: ExpandedParameterizedTest[];
  testEndpointMappings: TestEndpointMapping[];
}
