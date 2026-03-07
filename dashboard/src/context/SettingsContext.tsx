import { createContext, useContext, useState, type ReactNode } from 'react';

interface SettingsContextValue {
  showAiSummaries: boolean;
  toggleAiSummaries: () => void;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

function readStoredBool(key: string, defaultValue: boolean): boolean {
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return defaultValue;
    return stored === 'true';
  } catch {
    return defaultValue;
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [showAiSummaries, setShowAiSummaries] = useState<boolean>(() =>
    readStoredBool('showAiSummaries', true),
  );

  function toggleAiSummaries() {
    setShowAiSummaries((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('showAiSummaries', String(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }

  return (
    <SettingsContext.Provider value={{ showAiSummaries, toggleAiSummaries }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}

export { SettingsContext };
