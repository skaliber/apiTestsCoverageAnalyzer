import type { LocalValidationCommand } from '../types';
import CodeBlock from './CodeBlock';

interface LocalValidationPanelProps {
  commands: LocalValidationCommand[];
}

const sourceBadgeConfig: Record<
  LocalValidationCommand['source'],
  { label: string; classes: string }
> = {
  detected: {
    label: 'Detected',
    classes: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  },
  inferred: {
    label: 'Inferred',
    classes: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  },
  suggested: {
    label: 'Suggested',
    classes: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  },
};

export default function LocalValidationPanel({ commands }: LocalValidationPanelProps) {
  if (!commands || commands.length === 0) return null;

  return (
    <div data-testid="local-validation-panel" className="space-y-3">
      {commands.map((cmd, i) => {
        const badge = sourceBadgeConfig[cmd.source];
        return (
          <div key={i}>
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${badge.classes}`}
              >
                {badge.label}
              </span>
              {cmd.label && (
                <span className="text-xs text-gray-600 dark:text-gray-400">{cmd.label}</span>
              )}
            </div>
            <CodeBlock code={cmd.command} language="bash" />
          </div>
        );
      })}
    </div>
  );
}
