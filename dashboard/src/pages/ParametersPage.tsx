import { useCoverage } from '../context/CoverageContext';
import DetailPage from './DetailPage';

const columns = [
  { key: 'id', label: 'Parameter' },
  { key: 'covered', label: 'Covered' },
  { key: 'tests', label: 'Tests' },
];

export default function ParametersPage() {
  const { report } = useCoverage();
  return (
    <DetailPage
      title="Parameters"
      section={report?.details?.parameter}
      columns={columns}
    />
  );
}
