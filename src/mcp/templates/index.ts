/**
 * MCP integration – template mapper.
 *
 * Converts a NormalizedAiAnalysis into rendered markdown/HTML sections that
 * can be embedded in dashboard pages, PR comments, and build summaries.
 */

import type { NormalizedAiAnalysis, TemplateContext } from '../types';

// ─── Markdown template ────────────────────────────────────────────────────────

/**
 * Render a NormalizedAiAnalysis as a collapsible Markdown section.
 * Compatible with GitHub Flavoured Markdown `<details>` blocks.
 */
export function renderAiAnalysisMarkdown(ctx: TemplateContext): string {
  const { analysis, categoryTitle, mcpEnabled, serverRef } = ctx;
  const title = categoryTitle ?? ctx.category;

  const lines: string[] = [
    `<details>`,
    `<summary>🤖 AI Analysis — ${title}${analysis.isFallback ? ' (fallback mode)' : ''}</summary>`,
    '',
    `### ${title} — AI Insights`,
    '',
    `**Summary:** ${analysis.summary}`,
    '',
  ];

  if (analysis.keyFindings.length > 0) {
    lines.push('**Key Findings:**');
    for (const f of analysis.keyFindings) lines.push(`- ${f}`);
    lines.push('');
  }

  if (analysis.topRisks.length > 0) {
    lines.push('**Top Risks:**');
    for (const r of analysis.topRisks) lines.push(`- ${r}`);
    lines.push('');
  }

  if ((analysis.missingCoverageAreas?.length ?? 0) > 0) {
    lines.push('**Missing Coverage Areas:**');
    for (const a of analysis.missingCoverageAreas!) lines.push(`- ${a}`);
    lines.push('');
  }

  if ((analysis.likelyRootCauses?.length ?? 0) > 0) {
    lines.push('**Likely Root Causes:**');
    for (const c of analysis.likelyRootCauses!) lines.push(`- ${c}`);
    lines.push('');
  }

  if (analysis.recommendedActions.length > 0) {
    lines.push('**Recommended Actions:**');
    for (const a of analysis.recommendedActions) lines.push(`- ${a}`);
    lines.push('');
  }

  if (analysis.confidence) {
    lines.push(`*Confidence: ${analysis.confidence}*`);
    lines.push('');
  }

  if (mcpEnabled !== undefined) {
    lines.push(`*MCP enabled: ${mcpEnabled}*`);
  }
  if (serverRef) {
    lines.push(`*Server: ${serverRef}*`);
  }

  lines.push('</details>');
  lines.push('');

  return lines.join('\n');
}

// ─── HTML template ────────────────────────────────────────────────────────────

/**
 * Render a NormalizedAiAnalysis as an HTML `<details>` block.
 * Used in published HTML reports.
 */
export function renderAiAnalysisHtml(ctx: TemplateContext): string {
  const { analysis, categoryTitle, mcpEnabled, serverRef } = ctx;
  const title = categoryTitle ?? ctx.category;
  const fallbackNote = analysis.isFallback
    ? '<span class="ai-fallback"> (fallback mode)</span>'
    : '';

  const escHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const li = (items: string[]) =>
    items.map((i) => `<li>${escHtml(i)}</li>`).join('\n');

  const sections: string[] = [];

  sections.push(`<p><strong>Summary:</strong> ${escHtml(analysis.summary)}</p>`);

  if (analysis.keyFindings.length > 0) {
    sections.push(`<p><strong>Key Findings:</strong></p><ul>${li(analysis.keyFindings)}</ul>`);
  }
  if (analysis.topRisks.length > 0) {
    sections.push(`<p><strong>Top Risks:</strong></p><ul>${li(analysis.topRisks)}</ul>`);
  }
  if ((analysis.missingCoverageAreas?.length ?? 0) > 0) {
    sections.push(`<p><strong>Missing Coverage Areas:</strong></p><ul>${li(analysis.missingCoverageAreas!)}</ul>`);
  }
  if ((analysis.likelyRootCauses?.length ?? 0) > 0) {
    sections.push(`<p><strong>Likely Root Causes:</strong></p><ul>${li(analysis.likelyRootCauses!)}</ul>`);
  }
  if (analysis.recommendedActions.length > 0) {
    sections.push(`<p><strong>Recommended Actions:</strong></p><ul>${li(analysis.recommendedActions)}</ul>`);
  }
  if (analysis.confidence) {
    sections.push(`<p><em>Confidence: ${escHtml(analysis.confidence)}</em></p>`);
  }
  if (mcpEnabled !== undefined) {
    sections.push(`<p><em>MCP enabled: ${mcpEnabled}</em></p>`);
  }
  if (serverRef) {
    sections.push(`<p><em>Server: ${escHtml(serverRef)}</em></p>`);
  }

  return [
    `<details class="ai-analysis-panel">`,
    `  <summary>🤖 AI Analysis — ${escHtml(title)}${fallbackNote}</summary>`,
    `  <div class="ai-analysis-content">`,
    `    <h4>${escHtml(title)} — AI Insights</h4>`,
    ...sections.map((s) => `    ${s}`),
    `  </div>`,
    `</details>`,
    '',
  ].join('\n');
}

// ─── Dashboard panel data ─────────────────────────────────────────────────────

/**
 * Convert a NormalizedAiAnalysis into a plain-object panel data structure
 * consumed by the React dashboard.
 */
export function buildAiPanelData(analysis: NormalizedAiAnalysis): AiPanelData {
  return {
    summary: analysis.summary,
    keyFindings: analysis.keyFindings,
    topRisks: analysis.topRisks,
    recommendedActions: analysis.recommendedActions,
    missingCoverageAreas: analysis.missingCoverageAreas ?? [],
    likelyRootCauses: analysis.likelyRootCauses ?? [],
    confidence: analysis.confidence ?? 'medium',
    isFallback: analysis.isFallback ?? false,
    category: analysis.category ?? '',
  };
}

/** Data shape consumed by the AiSummaryPanel React component */
export interface AiPanelData {
  summary: string;
  keyFindings: string[];
  topRisks: string[];
  recommendedActions: string[];
  missingCoverageAreas: string[];
  likelyRootCauses: string[];
  confidence: string;
  isFallback: boolean;
  category: string;
}
