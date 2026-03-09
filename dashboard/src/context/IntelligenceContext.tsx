/**
 * IntelligenceContext – loads coverage-intelligence.json once and exposes it
 * to all dashboard pages so every category page can show relevant findings
 * and recommendations without re-fetching.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from 'react';

// ─── Types (mirrors src/intelligence/types.ts) ───────────────────────────────

export interface EndpointRef {
  method?: string;
  path?: string;
}

export interface FunctionalFinding {
  id: string;
  source: string;
  category: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  description: string;
  endpoint?: EndpointRef;
  missingTestTypes?: string[];
  frameworkHints?: string[];
  languageHints?: string[];
  relatedScanners?: string[];
  relatedRules?: string[];
  tags?: string[];
}

export interface MissingTestRecommendation {
  id: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  title: string;
  rationale: string;
  recommendedTestType: string;
  endpoint?: EndpointRef;
  likelyFramework?: string;
  likelyLanguage?: string;
  linkedFindingIds: string[];
  riskScore: number;
  confidence: string;
}

export interface IntelligenceSummary {
  totalFindings: number;
  findingsBySeverity: Record<string, number>;
  totalRecommendations: number;
  recommendationsByPriority: Record<string, number>;
  maxRiskScore: number;
  avgRiskScore: number;
  criticalUncoveredItems: number;
  unprotectedSecurityFindings: number;
  topRiskAreas: string[];
}

export interface IntelligenceReport {
  generatedAt: string;
  projectName: string;
  findings: FunctionalFinding[];
  recommendations: MissingTestRecommendation[];
  summary: IntelligenceSummary;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Map coverage analyzer type to finding source/category patterns. */
export const CATEGORY_SOURCES: Record<string, string[]> = {
  endpoint:      ['coverage-gap-analysis', 'uncovered-endpoint'],
  parameter:     ['parameter-coverage', 'missing-boundary-test', 'high-risk-parameter-gap'],
  business:      ['business-coverage', 'missing-business-rule-test'],
  integration:   ['integration-flow', 'missing-flow-step-test'],
  security:      ['security-coverage', 'security-scan', 'missing-auth-test', 'security-finding-unprotected'],
  error:         ['error-coverage', 'error-scenario-gap'],
  performance:   ['performance-resilience', 'performance-risk'],
  compatibility: ['compatibility', 'compatibility-risk'],
};

/** Filter findings for a specific coverage category. */
export function findingsForCategory(
  findings: FunctionalFinding[],
  category: string,
): FunctionalFinding[] {
  const patterns = CATEGORY_SOURCES[category] ?? [];
  return findings.filter(
    (f) =>
      patterns.includes(f.source) ||
      patterns.includes(f.category) ||
      f.tags?.some((t) => patterns.includes(t)),
  );
}

/** Filter recommendations for a specific coverage category (via linked findings). */
export function recommendationsForCategory(
  recs: MissingTestRecommendation[],
  findings: FunctionalFinding[],
  category: string,
): MissingTestRecommendation[] {
  const catFindingIds = new Set(findingsForCategory(findings, category).map((f) => f.id));
  return recs.filter((r) => r.linkedFindingIds.some((id) => catFindingIds.has(id)));
}

export function riskBand(score: number): string {
  if (score >= 75) return 'Critical';
  if (score >= 50) return 'High';
  if (score >= 25) return 'Moderate';
  return 'Low';
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface IntelligenceContextValue {
  report: IntelligenceReport | null;
  loading: boolean;
  error: string | null;
  /** Get findings relevant to a dashboard category (e.g. "endpoint", "security") */
  findingsFor: (category: string) => FunctionalFinding[];
  /** Get recommendations relevant to a dashboard category */
  recommendationsFor: (category: string) => MissingTestRecommendation[];
}

const IntelligenceContext = createContext<IntelligenceContextValue | undefined>(undefined);

export function IntelligenceProvider({ children }: { children: ReactNode }) {
  const [report, setReport] = useState<IntelligenceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/reports/coverage-intelligence.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: IntelligenceReport) => {
        setReport(data);
        setLoading(false);
      })
      .catch(() => {
        // Not a fatal error — intelligence report may not exist yet
        setLoading(false);
        setError('not-available');
      });
  }, []);

  function findingsFor(category: string): FunctionalFinding[] {
    if (!report) return [];
    return findingsForCategory(report.findings, category);
  }

  function recommendationsFor(category: string): MissingTestRecommendation[] {
    if (!report) return [];
    return recommendationsForCategory(report.recommendations, report.findings, category);
  }

  return (
    <IntelligenceContext.Provider
      value={{ report, loading, error, findingsFor, recommendationsFor }}
    >
      {children}
    </IntelligenceContext.Provider>
  );
}

export function useIntelligence() {
  const ctx = useContext(IntelligenceContext);
  if (!ctx) throw new Error('useIntelligence must be used within IntelligenceProvider');
  return ctx;
}
