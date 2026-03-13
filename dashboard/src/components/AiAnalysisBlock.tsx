import { useState } from 'react';
import ReactMarkdown from 'react-markdown';

interface AiAnalysisData {
  whatWasAnalyzed: string;
  howItWasAnalyzed: string;
  strongEvidence: string[];
  weakOrMissing: string[];
  confidenceAndCaveats: string;
  likelyRisks: string[];
  recommendedActions: string[];
  aiHandoffNotes: string;
}

interface AiAnalysisBlockProps {
  sectionName: string;
  analysisMarkdown?: string;
  analysisData?: AiAnalysisData;
}

export default function AiAnalysisBlock({
  sectionName,
  analysisMarkdown,
  analysisData,
}: AiAnalysisBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const panelId = `ai-analysis-block-${sectionName.replace(/\s+/g, '-').toLowerCase()}`;

  if (!analysisMarkdown && !analysisData) return null;

  return (
    <div
      data-testid="ai-analysis-block"
      className="mb-6 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20"
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-xl"
      >
        <span className="text-sm font-semibold text-indigo-700 dark:text-indigo-300 flex items-center gap-2">
          <span aria-hidden="true">🤖</span>
          AI Analysis — {sectionName}
        </span>
        <span
          aria-hidden="true"
          className={`text-indigo-600 dark:text-indigo-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
        >
          ▼
        </span>
      </button>

      {expanded && (
        <div
          id={panelId}
          role="region"
          aria-label={`AI Analysis for ${sectionName}`}
          className="px-4 pb-4 text-gray-800 dark:text-gray-200"
        >
          {analysisData ? (
            <StructuredAnalysis data={analysisData} />
          ) : analysisMarkdown ? (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown>{analysisMarkdown}</ReactMarkdown>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function StructuredAnalysis({ data }: { data: AiAnalysisData }) {
  return (
    <div className="space-y-4 text-sm">
      {data.whatWasAnalyzed && (
        <Section title="What Was Analyzed">
          <p>{data.whatWasAnalyzed}</p>
        </Section>
      )}

      {data.howItWasAnalyzed && (
        <Section title="How It Was Analyzed">
          <p>{data.howItWasAnalyzed}</p>
        </Section>
      )}

      {data.strongEvidence.length > 0 && (
        <Section title="Strong Evidence">
          <BulletList items={data.strongEvidence} />
        </Section>
      )}

      {data.weakOrMissing.length > 0 && (
        <Section title="Weak or Missing">
          <BulletList items={data.weakOrMissing} />
        </Section>
      )}

      {data.confidenceAndCaveats && (
        <Section title="Confidence & Caveats">
          <p>{data.confidenceAndCaveats}</p>
        </Section>
      )}

      {data.likelyRisks.length > 0 && (
        <Section title="Likely Risks">
          <BulletList items={data.likelyRisks} />
        </Section>
      )}

      {data.recommendedActions.length > 0 && (
        <Section title="Recommended Actions">
          <BulletList items={data.recommendedActions} />
        </Section>
      )}

      {data.aiHandoffNotes && (
        <Section title="AI Handoff Notes">
          <p className="italic text-gray-600 dark:text-gray-400">{data.aiHandoffNotes}</p>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-semibold text-indigo-800 dark:text-indigo-200 mb-1">{title}</p>
      {children}
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc list-inside space-y-0.5 text-gray-700 dark:text-gray-300">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}
