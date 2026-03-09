import { useEffect, useRef } from 'react';
import mermaid from 'mermaid';

interface MermaidDiagramProps {
  chart: string;
}

let diagramCounter = 0;

export default function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const idRef = useRef<string | null>(null);
  if (idRef.current === null) {
    idRef.current = `mermaid-diagram-${++diagramCounter}`;
  }

  useEffect(() => {
    if (!containerRef.current || !chart) return;
    const isDark = document.documentElement.classList.contains('dark');
    mermaid.initialize({
      startOnLoad: false,
      theme: isDark ? 'dark' : 'default',
    });
    const id = idRef.current!;
    mermaid
      .render(id, chart)
      .then(({ svg }) => {
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      })
      .catch((err: unknown) => {
        if (containerRef.current) {
          containerRef.current.innerHTML = `<pre class="text-xs text-red-500">Diagram error: ${String(err)}</pre>`;
        }
      });
  }, [chart]);

  return (
    <div
      ref={containerRef}
      data-testid="mermaid-diagram"
      className="overflow-x-auto p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700"
      aria-label="Flow diagram"
    />
  );
}
