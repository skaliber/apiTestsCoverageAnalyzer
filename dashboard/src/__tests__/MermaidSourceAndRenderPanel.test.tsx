import { render, screen } from '@testing-library/react';
import MermaidSourceAndRenderPanel from '../components/MermaidSourceAndRenderPanel';

jest.mock('../components/MermaidDiagram', () => ({
  __esModule: true,
  default: () => <div data-testid="mermaid-diagram">mermaid</div>,
}));
jest.mock('../components/CodeBlock', () => ({
  __esModule: true,
  default: ({ code }: any) => <pre data-testid="code-block">{code}</pre>,
}));

describe('MermaidSourceAndRenderPanel', () => {
  const chart = 'graph TD\n  A-->B';

  it('renders both code block and mermaid diagram', () => {
    render(<MermaidSourceAndRenderPanel chart={chart} />);
    expect(screen.getByTestId('code-block')).toBeInTheDocument();
    expect(screen.getByTestId('mermaid-diagram')).toBeInTheDocument();
  });

  it('renders data-testid="mermaid-dual-panel"', () => {
    render(<MermaidSourceAndRenderPanel chart={chart} />);
    expect(screen.getByTestId('mermaid-dual-panel')).toBeInTheDocument();
  });

  it('passes chart source to code block', () => {
    render(<MermaidSourceAndRenderPanel chart={chart} />);
    // toHaveTextContent normalises whitespace; check key fragments instead
    const codeBlock = screen.getByTestId('code-block');
    expect(codeBlock).toHaveTextContent('graph TD');
    expect(codeBlock).toHaveTextContent('A-->B');
  });
});
