import { useState } from 'react';
import type { ScanDiagnostics } from '../types';

interface ScanDiagnosticsPanelProps {
  diagnostics: ScanDiagnostics;
  title?: string;
}

export default function ScanDiagnosticsPanel({
  diagnostics,
  title,
}: ScanDiagnosticsPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const panelId = 'scan-diagnostics-content';
  const panelTitle = title ?? 'Scan Diagnostics';

  return (
    <div
      data-testid="scan-diagnostics-panel"
      className="mb-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-xl"
      >
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2">
          {panelTitle}
          {diagnostics.sourceFileCount !== undefined && diagnostics.testFileCount !== undefined && (
            <span className="font-normal text-xs text-gray-500 dark:text-gray-400">
              ({diagnostics.sourceFileCount} source, {diagnostics.testFileCount} test files)
            </span>
          )}
        </span>
        <span
          aria-hidden="true"
          className={`text-gray-500 dark:text-gray-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
        >
          ▼
        </span>
      </button>

      {expanded && (
        <div
          id={panelId}
          role="region"
          aria-label={panelTitle}
          className="px-4 pb-4 space-y-3 text-sm"
        >
          {/* File counts */}
          {(diagnostics.sourceFileCount !== undefined || diagnostics.testFileCount !== undefined) && (
            <div className="flex gap-4">
              {diagnostics.sourceFileCount !== undefined && (
                <span className="text-gray-600 dark:text-gray-300">
                  Source files: <strong>{diagnostics.sourceFileCount}</strong>
                </span>
              )}
              {diagnostics.testFileCount !== undefined && (
                <span className="text-gray-600 dark:text-gray-300">
                  Test files: <strong>{diagnostics.testFileCount}</strong>
                </span>
              )}
            </div>
          )}

          {/* Scanned paths */}
          {diagnostics.scannedPaths && diagnostics.scannedPaths.length > 0 && (
            <CollapsibleList
              title="Scanned Paths"
              items={diagnostics.scannedPaths}
              className="text-gray-600 dark:text-gray-400"
            />
          )}

          {/* Ignored paths */}
          {diagnostics.ignoredPaths && diagnostics.ignoredPaths.length > 0 && (
            <CollapsibleList
              title="Ignored Paths"
              items={diagnostics.ignoredPaths}
              className="text-gray-600 dark:text-gray-400"
            />
          )}

          {/* Parse failures */}
          {diagnostics.parseFailures && diagnostics.parseFailures.length > 0 && (
            <div>
              <p className="font-semibold text-red-700 dark:text-red-400 mb-1">Parse Failures</p>
              <ul className="list-disc list-inside space-y-0.5 text-red-600 dark:text-red-400 font-mono text-xs">
                {diagnostics.parseFailures.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Unsupported patterns */}
          {diagnostics.unsupportedPatterns && diagnostics.unsupportedPatterns.length > 0 && (
            <div>
              <p className="font-semibold text-amber-700 dark:text-amber-400 mb-1">
                Unsupported Patterns
              </p>
              <ul className="list-disc list-inside space-y-0.5 text-amber-600 dark:text-amber-400 text-xs">
                {diagnostics.unsupportedPatterns.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Manifests found */}
          {diagnostics.manifestsFound && diagnostics.manifestsFound.length > 0 && (
            <div>
              <p className="font-semibold text-gray-700 dark:text-gray-200 mb-1">
                Manifests Found
              </p>
              <ul className="list-disc list-inside space-y-0.5 text-gray-600 dark:text-gray-400 font-mono text-xs">
                {diagnostics.manifestsFound.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Packages detected */}
          {diagnostics.packagesDetected && diagnostics.packagesDetected.length > 0 && (
            <div>
              <p className="font-semibold text-gray-700 dark:text-gray-200 mb-1">
                Packages Detected
              </p>
              <ul className="list-disc list-inside space-y-0.5 text-gray-600 dark:text-gray-400 text-xs">
                {diagnostics.packagesDetected.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CollapsibleList({
  title,
  items,
  className,
}: {
  title: string;
  items: string[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-1 mb-1"
      >
        <span
          aria-hidden="true"
          className={`text-xs transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
        >
          ▶
        </span>
        {title} ({items.length})
      </button>
      {open && (
        <ul className={`list-disc list-inside space-y-0.5 font-mono text-xs ${className ?? ''}`}>
          {items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
