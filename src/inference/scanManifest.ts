/**
 * Scan Manifest
 *
 * Records what was scanned during a zero-config `analyze` run —
 * files analyzed, languages detected, frameworks detected, and
 * per-metric coverage outcomes with their source (explicit / inferred / skipped).
 *
 * Written to: reports/scan-manifest.json
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ScanTypeEntry {
  type: string;
  source: 'explicit' | 'inferred' | 'skipped';
  reason?: string;
  itemsFound: number;
  itemsCovered: number;
  coveragePercent: number;
}

export interface ScanManifest {
  projectRoot: string;
  analyzedAt: string;
  discoveredFiles: {
    serviceFiles: string[];
    testFiles: string[];
    specFiles: string[];
  };
  languages: string[];
  frameworks: string[];
  scanTypes: ScanTypeEntry[];
}

// ─── Writer ───────────────────────────────────────────────────────────────────

/**
 * Write a scan manifest to the reports directory.
 * Returns the path of the written file.
 */
export function writeScanManifest(manifest: ScanManifest, reportsDir: string): string {
  fs.mkdirSync(reportsDir, { recursive: true });
  const outputPath = path.join(reportsDir, 'scan-manifest.json');
  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2), 'utf-8');
  return outputPath;
}
