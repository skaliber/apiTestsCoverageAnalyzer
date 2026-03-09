#!/usr/bin/env node
/**
 * scripts/run-analyzer.js
 * Runs the API coverage analyzer against this project.
 *
 * Usage:
 *   node scripts/run-analyzer.js                        # analyze tests-complete
 *   node scripts/run-analyzer.js --tests tests-initial  # analyze tests-initial
 *   node scripts/run-analyzer.js --format json          # output as JSON
 *   node scripts/run-analyzer.js --threshold 90         # fail below 90%
 *
 * The analyzer is expected to be installed at the root of the repository
 * (two directories up from this file) or available via npx.
 */
const { execSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// ─── CLI argument parsing ──────────────────────────────────────────────────

const args = process.argv.slice(2);

function getArg(flag, defaultVal) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultVal;
}

const testsDir   = getArg('--tests',     'tests-complete');
const format     = getArg('--format',    'html');
const threshold  = getArg('--threshold', '0');

// ─── Locate analyzer binary ───────────────────────────────────────────────

const projectRoot = path.resolve(__dirname, '..');
const repoRoot    = path.resolve(__dirname, '../../..');

// Try to find the binary in multiple locations
const candidatePaths = [
  // Development: built dist in the monorepo root
  { bin: path.join(repoRoot, 'dist/src/index.js'), prefix: 'node' },
  // Installed as a local bin symlink
  { bin: path.join(repoRoot,    'node_modules/.bin/api-coverage'), prefix: '' },
  { bin: path.join(projectRoot, 'node_modules/.bin/api-coverage'), prefix: '' },
];

let analyzerBin  = null;
let analyzerPrefix = '';
for (const candidate of candidatePaths) {
  if (fs.existsSync(candidate.bin)) {
    analyzerBin    = candidate.bin;
    analyzerPrefix = candidate.prefix;
    break;
  }
}

if (!analyzerBin) {
  console.error('[run-analyzer] Could not locate the analyzer binary.');
  console.error('  Expected one of:');
  candidatePaths.forEach(c => console.error('   •', c.bin));
  console.error('  Run `npm run build` from the repository root, then retry.');
  process.exit(1);
}

// ─── Build command ─────────────────────────────────────────────────────────

const binInvocation = analyzerPrefix ? `${analyzerPrefix} "${analyzerBin}"` : `"${analyzerBin}"`;

const cmd = [
  binInvocation,
  'endpoint-coverage',
  '--spec',               './openapi.yaml',
  '--tests',              `"./tests/${testsDir}/**/*.js"`,
  '--language',           'javascript',
  '--format',             format,
  '--threshold-endpoint', threshold,
].join(' ');

// ─── Execute ──────────────────────────────────────────────────────────────

console.log('[run-analyzer] Working directory:', projectRoot);
console.log('[run-analyzer] Tests directory:  ', `tests/${testsDir}`);
console.log('[run-analyzer] Output directory: ', path.join(projectRoot, 'reports'));
console.log('[run-analyzer] Command:', cmd);
console.log('');

try {
  execSync(cmd, {
    cwd:   projectRoot,
    stdio: 'inherit',
    env:   {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV || 'test',
    },
  });
  console.log('\n[run-analyzer] Analysis complete.');
} catch (err) {
  console.error('\n[run-analyzer] Analysis failed:', err.message);
  process.exit(err.status || 1);
}
