/**
 * OWASP ZAP scanner integration.
 * Supports import (pre-generated JSON) and embedded (binary) modes.
 */
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { ZapScannerConfig, SecurityFinding, ScannerResult } from '../types';
import { normalizeZapOutput } from '../normalizers/zap';

const execFileAsync = promisify(execFile);

/**
 * Run ZAP in embedded mode using the baseline scan script.
 */
async function runEmbedded(config: ZapScannerConfig): Promise<SecurityFinding[]> {
  if (!config.targetUrl) {
    throw new Error('ZAP embedded mode requires targetUrl to be set');
  }

  const timeout = (config.timeout ?? 300) * 1000;
  const reportFile = path.join(process.cwd(), 'reports', 'zap-raw.json');

  // Ensure reports directory exists
  const reportsDir = path.dirname(reportFile);
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  // Run zap-baseline.py with parameterized arguments (no shell interpolation)
  let ranSuccessfully = false;
  try {
    await execFileAsync(
      'zap-baseline.py',
      ['-t', config.targetUrl, '-J', reportFile],
      { timeout, maxBuffer: 10 * 1024 * 1024 },
    );
    ranSuccessfully = true;
  } catch {
    // zap-baseline.py may exit with non-zero even on success; check the output file
    ranSuccessfully = fs.existsSync(reportFile);
  }

  if (!ranSuccessfully) {
    // Try zap.sh as fallback (also parameterized, no shell interpolation)
    try {
      await execFileAsync(
        'zap.sh',
        ['-cmd', '-quickurl', config.targetUrl, '-quickout', reportFile, '-quickprogress'],
        { timeout, maxBuffer: 10 * 1024 * 1024 },
      );
    } catch (e) {
      if (!fs.existsSync(reportFile)) {
        throw new Error(`ZAP embedded scan failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  const content = fs.readFileSync(reportFile, 'utf-8');
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new Error(`Failed to parse ZAP JSON output from ${reportFile}`);
  }
  return normalizeZapOutput(raw);
}

/**
 * Import ZAP findings from a pre-generated JSON report.
 */
function importFromFile(reportPath: string): SecurityFinding[] {
  const resolved = path.resolve(reportPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`ZAP report file not found: ${resolved}`);
  }
  const content = fs.readFileSync(resolved, 'utf-8');
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new Error(`Failed to parse ZAP report file: ${resolved}`);
  }
  return normalizeZapOutput(raw);
}

/**
 * Run the ZAP scanner according to the given configuration.
 */
export async function runZap(config: ZapScannerConfig): Promise<ScannerResult> {
  if (!config.enabled || config.mode === 'disabled') {
    return { scanner: 'zap', findings: [], success: true };
  }

  try {
    let findings: SecurityFinding[];

    if (config.mode === 'import') {
      if (!config.reportPath) {
        throw new Error('ZAP import mode requires reportPath to be set');
      }
      findings = importFromFile(config.reportPath);
    } else {
      findings = await runEmbedded(config);
    }

    return { scanner: 'zap', findings, success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { scanner: 'zap', findings: [], success: false, error };
  }
}
