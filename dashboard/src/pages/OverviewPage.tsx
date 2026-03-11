import React, { useState } from 'react';
import { useCoverage } from '../context/CoverageContext';
import { useIntelligence } from '../context/IntelligenceContext';
import { DEFAULT_THRESHOLDS } from '../types';
import { getStatus } from '../components/QualityGateBanner';
import QualityGateBanner from '../components/QualityGateBanner';
import FileUpload from '../components/FileUpload';
import IntelligenceSection from '../components/IntelligenceSection';
import { Link } from 'react-router-dom';
import ConfidenceBadge from '../components/ConfidenceBadge';
import LocalValidationPanel from '../components/LocalValidationPanel';
import type { ConfidenceLevel, EvidenceDepth, LocalValidationCommand } from '../types';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';

function riskBandColor(score: number): string {
  if (score >= 75) return 'text-red-600 dark:text-red-400';
  if (score >= 50) return 'text-orange-600 dark:text-orange-400';
  if (score >= 25) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-gray-500';
}

export default function OverviewPage() {
  const { report, loading, error } = useCoverage();
  const { report: intel, loading: intelLoading } = useIntelligence();
  const [expandedType, setExpandedType] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 dark:text-gray-400">
        Loading report…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300">
          <p className="font-semibold">Failed to load report</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
        <div className="mt-4">
          <FileUpload />
        </div>
      </div>
    );
  }

  if (!report) return null;

  const chartData = report.summary.map((s) => ({
    name: s.type,
    Coverage: s.coveragePercent,
    Threshold: DEFAULT_THRESHOLDS[s.type] ?? 50,
  }));

  const failing = report.summary.filter((s) => {
    const threshold = DEFAULT_THRESHOLDS[s.type] ?? 50;
    return s.coveragePercent < threshold;
  });

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Overview</h1>
        <FileUpload />
      </div>

      <QualityGateBanner summary={report.summary} />

      {/* Marginal coverage warning when all gates pass */}
      {failing.length === 0 && (() => {
        const shallowSections = report.summary.filter(s => {
          const t = DEFAULT_THRESHOLDS[s.type] ?? 50;
          return s.coveragePercent >= t && s.coveragePercent < t + 15 && s.totalItems > 0;
        });
        if (shallowSections.length === 0) return null;
        return (
          <div className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-300 text-sm">
            Thresholds passed, but {shallowSections.map(s => s.type).join(', ')} coverage is marginal. Evidence depth may be shallow.
          </div>
        );
      })()}

      {/* Intelligence Summary Banner */}
      {!intelLoading && intel && intel.summary.totalRecommendations > 0 && (
        <div className="mb-6 p-4 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="font-semibold text-blue-800 dark:text-blue-300 flex items-center gap-2">
                🧠 Coverage Intelligence
              </p>
              <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">
                {intel.summary.totalFindings} findings · {intel.summary.totalRecommendations} recommendations ·{' '}
                <span className={riskBandColor(intel.summary.maxRiskScore)}>
                  Max risk: {intel.summary.maxRiskScore}
                </span>
                {(intel.summary.recommendationsByPriority.P0 ?? 0) > 0 && (
                  <span className="ml-2 font-bold text-red-600 dark:text-red-400">
                    ⚠️ {intel.summary.recommendationsByPriority.P0} P0 action{intel.summary.recommendationsByPriority.P0 !== 1 ? 's' : ''} required
                  </span>
                )}
              </p>
            </div>
            <Link
              to="/intelligence"
              className="text-sm px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              View Intelligence →
            </Link>
          </div>
        </div>
      )}

      {/* Summary Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden mb-8">
        <table className="w-full text-sm" data-testid="summary-table">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-700">
              <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-200">Coverage Type</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-200">Total Items</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-200">Covered Items</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-200">Coverage %</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-200">Threshold</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-700 dark:text-gray-200">Status</th>
            </tr>
          </thead>
          <tbody>
            {report.summary.map((row, i) => {
              const threshold = DEFAULT_THRESHOLDS[row.type] ?? 50;
              const { label, color } = getStatus(row.coveragePercent, threshold);
              const isExpanded = expandedType === row.type;

              // Derive confidence interpretation
              let confidence: ConfidenceLevel;
              if (row.coveragePercent >= 100 && row.coveragePercent >= threshold) {
                confidence = 'high';
              } else if (row.coveragePercent >= 80 && row.coveragePercent >= threshold) {
                confidence = 'medium';
              } else if (row.coveragePercent >= threshold && row.coveragePercent < 80) {
                confidence = 'low';
              } else {
                confidence = 'low';
              }
              const thresholdMet = row.coveragePercent >= threshold;

              // Derive evidence depth
              let evidenceDepth: EvidenceDepth;
              if (row.totalItems > 20) {
                evidenceDepth = 'deep';
              } else if (row.totalItems > 5) {
                evidenceDepth = 'moderate';
              } else {
                evidenceDepth = 'shallow';
              }

              // Blind spots
              const blindSpots: string[] = [];
              if (row.coveragePercent === 100) {
                blindSpots.push('Full coverage claimed — verify assertion depth');
              }

              return (
                <React.Fragment key={row.type}>
                  <tr
                    className={`cursor-pointer ${
                      i % 2 === 0
                        ? 'bg-white dark:bg-gray-800'
                        : 'bg-gray-50 dark:bg-gray-750'
                    } hover:bg-gray-100 dark:hover:bg-gray-700`}
                    onClick={() => setExpandedType(isExpanded ? null : row.type)}
                  >
                    <td className="px-4 py-3 font-medium capitalize text-gray-800 dark:text-gray-100">
                      <span className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">{isExpanded ? '▲' : '▼'}</span>
                        {row.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{row.totalItems}</td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{row.coveredItems}</td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`font-semibold ${
                          row.coveragePercent >= threshold
                            ? 'text-green-600 dark:text-green-400'
                            : row.coveragePercent >= threshold - 10
                            ? 'text-yellow-600 dark:text-yellow-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {row.coveragePercent}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{threshold}%</td>
                    <td className={`px-4 py-3 text-center font-medium ${color}`}>{label}</td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-gray-100 dark:bg-gray-750">
                      <td colSpan={6} className="px-6 py-4">
                        <div className="flex flex-wrap items-center gap-3 text-sm">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Confidence:</span>
                            <ConfidenceBadge confidence={confidence} />
                            {thresholdMet && row.coveragePercent < 80 && (
                              <span className="text-xs text-amber-600 dark:text-amber-400 italic">barely passing</span>
                            )}
                            {!thresholdMet && (
                              <span className="text-xs text-red-600 dark:text-red-400 font-semibold">threshold not met</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Evidence Depth:</span>
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                              evidenceDepth === 'deep'
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                                : evidenceDepth === 'moderate'
                                ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300'
                                : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
                            }`}>
                              {evidenceDepth.charAt(0).toUpperCase() + evidenceDepth.slice(1)}
                            </span>
                          </div>
                          {blindSpots.length > 0 && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Blind Spots:</span>
                              {blindSpots.map((bs, idx) => (
                                <span key={idx} className="text-xs text-amber-600 dark:text-amber-400">{bs}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Discovery Info (shown when analyze command was run without YAML spec) */}
      {report.discoveryInfo && (() => {
        const di = report.discoveryInfo!;
        return (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 mb-6">
            <h2 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2">
              🔍 Scan Discovery Info
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs text-blue-700 dark:text-blue-400">
              {di.analysisMode && (
                <div>
                  <span className="font-medium block">Mode</span>
                  <span>{di.analysisMode === 'inferred' ? 'Zero-config (inferred)' : 'Explicit spec'}</span>
                </div>
              )}
              {di.languages && di.languages.length > 0 && (
                <div>
                  <span className="font-medium block">Languages</span>
                  <span>{di.languages.join(', ')}</span>
                </div>
              )}
              {di.frameworks && di.frameworks.length > 0 && (
                <div>
                  <span className="font-medium block">Frameworks</span>
                  <span>{di.frameworks.join(', ')}</span>
                </div>
              )}
              {di.serviceFilesCount !== undefined && (
                <div>
                  <span className="font-medium block">Source Files</span>
                  <span>{di.serviceFilesCount}</span>
                </div>
              )}
              {di.testFilesCount !== undefined && (
                <div>
                  <span className="font-medium block">Test Files</span>
                  <span>{di.testFilesCount}</span>
                </div>
              )}
              {di.specFilesCount !== undefined && (
                <div>
                  <span className="font-medium block">API Specs</span>
                  <span>{di.specFilesCount}</span>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Local Validation Commands */}
      {(() => {
        const commands: LocalValidationCommand[] = [];
        // Check for common build systems in discovery info
        if (report.discoveryInfo?.frameworks?.some(f => f.toLowerCase().includes('jest'))) {
          commands.push({ command: 'npm test', source: 'detected', label: 'Detected from package.json' });
        }
        if (report.discoveryInfo?.frameworks?.some(f => f.toLowerCase().includes('cypress'))) {
          commands.push({ command: 'npx cypress run', source: 'detected', label: 'Detected Cypress' });
        }
        // Always suggest the analyzer command
        commands.push({ command: 'api-coverage-analyzer scan --report coverage-summary.json', source: 'suggested', label: 'Run the analyzer' });
        if (commands.length > 0) return <LocalValidationPanel commands={commands} />;
        return null;
      })()}

      {/* Bar Chart */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Coverage by Type</h2>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 12 }} />
            <Tooltip formatter={(value) => `${value}%`} />
            <Legend />
            <ReferenceLine y={80} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'Threshold', position: 'insideTopRight', fontSize: 11 }} />
            <Bar dataKey="Coverage" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Threshold" fill="#f59e0b" opacity={0.4} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Top Intelligence Gaps on Overview */}
      {!intelLoading && intel && (
        <IntelligenceSection
          coverageType="overview"
          findings={intel.findings.slice(0, 10)}
          recommendations={intel.recommendations.slice(0, 10)}
        />
      )}
    </div>
  );
}
