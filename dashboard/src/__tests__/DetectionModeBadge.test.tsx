import { render, screen } from '@testing-library/react';
import DetectionModeBadge from '../components/DetectionModeBadge';

describe('DetectionModeBadge', () => {
  it('renders "Direct" for direct mode', () => {
    render(<DetectionModeBadge mode="direct" />);
    expect(screen.getByTestId('detection-mode-badge')).toHaveTextContent('Direct');
  });

  it('renders "Inferred" for inferred mode', () => {
    render(<DetectionModeBadge mode="inferred" />);
    expect(screen.getByTestId('detection-mode-badge')).toHaveTextContent('Inferred');
  });

  it('renders "Heuristic" for heuristic mode', () => {
    render(<DetectionModeBadge mode="heuristic" />);
    expect(screen.getByTestId('detection-mode-badge')).toHaveTextContent('Heuristic');
  });

  it('returns null when mode is undefined', () => {
    const { container } = render(<DetectionModeBadge />);
    expect(container.innerHTML).toBe('');
  });
});
