import { useState } from 'react';
import { useCoverage } from '../context/CoverageContext';
import { useSettings } from '../context/SettingsContext';
import { useIntelligence } from '../context/IntelligenceContext';
import { useScanDiagnostics } from '../context/ScanDiagnosticsContext';
import CoveragePieChart from '../components/CoveragePieChart';
import AiSummaryPanel from '../components/AiSummaryPanel';
import IntelligenceSection from '../components/IntelligenceSection';
import EmptyStatePanel from '../components/EmptyStatePanel';
import EvidencePanel from '../components/EvidencePanel';
import type { DetailItem, RichDetailItem } from '../types';
import { generatePerformanceSummary } from '../utils/markdownSummaries';

export default function PerformancePage() {
  const { report } = useCoverage();
  const { showAiSummaries } = useSettings();
  const { findingsFor, recommendationsFor } = useIntelligence();
  const { scanManifest } = useScanDiagnostics();
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const merged: DetailItem[] = [
    ...(report?.details?.performance?.items ?? []),
    ...(report?.details?.resilience?.items ?? []),
  ];

  // Build stack-aware suggestions based on detected languages/frameworks
  const stackSuggestions: string[] = [];
  const languages = scanManifest?.languages ?? [];
  const frameworks = scanManifest?.frameworks ?? [];
  const langLower = languages.map((l) => l.toLowerCase());
  const frameworkLower = frameworks.map((f) => f.toLowerCase());

  if (
    frameworkLower.some((f) => f.includes('spring')) ||
    langLower.includes('java') ||
    langLower.includes('kotlin')
  ) {
    stackSuggestions.push(
      'Consider Gatling scenarios, resilience tests around downstream failures',
    );
  }
  if (langLower.includes('javascript') || langLower.includes('typescript') || frameworkLower.some((f) => f.includes('node') || f.includes('express') || f.includes('fastify') || f.includes('nest'))) {
    stackSuggestions.push(
      'Consider k6 or artillery, timeout assertions, retry policy tests',
    );
  }
  if (frameworkLower.some((f) => f.includes('react') || f.includes('vue') || f.includes('angular') || f.includes('next') || f.includes('nuxt'))) {
    stackSuggestions.push(
      'Consider API mock latency tests, retry/offline behavior tests',
    );
  }

  if (merged.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
          Performance &amp; Resilience
        </h1>
        <EmptyStatePanel
          sectionName="Performance & Resilience"
          scannedInfo={{
            signalsSearched: [
              'Gatling',
              'JMeter',
              'k6',
              'Locust',
              'artillery',
              'resilience4j',
              'circuit breakers',
              'timeout configs',
              'retry policies',
            ],
          }}
          stackSuggestions={stackSuggestions}
        />
        <IntelligenceSection
          coverageType="performance"
          findings={findingsFor('performance')}
          recommendations={recommendationsFor('performance')}
          alwaysShow
        />
      </div>
    );
  }

  const filtered = merged.filter((item) =>
    item.id.toLowerCase().includes(search.toLowerCase()),
  );
  const covered = merged.filter((i) => i.covered).length;
  const aiSummary = report ? generatePerformanceSummary(report) : undefined;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
        Performance &amp; Resilience
      </h1>

      {showAiSummaries && aiSummary && <AiSummaryPanel markdown={aiSummary} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2">
          <input
            type="text"
            placeholder="Search metrics…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-3 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Search items"
          />
          <div className="flex flex-col gap-2">
            {filtered.map((item) => (
              <div
                key={item.id}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden"
              >
                <button
                  className="w-full flex items-center justify-between px-4 py-3 text-left"
                  onClick={() =>
                    setExpandedId(expandedId === item.id ? null : item.id)
                  }
                >
                  <span className="font-medium text-gray-800 dark:text-gray-100 text-sm">
                    {item.covered ? '✅' : '❌'} {item.id}
                  </span>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                    {item.threshold && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        Threshold: {item.threshold}
                      </span>
                    )}
                    <span className="text-gray-400 dark:text-gray-500 text-xs">
                      {expandedId === item.id ? '▲' : '▼'}
                    </span>
                  </div>
                </button>
                {expandedId === item.id && (
                  <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 space-y-2">
                    <p className="mt-2">
                      <span className="font-medium">Status: </span>
                      {item.covered ? (
                        <span className="text-green-600 dark:text-green-400">
                          Covered
                        </span>
                      ) : (
                        <span className="text-red-600 dark:text-red-400">
                          Not covered
                        </span>
                      )}
                    </p>
                    {item.threshold && (
                      <p>
                        <span className="font-medium">Threshold: </span>
                        {item.threshold}
                      </p>
                    )}
                    {item.tests && item.tests.length > 0 && (
                      <p>
                        <span className="font-medium">Tests: </span>
                        <span className="text-xs">{item.tests.join(', ')}</span>
                      </p>
                    )}
                    {(() => {
                      const rich = item as RichDetailItem;
                      if (!rich.evidence && !rich.description && !rich.category)
                        return null;
                      return (
                        <EvidencePanel
                          evidence={rich.evidence}
                          testFiles={item.tests}
                          description={rich.description}
                          category={rich.category}
                        />
                      );
                    })()}
                  </div>
                )}
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No results found.
              </p>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-2">
            Coverage Distribution
          </h2>
          <CoveragePieChart covered={covered} total={merged.length} />
          <p className="text-sm text-center text-gray-500 dark:text-gray-400 mt-2">
            {covered} / {merged.length} covered
          </p>
        </div>
      </div>

      <IntelligenceSection
        coverageType="performance"
        findings={findingsFor('performance')}
        recommendations={recommendationsFor('performance')}
      />
    </div>
  );
}
