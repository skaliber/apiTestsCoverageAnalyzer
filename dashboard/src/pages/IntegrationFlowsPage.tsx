import { useState } from 'react';
import { useCoverage } from '../context/CoverageContext';
import { useSettings } from '../context/SettingsContext';
import CoveragePieChart from '../components/CoveragePieChart';
import AiSummaryPanel from '../components/AiSummaryPanel';
import MermaidDiagram from '../components/MermaidDiagram';
import type { DetailItem } from '../types';
import { generateIntegrationFlowsSummary, generateMermaidFlowchart } from '../utils/markdownSummaries';

interface FlowItem extends DetailItem {
  steps?: number;
  coveredSteps?: number;
}

export default function IntegrationFlowsPage() {
  const { report } = useCoverage();
  const { showAiSummaries } = useSettings();
  const [search, setSearch] = useState('');

  const section = report?.details?.integration;
  if (!section) {
    return (
      <div className="p-6 text-gray-500 dark:text-gray-400">
        No integration flows data available.
      </div>
    );
  }

  const items = section.items as FlowItem[];
  const filtered = items.filter((item) =>
    item.id.toLowerCase().includes(search.toLowerCase()),
  );
  const covered = items.filter((i) => i.covered).length;
  const mermaidChart = generateMermaidFlowchart(items);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Integration Flows</h1>
      {showAiSummaries && report && (
        <AiSummaryPanel markdown={generateIntegrationFlowsSummary(report)} />
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <input
            type="text"
            placeholder="Search flows…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-3 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex flex-col gap-3">
            {filtered.map((item) => {
              const stepPercent =
                item.steps && item.steps > 0
                  ? Math.round(((item.coveredSteps ?? 0) / item.steps) * 100)
                  : 0;
              return (
                <div
                  key={item.id}
                  className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-800 dark:text-gray-100 text-sm">
                      {item.covered ? '✅' : '❌'} {item.id}
                    </span>
                    {item.steps && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {item.coveredSteps ?? 0}/{item.steps} steps
                      </span>
                    )}
                  </div>
                  {item.steps && (
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          stepPercent === 100
                            ? 'bg-green-500'
                            : stepPercent > 0
                            ? 'bg-yellow-500'
                            : 'bg-red-500'
                        }`}
                        style={{ width: `${stepPercent}%` }}
                      />
                    </div>
                  )}
                  {item.tests && item.tests.length > 0 && (
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      Tests: {item.tests.join(', ')}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          {mermaidChart && (
            <div className="mt-6">
              <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-3">
                Flow Diagram
              </h2>
              <MermaidDiagram chart={mermaidChart} />
            </div>
          )}
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
    </div>
  );
}
