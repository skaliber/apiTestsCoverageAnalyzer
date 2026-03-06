import { render, screen, waitFor } from '@testing-library/react';
import { CoverageProvider, useCoverage } from '../context/CoverageContext';

// Mock fetch for the default report load
const mockReport = {
  generatedAt: '2024-01-15T12:00:00.000Z',
  summary: [
    { type: 'endpoint', totalItems: 10, coveredItems: 8, coveragePercent: 80 },
  ],
  details: {
    endpoint: { items: [] },
  },
};

function TestConsumer() {
  const { report, loading, error } = useCoverage();
  if (loading) return <div>Loading</div>;
  if (error) return <div>Error: {error}</div>;
  if (!report) return <div>No report</div>;
  return (
    <div>
      <div data-testid="generated-at">{report.generatedAt}</div>
      <div data-testid="summary-count">{report.summary.length}</div>
    </div>
  );
}

describe('CoverageContext', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockReport),
    } as Response);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('loads report data via fetch on mount', async () => {
    render(
      <CoverageProvider>
        <TestConsumer />
      </CoverageProvider>,
    );

    expect(screen.getByText('Loading')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('generated-at')).toHaveTextContent('2024-01-15T12:00:00.000Z');
    });

    expect(screen.getByTestId('summary-count')).toHaveTextContent('1');
  });

  it('shows error when fetch fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network failed'));

    render(
      <CoverageProvider>
        <TestConsumer />
      </CoverageProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Error: Network failed')).toBeInTheDocument();
    });
  });

  it('shows error when response is not ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    } as Response);

    render(
      <CoverageProvider>
        <TestConsumer />
      </CoverageProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Error: HTTP 404: Not Found')).toBeInTheDocument();
    });
  });

  it('throws when useCoverage is used outside provider', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow(
      'useCoverage must be used within CoverageProvider',
    );
    consoleError.mockRestore();
  });
});
