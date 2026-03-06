import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import OverviewPage from '../pages/OverviewPage';
import { CoverageContext } from '../context/CoverageContext';
import type { CoverageReport } from '../types';

// Mock recharts to avoid SVG rendering issues in jsdom
jest.mock('recharts', () => ({
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
  Legend: () => <div />,
  ReferenceLine: () => <div />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const sampleReport: CoverageReport = {
  generatedAt: '2024-01-15T12:00:00.000Z',
  summary: [
    { type: 'endpoint', totalItems: 10, coveredItems: 8, coveragePercent: 80 },
    { type: 'parameter', totalItems: 20, coveredItems: 14, coveragePercent: 70 },
  ],
  details: {
    endpoint: { items: [{ id: 'GET /api/users', covered: true, tests: [] }] },
  },
};

function renderWithContext(report: CoverageReport | null) {
  return render(
    <BrowserRouter>
      <CoverageContext.Provider
        value={{
          report,
          reportName: 'test.json',
          loading: false,
          error: null,
          loadFromFile: jest.fn(),
          historicalReports: [],
          addHistoricalReport: jest.fn(),
        }}
      >
        <OverviewPage />
      </CoverageContext.Provider>
    </BrowserRouter>,
  );
}

describe('OverviewPage', () => {
  it('renders summary table when given sample data', () => {
    renderWithContext(sampleReport);
    expect(screen.getByTestId('summary-table')).toBeInTheDocument();
  });

  it('renders coverage type rows', () => {
    renderWithContext(sampleReport);
    expect(screen.getByText('endpoint')).toBeInTheDocument();
    expect(screen.getByText('parameter')).toBeInTheDocument();
  });

  it('renders coverage percentages', () => {
    renderWithContext(sampleReport);
    expect(screen.getAllByText('80%').length).toBeGreaterThan(0);
    expect(screen.getAllByText('70%').length).toBeGreaterThan(0);
  });

  it('shows error state when error is provided', () => {
    render(
      <BrowserRouter>
        <CoverageContext.Provider
          value={{
            report: null,
            reportName: 'test.json',
            loading: false,
            error: 'Network error',
            loadFromFile: jest.fn(),
            historicalReports: [],
            addHistoricalReport: jest.fn(),
          }}
        >
          <OverviewPage />
        </CoverageContext.Provider>
      </BrowserRouter>,
    );
    expect(screen.getByText('Failed to load report')).toBeInTheDocument();
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(
      <BrowserRouter>
        <CoverageContext.Provider
          value={{
            report: null,
            reportName: 'test.json',
            loading: true,
            error: null,
            loadFromFile: jest.fn(),
            historicalReports: [],
            addHistoricalReport: jest.fn(),
          }}
        >
          <OverviewPage />
        </CoverageContext.Provider>
      </BrowserRouter>,
    );
    expect(screen.getByText('Loading report…')).toBeInTheDocument();
  });
});
