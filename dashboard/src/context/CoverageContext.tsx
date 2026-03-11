import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from 'react';
import type { CoverageReport, DetailSection, DetailItem, FlowStepDetail } from '../types';

interface CoverageContextValue {
  report: CoverageReport | null;
  reportName: string;
  loading: boolean;
  error: string | null;
  loadFromFile: (file: File) => void;
  historicalReports: { name: string; report: CoverageReport }[];
  addHistoricalReport: (name: string, report: CoverageReport) => void;
}

const CoverageContext = createContext<CoverageContextValue | undefined>(undefined);

// ─── Data normalization ───────────────────────────────────────────────────────
// The analyzer CLI emits details as flat arrays; the dashboard expects
// { items: DetailItem[] }.  This normalizer handles both shapes so the
// dashboard works with reports from the analyzer AND with the demo report
// (which already uses the items format).

function normalizeItem(raw: Record<string, unknown>, sectionKey: string, idx: number): DetailItem {
  // Already in the right shape — has an 'id' field directly
  if (typeof raw.id === 'string') {
    return {
      id: raw.id,
      covered: Boolean(raw.covered),
      tests: (raw.tests ?? raw.matchedTests) as string[] | undefined,
      // `total` is the Spring Boot inferred-flow step count field; `steps` is the generic name
      steps: (raw.steps ?? raw.total) as number | undefined,
      coveredSteps: raw.coveredSteps as number | undefined,
      threshold: raw.threshold as string | undefined,
      // `name` is used for integration flows (e.g. "Flow in ArticleApiTest.java:72")
      flowName: (raw.flowName ?? raw.name) as string | undefined,
      rawSteps: raw.rawSteps as import('../types').FlowStepDetail[] | undefined,
    };
  }

  switch (sectionKey) {
    case 'endpoint': {
      // Real analyzer format: { method, path, covered, testFiles, ... }
      // Demo/legacy format:   { endpoint: { method, path }, covered, ... }
      const epNested = (raw.endpoint ?? {}) as { method?: string; path?: string };
      const method = ((raw.method as string) || epNested.method || '') as string;
      const pathStr = ((raw.path as string) || epNested.path || '') as string;
      const tests = (raw.testFiles ?? raw.matchedTests ?? []) as string[];
      return {
        id: `${method} ${pathStr}`.trim() || `endpoint-${idx}`,
        covered: Boolean(raw.covered),
        tests,
      };
    }
    case 'parameter': {
      // Raw format: { parameter: { name, location, method, path, ... }, ratio, validValue, ... }
      const param = (raw.parameter ?? {}) as { name?: string; location?: string; in?: string; method?: string; path?: string };
      const location = param.location ?? param.in ?? 'query';
      const name = param.name ?? `param-${idx}`;
      const ratio = (raw.ratio as number) ?? 0;
      const tests = (raw.matchedTests ?? raw.testFiles ?? []) as string[];
      return {
        id: `${param.method ? param.method + ' ' : ''}${param.path ? param.path + ':' : ''}${location}.${name}`,
        covered: ratio > 0,
        tests,
      };
    }
    case 'business': {
      // Raw format: { rule: { id, name, description, ... }, covered, matchedTests }
      const ruleData = (raw.rule ?? {}) as { id?: string; name?: string; description?: string };
      const tests = (raw.matchedTests ?? raw.testFiles ?? []) as string[];
      return {
        id: ruleData.id || (raw.name as string) || (raw.id as string) || `rule-${idx}`,
        covered: Boolean(raw.covered),
        tests,
      };
    }
    case 'error': {
      // Real analyzer format: { scenario: { id, endpoint, statusCode, ... }, covered, matchedTests }
      // Demo/legacy format:   { endpoint: { method, path }, errorCodes, covered }
      const scenario = (raw.scenario ?? {}) as { id?: string; endpoint?: string; statusCode?: number };
      const epNested = (raw.endpoint ?? {}) as { method?: string; path?: string };
      const tests = (raw.matchedTests ?? raw.testFiles ?? []) as string[];
      if (scenario.id) {
        return { id: scenario.id, covered: Boolean(raw.covered), tests };
      }
      // Legacy: build id from endpoint + error codes
      const codes = (raw.errorCodes ?? []) as string[];
      const codeStr = codes.length ? `:${codes.join(',')}` : '';
      const legacyId =
        `${epNested.method ?? ''} ${epNested.path ?? ''}${codeStr}`.trim() || `error-${idx}`;
      return { id: legacyId, covered: Boolean(raw.covered), tests };
    }
    case 'integration': {
      // Raw format: { flow: { id, name, description, steps }, status, testFiles, steps: [{step, covered, matchedTests}] }
      const flowData = (raw.flow ?? {}) as { id?: string; name?: string; steps?: unknown[] };
      // raw.steps = array of { step: { step, name, method, path, ... }, covered, matchedTests }
      // flowData.steps = array of step definition objects (no coverage info)
      const stepsArr = (raw.steps ?? []) as unknown[];

      // Build rich step details preserving names, methods, paths and per-step coverage
      const rawSteps: FlowStepDetail[] = stepsArr.map((s) => {
        const sr = s as Record<string, unknown>;
        const stepDef = (sr.step ?? {}) as Record<string, unknown>;
        return {
          stepNumber: (stepDef.step as number) ?? 0,
          name: ((stepDef.name ?? sr.name ?? '') as string),
          method: (stepDef.method ?? sr.method) as string | undefined,
          path: (stepDef.path ?? sr.path) as string | undefined,
          covered: Boolean(sr.covered),
        };
      });

      // Fall back to flowData.steps when raw.steps is absent (demo data)
      const effectiveSteps = rawSteps.length > 0
        ? rawSteps
        : (flowData.steps ?? []).map((s, i) => {
            const sd = s as Record<string, unknown>;
            return {
              stepNumber: (sd.step as number) ?? i + 1,
              name: (sd.name as string) ?? `Step ${i + 1}`,
              method: sd.method as string | undefined,
              path: sd.path as string | undefined,
              covered: false,
            } satisfies FlowStepDetail;
          });

      const coveredStepsCount = effectiveSteps.filter((s) => s.covered).length;
      const tests = (raw.testFiles ?? raw.matchedTests ?? []) as string[];
      return {
        id: flowData.id || (raw.id as string) || `flow-${idx}`,
        flowName: (flowData.name as string) || undefined,
        covered: raw.status === 'covered' || coveredStepsCount > 0,
        tests,
        steps: effectiveSteps.length,
        coveredSteps: coveredStepsCount,
        rawSteps: effectiveSteps,
      };
    }
    case 'security': {
      const ctrl = (raw.control ?? {}) as { id?: string; category?: string; description?: string };
      const tests = (raw.matchedTests ?? []) as string[];
      return {
        id: ctrl.id || `security-${idx}`,
        covered: Boolean(raw.covered),
        tests,
      };
    }
    default: {
      return {
        id: (raw.id as string) || (raw.name as string) || `${sectionKey}-${idx}`,
        covered: Boolean(raw.covered),
        tests: (raw.tests ?? raw.matchedTests) as string[] | undefined,
        steps: raw.steps as number | undefined,
        coveredSteps: raw.coveredSteps as number | undefined,
        threshold: raw.threshold as string | undefined,
      };
    }
  }
}

// Maps each coverage type to the array property that holds its items
const SECTION_ARRAY_KEY: Record<string, string> = {
  endpoint: 'endpoints',
  parameter: 'parameters',
  error: 'scenarios',
  integration: 'flows',
  security: 'controls',
  performance: 'results',
  resilience: 'results',
};

export function normalizeSection(value: unknown, sectionKey: string): DetailSection {
  if (Array.isArray(value)) {
    return {
      items: value.map((item, idx) =>
        normalizeItem(item as Record<string, unknown>, sectionKey, idx),
      ),
    };
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if ('items' in obj && Array.isArray(obj.items)) {
      // Already has an items array — preserve all extra keys (e.g. inferred_details, source)
      return obj as DetailSection;
    }
    // Handle business coverage format: { rules: [...], inferred_details: {...}, ... }
    if ('rules' in obj && Array.isArray(obj.rules)) {
      return {
        ...obj,
        items: (obj.rules as unknown[]).map((item, idx) =>
          normalizeItem(item as Record<string, unknown>, sectionKey, idx),
        ),
      } as DetailSection;
    }
    // Use the preferred array key for this section type, or fall back to the first array found.
    // Covers endpoint→endpoints, parameter→parameters, error→scenarios, integration→flows, etc.
    const preferredKey = SECTION_ARRAY_KEY[sectionKey];
    const arrayKey =
      preferredKey && Array.isArray(obj[preferredKey])
        ? preferredKey
        : Object.keys(obj).find((k) => Array.isArray(obj[k]));
    if (arrayKey) {
      return {
        ...obj,
        items: (obj[arrayKey] as unknown[]).map((item, idx) =>
          normalizeItem(item as Record<string, unknown>, sectionKey, idx),
        ),
      } as DetailSection;
    }
  }
  return { items: [] };
}

export function normalizeReport(raw: CoverageReport): CoverageReport {
  if (!raw.details) return raw;
  const normalizedDetails: Record<string, DetailSection> = {};
  for (const [key, value] of Object.entries(raw.details)) {
    normalizedDetails[key] = normalizeSection(value, key);
  }
  return { ...raw, details: normalizedDetails };
}

// ─────────────────────────────────────────────────────────────────────────────

export function CoverageProvider({ children }: { children: ReactNode }) {
  const [report, setReport] = useState<CoverageReport | null>(null);
  const [reportName, setReportName] = useState('coverage-summary.json');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [historicalReports, setHistoricalReports] = useState<
    { name: string; report: CoverageReport }[]
  >([]);

  useEffect(() => {
    fetch('/reports/coverage-summary.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        return res.json();
      })
      .then((data: CoverageReport) => {
        const normalized = normalizeReport(data);
        setReport(normalized);
        setHistoricalReports([{ name: 'coverage-summary.json', report: normalized }]);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
  }, []);

  function loadFromFile(file: File) {
    setLoading(true);
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const raw = JSON.parse(e.target?.result as string) as CoverageReport;
        const data = normalizeReport(raw);
        setReport(data);
        setReportName(file.name);
        setHistoricalReports((prev) => {
          const existing = prev.find((r) => r.name === file.name);
          if (existing) return prev;
          return [...prev, { name: file.name, report: data }];
        });
        setLoading(false);
      } catch {
        setError('Failed to parse JSON file. Please ensure it is a valid coverage report.');
        setLoading(false);
      }
    };
    reader.onerror = () => {
      setError('Failed to read file.');
      setLoading(false);
    };
    reader.readAsText(file);
  }

  function addHistoricalReport(name: string, reportData: CoverageReport) {
    setHistoricalReports((prev) => {
      const existing = prev.find((r) => r.name === name);
      if (existing) return prev;
      return [...prev, { name, report: reportData }];
    });
  }

  return (
    <CoverageContext.Provider
      value={{ report, reportName, loading, error, loadFromFile, historicalReports, addHistoricalReport }}
    >
      {children}
    </CoverageContext.Provider>
  );
}

export function useCoverage() {
  const ctx = useContext(CoverageContext);
  if (!ctx) throw new Error('useCoverage must be used within CoverageProvider');
  return ctx;
}

export { CoverageContext };
