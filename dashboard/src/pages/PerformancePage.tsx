import { useCoverage } from '../context/CoverageContext';
import DetailPage from './DetailPage';

const columns = [
  { key: 'id', label: 'Metric' },
  { key: 'threshold', label: 'Threshold' },
  { key: 'covered', label: 'Tested' },
  { key: 'tests', label: 'Tests' },
];

export default function PerformancePage() {
  const { report } = useCoverage();

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
    />
  );
}
