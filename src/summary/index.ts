/**
 * Summary engine – public entry point.
 *
 * Re-exports the full public API for the built-in summary engine.
 */

export { generateBuildSummary } from './buildSummary';
export { generatePrSummary } from './prSummary';
export type {
  SummaryInput,
  SummaryResult,
  SummarySection,
  SummaryConfig,
} from './markdownRenderer';
export {
  coverageTypeTitle,
  renderCoverageSection,
  renderSecurityScanSection,
  renderAiSummary,
  statusBadge,
  pct,
  tableRow,
  extractGaps,
} from './markdownRenderer';
