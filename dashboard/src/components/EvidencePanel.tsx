import type { EvidenceMetadata } from '../types';
import ConfidenceBadge from './ConfidenceBadge';
import DetectionModeBadge from './DetectionModeBadge';
import CodeBlock from './CodeBlock';

interface EvidencePanelProps {
  evidence?: EvidenceMetadata;
  testFiles?: string[];
  codeSnippet?: string;
  pseudocode?: string;
  suggestedTest?: string;
  description?: string;
  category?: string;
  statusCode?: number;
  relatedEndpoint?: string;
  children?: React.ReactNode;
}

export default function EvidencePanel({
  evidence,
  testFiles,
  codeSnippet,
  pseudocode,
  suggestedTest,
  description,
  category,
  statusCode,
  relatedEndpoint,
  children,
}: EvidencePanelProps) {
  const hasAnyContent =
    evidence ||
    testFiles?.length ||
    codeSnippet ||
    pseudocode ||
    suggestedTest ||
    description ||
    category ||
    statusCode !== undefined ||
    relatedEndpoint ||
    children;

  if (!hasAnyContent) return null;

  return (
    <div
      data-testid="evidence-panel"
      className="mt-2 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 space-y-3 text-sm"
    >
      {/* 1. Evidence bar */}
      {evidence && (
        <div className="flex flex-wrap items-center gap-2">
          <ConfidenceBadge confidence={evidence.confidence} />
          <DetectionModeBadge mode={evidence.detectionMode} />
          {evidence.riskScore !== undefined && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Risk: {evidence.riskScore}/100
            </span>
          )}
          {category && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Category: {category}
            </span>
          )}
          {statusCode !== undefined && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Status: {statusCode}
            </span>
          )}
          {relatedEndpoint && (
            <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
              {relatedEndpoint}
            </span>
          )}
        </div>
      )}

      {/* 2. Description */}
      {description && (
        <p className="text-gray-700 dark:text-gray-300">{description}</p>
      )}

      {/* 3. Source locations */}
      {evidence?.sourceLocations && evidence.sourceLocations.length > 0 && (
        <div>
          <p className="font-semibold text-gray-700 dark:text-gray-200 mb-1">Source Locations</p>
          <ul className="list-disc list-inside space-y-0.5 text-gray-600 dark:text-gray-400">
            {evidence.sourceLocations.map((loc, i) => (
              <li key={i} className="font-mono text-xs">
                {loc.file}
                {loc.line !== undefined && `:${loc.line}`}
                {loc.snippet && (
                  <span className="ml-2 text-gray-500">— {loc.snippet}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 4. Test locations / test files */}
      {(evidence?.testLocations?.length || testFiles?.length) && (
        <div>
          <p className="font-semibold text-gray-700 dark:text-gray-200 mb-1">Test Files</p>
          <ul className="list-disc list-inside space-y-0.5 text-gray-600 dark:text-gray-400">
            {evidence?.testLocations?.map((loc, i) => (
              <li key={`tl-${i}`} className="font-mono text-xs">
                {loc.file}
                {loc.line !== undefined && `:${loc.line}`}
                {loc.snippet && (
                  <span className="ml-2 text-gray-500">— {loc.snippet}</span>
                )}
              </li>
            ))}
            {testFiles?.map((f, i) => (
              <li key={`tf-${i}`} className="font-mono text-xs">
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 5. Scanner notes */}
      {evidence?.scannerNotes && evidence.scannerNotes.length > 0 && (
        <div>
          <p className="font-semibold text-gray-700 dark:text-gray-200 mb-1">Scanner Notes</p>
          <ul className="list-disc list-inside space-y-0.5 text-gray-600 dark:text-gray-400">
            {evidence.scannerNotes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 6. Code snippet */}
      {codeSnippet && <CodeBlock code={codeSnippet} title="Source Code" />}

      {/* 7. Pseudocode */}
      {pseudocode && <CodeBlock code={pseudocode} language="text" title="Pseudocode" />}

      {/* 8. Suggested test */}
      {suggestedTest && <CodeBlock code={suggestedTest} title="Suggested Test" />}

      {/* 9. Supporting evidence */}
      {evidence?.supportingEvidence && evidence.supportingEvidence.length > 0 && (
        <div>
          <p className="font-semibold text-green-700 dark:text-green-300 mb-1">
            Supporting Evidence
          </p>
          <ul className="list-disc list-inside space-y-0.5 text-gray-600 dark:text-gray-400">
            {evidence.supportingEvidence.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 10. Contradicting evidence */}
      {evidence?.contradictingEvidence && evidence.contradictingEvidence.length > 0 && (
        <div>
          <p className="font-semibold text-red-700 dark:text-red-300 mb-1">
            Contradicting Evidence
          </p>
          <ul className="list-disc list-inside space-y-0.5 text-gray-600 dark:text-gray-400">
            {evidence.contradictingEvidence.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 11. Children slot */}
      {children}
    </div>
  );
}
