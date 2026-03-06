import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from 'react';
import type { CoverageReport } from '../types';

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
        setReport(data);
        setHistoricalReports([{ name: 'coverage-summary.json', report: data }]);
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
        const data = JSON.parse(e.target?.result as string) as CoverageReport;
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
