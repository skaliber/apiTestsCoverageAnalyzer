import { useState } from 'react';
import ReactMarkdown from 'react-markdown';

interface AiSummaryPanelProps {
  markdown: string;
}

export default function AiSummaryPanel({ markdown }: AiSummaryPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const panelId = 'ai-summary-panel-content';

  return (
    <div
      className="mb-6 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20"
      data-testid="ai-summary-panel"
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-xl"
      >
        <span className="text-sm font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-2">
          <span aria-hidden="true">🤖</span> AI-friendly analysis
        </span>
        <span
          aria-hidden="true"
          className={`text-blue-600 dark:text-blue-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
        >
          ▼
        </span>
      </button>

      {expanded && (
        <div
          id={panelId}
          role="region"
          aria-label="AI-friendly analysis"
          className="px-4 pb-4 prose prose-sm dark:prose-invert max-w-none text-gray-800 dark:text-gray-200"
        >
          <ReactMarkdown>{markdown}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}
