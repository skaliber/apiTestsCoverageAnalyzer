import { useState } from 'react';
import ReactMarkdown from 'react-markdown';

/** MCP-normalized AI analysis panel data */
export interface McpAiPanelData {
  summary: string;
  keyFindings: string[];
  topRisks: string[];
  recommendedActions: string[];
  missingCoverageAreas?: string[];
  likelyRootCauses?: string[];
  confidence?: string;
  isFallback?: boolean;
  category?: string;
}

interface AiSummaryPanelProps {
  /** Legacy: raw markdown string (original mode) */
  markdown?: string;
  /** New: structured MCP analysis data */
  mcpData?: McpAiPanelData;
  /** Optional title override */
  title?: string;
}

export default function AiSummaryPanel({ markdown, mcpData, title }: AiSummaryPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const panelId = 'ai-summary-panel-content';
  const panelTitle = title ?? (mcpData ? 'MCP AI Analysis' : 'AI-friendly analysis');
  const isFallback = mcpData?.isFallback;
  const confidenceLabel = mcpData?.confidence
    ? ` · Confidence: ${mcpData.confidence}`
    : '';
  const fallbackLabel = isFallback ? ' (fallback mode)' : '';

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
          <span aria-hidden="true">🤖</span>
          {panelTitle}
          {(fallbackLabel || confidenceLabel) && (
            <span className="font-normal text-xs text-blue-500 dark:text-blue-400">
              {fallbackLabel}{confidenceLabel}
            </span>
          )}
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
          aria-label={panelTitle}
          className="px-4 pb-4 text-gray-800 dark:text-gray-200"
        >
          {mcpData ? (
            <McpAnalysisContent data={mcpData} />
          ) : markdown ? (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown>{markdown}</ReactMarkdown>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ─── Structured MCP panel ─────────────────────────────────────────────────────

function McpAnalysisContent({ data }: { data: McpAiPanelData }) {
  return (
    <div className="space-y-4 text-sm" data-testid="mcp-analysis-content">
      {data.summary && (
        <div>
          <p className="font-semibold text-blue-800 dark:text-blue-200 mb-1">Summary</p>
          <p>{data.summary}</p>
        </div>
      )}

      {(data.keyFindings?.length ?? 0) > 0 && (
        <AnalysisSection title="Key Findings" items={data.keyFindings!} icon="🔍" />
      )}

      {(data.topRisks?.length ?? 0) > 0 && (
        <AnalysisSection title="Top Risks" items={data.topRisks!} icon="⚠️" />
      )}

      {(data.missingCoverageAreas?.length ?? 0) > 0 && (
        <AnalysisSection title="Missing Coverage Areas" items={data.missingCoverageAreas!} icon="📋" />
      )}

      {(data.likelyRootCauses?.length ?? 0) > 0 && (
        <AnalysisSection title="Likely Root Causes" items={data.likelyRootCauses!} icon="🔎" />
      )}

      {(data.recommendedActions?.length ?? 0) > 0 && (
        <AnalysisSection title="Recommended Actions" items={data.recommendedActions!} icon="✅" />
      )}
    </div>
  );
}

function AnalysisSection({
  title,
  items,
  icon,
}: {
  title: string;
  items: string[];
  icon: string;
}) {
  return (
    <div>
      <p className="font-semibold text-blue-800 dark:text-blue-200 mb-1">
        <span aria-hidden="true">{icon}</span> {title}
      </p>
      <ul className="list-disc list-inside space-y-0.5 text-gray-700 dark:text-gray-300">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

