/**
 * Trivy scanner integration.
 * Supports embedded (binary) and import (pre-generated JSON) modes.
 */
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { TrivyScannerConfig, SecurityFinding, ScannerResult } from '../types';
import { normaliseTrivyOutput } from '../normalizers/trivy';

const execFileAsync = promisify(execFile);

/**
 * Run Trivy in embedded mode.
 * Invokes the `trivy` binary and parses its JSON output.
 */
async function runEmbedded(
  config: TrivyScannerConfig,
  workspace: string,
): Promise<SecurityFinding[]> {
  const binary = config.binaryPath ?? 'trivy';
  const scanMode = config.scanMode ?? 'fs';
  const scanners = config.scanners ?? ['vuln', 'secret'];
  const timeout = (config.timeout ?? 120) * 1000;

  const args: string[] = [
    scanMode,
    '--format', 'json',
    '--scanners', scanners.join(','),
    workspace,
  ];

  const { stdout } = await execFileAsync(binary, args, { timeout, maxBuffer: 50 * 1024 * 1024 });

  let raw: unknown;
  try {
    raw = JSON.parse(stdout);
  } catch {
    throw new Error(`Failed to parse Trivy JSON output: ${stdout.slice(0, 500)}`);
  }

  return normaliseTrivyOutput(raw);
}

/**
 * Import Trivy findings from a pre-generated JSON report.
 */
function importFromFile(reportPath: string): SecurityFinding[] {
  const resolved = path.resolve(reportPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Trivy report file not found: ${resolved}`);
  }
  const content = fs.readFileSync(resolved, 'utf-8');
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new Error(`Failed to parse Trivy report file: ${resolved}`);
  }
  return normaliseTrivyOutput(raw);
}

/**
 * Run the Trivy scanner according to the given configuration.
 */
export async function runTrivy(
  config: TrivyScannerConfig,
  workspace: string = '.',
): Promise<ScannerResult> {
  if (!config.enabled || config.mode === 'disabled') {
    return { scanner: 'trivy', findings: [], success: true };
  }

  try {
    let findings: SecurityFinding[];

    if (config.mode === 'import') {
      if (!config.reportPath) {
        throw new Error('Trivy import mode requires reportPath to be set');
      }
      findings = importFromFile(config.reportPath);
    } else {
      findings = await runEmbedded(config, workspace);
    }

    return { scanner: 'trivy', findings, success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { scanner: 'trivy', findings: [], success: false, error };
  }
}
