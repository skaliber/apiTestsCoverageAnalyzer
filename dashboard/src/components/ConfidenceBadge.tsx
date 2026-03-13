import type { ConfidenceLevel } from '../types';

interface ConfidenceBadgeProps {
  confidence?: ConfidenceLevel;
}

const styles: Record<ConfidenceLevel, string> = {
  high: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  low: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

export default function ConfidenceBadge({ confidence }: ConfidenceBadgeProps) {
  if (!confidence) return null;

  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${styles[confidence]}`}
      data-testid="confidence-badge"
    >
      {confidence.charAt(0).toUpperCase() + confidence.slice(1)}
    </span>
  );
}
