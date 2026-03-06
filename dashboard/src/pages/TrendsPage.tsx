import { useRef } from 'react';
import { useCoverage } from '../context/CoverageContext';
import type { CoverageReport } from '../types';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16'];

export default function TrendsPage() {
  const { historicalReports, addHistoricalReport } = useCoverage();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string) as CoverageReport;
        addHistoricalReport(file.name, data);
      } catch {
        alert('Failed to parse JSON file.');
      }
    };
    reader.readAsText(file);
    if (inputRef.current) inputRef.current.value = '';
  }

  // Build chart data: each point is a report, each line is a coverage type
  const types =
    historicalReports.length > 0
      ? historicalReports[0].report.summary.map((s) => s.type)
      : [];

  const chartData = historicalReports.map((r) => {
    const point: Record<string, string | number> = {
      name: r.name.replace('.json', '').slice(0, 20),
    };
    r.report.summary.forEach((s) => {
      point[s.type] = s.coveragePercent;
    });
    return point;
  });

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Coverage Trends</h1>
        <div>
          <input
            ref={inputRef}
            type="file"
            accept=".json"
            onChange={handleFile}
            className="hidden"
            id="trends-upload"
          />
          <label
            htmlFor="trends-upload"
            className="cursor-pointer inline-flex items-center px-4 py-2 rounded-lg border border-blue-400 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-sm font-medium hover:bg-blue-100 dark:hover:bg-blue-800/30 transition-colors"
          >
            📂 Add Historical Report
          </label>
        </div>
      </div>

      {historicalReports.length < 2 ? (
        <div className="p-4 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-300 text-sm">
          Load at least 2 reports to see trends. Currently loaded: {historicalReports.length}.
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <ResponsiveContainer width="100%" height={380}>
            <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value) => `${value}%`} />
              <Legend />
              {types.map((type, i) => (
                <Line
                  key={type}
                  type="monotone"
                  dataKey={type}
                  stroke={COLORS[i % COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="mt-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-3">Loaded Reports</h2>
        <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
          {historicalReports.map((r) => (
            <li key={r.name} className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              <span>{r.name}</span>
              <span className="text-gray-400 dark:text-gray-500 text-xs">
                ({new Date(r.report.generatedAt).toLocaleDateString()})
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
