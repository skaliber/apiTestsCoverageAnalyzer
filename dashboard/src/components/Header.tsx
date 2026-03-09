import { useCoverage } from '../context/CoverageContext';
import { useSettings } from '../context/SettingsContext';
import ThemeToggle from './ThemeToggle';

export default function Header() {
  const { reportName, report } = useCoverage();
  const { showAiSummaries, toggleAiSummaries } = useSettings();

  return (
    <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 flex items-center justify-between shrink-0">
      <div>
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{reportName}</span>
        {report && (
          <span className="ml-3 text-xs text-gray-500 dark:text-gray-400">
            Generated: {new Date(report.generatedAt).toLocaleString()}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggleAiSummaries}
          aria-pressed={showAiSummaries}
          title="Toggle AI-friendly summaries"
          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            showAiSummaries
              ? 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
              : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400'
          }`}
          data-testid="ai-summaries-toggle"
        >
          🤖 AI summaries {showAiSummaries ? 'on' : 'off'}
        </button>
        <ThemeToggle />
      </div>
    </header>
  );
}
