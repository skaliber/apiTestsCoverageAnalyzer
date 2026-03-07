/**
 * IntelligenceSection – embeddable intelligence panel for any category page.
 *
 * Shows:
 *  - Filterable + sortable recommendations table
 *  - Filterable findings list
 *  - AI-friendly markdown summary (collapsed by default)
 *  - Drill-down from finding → recommendation
 *
 * Used on Overview, Endpoints, Parameters, Business Rules, Integration Flows,
 * Security, Error Handling, Performance, and Compatibility pages.
 */

import { useState, useMemo } from 'react';
import type { FunctionalFinding, MissingTestRecommendation } from '../context/IntelligenceContext';
import { riskBand } from '../context/IntelligenceContext';
import AiSummaryPanel from './AiSummaryPanel';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function severityBadge(s: string) {
  const base = 'inline-block px-2 py-0.5 rounded text-xs font-semibold';
  switch (s) {
    case 'CRITICAL': return `${base} bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300`;
    case 'HIGH':     return `${base} bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300`;
    case 'MEDIUM':   return `${base} bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300`;
    default:         return `${base} bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300`;
  }
}

function priorityBadge(p: string) {
  const base = 'inline-block px-2 py-0.5 rounded text-xs font-bold';
  switch (p) {
    case 'P0': return `${base} bg-red-600 text-white`;
    case 'P1': return `${base} bg-orange-500 text-white`;
    case 'P2': return `${base} bg-yellow-500 text-white`;
    default:   return `${base} bg-gray-400 text-white`;
  }
}

function riskBandColor(score: number): string {
  if (score >= 75) return 'text-red-600 dark:text-red-400 font-bold';
  if (score >= 50) return 'text-orange-600 dark:text-orange-400 font-semibold';
  if (score >= 25) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-gray-500';
}

function epLabel(ep?: { method?: string; path?: string }): string {
  if (!ep) return '—';
  return `${ep.method ?? ''} ${ep.path ?? ''}`.trim();
}

function sortNumber(a: number, b: number, dir: 'asc' | 'desc') {
  return dir === 'asc' ? a - b : b - a;
}

// ─── Filter bar ───────────────────────────────────────────────────────────────

interface FilterState {
  priority: string;
  riskBandFilter: string;
  language: string;
  framework: string;
  severity: string;
  scanner: string;
}

function FilterBar({
  filters,
  setFilters,
  languages,
  frameworks,
  scanners,
}: {
  filters: FilterState;
  setFilters: (f: FilterState) => void;
  languages: string[];
  frameworks: string[];
  scanners: string[];
}) {
  const sel = (value: string, field: keyof FilterState) =>
    setFilters({ ...filters, [field]: value });

  const selectClass =
    'rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-2 py-1 text-xs';

  return (
    <div className="flex flex-wrap gap-2 mb-3" data-testid="intelligence-filters">
      <select value={filters.priority} onChange={(e) => sel(e.target.value, 'priority')} className={selectClass}>
        <option value="all">All Priorities</option>
        <option value="P0">P0</option>
        <option value="P1">P1</option>
        <option value="P2">P2</option>
        <option value="P3">P3</option>
      </select>
      <select value={filters.riskBandFilter} onChange={(e) => sel(e.target.value, 'riskBandFilter')} className={selectClass}>
        <option value="all">All Risk Bands</option>
        <option value="Critical">Critical</option>
        <option value="High">High</option>
        <option value="Moderate">Moderate</option>
        <option value="Low">Low</option>
      </select>
      <select value={filters.severity} onChange={(e) => sel(e.target.value, 'severity')} className={selectClass}>
        <option value="all">All Severities</option>
        <option value="CRITICAL">Critical</option>
        <option value="HIGH">High</option>
        <option value="MEDIUM">Medium</option>
        <option value="LOW">Low</option>
      </select>
      {languages.length > 0 && (
        <select value={filters.language} onChange={(e) => sel(e.target.value, 'language')} className={selectClass}>
          <option value="all">All Languages</option>
          {languages.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      )}
      {frameworks.length > 0 && (
        <select value={filters.framework} onChange={(e) => sel(e.target.value, 'framework')} className={selectClass}>
          <option value="all">All Frameworks</option>
          {frameworks.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      )}
      {scanners.length > 0 && (
        <select value={filters.scanner} onChange={(e) => sel(e.target.value, 'scanner')} className={selectClass}>
          <option value="all">All Scanners</option>
          {scanners.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      )}
    </div>
  );
}

// ─── Recommendation row with drill-down ──────────────────────────────────────

function RecRow({
  rec,
  findings,
  onFindingClick,
}: {
  rec: MissingTestRecommendation;
  findings: FunctionalFinding[];
  onFindingClick: (f: FunctionalFinding) => void;
}) {
  const linkedFindings = findings.filter((f) => rec.linkedFindingIds.includes(f.id));

  return (
    <tr className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750">
      <td className="px-3 py-2">
        <span className={priorityBadge(rec.priority)}>{rec.priority}</span>
      </td>
      <td className="px-3 py-2 text-sm text-gray-900 dark:text-gray-100 max-w-xs">
        <div className="font-medium leading-tight">{rec.title}</div>
        {rec.endpoint?.path && (
          <code className="text-xs text-gray-500 dark:text-gray-400">
            {rec.endpoint.method} {rec.endpoint.path}
          </code>
        )}
      </td>
      <td className="px-3 py-2">
        <span className={`text-sm font-semibold ${riskBandColor(rec.riskScore)}`}>
          {rec.riskScore} <span className="text-xs font-normal">({riskBand(rec.riskScore)})</span>
        </span>
      </td>
      <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
        {rec.recommendedTestType}
      </td>
      <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
        {rec.likelyLanguage ?? '—'} / {rec.likelyFramework ?? '—'}
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {linkedFindings.map((f) => (
            <button
              key={f.id}
              onClick={() => onFindingClick(f)}
              className="text-xs px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
              title={f.title}
            >
              {f.category}
            </button>
          ))}
        </div>
      </td>
    </tr>
  );
}

// ─── Finding detail drawer ────────────────────────────────────────────────────

function FindingDrawer({
  finding,
  recommendations,
  onClose,
}: {
  finding: FunctionalFinding;
  recommendations: MissingTestRecommendation[];
  onClose: () => void;
}) {
  const linkedRecs = recommendations.filter((r) => r.linkedFindingIds.includes(finding.id));

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      data-testid="finding-drawer"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-900 shadow-2xl overflow-y-auto">
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white pr-8 leading-tight">
              {finding.title}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none"
            >
              ✕
            </button>
          </div>

          <div className="space-y-3 text-sm">
            <div className="flex gap-2">
              <span className={severityBadge(finding.severity)}>{finding.severity}</span>
              <span className="text-gray-500 dark:text-gray-400">{finding.category}</span>
              <span className="text-gray-400 dark:text-gray-500">{finding.source}</span>
            </div>

            <p className="text-gray-700 dark:text-gray-300">{finding.description}</p>

            {finding.endpoint?.path && (
              <div>
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Endpoint</span>
                <code className="block mt-1 px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-xs">
                  {epLabel(finding.endpoint)}
                </code>
              </div>
            )}

            {finding.missingTestTypes && finding.missingTestTypes.length > 0 && (
              <div>
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Missing Test Types</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {finding.missingTestTypes.map((t) => (
                    <span key={t} className="px-1.5 py-0.5 rounded bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 text-xs">{t}</span>
                  ))}
                </div>
              </div>
            )}

            {finding.frameworkHints && finding.frameworkHints.length > 0 && (
              <div>
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Framework Hints</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {finding.frameworkHints.map((f) => (
                    <span key={f} className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs">{f}</span>
                  ))}
                </div>
              </div>
            )}

            {finding.relatedScanners && finding.relatedScanners.length > 0 && (
              <div>
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Scanner Findings</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {finding.relatedScanners.map((s) => (
                    <span key={s} className="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-xs">{s}</span>
                  ))}
                </div>
              </div>
            )}

            {linkedRecs.length > 0 && (
              <div>
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Linked Recommendations</span>
                <div className="mt-2 space-y-2">
                  {linkedRecs.map((r) => (
                    <div key={r.id} className="p-2 rounded bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                      <div className="flex items-center gap-2">
                        <span className={priorityBadge(r.priority)}>{r.priority}</span>
                        <span className={`text-xs font-semibold ${riskBandColor(r.riskScore)}`}>Score: {r.riskScore}</span>
                      </div>
                      <p className="mt-1 text-xs text-gray-700 dark:text-gray-300">{r.title}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type SortField = 'riskScore' | 'severity' | 'priority' | 'linkedFindings';

const PRIORITY_ORDER: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

interface IntelligenceSectionProps {
  /** Coverage type label for filtering (e.g. "endpoint", "security", "business") */
  coverageType: string;
  findings: FunctionalFinding[];
  recommendations: MissingTestRecommendation[];
  /** Whether to show section even when empty (default: show placeholder) */
  alwaysShow?: boolean;
}

export default function IntelligenceSection({
  coverageType,
  findings,
  recommendations,
  alwaysShow = false,
}: IntelligenceSectionProps) {
  const [filters, setFilters] = useState<FilterState>({
    priority: 'all',
    riskBandFilter: 'all',
    language: 'all',
    framework: 'all',
    severity: 'all',
    scanner: 'all',
  });
  const [sortField, setSortField] = useState<SortField>('riskScore');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [drawerFinding, setDrawerFinding] = useState<FunctionalFinding | null>(null);

  // Derived option lists
  const languages = useMemo(
    () => [...new Set(recommendations.flatMap((r) => r.likelyLanguage ? [r.likelyLanguage] : []))],
    [recommendations],
  );
  const frameworks = useMemo(
    () => [...new Set(recommendations.flatMap((r) => r.likelyFramework ? [r.likelyFramework] : []))],
    [recommendations],
  );
  const scanners = useMemo(
    () => [...new Set(findings.flatMap((f) => f.relatedScanners ?? []))],
    [findings],
  );

  // Filter recommendations
  const filteredRecs = useMemo(() => {
    return recommendations
      .filter((r) => {
        if (filters.priority !== 'all' && r.priority !== filters.priority) return false;
        if (filters.riskBandFilter !== 'all' && riskBand(r.riskScore) !== filters.riskBandFilter) return false;
        if (filters.language !== 'all' && r.likelyLanguage !== filters.language) return false;
        if (filters.framework !== 'all' && r.likelyFramework !== filters.framework) return false;
        return true;
      })
      .sort((a, b) => {
        switch (sortField) {
          case 'riskScore':
            return sortNumber(a.riskScore, b.riskScore, sortDir);
          case 'priority':
            return sortNumber(
              PRIORITY_ORDER[a.priority] ?? 9,
              PRIORITY_ORDER[b.priority] ?? 9,
              sortDir,
            );
          case 'linkedFindings':
            return sortNumber(a.linkedFindingIds.length, b.linkedFindingIds.length, sortDir);
          default:
            return 0;
        }
      });
  }, [recommendations, filters, sortField, sortDir]);

  // Filter findings
  const filteredFindings = useMemo(() => {
    return findings.filter((f) => {
      if (filters.severity !== 'all' && f.severity !== filters.severity) return false;
      if (
        filters.scanner !== 'all' &&
        !(f.relatedScanners ?? []).includes(filters.scanner)
      )
        return false;
      return true;
    });
  }, [findings, filters]);

  // AI markdown summary
  const aiMarkdown = useMemo(() => {
    if (recommendations.length === 0 && findings.length === 0) return null;
    const lines: string[] = [
      `## Coverage Intelligence — ${coverageType}`,
      ``,
      `**Findings:** ${findings.length} | **Recommendations:** ${recommendations.length}`,
      ``,
    ];
    if (filteredRecs.length > 0) {
      lines.push('### Top Recommendations', '');
      filteredRecs.slice(0, 5).forEach((r) => {
        lines.push(`- **[${r.priority}]** ${r.title} (Risk: ${r.riskScore})`);
      });
    }
    return lines.join('\n');
  }, [coverageType, findings.length, recommendations.length, filteredRecs]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }

  function sortIcon(field: SortField) {
    if (sortField !== field) return '↕';
    return sortDir === 'asc' ? '↑' : '↓';
  }

  if (!alwaysShow && findings.length === 0 && recommendations.length === 0) {
    return null;
  }

  return (
    <div
      className="mt-6 border border-blue-200 dark:border-blue-800 rounded-xl overflow-hidden"
      data-testid="intelligence-section"
    >
      {/* Header */}
      <div className="bg-blue-50 dark:bg-blue-900/20 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-blue-600 dark:text-blue-400 font-bold text-sm">🧠 Coverage Intelligence</span>
          {recommendations.length > 0 && (
            <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">
              {recommendations.length} recommendation{recommendations.length !== 1 ? 's' : ''}
            </span>
          )}
          {findings.filter((f) => f.severity === 'CRITICAL' || f.severity === 'HIGH').length > 0 && (
            <span className="bg-red-600 text-white text-xs px-2 py-0.5 rounded-full">
              {findings.filter((f) => f.severity === 'CRITICAL' || f.severity === 'HIGH').length} high-risk
            </span>
          )}
        </div>
      </div>

      <div className="p-4 bg-white dark:bg-gray-900">
        {/* AI Summary (collapsed by default) */}
        {aiMarkdown && <AiSummaryPanel markdown={aiMarkdown} />}

        {/* Filters */}
        <FilterBar
          filters={filters}
          setFilters={setFilters}
          languages={languages}
          frameworks={frameworks}
          scanners={scanners}
        />

        {/* Recommendations table */}
        {filteredRecs.length > 0 ? (
          <div className="overflow-x-auto mb-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Missing Test Recommendations
            </h3>
            <table className="w-full text-xs">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th
                    className="px-3 py-2 text-left font-semibold text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:text-gray-700 dark:hover:text-gray-200"
                    onClick={() => toggleSort('priority')}
                  >
                    Priority {sortIcon('priority')}
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-500 dark:text-gray-400 uppercase">
                    Recommendation
                  </th>
                  <th
                    className="px-3 py-2 text-left font-semibold text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:text-gray-700 dark:hover:text-gray-200"
                    onClick={() => toggleSort('riskScore')}
                  >
                    Risk {sortIcon('riskScore')}
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-500 dark:text-gray-400 uppercase">
                    Test Type
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-500 dark:text-gray-400 uppercase">
                    Language / Framework
                  </th>
                  <th
                    className="px-3 py-2 text-left font-semibold text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:text-gray-700 dark:hover:text-gray-200"
                    onClick={() => toggleSort('linkedFindings')}
                  >
                    Linked Findings {sortIcon('linkedFindings')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filteredRecs.map((rec) => (
                  <RecRow
                    key={rec.id}
                    rec={rec}
                    findings={filteredFindings}
                    onFindingClick={setDrawerFinding}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-xs text-gray-400 dark:text-gray-500 italic py-2">
            No recommendations match the current filters.
          </div>
        )}

        {/* Findings summary */}
        {filteredFindings.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Functional Findings ({filteredFindings.length})
            </h3>
            <div className="space-y-1">
              {filteredFindings.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setDrawerFinding(f)}
                  className="w-full text-left flex items-start gap-2 px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <span className={severityBadge(f.severity)}>{f.severity}</span>
                  <span className="text-xs text-gray-700 dark:text-gray-300 flex-1 leading-tight">{f.title}</span>
                  {f.endpoint?.path && (
                    <code className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                      {f.endpoint.method} {f.endpoint.path}
                    </code>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Drawer */}
      {drawerFinding && (
        <FindingDrawer
          finding={drawerFinding}
          recommendations={recommendations}
          onClose={() => setDrawerFinding(null)}
        />
      )}
    </div>
  );
}
