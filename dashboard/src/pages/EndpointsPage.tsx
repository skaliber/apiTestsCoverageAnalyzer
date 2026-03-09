import { useCoverage } from '../context/CoverageContext';
import { useIntelligence } from '../context/IntelligenceContext';
import DetailPage from './DetailPage';
import { generateEndpointSummary } from '../utils/markdownSummaries';

const columns = [
  { key: 'id', label: 'Endpoint' },
  { key: 'covered', label: 'Covered' },
  { key: 'tests', label: 'Tests' },
];

export default function EndpointsPage() {
  const { report } = useCoverage();
  const { findingsFor, recommendationsFor } = useIntelligence();
  const aiSummary = report ? generateEndpointSummary(report) : undefined;
  return (
    <DetailPage
      title="Endpoints"
      section={report?.details?.endpoint}
      columns={columns}
      aiSummary={aiSummary}
      coverageType="endpoint"
      intelligenceFindings={findingsFor('endpoint')}
      intelligenceRecommendations={recommendationsFor('endpoint')}
    />
  );
}
