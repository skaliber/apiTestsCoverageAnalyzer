import { useState, useMemo } from 'react';

interface AiFlowGap {
  gapId: string;
  priority: string;
  riskScore: number;
  type: string;
  endpoint: {
    method: string;
    path: string;
    auth: { required: boolean; type?: string; scheme?: string };
  };
  missingTestCases: Array<{ id: string; description: string; expectedStatus: number }>;
  copilotPrompt: string;
  suggestedOutputPath: string;
  existingSimilarTests: string[];
  generatedCode?: string;
}

interface AiReadyFlows {
  generatedAt: string;
  project: { name: string; language: string; testFramework: string; appImportPath: string };
  gaps: AiFlowGap[];
}

function priorityColor(priority: string): string {
  switch (priority) {
    case 'P0': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    case 'P1': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
    case 'P2': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    default: return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
  }
}

function copyToClipboard(text: string): void {
  void navigator.clipboard.writeText(text);
}

function downloadFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadAllAsZip(gaps: AiFlowGap[]): void {
  // Without JSZip available, download as concatenated file
  const content = gaps
    .filter(g => g.generatedCode)
    .map(g => `// ===== FILE: ${g.suggestedOutputPath} =====\n\n${g.generatedCode}`)
    .join('\n\n');
  downloadFile('generated-tests.txt', content);
}

export default function TestGeneratorPage() {
  const [flows, setFlows] = useState<AiReadyFlows | null>(null);
  const [selectedGapId, setSelectedGapId] = useState<string | null>(null);
  const [filterPriority, setFilterPriority] = useState<string>('All');
  const [filterType, setFilterType] = useState<string>('All');
  const [copied, setCopied] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Load ai-ready-flows.json on mount
  useMemo(() => {
    fetch('/reports/ai-ready-flows.json')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<AiReadyFlows>;
      })
      .then(data => {
        setFlows(data);
        if (data.gaps.length > 0) setSelectedGapId(data.gaps[0].gapId);
      })
      .catch((err: unknown) => {
        setLoadError(String(err));
      });
  }, []);

  const filteredGaps = useMemo(() => {
    if (!flows) return [];
    return flows.gaps.filter(g => {
      if (filterPriority !== 'All' && g.priority !== filterPriority) return false;
      if (filterType !== 'All' && g.type !== filterType) return false;
      return true;
    });
  }, [flows, filterPriority, filterType]);

  const selectedGap = filteredGaps.find(g => g.gapId === selectedGapId) ?? filteredGaps[0] ?? null;

  function handleCopy(text: string, key: string): void {
    copyToClipboard(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  if (loadError) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Test Generator</h1>
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4">
          <p className="text-yellow-800 dark:text-yellow-200 font-medium">No AI flows data found.</p>
          <p className="text-yellow-700 dark:text-yellow-300 text-sm mt-1">
            Run <code className="bg-yellow-100 dark:bg-yellow-800 px-1 rounded">make export-ai-flows</code> to generate AI-ready flows data.
          </p>
          <p className="text-yellow-600 dark:text-yellow-400 text-xs mt-1">Error: {loadError}</p>
        </div>
      </div>
    );
  }

  if (!flows) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Test Generator</h1>
        <div className="animate-pulse text-gray-500">Loading AI flows data...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Test Generator</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {flows.gaps.length} gaps detected · Project: {flows.project.name} · {flows.project.testFramework}
          </p>
        </div>
        <button
          onClick={() => downloadAllAsZip(flows.gaps)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          Generate All
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Left Panel — Gap List */}
        <div className="w-72 shrink-0 border-r border-gray-200 dark:border-gray-700 flex flex-col">
          {/* Filters */}
          <div className="p-3 border-b border-gray-200 dark:border-gray-700 space-y-2">
            <select
              value={filterPriority}
              onChange={e => setFilterPriority(e.target.value)}
              className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="All">All Priorities</option>
              {['P0', 'P1', 'P2', 'P3', 'P4', 'P5'].map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="All">All Types</option>
              {['endpoint', 'security', 'error', 'business', 'integration', 'parameter'].map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Gap List */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-2 text-xs text-gray-500 dark:text-gray-400 font-medium px-3">
              Gaps ({filteredGaps.length})
            </div>
            {filteredGaps.map(gap => (
              <button
                key={gap.gapId}
                onClick={() => setSelectedGapId(gap.gapId)}
                className={`w-full text-left px-3 py-2 text-sm transition-colors border-l-2 ${
                  selectedGapId === gap.gapId
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500 text-gray-900 dark:text-white'
                    : 'border-transparent text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <div className="font-medium truncate">
                  <span className="text-xs font-bold text-gray-500 dark:text-gray-400">{gap.endpoint.method}</span>{' '}
                  {gap.endpoint.path}
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${priorityColor(gap.priority)}`}>
                    {gap.priority}
                  </span>
                  <span className="text-xs text-gray-400">Risk: {gap.riskScore}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right Panel — Generated Code */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedGap ? (
            <>
              {/* Gap Header */}
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-900 dark:text-white">
                    {selectedGap.endpoint.method} {selectedGap.endpoint.path}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${priorityColor(selectedGap.priority)}`}>
                    {selectedGap.priority}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">Risk: {selectedGap.riskScore}</span>
                  <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded">
                    {selectedGap.type}
                  </span>
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Missing: {selectedGap.missingTestCases.length} test case(s) ·
                  Output: <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded">{selectedGap.suggestedOutputPath}</code>
                </div>
              </div>

              {/* Code Area */}
              <div className="flex-1 overflow-auto p-4">
                {selectedGap.generatedCode ? (
                  <pre className="bg-gray-900 text-green-300 rounded-lg p-4 text-xs overflow-auto font-mono whitespace-pre leading-relaxed">
                    {selectedGap.generatedCode}
                  </pre>
                ) : (
                  <div className="text-gray-500 dark:text-gray-400 text-sm">
                    No generated code available for this gap.
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex gap-2 flex-wrap">
                <button
                  onClick={() => handleCopy(selectedGap.generatedCode ?? '', 'code')}
                  className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  {copied === 'code' ? 'Copied!' : 'Copy to Clipboard'}
                </button>
                <button
                  onClick={() => downloadFile(
                    selectedGap.suggestedOutputPath.split('/').pop() ?? 'test.ts',
                    selectedGap.generatedCode ?? ''
                  )}
                  className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  Download
                </button>
                <button
                  onClick={() => handleCopy(selectedGap.copilotPrompt, 'copilot')}
                  className="px-3 py-1.5 text-sm bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded hover:bg-purple-200 dark:hover:bg-purple-800/30 transition-colors"
                >
                  {copied === 'copilot' ? 'Copied!' : 'Copy Copilot Prompt'}
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-600">
              Select a gap from the left panel to view generated test code
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
