import { useCoverage } from '../context/CoverageContext';
import { useIntelligence } from '../context/IntelligenceContext';
import DetailPage from './DetailPage';
import { generateParameterSummary } from '../utils/markdownSummaries';

const columns = [
  { key: 'id', label: 'Parameter' },
  { key: 'covered', label: 'Covered' },
  { key: 'tests', label: 'Tests' },
];

export default function ParametersPage() {
  const { report } = useCoverage();
  const { findingsFor, recommendationsFor } = useIntelligence();
  const aiSummary = report ? generateParameterSummary(report) : undefined;
  return (
    <DetailPage
      title="Parameters"
      section={report?.details?.parameter}
      columns={columns}
      aiSummary={aiSummary}
      coverageType="parameter"
      intelligenceFindings={findingsFor('parameter')}
      intelligenceRecommendations={recommendationsFor('parameter')}
    />
  );
}
