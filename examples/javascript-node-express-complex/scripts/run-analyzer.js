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
const outputDir  = getArg('--output',    './reports');

// ─── Locate analyzer binary ───────────────────────────────────────────────

const projectRoot = path.resolve(__dirname, '..');
const repoRoot    = path.resolve(__dirname, '../../..');

// Try to find the binary in multiple locations
const candidatePaths = [
  path.join(repoRoot,    'node_modules/.bin/api-coverage'),
  path.join(repoRoot,    'bin/api-coverage.js'),
  path.join(projectRoot, 'node_modules/.bin/api-coverage'),
];

let analyzerBin = null;
for (const p of candidatePaths) {
  if (fs.existsSync(p)) {
    analyzerBin = p;
    break;
  }
}

// ─── Build command ─────────────────────────────────────────────────────────

let cmd;

if (analyzerBin) {
  // Use locally installed binary
  cmd = [
    analyzerBin,
    'endpoint-coverage',
    '--spec',      './openapi.yaml',
    '--tests',     `./tests/${testsDir}`,
    '--language',  'javascript',
    '--config',    './config.yaml',
    '--format',    format,
    '--output',    outputDir,
    '--threshold', threshold,
  ].join(' ');
} else {
  // Fallback: use npx for ad-hoc runs
  console.log('[run-analyzer] Binary not found locally, falling back to npx...');
  cmd = [
    'npx api-coverage endpoint-coverage',
    '--spec',      './openapi.yaml',
    '--tests',     `./tests/${testsDir}`,
    '--language',  'javascript',
    '--config',    './config.yaml',
    '--format',    format,
    '--output',    outputDir,
    '--threshold', threshold,
  ].join(' ');
}

// ─── Execute ──────────────────────────────────────────────────────────────

console.log('[run-analyzer] Working directory:', projectRoot);
console.log('[run-analyzer] Tests directory:  ', `tests/${testsDir}`);
console.log('[run-analyzer] Output directory: ', outputDir);
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
