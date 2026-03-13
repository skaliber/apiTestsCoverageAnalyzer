/**
 * ScanDiagnosticsContext – loads scan-manifest.json once and exposes it
 * to all dashboard pages so scan metadata (discovered files, languages,
 * frameworks, etc.) is available without re-fetching.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScanManifest {
  projectRoot: string;
  analyzedAt: string;
  discoveredFiles: {
    serviceFiles: string[];
    testFiles: string[];
    specFiles: string[];
  };
  languages: string[];
  frameworks: string[];
  scanTypes: string[];
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface ScanDiagnosticsContextValue {
  scanManifest: ScanManifest | null;
  loading: boolean;
  error: string | null;
}

const ScanDiagnosticsContext = createContext<ScanDiagnosticsContextValue | undefined>(undefined);

export function ScanDiagnosticsProvider({ children }: { children: ReactNode }) {
  const [scanManifest, setScanManifest] = useState<ScanManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/reports/scan-manifest.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: ScanManifest) => {
        setScanManifest(data);
        setLoading(false);
      })
      .catch(() => {
        // Not a fatal error — scan manifest may not exist yet
        setLoading(false);
        setError('not-available');
      });
  }, []);

  return (
    <ScanDiagnosticsContext.Provider value={{ scanManifest, loading, error }}>
      {children}
    </ScanDiagnosticsContext.Provider>
  );
}

export function useScanDiagnostics() {
  const ctx = useContext(ScanDiagnosticsContext);
  if (!ctx) throw new Error('useScanDiagnostics must be used within ScanDiagnosticsProvider');
  return ctx;
}
