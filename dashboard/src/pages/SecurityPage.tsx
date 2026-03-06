import { useCoverage } from '../context/CoverageContext';
import DetailPage from './DetailPage';

const columns = [
  { key: 'id', label: 'Security Check' },
  { key: 'covered', label: 'Covered' },
  { key: 'tests', label: 'Tests' },
];

export default function SecurityPage() {
  const { report } = useCoverage();
  return (
    <DetailPage
      title="Security"
      section={report?.details?.security}
      columns={columns}
    />
  );
}
