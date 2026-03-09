/**
 * businessRules.self-analysis.test.ts
 *
 * Tests for the business-rules.self-analysis.yaml file.
 * Validates that:
 * - The file parses correctly
 * - Every rule has all required fields
 * - Every required rule category is represented
 * - Core analyzer features are each covered by at least one rule
 * - No duplicate rule IDs exist
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

const ROOT = path.resolve(__dirname, '..');
const RULES_FILE = path.join(ROOT, 'business-rules.self-analysis.yaml');

interface BusinessRule {
  id: string;
  title: string;
  description: string;
  category: string;
  keywords: string[];
  endpoints?: Array<{ method?: string; path?: string } | string>;
  scenarios?: Array<{ id: string; description: string; keywords: string[] }>;
}

interface RulesFile {
  rules: BusinessRule[];
}

// ─── Required categories per spec 17 section 8.3 ─────────────────────────────

const REQUIRED_CATEGORIES = [
  'endpoint-coverage',
  'parameter-coverage',
  'business-coverage',
  'integration-coverage',
  'error-coverage',
  'security-coverage',
  'security-scanning',
  'performance-coverage',
  'compatibility-coverage',
  'summary-generation',
  'threshold-enforcement',
  'self-analysis',
  'reporting',
  'dashboard-ai-summaries',
  'ci-integration',
  'plugin-behaviour',
  'mcp-integration',
  'github-pages',
];

// ─── Core analyzer features that must each have a rule ───────────────────────

const REQUIRED_FEATURE_KEYWORDS = [
  'analyzeEndpoints',
  'analyzeParameters',
  'analyzeBusinessRules',
  'analyzeIntegrationFlows',
  'analyzeErrorHandling',
  'analyzeSecurityControls',
  'analyzePerfResilience',
  'checkCompatibility',
  'checkThresholds',
  'buildSummary',
  'intelligence',
  'plugin',
  'config',
];

describe('business-rules.self-analysis.yaml', () => {
  let parsed: RulesFile;
  let rules: BusinessRule[];

  beforeAll(() => {
    expect(fs.existsSync(RULES_FILE)).toBe(true);
    const content = fs.readFileSync(RULES_FILE, 'utf-8');
    parsed = yaml.load(content) as RulesFile;
    rules = parsed.rules;
  });

  // ── File structure ──────────────────────────────────────────────────────────

  it('parses without errors and has a rules array', () => {
    expect(Array.isArray(rules)).toBe(true);
  });

  it('has at least 10 rules (covering all major capabilities)', () => {
    expect(rules.length).toBeGreaterThanOrEqual(10);
  });

  // ── Required fields on every rule ──────────────────────────────────────────

  describe('every rule has required fields', () => {
    it.each(
      // We'll verify each rule has id, title, description, category, keywords
      ['id', 'title', 'description', 'category', 'keywords'] as const,
    )('every rule has a "%s" field', (field) => {
      for (const rule of rules) {
        expect(rule[field]).toBeDefined();
        if (field === 'keywords') {
          expect(Array.isArray(rule.keywords)).toBe(true);
          expect(rule.keywords.length).toBeGreaterThan(0);
        } else {
          expect(typeof rule[field]).toBe('string');
          expect((rule[field] as string).length).toBeGreaterThan(0);
        }
      }
    });
  });

  // ── ID format ──────────────────────────────────────────────────────────────

  it('all rule IDs match RULE-NNN format', () => {
    for (const rule of rules) {
      expect(rule.id).toMatch(/^RULE-\d{3}$/);
    }
  });

  it('no duplicate rule IDs', () => {
    const ids = rules.map((r) => r.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  // ── Required categories ─────────────────────────────────────────────────────

  describe('required categories are covered', () => {
    let categoriesPresent: Set<string>;

    beforeAll(() => {
      categoriesPresent = new Set(rules.map((r) => r.category));
    });

    for (const category of REQUIRED_CATEGORIES) {
      it(`category "${category}" has at least one rule`, () => {
        expect(categoriesPresent.has(category)).toBe(true);
      });
    }
  });

  // ── Core feature keyword coverage ──────────────────────────────────────────

  describe('core engine features have at least one rule with a matching keyword', () => {
    for (const featureKeyword of REQUIRED_FEATURE_KEYWORDS) {
      it(`feature "${featureKeyword}" is referenced in at least one rule`, () => {
        const hasMatch = rules.some((rule) =>
          rule.keywords.some((kw) =>
            kw.toLowerCase().includes(featureKeyword.toLowerCase()),
          ),
        );
        expect(hasMatch).toBe(true);
      });
    }
  });

  // ── Scenario validation ─────────────────────────────────────────────────────

  it('all rule scenarios have id, description, and keywords', () => {
    for (const rule of rules) {
      if (!rule.scenarios) continue;
      for (const scenario of rule.scenarios) {
        expect(scenario.id).toBeDefined();
        expect(scenario.id).toMatch(/^RULE-\d{3}-/);
        expect(typeof scenario.description).toBe('string');
        expect(Array.isArray(scenario.keywords)).toBe(true);
        expect(scenario.keywords.length).toBeGreaterThan(0);
      }
    }
  });

  // ── Security gate rule ──────────────────────────────────────────────────────

  it('has a rule covering security scanning with zero-tolerance gate', () => {
    const securityScanRule = rules.find((r) => r.category === 'security-scanning');
    expect(securityScanRule).toBeDefined();
    expect(securityScanRule!.keywords.some((kw) =>
      kw.toLowerCase().includes('semgrep') || kw.toLowerCase().includes('trivy'),
    )).toBe(true);
  });

  // ── Threshold enforcement rule ──────────────────────────────────────────────

  it('has at least one threshold-enforcement rule mentioning quality gate', () => {
    const thresholdRules = rules.filter((r) => r.category === 'threshold-enforcement');
    expect(thresholdRules.length).toBeGreaterThan(0);
    const hasGateKeyword = thresholdRules.some((r) =>
      r.keywords.some((kw) =>
        kw.toLowerCase().includes('gate') || kw.toLowerCase().includes('threshold'),
      ),
    );
    expect(hasGateKeyword).toBe(true);
  });

  // ── Self-analysis rule ──────────────────────────────────────────────────────

  it('has a self-analysis category rule', () => {
    const selfRule = rules.find((r) => r.category === 'self-analysis');
    expect(selfRule).toBeDefined();
  });

  // ── Intelligence / AI summary rule ─────────────────────────────────────────

  it('has a dashboard-ai-summaries rule covering intelligence engine', () => {
    const intelligenceRule = rules.find((r) => r.category === 'dashboard-ai-summaries');
    expect(intelligenceRule).toBeDefined();
    expect(intelligenceRule!.keywords.some((kw) =>
      kw.toLowerCase().includes('intelligence') || kw.toLowerCase().includes('risk'),
    )).toBe(true);
  });
});
