import { useCoverage } from '../context/CoverageContext';
import { useIntelligence } from '../context/IntelligenceContext';
import { DEFAULT_THRESHOLDS } from '../types';
import { getStatus } from '../components/QualityGateBanner';
import QualityGateBanner from '../components/QualityGateBanner';
import FileUpload from '../components/FileUpload';
import IntelligenceSection from '../components/IntelligenceSection';
import { Link } from 'react-router-dom';
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

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Overview</h1>
        <FileUpload />
      </div>

      <QualityGateBanner summary={report.summary} />

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
              return (
                <tr
                  key={row.type}
                  className={
                    i % 2 === 0
                      ? 'bg-white dark:bg-gray-800'
                      : 'bg-gray-50 dark:bg-gray-750'
                  }
                >
                  <td className="px-4 py-3 font-medium capitalize text-gray-800 dark:text-gray-100">
                    {row.type}
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
