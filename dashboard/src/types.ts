export interface SummaryItem {
  type: string;
  totalItems: number;
  coveredItems: number;
  coveragePercent: number;
}

export interface DetailItem {
  id: string;
  covered: boolean;
  tests?: string[];
  steps?: number;
  coveredSteps?: number;
  threshold?: string;
}

export interface DetailSection {
  items: DetailItem[];
}

export interface CoverageReport {
  generatedAt: string;
  summary: SummaryItem[];
  details: Record<string, DetailSection>;
}

export interface Thresholds {
  endpoint: number;
  parameter: number;
  business: number;
  integration: number;
  security: number;
  error: number;
  performance: number;
  resilience: number;
  [key: string]: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  endpoint: 80,
  parameter: 70,
  business: 60,
  integration: 50,
  security: 60,
  error: 50,
  performance: 75,
  resilience: 50,
};

/** Extra detail attached to inferred business rules from the `analyze` command. */
export interface InferredRuleDetail {
  source_location?: string;
  condition?: string;
  code_snippet?: string;
  type?: string;
}
