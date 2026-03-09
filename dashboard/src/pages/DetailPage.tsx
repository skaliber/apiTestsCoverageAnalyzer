import { useState } from 'react';
import type { DetailSection } from '../types';
import CoveragePieChart from '../components/CoveragePieChart';
import AiSummaryPanel from '../components/AiSummaryPanel';
import IntelligenceSection from '../components/IntelligenceSection';
import { useSettings } from '../context/SettingsContext';
import type { FunctionalFinding, MissingTestRecommendation } from '../context/IntelligenceContext';

interface Props {
  title: string;
  section: DetailSection | undefined;
  columns?: { key: string; label: string }[];
  renderRow?: (item: Record<string, unknown>, i: number) => React.ReactNode;
  aiSummary?: string;
  /** Coverage type for intelligence filtering (e.g. "endpoint", "security") */
  coverageType?: string;
  intelligenceFindings?: FunctionalFinding[];
  intelligenceRecommendations?: MissingTestRecommendation[];
}

const defaultColumns = [
  { key: 'id', label: 'Item' },
  { key: 'covered', label: 'Covered' },
];

export default function DetailPage({
  title,
  section,
  columns = defaultColumns,
  renderRow,
  aiSummary,
  coverageType,
  intelligenceFindings = [],
  intelligenceRecommendations = [],
}: Props) {
  const [search, setSearch] = useState('');
  const { showAiSummaries } = useSettings();

  if (!section) {
    return (
      <div className="p-6">
        <div className="text-gray-500 dark:text-gray-400 mb-4">
          No data available for {title}. Load a report that includes this section.
        </div>
        {coverageType && (intelligenceFindings.length > 0 || intelligenceRecommendations.length > 0) && (
          <IntelligenceSection
            coverageType={coverageType}
            findings={intelligenceFindings}
            recommendations={intelligenceRecommendations}
            alwaysShow
          />
        )}
      </div>
    );
  }

  const items = section.items as unknown as Record<string, unknown>[];
  const filtered = items.filter((item) =>
    String(item.id ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  const covered = items.filter((item) => item.covered === true).length;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">{title}</h1>

      {showAiSummaries && aiSummary && (
        <AiSummaryPanel markdown={aiSummary} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <div className="mb-3">
            <input
              type="text"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Search items"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700">
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-200"
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={columns.length}
                      className="px-3 py-4 text-center text-gray-400 dark:text-gray-500"
                    >
                      No results found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((item, i) =>
                    renderRow ? (
                      renderRow(item, i)
                    ) : (
                      <tr
                        key={String(item.id)}
                        className={
                          i % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-750'
                        }
                      >
                        {columns.map((col) => (
                          <td
                            key={col.key}
                            className="px-3 py-2 text-gray-700 dark:text-gray-300"
                          >
                            {col.key === 'covered' ? (
                              <span
                                className={
                                  item[col.key]
                                    ? 'text-green-600 dark:text-green-400 font-medium'
                                    : 'text-red-600 dark:text-red-400 font-medium'
                                }
                              >
                                {item[col.key] ? '✅ Yes' : '❌ No'}
                              </span>
                            ) : col.key === 'tests' ? (
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {(item[col.key] as string[])?.join(', ') || '-'}
                              </span>
                            ) : (
                              String(item[col.key] ?? '-')
                            )}
                          </td>
                        ))}
                      </tr>
                    ),
                  )
                )}
              </tbody>
            </table>
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

      {/* Intelligence Section */}
      {coverageType && (
        <IntelligenceSection
          coverageType={coverageType}
          findings={intelligenceFindings}
          recommendations={intelligenceRecommendations}
        />
      )}
    </div>
  );
}
