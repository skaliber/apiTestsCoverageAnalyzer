import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface Props {
  covered: number;
  total: number;
}

const COLORS = ['#22c55e', '#ef4444'];

export default function CoveragePieChart({ covered, total }: Props) {
  const uncovered = total - covered;
  const data = [
    { name: 'Covered', value: covered },
    { name: 'Uncovered', value: uncovered },
  ];

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" outerRadius={80} dataKey="value" label>
          {data.map((_, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
