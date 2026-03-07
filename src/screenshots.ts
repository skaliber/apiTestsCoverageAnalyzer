import * as fs from 'fs';
import * as path from 'path';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScreenshotResult {
  page: string;
  filePath: string | null;
  captured: boolean;
  error?: string;
}

export interface ScreenshotCaptureConfig {
  /** Whether screenshot capture is enabled */
  enabled?: boolean;
  /** If true, missing screenshots cause a build failure */
  strict?: boolean;
  /** Dashboard URL to screenshot (defaults to http://localhost:4173) */
  dashboardUrl?: string;
  /** Output directory for screenshots */
  outputDir?: string;
  /** Build ID to include in path */
  buildId?: string;
}

/** Dashboard pages to capture */
export const SCREENSHOT_PAGES = [
  { name: 'overview', path: '/' },
  { name: 'endpoint-coverage', path: '/endpoint' },
  { name: 'parameter-coverage', path: '/parameter' },
  { name: 'business-coverage', path: '/business' },
  { name: 'integration-flows', path: '/integration' },
  { name: 'security-coverage', path: '/security' },
  { name: 'error-coverage', path: '/error' },
  { name: 'performance-resilience', path: '/performance' },
  { name: 'compatibility', path: '/compatibility' },
  { name: 'ai-analysis', path: '/ai' },
] as const;

// ─── Capture ──────────────────────────────────────────────────────────────────

/**
 * Attempt to capture screenshots of the dashboard using Playwright or Puppeteer.
 *
 * This function **never throws** when `strict` is false (the default).
 * When headless screenshot tooling is unavailable, it returns results with
 * `captured: false` for each page and includes an informative error message.
 *
 * When `strict: true`, a thrown error will propagate if any screenshot fails.
 */
export async function captureScreenshots(
  config: ScreenshotCaptureConfig,
): Promise<ScreenshotResult[]> {
  if (config.enabled === false) {
    return SCREENSHOT_PAGES.map((p) => ({
      page: p.name,
      filePath: null,
      captured: false,
      error: 'Screenshot capture is disabled',
    }));
  }

  const baseUrl = config.dashboardUrl ?? 'http://localhost:4173';
  const siteDir = config.outputDir ?? 'site';
  const buildId = config.buildId ?? 'latest';
  const screenshotDir = path.join(siteDir, 'assets', 'screenshots', buildId);

  fs.mkdirSync(screenshotDir, { recursive: true });

  const results: ScreenshotResult[] = [];

  for (const page of SCREENSHOT_PAGES) {
    const filePath = path.join(screenshotDir, `${page.name}.png`);

    try {
      await captureOnePage(baseUrl + page.path, filePath);
      results.push({ page: page.name, filePath, captured: true });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);

      if (config.strict) {
        throw new Error(`Failed to capture screenshot for page "${page.name}": ${error}`);
      }

      results.push({ page: page.name, filePath: null, captured: false, error });
    }
  }

  return results;
}

// ─── Internal types ────────────────────────────────────────────────────────────

interface PlaywrightBrowser {
  newPage(): Promise<{
    goto(url: string, opts: object): Promise<void>;
    screenshot(opts: object): Promise<void>;
  }>;
  close(): Promise<void>;
}

interface PlaywrightModule {
  chromium: {
    launch(opts: { headless: boolean }): Promise<PlaywrightBrowser>;
  };
}

/**
 * Attempt to capture a single page screenshot.
 * Tries Playwright first, then falls back to a clear "unavailable" error.
 */
async function captureOnePage(url: string, outputPath: string): Promise<void> {
  // Try Playwright (chromium) — it is an optional peer dependency
  let playwright: PlaywrightModule;

  try {
    // Dynamic require to avoid hard dependency
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    playwright = require('playwright') as PlaywrightModule;
  } catch {
    throw new Error(
      'Playwright is not installed. Install it with: npm install --save-dev playwright',
    );
  }

  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
    await page.screenshot({ path: outputPath, fullPage: true });
  } finally {
    await browser.close();
  }
}

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Return the relative paths of successfully captured screenshots,
 * suitable for embedding into HTML.
 */
export function getScreenshotRelativePaths(
  results: ScreenshotResult[],
  siteDir: string,
  basePath: string = '/',
): string[] {
  return results
    .filter((r) => r.captured && r.filePath !== null)
    .map((r) => {
      const rel = path.relative(siteDir, r.filePath!).replace(/\\/g, '/');
      return `${basePath}${rel}`;
    });
}

/**
 * Check whether screenshots are available.
 * Returns `true` when at least one screenshot was captured.
 */
export function hasScreenshots(results: ScreenshotResult[]): boolean {
  return results.some((r) => r.captured);
}
