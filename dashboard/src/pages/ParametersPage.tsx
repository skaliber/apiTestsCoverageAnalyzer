import { useCoverage } from '../context/CoverageContext';
import DetailPage from './DetailPage';
import { generateParameterSummary } from '../utils/markdownSummaries';

const columns = [
  { key: 'id', label: 'Parameter' },
  { key: 'covered', label: 'Covered' },
  { key: 'tests', label: 'Tests' },
];

export default function ParametersPage() {
  const { report } = useCoverage();
  const aiSummary = report ? generateParameterSummary(report) : undefined;
  return (
    <DetailPage
      title="Parameters"
      section={report?.details?.parameter}
      columns={columns}
      aiSummary={aiSummary}
    />
  );
}
