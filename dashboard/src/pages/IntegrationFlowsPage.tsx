import { useState } from 'react';
import { useCoverage } from '../context/CoverageContext';
import { useSettings } from '../context/SettingsContext';
import { useIntelligence } from '../context/IntelligenceContext';
import CoveragePieChart from '../components/CoveragePieChart';
import AiSummaryPanel from '../components/AiSummaryPanel';
import IntelligenceSection from '../components/IntelligenceSection';
import MermaidDiagram from '../components/MermaidDiagram';
import type { DetailItem, FlowStepDetail } from '../types';
import { generateIntegrationFlowsSummary, generateFlowMermaid } from '../utils/markdownSummaries';

interface FlowItem extends DetailItem {
  steps?: number;
  coveredSteps?: number;
  flowName?: string;
  rawSteps?: FlowStepDetail[];
}

function FlowCard({ item }: { item: FlowItem }) {
  const [showDiagram, setShowDiagram] = useState(false);

  const stepPercent =
    item.steps && item.steps > 0
      ? Math.round(((item.coveredSteps ?? 0) / item.steps) * 100)
      : item.covered
      ? 100
      : 0;

  const title = item.flowName || item.id;
  const subtitle = item.flowName ? item.id : undefined;
  const diagram = generateFlowMermaid(item);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div>
            <span className="font-semibold text-gray-900 dark:text-white text-sm leading-snug">
              {item.covered ? '✅' : '❌'} {title}
            </span>
            {subtitle && (
              <span className="ml-2 text-xs text-gray-400 dark:text-gray-500 font-mono">
                {subtitle}
              </span>
            )}
          </div>
          {item.steps !== undefined && (
            <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
              {item.coveredSteps ?? 0}/{item.steps} steps
            </span>
          )}
        </div>

        {/* Progress bar */}
        {item.steps !== undefined && (
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mt-2">
            <div
              className={`h-1.5 rounded-full transition-all ${
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
      </div>

      {/* Step list */}
      {item.rawSteps && item.rawSteps.length > 0 && (
        <div className="border-t border-gray-100 dark:border-gray-700">
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {item.rawSteps.map((step, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-2.5">
                {/* Step number badge */}
                <span
                  className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    step.covered
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                      : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
                  }`}
                >
                  {step.stepNumber || i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 dark:text-gray-200 leading-snug">
                    {step.name}
                  </p>
                  {step.method && step.path && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 font-mono mt-0.5">
                      <span
                        className={`inline-block px-1 rounded text-xs font-bold mr-1 ${
                          step.method === 'GET'
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400'
                            : step.method === 'POST'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                            : step.method === 'PUT' || step.method === 'PATCH'
                            ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400'
                            : step.method === 'DELETE'
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                        }`}
                      >
                        {step.method}
                      </span>
                      {step.path}
                    </p>
                  )}
                </div>
                <span className="flex-shrink-0 text-base leading-none mt-0.5">
                  {step.covered ? '✅' : '❌'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Diagram toggle */}
      {diagram && (
        <div className="border-t border-gray-100 dark:border-gray-700">
          <button
            onClick={() => setShowDiagram((v) => !v)}
            className="w-full px-4 py-2 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-left font-medium flex items-center gap-1"
          >
            {showDiagram ? '▲' : '▶'} {showDiagram ? 'Hide' : 'Show'} flow diagram
          </button>
          {showDiagram && (
            <div className="px-4 pb-4">
              <MermaidDiagram chart={diagram} />
            </div>
          )}
        </div>
      )}

      {/* Matched tests */}
      {item.tests && item.tests.length > 0 && (
        <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-2">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Tests: {item.tests.join(', ')}
          </p>
        </div>
      )}
    </div>
  );
}

export default function IntegrationFlowsPage() {
  const { report } = useCoverage();
  const { showAiSummaries } = useSettings();
  const { findingsFor, recommendationsFor } = useIntelligence();
  const [search, setSearch] = useState('');

  const section = report?.details?.integration;
  if (!section) {
    return (
      <div className="p-6">
        <div className="text-gray-500 dark:text-gray-400 mb-4">No integration flows data available.</div>
        <IntelligenceSection
          coverageType="integration"
          findings={findingsFor('integration')}
          recommendations={recommendationsFor('integration')}
          alwaysShow
        />
      </div>
    );
  }

  const items = section.items as FlowItem[];
  const filtered = items.filter(
    (item) =>
      (item.flowName || item.id).toLowerCase().includes(search.toLowerCase()) ||
      item.id.toLowerCase().includes(search.toLowerCase()),
  );
  const covered = items.filter((i) => i.covered).length;

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
            className="mb-4 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex flex-col gap-4">
            {filtered.map((item) => (
              <FlowCard key={item.id} item={item} />
            ))}
            {filtered.length === 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400">No flows match your search.</p>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 self-start">
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
        coverageType="integration"
        findings={findingsFor('integration')}
        recommendations={recommendationsFor('integration')}
      />
    </div>
  );
}
