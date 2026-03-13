import { useState } from 'react';
import { useCoverage } from '../context/CoverageContext';
import { useSettings } from '../context/SettingsContext';
import { useIntelligence } from '../context/IntelligenceContext';
import CoveragePieChart from '../components/CoveragePieChart';
import AiSummaryPanel from '../components/AiSummaryPanel';
import IntelligenceSection from '../components/IntelligenceSection';
import EvidencePanel from '../components/EvidencePanel';
import ConfidenceBadge from '../components/ConfidenceBadge';
import EmptyStatePanel from '../components/EmptyStatePanel';
import type { RichDetailItem } from '../types';
import { generateErrorHandlingSummary, generateFallbackAnalysis } from '../utils/markdownSummaries';

export default function ErrorHandlingPage() {
  const { report } = useCoverage();
  const { showAiSummaries } = useSettings();
  const { findingsFor, recommendationsFor } = useIntelligence();
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const section = report?.details?.error;
  if (!section) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Error Handling</h1>
        {showAiSummaries && report && (
          <AiSummaryPanel markdown={generateFallbackAnalysis('error', report.discoveryInfo)} />
        )}
        <EmptyStatePanel sectionName="Error Handling" />
        <IntelligenceSection
          coverageType="error"
          findings={findingsFor('error')}
          recommendations={recommendationsFor('error')}
          alwaysShow
        />
      </div>
    );
  }

  const items = section.items as RichDetailItem[];
  const filtered = items.filter((item) =>
    item.id.toLowerCase().includes(search.toLowerCase()),
  );
  const covered = items.filter((i) => i.covered).length;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Error Handling</h1>
      {showAiSummaries && report && (
        <AiSummaryPanel markdown={generateErrorHandlingSummary(report)} />
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <input
            type="text"
            placeholder="Search error scenarios…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-3 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex flex-col gap-2">
            {filtered.map((item) => (
              <div
                key={item.id}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden"
              >
                <button
                  className="w-full flex items-center justify-between px-4 py-3 text-left"
                  onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                >
                  <span className="font-medium text-gray-800 dark:text-gray-100 text-sm flex items-center gap-1">
                    {item.covered ? '✅' : '❌'} {item.id}
                    {(item as RichDetailItem).statusCode && (
                      <span className="inline-block px-1.5 py-0.5 rounded text-xs font-mono bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                        {(item as RichDetailItem).statusCode}
                      </span>
                    )}
                    {item.evidence?.confidence && (
                      <span className="ml-2">
                        <ConfidenceBadge confidence={item.evidence.confidence} />
                      </span>
                    )}
                  </span>
                  <span className="text-gray-400 dark:text-gray-500 text-xs">
                    {expandedId === item.id ? '▲' : '▼'}
                  </span>
                </button>
                {expandedId === item.id && (
                  <div className="px-4 pb-3">
                    <EvidencePanel
                      evidence={item.evidence}
                      testFiles={item.tests}
                      description={item.description}
                      category={item.category}
                      statusCode={item.statusCode}
                      relatedEndpoint={item.relatedEndpoint}
                      codeSnippet={item.codeSnippet}
                      pseudocode={item.pseudocode}
                      suggestedTest={item.suggestedTest}
                    />
                    {!item.evidence && (
                      <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                        <p>
                          <span className="font-medium">Status: </span>
                          {item.covered ? (
                            <span className="text-green-600 dark:text-green-400">Covered</span>
                          ) : (
                            <span className="text-red-600 dark:text-red-400">Not covered</span>
                          )}
                        </p>
                        {item.tests && item.tests.length > 0 && (
                          <p className="mt-1">
                            <span className="font-medium">Tests: </span>
                            {item.tests.join(', ')}
                          </p>
                        )}
                        {item.relatedEndpoint && (
                          <p className="mt-1">
                            <span className="font-medium">Related Endpoint: </span>
                            <code className="font-mono text-xs">{item.relatedEndpoint}</code>
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-2">
            Coverage Distribution
          </h2>
          <CoveragePieChart covered={covered} total={items.length} />
          <p className="text-sm text-center text-gray-500 dark:text-gray-400 mt-2">
            {covered} / {items.length} covered
          </p>
        </div>
      </div>

      <IntelligenceSection
        coverageType="error"
        findings={findingsFor('error')}
        recommendations={recommendationsFor('error')}
      />
    </div>
  );
}
