import type { DetectionMode } from '../types';

interface DetectionModeBadgeProps {
  mode?: DetectionMode;
}

const config: Record<DetectionMode, { label: string; classes: string }> = {
  direct: {
    label: 'Direct',
    classes: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  },
  inferred: {
    label: 'Inferred',
    classes: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  },
  heuristic: {
    label: 'Heuristic',
    classes: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  },
};

export default function DetectionModeBadge({ mode }: DetectionModeBadgeProps) {
  if (!mode) return null;

  const { label, classes } = config[mode];

  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${classes}`}
      data-testid="detection-mode-badge"
    >
      {label}
    </span>
  );
}
