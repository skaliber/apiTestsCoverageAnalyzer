#!/usr/bin/env node
'use strict';

const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:5173';
const GRAFANA_URL = process.env.GRAFANA_URL || 'http://localhost:3000';
const SCREENSHOTS_DIR = path.join(__dirname, '..', 'reports', 'screenshots');

async function main() {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  const dashboardPages = [
    { name: 'overview', path: '/' },
    { name: 'endpoints', path: '/endpoints' },
    { name: 'parameters', path: '/parameters' },
    { name: 'business-rules', path: '/business-rules' },
    { name: 'security', path: '/security' },
    { name: 'errors', path: '/error-handling' },
    { name: 'performance', path: '/performance' },
    { name: 'integration-flows', path: '/integration-flows' },
    { name: 'intelligence', path: '/intelligence' },
    { name: 'trends', path: '/trends' },
  ];

  for (const p of dashboardPages) {
    try {
      await page.goto(`${DASHBOARD_URL}${p.path}`, { waitUntil: 'networkidle', timeout: 10000 });
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `${p.name}.png`), fullPage: true });
      console.log(`Screenshot saved: ${p.name}.png`);
    } catch (err) {
      console.warn(`Could not capture ${p.name}: ${err.message}`);
    }
  }

  // Capture Grafana dashboard
  try {
    await page.goto(`${GRAFANA_URL}/d/wallets-payments`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'grafana-dashboard.png'), fullPage: true });
    console.log('Screenshot saved: grafana-dashboard.png');
  } catch (err) {
    console.warn(`Could not capture Grafana dashboard: ${err.message}`);
  }

  await browser.close();
  console.log(`Screenshots saved to ${SCREENSHOTS_DIR}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
