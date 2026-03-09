import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import fs from 'fs'

// When running in --mode real (via `make dashboard` or `make examples-dashboard`),
// serve the real reports directory as /reports.
// Set REPORTS_OVERRIDE to an absolute path to point at any project's reports/
// (e.g. examples/typescript/reports).  Defaults to the root reports/ directory.
// Default dev mode continues to serve public/reports/ (sample/demo data).
function reportsPlugin() {
  const reportsDir = process.env.REPORTS_OVERRIDE
    ? path.resolve(process.env.REPORTS_OVERRIDE)
    : path.resolve(__dirname, '../reports')
  return {
    name: 'serve-real-reports',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    configureServer(server: any) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      server.middlewares.use('/reports', (req: any, res: any, next: any) => {
        const filePath = path.join(reportsDir, (req.url ?? '/').split('?')[0])
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const ext = path.extname(filePath)
          const mime: Record<string, string> = {
            '.json': 'application/json',
            '.html': 'text/html',
            '.csv':  'text/csv',
          }
          res.writeHead(200, { 'Content-Type': mime[ext] ?? 'application/octet-stream' })
          res.end(fs.readFileSync(filePath))
        } else {
          next()
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    // Only intercept /reports when --mode real is set (i.e. `make dashboard`)
    ...(mode === 'real' ? [reportsPlugin()] : []),
  ],
}))

