import { useCoverage } from '../context/CoverageContext';
import DetailPage from './DetailPage';

const columns = [
  { key: 'id', label: 'Endpoint' },
  { key: 'covered', label: 'Covered' },
  { key: 'tests', label: 'Tests' },
];

export default function EndpointsPage() {
  const { report } = useCoverage();
  return (
    <DetailPage
      title="Endpoints"
      section={report?.details?.endpoint}
      columns={columns}
    />
  );
}
