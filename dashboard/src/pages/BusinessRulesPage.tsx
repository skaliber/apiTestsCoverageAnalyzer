import { useState } from 'react';
import { useCoverage } from '../context/CoverageContext';
import CoveragePieChart from '../components/CoveragePieChart';
import type { DetailItem } from '../types';

export default function BusinessRulesPage() {
  const { report } = useCoverage();
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const section = report?.details?.business;
  if (!section) {
    return (
      <div className="p-6 text-gray-500 dark:text-gray-400">
        No business rules data available.
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
    </div>
  );
}
