import { useState, useEffect } from 'react';

interface QualityDimensions {
  assertionDepth: number;
  negativePathCoverage: number;
  boundaryCoverage: number;
  authCoverage: number;
  testIndependence: number;
}

interface FileQualityScore {
  file: string;
  score: number;
  dimensions: QualityDimensions;
  issues: string[];
  strengths: string[];
}

interface HighRiskLowQualityGap {
  endpoint: string;
  qualityScore: number;
  riskScore: number;
  primaryIssue: string;
}

interface TestQualityReport {
  overallScore: number;
  byFile: FileQualityScore[];
  lowestQualityFiles: string[];
  highestRiskLowQualityGaps: HighRiskLowQualityGap[];
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-600 dark:text-green-400';
  if (score >= 60) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

function scoreBarColor(score: number): string {
  if (score >= 80) return 'bg-green-500';
  if (score >= 60) return 'bg-yellow-500';
  return 'bg-red-500';
}

function ScoreBar({ score, max = 20 }: { score: number; max?: number }) {
  const pct = (score / max) * 100;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all ${scoreBarColor((score / max) * 100)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-sm font-medium w-12 text-right ${scoreColor((score / max) * 100)}`}>
        {score}/{max}
      </span>
    </div>
  );
}

export default function TestQualityPage() {
  const [report, setReport] = useState<TestQualityReport | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/reports/test-quality.json')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<TestQualityReport>;
      })
      .then(data => {
        setReport(data);
        if (data.byFile.length > 0) setSelectedFile(data.byFile[0].file);
      })
      .catch((err: unknown) => setLoadError(String(err)));
  }, []);

  if (loadError) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Test Quality Score</h1>
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4">
          <p className="text-yellow-800 dark:text-yellow-200 font-medium">No quality report found.</p>
          <p className="text-yellow-700 dark:text-yellow-300 text-sm mt-1">
            Run <code className="bg-yellow-100 dark:bg-yellow-800 px-1 rounded">make score-tests</code> to generate a quality report.
          </p>
          <p className="text-yellow-600 dark:text-yellow-400 text-xs mt-1">Error: {loadError}</p>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Test Quality Score</h1>
        <div className="animate-pulse text-gray-500">Loading quality data...</div>
      </div>
    );
  }

  const selectedFileData = report.byFile.find(f => f.file === selectedFile);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Test Quality Score</h1>
        <span className={`text-3xl font-bold ${scoreColor(report.overallScore)}`}>
          {report.overallScore}/100
        </span>
      </div>

      {/* Overall Dimensions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Quality Distribution</h2>
          <div className="space-y-3">
            {report.byFile.length > 0 && (() => {
              const avg = (key: keyof QualityDimensions) =>
                Math.round(report.byFile.reduce((s, f) => s + f.dimensions[key], 0) / report.byFile.length);
              return (
                <>
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Assertion Depth</div>
                    <ScoreBar score={avg('assertionDepth')} />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Negative Path Coverage</div>
                    <ScoreBar score={avg('negativePathCoverage')} />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Auth Coverage</div>
                    <ScoreBar score={avg('authCoverage')} />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Boundary Tests</div>
                    <ScoreBar score={avg('boundaryCoverage')} />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Test Independence</div>
                    <ScoreBar score={avg('testIndependence')} />
                  </div>
                </>
              );
            })()}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Lowest Quality Files</h2>
          <div className="space-y-2">
            {report.lowestQualityFiles.map(file => {
              const entry = report.byFile.find(f => f.file === file);
              return (
                <div key={file} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400 truncate flex-1 mr-2" title={file}>
                    {file.split('/').pop()}
                  </span>
                  <span className={`font-bold ${scoreColor(entry?.score ?? 0)}`}>
                    {entry?.score ?? '?'}/100
                  </span>
                </div>
              );
            })}
          </div>

          {report.highestRiskLowQualityGaps.length > 0 && (
            <>
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 mt-4">High Risk + Low Quality</h2>
              <div className="space-y-2">
                {report.highestRiskLowQualityGaps.map(gap => (
                  <div key={gap.endpoint} className="text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600 dark:text-gray-400 truncate">{gap.endpoint.split('/').pop()}</span>
                      <span className={`font-bold ${scoreColor(gap.qualityScore)}`}>{gap.qualityScore}</span>
                    </div>
                    <div className="text-xs text-gray-400 dark:text-gray-500">→ {gap.primaryIssue}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* File List + Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* File List */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="p-3 border-b border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-300">
            All Files ({report.byFile.length})
          </div>
          <div className="overflow-y-auto max-h-64">
            {[...report.byFile].sort((a, b) => a.score - b.score).map(f => (
              <button
                key={f.file}
                onClick={() => setSelectedFile(f.file)}
                className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between border-l-2 transition-colors ${
                  selectedFile === f.file
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500'
                    : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <span className="text-gray-600 dark:text-gray-400 truncate flex-1 mr-2" title={f.file}>
                  {f.file.split('/').pop()}
                </span>
                <span className={`font-bold ${scoreColor(f.score)}`}>{f.score}</span>
              </button>
            ))}
          </div>
        </div>

        {/* File Detail */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          {selectedFileData ? (
            <>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 truncate">
                  {selectedFileData.file}
                </h3>
                <span className={`text-2xl font-bold ${scoreColor(selectedFileData.score)}`}>
                  {selectedFileData.score}/100
                </span>
              </div>

              <div className="space-y-2 mb-4">
                <ScoreBar score={selectedFileData.dimensions.assertionDepth} />
                <div className="text-xs text-gray-400 -mt-1">Assertion Depth</div>
                <ScoreBar score={selectedFileData.dimensions.negativePathCoverage} />
                <div className="text-xs text-gray-400 -mt-1">Negative Path Coverage</div>
                <ScoreBar score={selectedFileData.dimensions.authCoverage} />
                <div className="text-xs text-gray-400 -mt-1">Auth Coverage</div>
                <ScoreBar score={selectedFileData.dimensions.boundaryCoverage} />
                <div className="text-xs text-gray-400 -mt-1">Boundary Coverage</div>
                <ScoreBar score={selectedFileData.dimensions.testIndependence} />
                <div className="text-xs text-gray-400 -mt-1">Test Independence</div>
              </div>

              {selectedFileData.issues.length > 0 && (
                <div className="mb-3">
                  <div className="text-xs font-semibold text-red-600 dark:text-red-400 mb-1">Issues</div>
                  <ul className="space-y-1">
                    {selectedFileData.issues.map((issue, i) => (
                      <li key={i} className="text-xs text-gray-600 dark:text-gray-400 flex gap-1">
                        <span className="text-red-400">•</span> {issue}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedFileData.strengths.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-green-600 dark:text-green-400 mb-1">Strengths</div>
                  <ul className="space-y-1">
                    {selectedFileData.strengths.map((s, i) => (
                      <li key={i} className="text-xs text-gray-600 dark:text-gray-400 flex gap-1">
                        <span className="text-green-400">•</span> {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-gray-400 dark:text-gray-600">Select a file to view details</div>
          )}
        </div>
      </div>
    </div>
  );
}
