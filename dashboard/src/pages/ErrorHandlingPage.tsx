import { useCoverage } from '../context/CoverageContext';
import DetailPage from './DetailPage';
import { generateErrorHandlingSummary } from '../utils/markdownSummaries';

const columns = [
  { key: 'id', label: 'Error Scenario' },
  { key: 'covered', label: 'Covered' },
  { key: 'tests', label: 'Tests' },
];

export default function ErrorHandlingPage() {
  const { report } = useCoverage();
  const aiSummary = report ? generateErrorHandlingSummary(report) : undefined;
  return (
    <DetailPage
      title="Error Handling"
      section={report?.details?.error}
      columns={columns}
      aiSummary={aiSummary}
    />
  );
}
