import { DEFAULT_THRESHOLDS } from '../types';
import type { SummaryItem } from '../types';

function getStatus(
  coveragePercent: number,
  threshold: number,
): { label: string; color: string } {
  if (coveragePercent >= threshold)
    return { label: '✅ Pass', color: 'text-green-600 dark:text-green-400' };
  if (coveragePercent >= threshold - 10)
    return { label: '⚠️ Warning', color: 'text-yellow-600 dark:text-yellow-400' };
  return { label: '❌ Fail', color: 'text-red-600 dark:text-red-400' };
}

export default function QualityGateBanner({ summary }: { summary: SummaryItem[] }) {
  const failing = summary.filter((s) => {
    const threshold = DEFAULT_THRESHOLDS[s.type] ?? 50;
    return s.coveragePercent < threshold;
  });

  const warnings = summary.filter((s) => {
    const threshold = DEFAULT_THRESHOLDS[s.type] ?? 50;
    return s.coveragePercent >= threshold - 10 && s.coveragePercent < threshold;
  });

  if (failing.length === 0 && warnings.length === 0) {
    // Check for shallow sections
    const shallowCount = summary.filter(s => {
      const threshold = DEFAULT_THRESHOLDS[s.type] ?? 50;
      return s.totalItems > 0 && s.coveragePercent >= threshold && s.coveragePercent < threshold + 15;
    }).length;

    const message = shallowCount > 0
      ? `All configured thresholds passed, but ${shallowCount} section(s) have marginal coverage depth.`
      : 'All quality gates passed.';

    return (
      <div className="mb-4 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 text-sm font-medium">
        ✅ {message}
      </div>
    );
  }

  return (
    <div className="mb-4 flex flex-col gap-2">
      {failing.length > 0 && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
          <span className="font-semibold">❌ Quality gate failures: </span>
          {failing.map((s) => {
            const threshold = DEFAULT_THRESHOLDS[s.type] ?? 50;
            const { label } = getStatus(s.coveragePercent, threshold);
            return (
              <span key={s.type} className="mr-2">
                {s.type} ({s.coveragePercent}% / {threshold}%) {label}
              </span>
            );
          })}
        </div>
      )}
      {warnings.length > 0 && (
        <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-300 text-sm">
          <span className="font-semibold">⚠️ Quality gate warnings: </span>
          {warnings.map((s) => {
            const threshold = DEFAULT_THRESHOLDS[s.type] ?? 50;
            return (
              <span key={s.type} className="mr-2">
                {s.type} ({s.coveragePercent}% / {threshold}%)
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { getStatus };
