import { render, screen, waitFor } from '@testing-library/react';
import { CoverageProvider, useCoverage, normalizeSection, normalizeReport } from '../context/CoverageContext';
import type { CoverageReport } from '../types';

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

// ─── normalizeSection ─────────────────────────────────────────────────────────

describe('normalizeSection', () => {
  it('passes through already-normalized {items:[...]} format', () => {
    const input = { items: [{ id: 'GET /api/users', covered: true, tests: ['test1'] }] };
    const result = normalizeSection(input, 'endpoint');
    expect(result).toBe(input); // same reference — no copy
  });

  it('returns empty items for null/undefined', () => {
    expect(normalizeSection(null, 'endpoint')).toEqual({ items: [] });
    expect(normalizeSection(undefined, 'endpoint')).toEqual({ items: [] });
  });

  it('returns empty items for non-array, non-object values', () => {
    expect(normalizeSection(42, 'endpoint')).toEqual({ items: [] });
    expect(normalizeSection('string', 'endpoint')).toEqual({ items: [] });
  });

  describe('endpoint flat-array format', () => {
    it('maps {endpoint:{method,path}, covered, matchedTests} to {id, covered, tests}', () => {
      const input = [
        { endpoint: { method: 'GET', path: '/api/users' }, covered: true, matchedTests: ['t1'] },
        { endpoint: { method: 'POST', path: '/api/users' }, covered: false, matchedTests: [] },
      ];
      const result = normalizeSection(input, 'endpoint');
      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toMatchObject({ id: 'GET /api/users', covered: true, tests: ['t1'] });
      expect(result.items[1]).toMatchObject({ id: 'POST /api/users', covered: false });
    });

    it('falls back to endpoint-N id when method/path are empty', () => {
      const input = [{ endpoint: {}, covered: false, matchedTests: [] }];
      const result = normalizeSection(input, 'endpoint');
      expect(result.items[0].id).toBe('endpoint-0');
    });
  });

  describe('business flat-array format', () => {
    it('maps {name, covered, matchedTests} to {id, covered, tests}', () => {
      const input = [
        { name: 'unique email per account', covered: true, matchedTests: ['validates unique email'] },
        { name: 'Minimum order value is $5', covered: false, matchedTests: [] },
      ];
      const result = normalizeSection(input, 'business');
      expect(result.items[0]).toMatchObject({ id: 'unique email per account', covered: true });
      expect(result.items[1]).toMatchObject({ id: 'Minimum order value is $5', covered: false });
    });
  });

  describe('error flat-array format', () => {
    it('builds id from endpoint method/path and errorCodes', () => {
      const input = [
        {
          endpoint: { method: 'POST', path: '/api/users' },
          covered: true,
          errorCodes: ['400'],
        },
      ];
      const result = normalizeSection(input, 'error');
      expect(result.items[0].id).toBe('POST /api/users:400');
      expect(result.items[0].covered).toBe(true);
    });

    it('omits error code suffix when errorCodes is empty', () => {
      const input = [
        { endpoint: { method: 'GET', path: '/api/products' }, covered: false, errorCodes: [] },
      ];
      const result = normalizeSection(input, 'error');
      expect(result.items[0].id).toBe('GET /api/products');
    });
  });

  describe('security flat-array format', () => {
    it('maps {control:{id,...}, covered, matchedTests} to {id, covered, tests}', () => {
      const input = [
        {
          control: { id: 'JWT token validation', category: 'auth', description: 'validates JWT' },
          covered: true,
          matchedTests: ['validates JWT signature'],
        },
      ];
      const result = normalizeSection(input, 'security');
      expect(result.items[0]).toMatchObject({
        id: 'JWT token validation',
        covered: true,
        tests: ['validates JWT signature'],
      });
    });

    it('falls back to security-N when control.id is missing', () => {
      const input = [{ control: {}, covered: false, matchedTests: [] }];
      const result = normalizeSection(input, 'security');
      expect(result.items[0].id).toBe('security-0');
    });
  });

  describe('items already have id field (dashboard demo format)', () => {
    it('preserves existing id and passes through extra fields', () => {
      const input = [
        {
          id: 'GET /api/users response time < 200ms',
          covered: true,
          tests: ['p95 latency test'],
          threshold: '200ms',
        },
      ];
      const result = normalizeSection(input, 'performance');
      expect(result.items[0]).toMatchObject({
        id: 'GET /api/users response time < 200ms',
        covered: true,
        tests: ['p95 latency test'],
        threshold: '200ms',
      });
    });
  });
});

// ─── normalizeReport ──────────────────────────────────────────────────────────

describe('normalizeReport', () => {
  it('returns report unchanged when details is absent', () => {
    const raw: CoverageReport = {
      generatedAt: '2024-01-01T00:00:00.000Z',
      summary: [],
      details: {},
    };
    const result = normalizeReport(raw);
    expect(result).toEqual(raw);
  });

  it('normalizes flat-array details into {items:[...]} format', () => {
    const raw = {
      generatedAt: '2024-01-01T00:00:00.000Z',
      summary: [{ type: 'endpoint', totalItems: 1, coveredItems: 1, coveragePercent: 100 }],
      details: {
        endpoint: [
          { endpoint: { method: 'GET', path: '/api/users' }, covered: true, matchedTests: [] },
        ],
        security: [
          {
            control: { id: 'JWT token validation' },
            covered: true,
            matchedTests: ['jwt test'],
          },
        ],
      },
    } as unknown as CoverageReport;

    const result = normalizeReport(raw);
    expect(result.details.endpoint).toHaveProperty('items');
    expect(result.details.endpoint.items[0].id).toBe('GET /api/users');
    expect(result.details.security).toHaveProperty('items');
    expect(result.details.security.items[0].id).toBe('JWT token validation');
  });

  it('does not mutate the original report reference', () => {
    const raw = {
      generatedAt: '2024-01-01T00:00:00.000Z',
      summary: [],
      details: {
        endpoint: { items: [{ id: 'GET /api/users', covered: true }] },
      },
    } as unknown as CoverageReport;

    const result = normalizeReport(raw);
    expect(result).not.toBe(raw);
    // original details reference is not written back into the same object
    expect(raw.details.endpoint).toStrictEqual({ items: [{ id: 'GET /api/users', covered: true }] });
  });

  it('preserves summary unchanged', () => {
    const raw: CoverageReport = {
      generatedAt: '2024-01-15T12:00:00.000Z',
      summary: [
        { type: 'endpoint', totalItems: 10, coveredItems: 8, coveragePercent: 80 },
        { type: 'security', totalItems: 5, coveredItems: 3, coveragePercent: 60 },
      ],
      details: {},
    };
    const result = normalizeReport(raw);
    expect(result.summary).toHaveLength(2);
    expect(result.summary[0]).toEqual({ type: 'endpoint', totalItems: 10, coveredItems: 8, coveragePercent: 80 });
  });
});
