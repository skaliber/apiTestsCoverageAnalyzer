/**
 * Semgrep scanner integration.
 * Supports embedded (binary) and import (pre-generated JSON) modes.
 */
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { SemgrepScannerConfig, SecurityFinding, ScannerResult } from '../types';
import { normalizeSemgrepOutput } from '../normalizers/semgrep';

const execFileAsync = promisify(execFile);

/**
 * Run Semgrep in embedded mode.
 * Invokes the `semgrep` binary and parses its JSON output.
 */
async function runEmbedded(
  config: SemgrepScannerConfig,
  workspace: string,
): Promise<SecurityFinding[]> {
  const binary = config.binaryPath ?? 'semgrep';
  const semgrepConfig = config.config ?? 'p/default';
  const timeout = (config.timeout ?? 120) * 1000;

  const args: string[] = [
    'scan',
    '--json',
    '--config', semgrepConfig,
  ];

  if (config.include && config.include.length > 0) {
    for (const inc of config.include) {
      args.push('--include', inc);
    }
  }
  if (config.exclude && config.exclude.length > 0) {
    for (const exc of config.exclude) {
      args.push('--exclude', exc);
    }
  }

  args.push(workspace);

  const { stdout } = await execFileAsync(binary, args, { timeout, maxBuffer: 50 * 1024 * 1024 });

  let raw: unknown;
  try {
    raw = JSON.parse(stdout);
  } catch {
    throw new Error(`Failed to parse Semgrep JSON output: ${stdout.slice(0, 500)}`);
  }

  return normalizeSemgrepOutput(raw);
}

/**
 * Import Semgrep findings from a pre-generated JSON report.
 */
function importFromFile(reportPath: string): SecurityFinding[] {
  const resolved = path.resolve(reportPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Semgrep report file not found: ${resolved}`);
  }
  const content = fs.readFileSync(resolved, 'utf-8');
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new Error(`Failed to parse Semgrep report file: ${resolved}`);
  }
  return normalizeSemgrepOutput(raw);
}

/**
 * Run the Semgrep scanner according to the given configuration.
 */
export async function runSemgrep(
  config: SemgrepScannerConfig,
  workspace: string = '.',
): Promise<ScannerResult> {
  if (!config.enabled || config.mode === 'disabled') {
    return { scanner: 'semgrep', findings: [], success: true };
  }

  try {
    let findings: SecurityFinding[];

    if (config.mode === 'import') {
      if (!config.reportPath) {
        throw new Error('Semgrep import mode requires reportPath to be set');
      }
      findings = importFromFile(config.reportPath);
    } else {
      // embedded or hybrid: run the binary
      findings = await runEmbedded(config, workspace);
    }

    return { scanner: 'semgrep', findings, success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { scanner: 'semgrep', findings: [], success: false, error };
  }
}
