import { useCoverage } from '../context/CoverageContext';
import ThemeToggle from './ThemeToggle';

export default function Header() {
  const { reportName, report } = useCoverage();

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
      <ThemeToggle />
    </header>
  );
}
