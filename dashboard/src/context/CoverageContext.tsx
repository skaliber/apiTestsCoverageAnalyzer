import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from 'react';
import type { CoverageReport, DetailSection, DetailItem } from '../types';

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
      steps: raw.steps as number | undefined,
      coveredSteps: raw.coveredSteps as number | undefined,
      threshold: raw.threshold as string | undefined,
    };
  }

  switch (sectionKey) {
    case 'endpoint': {
      const ep = (raw.endpoint ?? {}) as { method?: string; path?: string };
      const tests = (raw.matchedTests ?? []) as string[];
      return {
        id: `${ep.method ?? ''} ${ep.path ?? ''}`.trim() || `endpoint-${idx}`,
        covered: Boolean(raw.covered),
        tests,
      };
    }
    case 'business': {
      const tests = (raw.matchedTests ?? []) as string[];
      return {
        id: (raw.name as string) || (raw.id as string) || `rule-${idx}`,
        covered: Boolean(raw.covered),
        tests,
      };
    }
    case 'error': {
      const ep = (raw.endpoint ?? {}) as { method?: string; path?: string };
      const codes = (raw.errorCodes ?? []) as string[];
      const codeStr = codes.length ? ` (${codes.join(', ')})` : '';
      return {
        id: (`${ep.method ?? ''} ${ep.path ?? ''}${codeStr}`).trim() || `error-${idx}`,
        covered: Boolean(raw.covered),
        tests: [],
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

export function normalizeSection(value: unknown, sectionKey: string): DetailSection {
  if (Array.isArray(value)) {
    return {
      items: value.map((item, idx) =>
        normalizeItem(item as Record<string, unknown>, sectionKey, idx),
      ),
    };
  }
  if (value && typeof value === 'object' && 'items' in value) {
    return value as DetailSection;
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
