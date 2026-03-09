import { render, screen, fireEvent } from '@testing-library/react';
import AiSummaryPanel from '../components/AiSummaryPanel';

// react-markdown is an ESM module; provide a minimal mock
jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => <div data-testid="markdown-content">{children}</div>,
}));

describe('AiSummaryPanel', () => {
  it('renders the panel collapsed by default', () => {
    render(<AiSummaryPanel markdown="## Hello" />);
    const toggle = screen.getByRole('button', { name: /ai-friendly analysis/i });
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('markdown-content')).not.toBeInTheDocument();
  });

  it('expands when the button is clicked', () => {
    render(<AiSummaryPanel markdown="## Hello" />);
    const toggle = screen.getByRole('button', { name: /ai-friendly analysis/i });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('markdown-content')).toBeInTheDocument();
  });

  it('collapses again on second click', () => {
    render(<AiSummaryPanel markdown="## Hello" />);
    const toggle = screen.getByRole('button', { name: /ai-friendly analysis/i });
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('markdown-content')).not.toBeInTheDocument();
  });

  it('renders the markdown content when expanded', () => {
    render(<AiSummaryPanel markdown="some **markdown** text" />);
    const toggle = screen.getByRole('button', { name: /ai-friendly analysis/i });
    fireEvent.click(toggle);
    expect(screen.getByTestId('markdown-content')).toHaveTextContent('some **markdown** text');
  });

  it('has correct ARIA attributes for accessibility', () => {
    render(<AiSummaryPanel markdown="## Test" />);
    const toggle = screen.getByRole('button', { name: /ai-friendly analysis/i });
    expect(toggle).toHaveAttribute('aria-controls', 'ai-summary-panel-content');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('has a region with label when expanded', () => {
    render(<AiSummaryPanel markdown="## Test" />);
    const toggle = screen.getByRole('button', { name: /ai-friendly analysis/i });
    fireEvent.click(toggle);
    expect(screen.getByRole('region', { name: /ai-friendly analysis/i })).toBeInTheDocument();
  });

  it('renders with data-testid for easy querying', () => {
    render(<AiSummaryPanel markdown="hello" />);
    expect(screen.getByTestId('ai-summary-panel')).toBeInTheDocument();
  });
});
