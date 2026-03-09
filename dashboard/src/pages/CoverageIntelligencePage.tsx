import { useState, useEffect } from 'react';
import AiSummaryPanel from '../components/AiSummaryPanel';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EndpointRef {
  method?: string;
  path?: string;
}

interface FunctionalFinding {
  id: string;
  source: string;
  category: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  description: string;
  endpoint?: EndpointRef;
  missingTestTypes?: string[];
  frameworkHints?: string[];
  languageHints?: string[];
  tags?: string[];
}

interface MissingTestRecommendation {
  id: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  title: string;
  rationale: string;
  recommendedTestType: string;
  endpoint?: EndpointRef;
  likelyFramework?: string;
  likelyLanguage?: string;
  linkedFindingIds: string[];
  riskScore: number;
  confidence: string;
}

interface IntelligenceSummary {
  totalFindings: number;
  findingsBySeverity: Record<string, number>;
  totalRecommendations: number;
  recommendationsByPriority: Record<string, number>;
  maxRiskScore: number;
  avgRiskScore: number;
  criticalUncoveredItems: number;
  unprotectedSecurityFindings: number;
  topRiskAreas: string[];
}

interface IntelligenceReport {
  generatedAt: string;
  projectName: string;
  findings: FunctionalFinding[];
  recommendations: MissingTestRecommendation[];
  summary: IntelligenceSummary;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function severityColor(s: string): string {
  switch (s) {
    case 'CRITICAL': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    case 'HIGH':     return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
    case 'MEDIUM':   return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
    default:         return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
  }
}

function priorityColor(p: string): string {
  switch (p) {
    case 'P0': return 'bg-red-600 text-white';
    case 'P1': return 'bg-orange-500 text-white';
    case 'P2': return 'bg-yellow-500 text-white';
    default:   return 'bg-gray-400 text-white';
  }
}

function riskBandColor(score: number): string {
  if (score >= 75) return 'text-red-600 dark:text-red-400 font-bold';
  if (score >= 50) return 'text-orange-600 dark:text-orange-400 font-semibold';
  if (score >= 25) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-gray-500 dark:text-gray-400';
}

function riskBand(score: number): string {
  if (score >= 75) return 'Critical';
  if (score >= 50) return 'High';
  if (score >= 25) return 'Moderate';
  return 'Low';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryCard({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 flex flex-col gap-1">
      <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</span>
      <span className={`text-2xl font-bold ${color ?? 'text-gray-900 dark:text-white'}`}>{value}</span>
    </div>
  );
}

function FindingRow({ finding }: { finding: FunctionalFinding }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <tr
      className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750 cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      <td className="px-4 py-2">
        <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${severityColor(finding.severity)}`}>
          {finding.severity}
        </span>
      </td>
      <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">{finding.title}</td>
      <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">{finding.category}</td>
      <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
        {finding.endpoint ? `${finding.endpoint.method ?? ''} ${finding.endpoint.path ?? ''}`.trim() : '—'}
      </td>
      {expanded && (
        <td colSpan={4} className="px-4 py-2 bg-gray-50 dark:bg-gray-750 text-sm text-gray-700 dark:text-gray-300">
          {finding.description}
          {finding.missingTestTypes?.length ? (
            <div className="mt-1">
              <span className="font-medium">Missing tests: </span>
              {finding.missingTestTypes.join(', ')}
            </div>
          ) : null}
        </td>
      )}
    </tr>
  );
}

function RecommendationCard({
  rec,
  allFindings,
}: {
  rec: MissingTestRecommendation;
  allFindings: FunctionalFinding[];
}) {
  const [showLinked, setShowLinked] = useState(false);
  const linkedFindings = allFindings.filter((f) => rec.linkedFindingIds.includes(f.id));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-start gap-3">
        <span className={`shrink-0 inline-block px-2 py-1 rounded text-xs font-bold ${priorityColor(rec.priority)}`}>
          {rec.priority}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">{rec.title}</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{rec.rationale}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className={`font-semibold ${riskBandColor(rec.riskScore)}`}>
              Risk: {rec.riskScore} ({riskBand(rec.riskScore)})
            </span>
            {rec.endpoint?.path && (
              <span className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded">
                {rec.endpoint.method ?? ''} {rec.endpoint.path}
              </span>
            )}
            {rec.likelyLanguage && (
              <span className="text-gray-500 dark:text-gray-400">🌐 {rec.likelyLanguage}</span>
            )}
            {rec.likelyFramework && (
              <span className="text-gray-500 dark:text-gray-400">🧰 {rec.likelyFramework}</span>
            )}
            <span className="text-gray-500 dark:text-gray-400">📎 {rec.recommendedTestType}</span>
            {linkedFindings.length > 0 && (
              <button
                onClick={() => setShowLinked(!showLinked)}
                className="text-blue-600 dark:text-blue-400 underline cursor-pointer"
              >
                {linkedFindings.length} finding{linkedFindings.length !== 1 ? 's' : ''}
              </button>
            )}
          </div>
          {showLinked && linkedFindings.length > 0 && (
            <div className="mt-3 border-t border-gray-100 dark:border-gray-700 pt-3 space-y-2">
              {linkedFindings.map((f) => (
                <div key={f.id} className="text-xs text-gray-700 dark:text-gray-300">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-semibold mr-2 ${severityColor(f.severity)}`}>
                    {f.severity}
                  </span>
                  <span className="font-medium">{f.title}</span>
                  {f.endpoint?.path && (
                    <span className="ml-2 font-mono text-gray-500 dark:text-gray-400">
                      {f.endpoint.method ?? ''} {f.endpoint.path}
                    </span>
                  )}
                  {f.description && (
                    <p className="mt-1 text-gray-500 dark:text-gray-400 pl-2">{f.description}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CoverageIntelligencePage() {
  const [report, setReport] = useState<IntelligenceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [riskBandFilter, setRiskBandFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [endpointFilter, setEndpointFilter] = useState<string>('');

  useEffect(() => {
    fetch('/reports/coverage-intelligence.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: IntelligenceReport) => {
        setReport(data);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 dark:text-gray-400">
        Loading intelligence report…
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="p-6">
        <div className="p-4 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 text-yellow-800 dark:text-yellow-300">
          <p className="font-semibold">Coverage Intelligence report not available</p>
          <p className="text-sm mt-1">
            Run <code className="font-mono bg-yellow-100 dark:bg-yellow-900/40 px-1 rounded">
              api-coverage coverage-intelligence
            </code> to generate this report.
          </p>
          {error && <p className="text-xs mt-1 text-yellow-600 dark:text-yellow-400">{error}</p>}
        </div>
      </div>
    );
  }

  const { summary, findings, recommendations } = report;

  // Filtered recommendations (sorted by risk score descending by default)
  const filteredRecs = recommendations
    .filter((r) => {
      if (priorityFilter !== 'all' && r.priority !== priorityFilter) return false;
      if (riskBandFilter !== 'all' && riskBand(r.riskScore) !== riskBandFilter) return false;
      if (endpointFilter) {
        const ep = `${r.endpoint?.method ?? ''} ${r.endpoint?.path ?? ''}`.toLowerCase();
        if (!ep.includes(endpointFilter.toLowerCase())) return false;
      }
      return true;
    })
    .sort((a, b) => b.riskScore - a.riskScore);

  // Filtered findings
  const filteredFindings = findings.filter((f) => {
    if (categoryFilter !== 'all' && f.category !== categoryFilter) return false;
    if (severityFilter !== 'all' && f.severity !== severityFilter) return false;
    return true;
  });

  const categories = [...new Set(findings.map((f) => f.category))];
  const aiSummaryMarkdown = report
    ? `# Coverage Intelligence\n\n` +
      `**Findings:** ${summary.totalFindings} | **Recommendations:** ${summary.totalRecommendations} | ` +
      `**Max Risk:** ${summary.maxRiskScore} | **P0:** ${summary.recommendationsByPriority.P0 ?? 0}\n\n` +
      (summary.topRiskAreas.length
        ? `## Top Risk Areas\n${summary.topRiskAreas.map((a) => `- ${a}`).join('\n')}\n`
        : '')
    : undefined;

  return (
    <div data-testid="intelligence-section" className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Coverage Intelligence</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Project: <span className="font-medium">{report.projectName}</span> ·{' '}
          Generated: {new Date(report.generatedAt).toLocaleString()}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <SummaryCard
          label="Total Findings"
          value={summary.totalFindings}
          color={summary.totalFindings > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-400'}
        />
        <SummaryCard
          label="Recommendations"
          value={summary.totalRecommendations}
          color="text-blue-600 dark:text-blue-400"
        />
        <SummaryCard
          label="Max Risk Score"
          value={`${summary.maxRiskScore} (${riskBand(summary.maxRiskScore)})`}
          color={riskBandColor(summary.maxRiskScore)}
        />
        <SummaryCard
          label="P0 Actions"
          value={summary.recommendationsByPriority.P0 ?? 0}
          color={
            (summary.recommendationsByPriority.P0 ?? 0) > 0
              ? 'text-red-600 dark:text-red-400'
              : 'text-green-600 dark:text-green-400'
          }
        />
        <SummaryCard
          label="Critical Uncovered"
          value={summary.criticalUncoveredItems}
          color={summary.criticalUncoveredItems > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500'}
        />
        <SummaryCard
          label="Unprotected Security"
          value={summary.unprotectedSecurityFindings}
          color={summary.unprotectedSecurityFindings > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500'}
        />
        <SummaryCard label="Avg Risk Score" value={summary.avgRiskScore} />
      </div>

      {/* AI Summary Panel */}
      {aiSummaryMarkdown && (
        <AiSummaryPanel markdown={aiSummaryMarkdown} />
      )}

      {/* Missing Test Recommendations */}
      <section>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Missing Test Recommendations
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <input
              type="text"
              data-testid="endpoint-filter"
              value={endpointFilter}
              onChange={(e) => setEndpointFilter(e.target.value)}
              placeholder="Filter by endpoint…"
              className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-2 py-1 text-xs"
            />
            <span className="text-xs text-gray-600 dark:text-gray-300">
              {priorityFilter === 'all' ? 'All Priorities' : `Priority: ${priorityFilter}`}
            </span>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-2 py-1 text-xs"
            >
              <option value="all">All</option>
              <option value="P0">P0</option>
              <option value="P1">P1</option>
              <option value="P2">P2</option>
              <option value="P3">P3</option>
            </select>
            <span className="text-xs text-gray-600 dark:text-gray-300">
              {riskBandFilter === 'all' ? 'All Risk Bands' : `Band: ${riskBandFilter}`}
            </span>
            <select
              value={riskBandFilter}
              onChange={(e) => setRiskBandFilter(e.target.value)}
              className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-2 py-1 text-xs"
            >
              <option value="all">All</option>
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Moderate">Moderate</option>
              <option value="Low">Low</option>
            </select>
          </div>
        </div>
        {filteredRecs.length === 0 ? (
          <div className="text-sm text-gray-500 dark:text-gray-400 italic py-4">
            No recommendations match the current filters.
          </div>
        ) : (
          <div className="grid gap-3">
            {filteredRecs.map((rec) => (
              <RecommendationCard key={rec.id} rec={rec} allFindings={findings} />
            ))}
          </div>
        )}
      </section>

      {/* Functional Findings */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Functional Findings</h2>
          <div className="flex gap-2 text-sm">
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-2 py-1 text-xs"
            >
              <option value="all">All Severities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-2 py-1 text-xs"
            >
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        {filteredFindings.length === 0 ? (
          <div className="text-sm text-gray-500 dark:text-gray-400 italic py-4">
            No findings match the current filters.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Severity</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Title</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Category</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Endpoint</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-900">
                {filteredFindings.map((f) => (
                  <FindingRow key={f.id} finding={f} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Top Risk Areas */}
      {summary.topRiskAreas.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Top Risk Areas</h2>
          <ul className="space-y-1">
            {summary.topRiskAreas.map((area, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                <span className="text-red-500 mt-0.5">🔴</span>
                <span>{area}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
