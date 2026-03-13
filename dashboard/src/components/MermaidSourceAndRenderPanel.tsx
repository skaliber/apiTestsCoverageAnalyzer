import CodeBlock from './CodeBlock';
import MermaidDiagram from './MermaidDiagram';

interface MermaidSourceAndRenderPanelProps {
  chart: string;
  title?: string;
}

export default function MermaidSourceAndRenderPanel({
  chart,
  title,
}: MermaidSourceAndRenderPanelProps) {
  return (
    <div data-testid="mermaid-dual-panel">
      {title && (
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">{title}</h3>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CodeBlock code={chart} language="mermaid" title="Mermaid source" />
        <MermaidDiagram chart={chart} />
      </div>
    </div>
  );
}
