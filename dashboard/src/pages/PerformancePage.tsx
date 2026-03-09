import { useCoverage } from '../context/CoverageContext';
import { useIntelligence } from '../context/IntelligenceContext';
import DetailPage from './DetailPage';
import { generatePerformanceSummary } from '../utils/markdownSummaries';

const columns = [
  { key: 'id', label: 'Metric' },
  { key: 'threshold', label: 'Threshold' },
  { key: 'covered', label: 'Tested' },
  { key: 'tests', label: 'Tests' },
];

export default function PerformancePage() {
  const { report } = useCoverage();
  const { findingsFor, recommendationsFor } = useIntelligence();
  const aiSummary = report ? generatePerformanceSummary(report) : undefined;

  const merged = {
    items: [
      ...(report?.details?.performance?.items ?? []),
      ...(report?.details?.resilience?.items ?? []),
    ],
  };

  return (
    <DetailPage
      title="Performance & Resilience"
      section={merged.items.length > 0 ? merged : undefined}
      columns={columns}
      aiSummary={aiSummary}
      coverageType="performance"
      intelligenceFindings={findingsFor('performance')}
      intelligenceRecommendations={recommendationsFor('performance')}
    />
  );
}
