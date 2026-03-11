import { useState, useEffect } from 'react';
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

interface InferredFlowStep {
  method?: string;
  path?: string;
}

interface InferredFlowDetail {
  id: string;
  name?: string;
  steps?: InferredFlowStep[];
  source_location?: string;
}

function MethodBadge({ method }: { method: string }) {
  const colorClass =
    method === 'GET'
      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400'
      : method === 'POST'
      ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
      : method === 'PUT' || method === 'PATCH'
      ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400'
      : method === 'DELETE'
      ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
      : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400';
  return (
    <span className={`inline-block px-1 rounded text-xs font-bold mr-1 ${colorClass}`}>
      {method}
    </span>
  );
}

export default function IntegrationFlowsPage() {
  const { report } = useCoverage();
  const { showAiSummaries } = useSettings();
  const { findingsFor, recommendationsFor } = useIntelligence();
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showDiagramFor, setShowDiagramFor] = useState<string | null>(null);
  const [inferredFlows, setInferredFlows] = useState<Record<string, InferredFlowDetail>>({});

  // Optionally load inferred-integration-flows.json for step details and source location
  useEffect(() => {
    fetch('/reports/inferred-integration-flows.json')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { flows?: InferredFlowDetail[] } | null) => {
        if (!data?.flows) return;
        const byId: Record<string, InferredFlowDetail> = {};
        for (const f of data.flows) byId[f.id] = f;
        setInferredFlows(byId);
      })
      .catch(() => {});
  }, []);

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
            className="mb-3 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex flex-col gap-2">
            {filtered.map((item) => {
              const isExpanded = expandedId === item.id;
              const inferred = inferredFlows[item.id];
              const title = item.flowName || item.id;
              const subtitle = item.flowName ? item.id : undefined;
              const stepCount = item.steps ?? inferred?.steps?.length;
              const coveredSteps = item.coveredSteps;
              const effectiveCoveredSteps = coveredSteps ?? (item.covered ? stepCount : 0);
              const stepPercent =
                stepCount && stepCount > 0
                  ? Math.round(((effectiveCoveredSteps ?? 0) / stepCount) * 100)
                  : item.covered
                  ? 100
                  : 0;

              // Derive a short source reference from source_location
              const rawSrc = inferred?.source_location ?? '';
              const srcDisplay = rawSrc ? rawSrc.replace(/^.*[/\\]/, '') : undefined;

              // Use rawSteps (with coverage data) when available, else inferred steps (method+path only)
              const stepsToShow: Array<{
                stepNumber?: number;
                name?: string;
                method?: string;
                path?: string;
                covered?: boolean;
              }> =
                item.rawSteps && item.rawSteps.length > 0
                  ? item.rawSteps
                  : (inferred?.steps ?? []).map((s, i) => ({
                      stepNumber: i + 1,
                      method: s.method,
                      path: s.path,
                    }));

              const diagram = generateFlowMermaid(
                stepsToShow.length > 0
                  ? { ...item, rawSteps: stepsToShow as import('../types').FlowStepDetail[] }
                  : item,
              );

              return (
                <div
                  key={item.id}
                  className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden"
                >
                  {/* Accordion header */}
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 text-left"
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-gray-800 dark:text-gray-100 text-sm">
                        {item.covered ? '✅' : '❌'} {title}
                      </span>
                      {subtitle && (
                        <span className="ml-2 text-xs text-gray-400 dark:text-gray-500 font-mono">
                          {subtitle}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                      {stepCount !== undefined && (
                        <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                          {effectiveCoveredSteps ?? 0}/{stepCount} steps
                        </span>
                      )}
                      <span className="text-gray-400 dark:text-gray-500 text-xs">
                        {isExpanded ? '▲' : '▼'}
                      </span>
                    </div>
                  </button>

                  {/* Step progress bar (always visible when step count is known) */}
                  {stepCount !== undefined && (
                    <div className="px-4 pb-2">
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
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
                    </div>
                  )}

                  {/* Expanded detail panel */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 space-y-2">
                      {/* Status */}
                      <p className="mt-2">
                        <span className="font-medium">Status: </span>
                        {item.covered ? (
                          <span className="text-green-600 dark:text-green-400">Covered</span>
                        ) : (
                          <span className="text-red-600 dark:text-red-400">Not covered</span>
                        )}
                        {stepCount !== undefined && (
                          <span className="ml-2 text-gray-500 dark:text-gray-400 text-xs">
                            ({effectiveCoveredSteps ?? 0}/{stepCount} steps — {stepPercent}%)
                          </span>
                        )}
                      </p>

                      {/* Source location */}
                      {srcDisplay && (
                        <p>
                          <span className="font-medium">Source: </span>
                          <span className="font-mono text-xs break-all">{srcDisplay}</span>
                        </p>
                      )}

                      {/* Step list */}
                      {stepsToShow.length > 0 && (
                        <div>
                          <p className="font-medium mb-1">Steps:</p>
                          <div className="divide-y divide-gray-100 dark:divide-gray-700 border border-gray-100 dark:border-gray-700 rounded-lg overflow-hidden">
                            {stepsToShow.map((step, i) => (
                              <div key={i} className="flex items-center gap-3 px-3 py-2">
                                <span
                                  className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                                    step.covered === undefined
                                      ? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                                      : step.covered
                                      ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                                      : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
                                  }`}
                                >
                                  {step.stepNumber ?? i + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                  {step.name && (
                                    <p className="text-xs text-gray-700 dark:text-gray-300 leading-snug">
                                      {step.name}
                                    </p>
                                  )}
                                  {step.method && step.path && (
                                    <p className="font-mono text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                      <MethodBadge method={step.method.toUpperCase()} />
                                      {step.path}
                                    </p>
                                  )}
                                </div>
                                {step.covered !== undefined && (
                                  <span className="flex-shrink-0 text-sm leading-none">
                                    {step.covered ? '✅' : '❌'}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Matched test files */}
                      {item.tests && item.tests.length > 0 && (
                        <p>
                          <span className="font-medium">Tests: </span>
                          <span className="text-xs">{item.tests.join(', ')}</span>
                        </p>
                      )}

                      {/* Gap warning */}
                      {!item.covered && (
                        <div className="text-amber-600 dark:text-amber-400 text-xs">
                          <p className="font-medium">⚠ Gap: This integration flow is not fully covered by tests.</p>
                        </div>
                      )}

                      {/* Mermaid diagram toggle */}
                      {diagram && (
                        <div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowDiagramFor(showDiagramFor === item.id ? null : item.id);
                            }}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium flex items-center gap-1"
                          >
                            {showDiagramFor === item.id ? '▲ Hide' : '▶ Show'} flow diagram
                          </button>
                          {showDiagramFor === item.id && (
                            <div className="mt-2">
                              <MermaidDiagram chart={diagram} />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
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
