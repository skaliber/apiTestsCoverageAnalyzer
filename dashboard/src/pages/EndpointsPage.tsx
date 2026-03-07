import { useCoverage } from '../context/CoverageContext';
import DetailPage from './DetailPage';
import { generateEndpointSummary } from '../utils/markdownSummaries';

const columns = [
  { key: 'id', label: 'Endpoint' },
  { key: 'covered', label: 'Covered' },
  { key: 'tests', label: 'Tests' },
];

export default function EndpointsPage() {
  const { report } = useCoverage();
  const aiSummary = report ? generateEndpointSummary(report) : undefined;
  return (
    <DetailPage
      title="Endpoints"
      section={report?.details?.endpoint}
      columns={columns}
      aiSummary={aiSummary}
    />
  );
}
