/**
 * Built-in dashboard HTTP server.
 *
 * Serves the pre-built React dashboard from the npm package's
 * `dashboard/dist/` directory and intercepts `/reports/*` requests to
 * serve from the caller's actual reports directory — giving every user
 * a live dashboard against their own coverage data with a single command.
 *
 * Usage (via CLI):
 *   npx api-tests-coverage serve [--reports-dir reports/] [--port 4000] [--open]
 */

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url';
import { execSync } from 'child_process';

// ─── MIME type map ─────────────────────────────────────────────────────────────

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.jtl':  'text/plain',
  '.csv':  'text/csv',
  '.xml':  'application/xml',
};

// ─── Dashboard location ───────────────────────────────────────────────────────

/**
 * Resolve the path to the pre-built dashboard static files.
 *
 * Checks two locations (first match wins):
 *  1. dist/dashboard/  — npm-published package (prepublishOnly copies dashboard/dist here)
 *  2. dashboard/dist/  — repo clone with dashboard already built (make dashboard-build)
 */
function resolveDashboardDir(): string {
  // dist/src/serveDashboard.js → ../dashboard  →  dist/dashboard/  (npm package)
  const inDist = path.resolve(__dirname, '..', 'dashboard');
  if (fs.existsSync(path.join(inDist, 'index.html'))) {
    return inDist;
  }

  // Fallback for local development: dist/src/ → ../../dashboard/dist  →  dashboard/dist/
  const inRepo = path.resolve(__dirname, '..', '..', 'dashboard', 'dist');
  if (fs.existsSync(path.join(inRepo, 'index.html'))) {
    return inRepo;
  }

  throw new Error(
    `Dashboard build not found.\n` +
    `Run: cd dashboard && npm run build\n` +
    `Or:  make dashboard-build`,
  );
}

// ─── Server factory ───────────────────────────────────────────────────────────

export interface ServeDashboardOptions {
  /** Directory containing coverage report JSON files. Default: reports/ */
  reportsDir?: string;
  /** Port to listen on. Default: 4000 */
  port?: number;
  /** Open the browser automatically. Default: false */
  open?: boolean;
}

/**
 * Start the dashboard HTTP server and return the server instance.
 *
 * The server:
 *  1. Intercepts `/reports/*` → serves from `reportsDir`
 *  2. Everything else → serves static files from `dashboard/dist/`
 *  3. Unknown paths fall back to `index.html` (SPA client-side routing)
 */
export function serveDashboard(options: ServeDashboardOptions = {}): http.Server {
  const reportsDir  = path.resolve(options.reportsDir ?? 'reports');
  const port        = options.port ?? 4000;
  const dashboardDir = resolveDashboardDir();

  const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url ?? '/');
    let pathname = parsedUrl.pathname ?? '/';

    // ── 1. Serve /reports/* from the actual reports directory ──────────────
    if (pathname.startsWith('/reports/')) {
      const relative   = pathname.slice('/reports/'.length);
      const reportPath = path.join(reportsDir, relative);

      // Security: prevent path traversal
      if (!reportPath.startsWith(reportsDir + path.sep) && reportPath !== reportsDir) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      try {
        const content  = fs.readFileSync(reportPath);
        const mimeType = MIME_TYPES[path.extname(reportPath)] ?? 'application/octet-stream';
        res.writeHead(200, {
          'Content-Type': mimeType,
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(content);
      } catch {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Report not found: ${relative}` }));
      }
      return;
    }

    // ── 2. Serve static dashboard assets ───────────────────────────────────
    if (pathname === '/') pathname = '/index.html';
    const filePath = path.join(dashboardDir, pathname);

    // Security: prevent escaping dashboard dir
    if (!filePath.startsWith(dashboardDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    try {
      const content  = fs.readFileSync(filePath);
      const mimeType = MIME_TYPES[path.extname(filePath)] ?? 'text/plain';
      res.writeHead(200, {
        'Content-Type': mimeType,
        'Cache-Control': path.extname(filePath) === '.html' ? 'no-cache' : 'max-age=86400',
      });
      res.end(content);
    } catch {
      // ── 3. SPA fallback — serve index.html for all unknown paths ───────
      try {
        const indexContent = fs.readFileSync(path.join(dashboardDir, 'index.html'));
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
        res.end(indexContent);
      } catch {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Dashboard build missing. Run: cd dashboard && npm run build');
      }
    }
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n[ERROR] Port ${port} is already in use.`);
      console.error(`  Kill the existing process or use --port <number> to choose a different port.`);
      console.error(`  Example: api-tests-coverage analyze --dashboard --port 4001 --open`);
    } else {
      console.error(`\n[ERROR] Dashboard server failed to start: ${err.message}`);
    }
    process.exit(1);
  });

  server.listen(port, () => {
    const serverUrl = `http://localhost:${port}`;
    console.log(`\n=== API Coverage Dashboard ===`);
    console.log(`  URL:         ${serverUrl}`);
    console.log(`  Reports dir: ${reportsDir}`);
    console.log(`\nPress Ctrl+C to stop.\n`);

    if (options.open) {
      openBrowser(serverUrl);
    }
  });

  return server;
}

// ─── Browser opener ───────────────────────────────────────────────────────────

function openBrowser(targetUrl: string): void {
  try {
    const cmd =
      process.platform === 'darwin' ? `open "${targetUrl}"` :
      process.platform === 'win32'  ? `start "" "${targetUrl}"` :
                                      `xdg-open "${targetUrl}"`;
    execSync(cmd, { stdio: 'ignore' });
  } catch {
    // Silently ignore — browser open is best-effort
  }
}
