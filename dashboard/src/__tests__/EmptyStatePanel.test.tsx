import { render, screen } from '@testing-library/react';
import EmptyStatePanel from '../components/EmptyStatePanel';

describe('EmptyStatePanel', () => {
  it('renders section name in the heading', () => {
    render(<EmptyStatePanel sectionName="endpoints" />);
    expect(screen.getByText('No endpoints data found')).toBeInTheDocument();
  });

  it('renders data-testid="empty-state-panel"', () => {
    render(<EmptyStatePanel sectionName="parameters" />);
    expect(screen.getByTestId('empty-state-panel')).toBeInTheDocument();
  });

  it('shows files scanned when scannedInfo.filesScanned provided', () => {
    render(
      <EmptyStatePanel
        sectionName="endpoints"
        scannedInfo={{ filesScanned: 42 }}
      />,
    );
    expect(screen.getByText('42 files scanned')).toBeInTheDocument();
  });

  it('shows stack suggestions when provided', () => {
    render(
      <EmptyStatePanel
        sectionName="endpoints"
        stackSuggestions={['Add an OpenAPI spec', 'Use annotation-based routing']}
      />,
    );
    expect(screen.getByText('Add an OpenAPI spec')).toBeInTheDocument();
    expect(screen.getByText('Use annotation-based routing')).toBeInTheDocument();
  });

  it('shows suggested next steps when provided', () => {
    render(
      <EmptyStatePanel
        sectionName="endpoints"
        scannedInfo={{ suggestedNextSteps: ['Re-run with verbose mode', 'Check scan path'] }}
      />,
    );
    expect(screen.getByText('Re-run with verbose mode')).toBeInTheDocument();
    expect(screen.getByText('Check scan path')).toBeInTheDocument();
  });
});
