#!/usr/bin/env node
/**
 * push-metrics.js
 *
 * Reads coverage-intelligence.json and risk-prioritization.json from the
 * reports directory and pushes intelligence metrics to the Prometheus
 * Pushgateway so they are available for scraping even after the one-shot
 * analyzer process has finished.
 *
 * Usage:
 *   node scripts/push-metrics.js
 *   PUSHGATEWAY_URL=http://localhost:9091 node scripts/push-metrics.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const REPORTS_DIR = path.join(__dirname, '..', 'reports');
const PUSHGATEWAY_URL = process.env.PUSHGATEWAY_URL || 'http://localhost:9091';
const JOB_NAME = process.env.PUSHGATEWAY_JOB || 'api-coverage-analyzer';
const SERVICE_NAME = process.env.SERVICE_NAME || 'wallets-payments-api';

function readJson(filename) {
  const p = path.join(REPORTS_DIR, filename);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return null;
  }
}

function buildMetricsPayload(intelligence, riskPrioritization) {
  const lines = [];
  const labels = `service="${SERVICE_NAME}"`;

  if (intelligence && intelligence.summary) {
    const s = intelligence.summary;

    lines.push(`# HELP api_coverage_risk_score_max Maximum risk score across all uncovered items`);
    lines.push(`# TYPE api_coverage_risk_score_max gauge`);
    lines.push(`api_coverage_risk_score_max{${labels}} ${s.maxRiskScore ?? 0}`);

    lines.push(`# HELP api_coverage_risk_score_avg Average risk score across all recommendations`);
    lines.push(`# TYPE api_coverage_risk_score_avg gauge`);
    lines.push(`api_coverage_risk_score_avg{${labels}} ${s.avgRiskScore ?? 0}`);

    lines.push(`# HELP api_coverage_critical_uncovered_items_total Total number of critical uncovered items`);
    lines.push(`# TYPE api_coverage_critical_uncovered_items_total gauge`);
    const criticalItems = (intelligence.findings || []).filter(
      (f) => f.severity === 'CRITICAL' || f.severity === 'HIGH'
    ).length;
    lines.push(`api_coverage_critical_uncovered_items_total{${labels}} ${criticalItems}`);

    lines.push(`# HELP api_coverage_unprotected_security_findings_total Security findings without test coverage`);
    lines.push(`# TYPE api_coverage_unprotected_security_findings_total gauge`);
    lines.push(`api_coverage_unprotected_security_findings_total{${labels}} ${s.unprotectedSecurityFindings ?? 0}`);

    lines.push(`# HELP api_coverage_total_findings_total Total number of coverage intelligence findings`);
    lines.push(`# TYPE api_coverage_total_findings_total gauge`);
    lines.push(`api_coverage_total_findings_total{${labels}} ${s.totalFindings ?? 0}`);
  }

  // Recommendations by priority
  if (riskPrioritization && Array.isArray(riskPrioritization.recommendations)) {
    lines.push(`# HELP api_coverage_missing_test_recommendations_total Missing test recommendations by priority`);
    lines.push(`# TYPE api_coverage_missing_test_recommendations_total gauge`);
    const priorities = ['P0', 'P1', 'P2', 'P3'];
    for (const p of priorities) {
      const count = riskPrioritization.recommendations.filter((r) => r.priority === p).length;
      lines.push(`api_coverage_missing_test_recommendations_total{${labels},priority="${p}"} ${count}`);
    }
  } else if (intelligence && Array.isArray(intelligence.recommendations)) {
    lines.push(`# HELP api_coverage_missing_test_recommendations_total Missing test recommendations by priority`);
    lines.push(`# TYPE api_coverage_missing_test_recommendations_total gauge`);
    const priorities = ['P0', 'P1', 'P2', 'P3'];
    for (const p of priorities) {
      const count = intelligence.recommendations.filter((r) => r.priority === p).length;
      lines.push(`api_coverage_missing_test_recommendations_total{${labels},priority="${p}"} ${count}`);
    }
  }

  return lines.join('\n') + '\n';
}

function pushToGateway(metricsText) {
  return new Promise((resolve, reject) => {
    const pushUrl = `${PUSHGATEWAY_URL}/metrics/job/${encodeURIComponent(JOB_NAME)}/instance/${encodeURIComponent(SERVICE_NAME)}`;
    const parsed = new URL(pushUrl);
    const reqLib = parsed.protocol === 'https:' ? https : http;

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'Content-Length': Buffer.byteLength(metricsText),
      },
    };

    const req = reqLib.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.statusCode);
        } else {
          reject(new Error(`Pushgateway returned HTTP ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(metricsText);
    req.end();
  });
}

async function main() {
  const intelligence = readJson('coverage-intelligence.json');
  const riskPrioritization = readJson('risk-prioritization.json');

  if (!intelligence) {
    console.warn('No coverage-intelligence.json found in', REPORTS_DIR);
    console.warn('Run the analyzer first: bash scripts/run-analyzer.sh');
    process.exit(0);
  }

  const payload = buildMetricsPayload(intelligence, riskPrioritization);

  console.log('Pushing intelligence metrics to Pushgateway:', PUSHGATEWAY_URL);
  console.log('Metrics payload:');
  console.log(payload);

  try {
    const status = await pushToGateway(payload);
    console.log(`Metrics pushed successfully (HTTP ${status})`);
  } catch (err) {
    console.warn(`Could not push to Pushgateway: ${err.message}`);
    console.warn('Is the Pushgateway running? Start it with: docker compose -f observability/docker-compose.yml up pushgateway');
    process.exit(0); // non-fatal: CI should not fail if pushgateway is not running
  }
}

main();
