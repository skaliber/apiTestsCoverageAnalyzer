import { useCoverage } from '../context/CoverageContext';
import DetailPage from './DetailPage';
import { generateSecuritySummary } from '../utils/markdownSummaries';
import { useIntelligence } from '../context/IntelligenceContext';

const columns = [
  { key: 'id', label: 'Security Check' },
  { key: 'covered', label: 'Covered' },
  { key: 'tests', label: 'Tests' },
];

export default function SecurityPage() {
  const { report } = useCoverage();
  const { findingsFor, recommendationsFor } = useIntelligence();
  const aiSummary = report ? generateSecuritySummary(report) : undefined;
  return (
    <DetailPage
      title="Security"
      section={report?.details?.security}
      columns={columns}
      aiSummary={aiSummary}
      coverageType="security"
      intelligenceFindings={findingsFor('security')}
      intelligenceRecommendations={recommendationsFor('security')}
    />
  );
}
