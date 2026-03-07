import {
  captureScreenshots,
  getScreenshotRelativePaths,
  hasScreenshots,
  SCREENSHOT_PAGES,
} from '../src/screenshots';

// ─── SCREENSHOT_PAGES ─────────────────────────────────────────────────────────

describe('SCREENSHOT_PAGES', () => {
  it('contains at least 10 pages', () => {
    expect(SCREENSHOT_PAGES.length).toBeGreaterThanOrEqual(10);
  });

  it('contains an overview page', () => {
    expect(SCREENSHOT_PAGES.some((p) => p.name === 'overview')).toBe(true);
  });

  it('contains an endpoint-coverage page', () => {
    expect(SCREENSHOT_PAGES.some((p) => p.name === 'endpoint-coverage')).toBe(true);
  });
});

// ─── captureScreenshots (disabled) ───────────────────────────────────────────

describe('captureScreenshots', () => {
  it('returns all pages as not-captured when enabled=false', async () => {
    const results = await captureScreenshots({ enabled: false });
    expect(results.length).toBe(SCREENSHOT_PAGES.length);
    expect(results.every((r) => !r.captured)).toBe(true);
    expect(results[0].error).toContain('disabled');
  });

  it('does not throw when Playwright is unavailable (non-strict mode)', async () => {
    // We run without Playwright installed, so every page should gracefully fail
    const results = await captureScreenshots({
      enabled: true,
      strict: false,
      dashboardUrl: 'http://localhost:19999', // unreachable
      outputDir: '/tmp/screenshots-test',
      buildId: 'test-build',
    });
    expect(results.length).toBe(SCREENSHOT_PAGES.length);
    expect(results.every((r) => !r.captured)).toBe(true);
  });

  it('each result has a page name', async () => {
    const results = await captureScreenshots({ enabled: false });
    for (const r of results) {
      expect(typeof r.page).toBe('string');
      expect(r.page.length).toBeGreaterThan(0);
    }
  });
});

// ─── getScreenshotRelativePaths ───────────────────────────────────────────────

describe('getScreenshotRelativePaths', () => {
  it('returns only captured screenshots', () => {
    const results = [
      { page: 'overview', filePath: '/site/assets/screenshots/b1/overview.png', captured: true },
      { page: 'endpoint-coverage', filePath: null, captured: false, error: 'unavailable' },
    ];
    const paths = getScreenshotRelativePaths(results, '/site');
    expect(paths).toHaveLength(1);
    expect(paths[0]).toContain('overview.png');
  });

  it('prepends the base path', () => {
    const results = [
      { page: 'overview', filePath: '/site/assets/screenshots/b1/overview.png', captured: true },
    ];
    const paths = getScreenshotRelativePaths(results, '/site', '/myrepo/');
    expect(paths[0]).toContain('/myrepo/');
  });

  it('returns empty array when no screenshots were captured', () => {
    const results = [
      { page: 'overview', filePath: null, captured: false, error: 'unavailable' },
    ];
    expect(getScreenshotRelativePaths(results, '/site')).toHaveLength(0);
  });
});

// ─── hasScreenshots ──────────────────────────────────────────────────────────

describe('hasScreenshots', () => {
  it('returns true when at least one screenshot was captured', () => {
    expect(
      hasScreenshots([
        { page: 'overview', filePath: '/path.png', captured: true },
        { page: 'endpoint', filePath: null, captured: false },
      ]),
    ).toBe(true);
  });

  it('returns false when no screenshots were captured', () => {
    expect(
      hasScreenshots([{ page: 'overview', filePath: null, captured: false, error: 'err' }]),
    ).toBe(false);
  });
});
