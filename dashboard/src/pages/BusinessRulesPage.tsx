import { useState } from 'react';
import { useCoverage } from '../context/CoverageContext';
import { useSettings } from '../context/SettingsContext';
import { useIntelligence } from '../context/IntelligenceContext';
import CoveragePieChart from '../components/CoveragePieChart';
import AiSummaryPanel from '../components/AiSummaryPanel';
import IntelligenceSection from '../components/IntelligenceSection';
import type { DetailItem, InferredRuleDetail } from '../types';
import { generateBusinessRulesSummary } from '../utils/markdownSummaries';

export default function BusinessRulesPage() {
  const { report } = useCoverage();
  const { showAiSummaries } = useSettings();
  const { findingsFor, recommendationsFor } = useIntelligence();
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const section = report?.details?.business;
  if (!section) {
    return (
      <div className="p-6">
        <div className="text-gray-500 dark:text-gray-400 mb-4">No business rules data available.</div>
        <IntelligenceSection
          coverageType="business"
          findings={findingsFor('business')}
          recommendations={recommendationsFor('business')}
          alwaysShow
        />
      </div>
    );
  }

  const items = section.items as DetailItem[];
  const filtered = items.filter((item) =>
    item.id.toLowerCase().includes(search.toLowerCase()),
  );
  const covered = items.filter((i) => i.covered).length;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Business Rules</h1>
      {showAiSummaries && report && (
        <AiSummaryPanel markdown={generateBusinessRulesSummary(report)} />
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <input
            type="text"
            placeholder="Search rules…"
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
                  <span className="font-medium text-gray-800 dark:text-gray-100 text-sm">
                    {item.covered ? '✅' : '❌'} {item.id}
                  </span>
                  <span className="text-gray-400 dark:text-gray-500 text-xs">
                    {expandedId === item.id ? '▲' : '▼'}
                  </span>
                </button>
                {expandedId === item.id && (
                  <div className="px-4 pb-3 text-sm text-gray-600 dark:text-gray-300">
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
                    {(() => {
                      const inferred = section['inferred_details'] as
                        | Record<string, InferredRuleDetail>
                        | undefined;
                      const detail = inferred?.[item.id];
                      if (!detail) return null;
                      return (
                        <div className="mt-2 space-y-1">
                          {detail.type && (
                            <p>
                              <span className="font-medium">Rule type: </span>
                              <span className="font-mono text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded">
                                {detail.type}
                              </span>
                            </p>
                          )}
                          {detail.source_location && (
                            <p>
                              <span className="font-medium">Source: </span>
                              <span className="font-mono text-xs break-all">{detail.source_location}</span>
                            </p>
                          )}
                          {detail.condition && (
                            <p>
                              <span className="font-medium">Condition: </span>
                              <code className="font-mono text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded break-all">
                                {detail.condition}
                              </code>
                            </p>
                          )}
                          {detail.code_snippet && (
                            <div>
                              <span className="font-medium">Code snippet:</span>
                              <pre className="mt-1 text-xs bg-gray-100 dark:bg-gray-700 p-2 rounded overflow-x-auto whitespace-pre-wrap break-all">
                                {detail.code_snippet}
                              </pre>
                            </div>
                          )}
                          {!item.covered && (
                            <div className="text-amber-600 dark:text-amber-400 text-xs mt-2">
                              <p className="font-medium">⚠ Gap: No tests covering this rule were found.</p>
                              {detail.specificKeywords && detail.specificKeywords.length > 0 && (
                                <p className="mt-1">
                                  To cover this rule, add a test whose name contains:{' '}
                                  <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">
                                    {detail.specificKeywords.join(', ')}
                                  </code>
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
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
        coverageType="business"
        findings={findingsFor('business')}
        recommendations={recommendationsFor('business')}
      />
    </div>
  );
}
