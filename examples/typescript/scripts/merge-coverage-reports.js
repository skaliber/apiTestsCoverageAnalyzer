#!/usr/bin/env node
/**
 * merge-coverage-reports.js
 *
 * Reads the individual coverage JSON files produced by the analyzer commands
 * and merges them into a single coverage-summary.json in the format expected
 * by the coverage-intelligence CLI command.
 *
 * Individual commands each overwrite coverage-summary.json with only their
 * own type; this script rebuilds it with ALL types combined.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const REPORTS_DIR = path.join(__dirname, '..', 'reports');

function readJson(filename) {
  const p = path.join(REPORTS_DIR, filename);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return null;
  }
}

const summary = [];
const details = {};

// ── Endpoint coverage ───────────────────────────────────────────────────────
const ep = readJson('endpoint-coverage.json');
if (ep && typeof ep.total === 'number') {
  summary.push({
    type: 'endpoint',
    totalItems: ep.total,
    coveredItems: ep.covered,
    coveragePercent: ep.percentage,
  });
  details.endpoint = (ep.endpoints || []).map((e) => ({
    endpoint: { method: e.method, path: e.path },
    covered: e.covered,
  }));
}

// ── Business rule coverage ──────────────────────────────────────────────────
const biz = readJson('business-coverage.json');
if (biz && typeof biz.total === 'number') {
  summary.push({
    type: 'business',
    totalItems: biz.total,
    coveredItems: biz.covered,
    coveragePercent: biz.percentage,
  });
  details.business = (biz.rules || []).map((r) => ({
    name: r.id,
    covered: r.covered,
  }));
}

// ── Error scenario coverage ─────────────────────────────────────────────────
const err = readJson('error-coverage.json');
if (err && typeof err.total === 'number') {
  summary.push({
    type: 'error',
    totalItems: err.total,
    coveredItems: err.covered,
    coveragePercent: err.percentage,
  });
  // The error-coverage JSON stores details under different keys depending on
  // analyzer version – normalise both shapes
  const scenarios =
    err.scenarios ||
    (err.details && err.details.scenarios) ||
    [];
  details.error = scenarios.map((s) => {
    const sc = s.scenario || s;
    return {
      endpoint: { method: sc.method || sc.endpoint?.split(' ')[0], path: sc.path || sc.endpoint?.split(' ')[1] },
      covered: s.covered,
      errorCodes: sc.statusCode ? [String(sc.statusCode)] : (sc.categories || []),
    };
  });
}

// ── Security coverage (for completeness; intelligence engine uses securityFindings separately) ─
const sec = readJson('security-coverage.json');
if (sec && typeof sec.total === 'number') {
  summary.push({
    type: 'security',
    totalItems: sec.total,
    coveredItems: sec.covered,
    coveragePercent: sec.percentage,
  });
  details.security = (sec.controls || []).map((c) => ({
    control: { id: c.id, category: c.category, description: c.description },
    covered: c.covered,
  }));
}

if (summary.length === 0) {
  console.error('No coverage JSON files found in', REPORTS_DIR);
  process.exit(1);
}

const combined = {
  generatedAt: new Date().toISOString(),
  summary,
  details,
};

const outPath = path.join(REPORTS_DIR, 'coverage-summary.json');
fs.writeFileSync(outPath, JSON.stringify(combined, null, 2));

console.log('coverage-summary.json generated with types:',
  summary.map((s) => `${s.type}(${s.coveredItems}/${s.totalItems} = ${s.coveragePercent.toFixed(1)}%)`).join(', '));
