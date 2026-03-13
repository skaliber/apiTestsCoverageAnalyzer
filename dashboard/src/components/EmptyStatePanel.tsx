interface EmptyStatePanelProps {
  sectionName: string;
  scannedInfo?: {
    filesScanned?: number;
    manifestsChecked?: string[];
    signalsSearched?: string[];
    parserLimitations?: string[];
    suggestedNextSteps?: string[];
  };
  stackSuggestions?: string[];
}

export default function EmptyStatePanel({
  sectionName,
  scannedInfo,
  stackSuggestions,
}: EmptyStatePanelProps) {
  return (
    <div
      data-testid="empty-state-panel"
      className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-5 space-y-4 text-sm"
    >
      <h3 className="text-base font-semibold text-blue-800 dark:text-blue-200">
        No {sectionName} data found
      </h3>

      {/* What was searched */}
      {scannedInfo && (scannedInfo.filesScanned !== undefined || scannedInfo.manifestsChecked?.length) && (
        <div>
          <p className="font-semibold text-blue-700 dark:text-blue-300 mb-1">What was searched</p>
          <ul className="list-disc list-inside space-y-0.5 text-gray-700 dark:text-gray-300">
            {scannedInfo.filesScanned !== undefined && (
              <li>{scannedInfo.filesScanned} files scanned</li>
            )}
            {scannedInfo.manifestsChecked?.map((m, i) => (
              <li key={i}>Checked manifest: {m}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Signals searched for */}
      {scannedInfo?.signalsSearched && scannedInfo.signalsSearched.length > 0 && (
        <div>
          <p className="font-semibold text-blue-700 dark:text-blue-300 mb-1">
            Signals searched for
          </p>
          <ul className="list-disc list-inside space-y-0.5 text-gray-700 dark:text-gray-300">
            {scannedInfo.signalsSearched.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Parser limitations */}
      {scannedInfo?.parserLimitations && scannedInfo.parserLimitations.length > 0 && (
        <div>
          <p className="font-semibold text-amber-700 dark:text-amber-300 mb-1">
            Parser Limitations
          </p>
          <ul className="list-disc list-inside space-y-0.5 text-amber-700 dark:text-amber-400">
            {scannedInfo.parserLimitations.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Stack-specific suggestions */}
      {stackSuggestions && stackSuggestions.length > 0 && (
        <div>
          <p className="font-semibold text-blue-700 dark:text-blue-300 mb-1">
            Stack-specific Suggestions
          </p>
          <ul className="list-disc list-inside space-y-0.5 text-gray-700 dark:text-gray-300">
            {stackSuggestions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Suggested next steps */}
      {scannedInfo?.suggestedNextSteps && scannedInfo.suggestedNextSteps.length > 0 && (
        <div>
          <p className="font-semibold text-blue-700 dark:text-blue-300 mb-1">
            Suggested Next Steps
          </p>
          <ul className="list-disc list-inside space-y-0.5 text-gray-700 dark:text-gray-300">
            {scannedInfo.suggestedNextSteps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
