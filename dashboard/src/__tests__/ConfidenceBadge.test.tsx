import { render, screen } from '@testing-library/react';
import ConfidenceBadge from '../components/ConfidenceBadge';

describe('ConfidenceBadge', () => {
  it('renders "High" for high confidence', () => {
    render(<ConfidenceBadge confidence="high" />);
    expect(screen.getByTestId('confidence-badge')).toHaveTextContent('High');
  });

  it('renders "Medium" for medium confidence', () => {
    render(<ConfidenceBadge confidence="medium" />);
    expect(screen.getByTestId('confidence-badge')).toHaveTextContent('Medium');
  });

  it('renders "Low" for low confidence', () => {
    render(<ConfidenceBadge confidence="low" />);
    expect(screen.getByTestId('confidence-badge')).toHaveTextContent('Low');
  });

  it('returns null when confidence is undefined', () => {
    const { container } = render(<ConfidenceBadge />);
    expect(container.innerHTML).toBe('');
  });
});
