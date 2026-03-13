/**
 * Business Rule Inference Engine
 *
 * When no `business-rules.yaml` file is present, this engine analyzes service
 * source code to infer business constraints automatically.
 *
 * Inference sources:
 *  - Throw / raise statements gated on a condition   (e.g. throw InsufficientFundsException)
 *  - Validation checks that return 4xx HTTP responses
 *  - Authorization logic (isAdmin, hasRole, etc.)
 *  - Null / empty guards
 *
 * Inferred rules are labeled `rule_source: "inferred"` and include a
 * `source_location` field pointing back to the originating code.
 *
 * Generated artifact: reports/inferred-business-rules.json
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Public types ─────────────────────────────────────────────────────────────

export type RuleSource = 'inferred' | 'explicit';
export type RuleType =
  | 'validation'      // Input validation (null, range, format)
  | 'authorization'   // Permission / role check
  | 'business_logic'  // Domain invariant (balance, capacity, etc.)
  | 'error_flow';     // Exception / error branch

export interface InferredBusinessRule {
  /** Stable identifier derived from location + condition */
  id: string;
  /** Short human-readable name */
  name: string;
  rule_source: RuleSource;
  type: RuleType;
  /** Best-guess endpoint this rule applies to */
  endpoint?: string;
  /** The condition expression as a string */
  condition: string;
  /** Human-readable description of expected behavior */
  expected_behavior: string;
  /** File path + line number */
  source_location: string;
  /** Raw matched code snippet */
  code_snippet: string;
  /** Most specific identifiable terms from the condition, for accurate test matching */
  specificKeywords: string[];
}

export interface BusinessRuleInferenceResult {
  rules: InferredBusinessRule[];
  /** Number of service files analyzed */
  filesAnalyzed: number;
  /** Whether inference was used (true) or explicit files found (false) */
  inferred: boolean;
  /** Warnings emitted during analysis */
  warnings: string[];
}

// ─── Inference patterns ───────────────────────────────────────────────────────

interface InferencePattern {
  type: RuleType;
  /** Regex applied to each code line */
  pattern: RegExp;
  /** Derive rule name from matched groups */
  nameTemplate: (match: RegExpMatchArray) => string;
  /** Derive expected_behavior from matched groups */
  behaviorTemplate: (match: RegExpMatchArray) => string;
  /** Derive condition expression from match */
  conditionTemplate: (match: RegExpMatchArray) => string;
}

const INFERENCE_PATTERNS: InferencePattern[] = [
  // ── throw / raise with an exception ──────────────────────────────────────
  {
    type: 'business_logic',
    pattern: /throw\s+new\s+(\w+Exception|\w+Error)\s*\(([^)]*)\)/i,
    nameTemplate: (m) => toSnakeCase(m[1]),
    behaviorTemplate: (m) => `Operation rejected: ${m[1]}`,
    conditionTemplate: (m) => `throws ${m[1]}(${m[2].trim()})`,
  },
  // Python raise
  {
    type: 'business_logic',
    pattern: /raise\s+(\w+(?:Exception|Error))\s*(?:\(([^)]*)\))?/,
    nameTemplate: (m) => toSnakeCase(m[1]),
    behaviorTemplate: (m) => `Operation rejected: ${m[1]}`,
    conditionTemplate: (m) => `raise ${m[1]}(${(m[2] ?? '').trim()})`,
  },
  // Ruby raise
  {
    type: 'business_logic',
    pattern: /raise\s+(\w+(?:Exception|Error))\s*(?:,\s*['"]([^'"]*)['"]\s*)?/,
    nameTemplate: (m) => toSnakeCase(m[1]),
    behaviorTemplate: (m) => `Operation rejected: ${m[1]}${m[2] ? ' — ' + m[2] : ''}`,
    conditionTemplate: (m) => `raise ${m[1]}`,
  },

  // ── HTTP 4xx response returns ──────────────────────────────────────────────
  {
    type: 'validation',
    pattern: /return\s+(?:ResponseEntity\.)?(?:status\s*\()?(4\d\d)(?:\))?/,
    nameTemplate: (m) => `http_${m[1]}_response`,
    behaviorTemplate: (m) => `Request rejected with HTTP ${m[1]}`,
    conditionTemplate: (m) => `returns HTTP ${m[1]}`,
  },
  // Chained .status(4xx) calls: res.status(400).json(...)
  {
    type: 'validation',
    pattern: /\.status\s*\(\s*(4\d\d)\s*\)/,
    nameTemplate: (m) => `http_${m[1]}_response`,
    behaviorTemplate: (m) => `Request rejected with HTTP ${m[1]}`,
    conditionTemplate: (m) => `returns HTTP ${m[1]}`,
  },
  // Flask / FastAPI abort(4xx) or return 4xx
  {
    type: 'validation',
    pattern: /abort\s*\(\s*(4\d\d)\s*\)/,
    nameTemplate: (m) => `http_${m[1]}_abort`,
    behaviorTemplate: (m) => `Request aborted with HTTP ${m[1]}`,
    conditionTemplate: (m) => `abort(${m[1]})`,
  },
  // Rails render json: ..., status: :unprocessable_entity / :forbidden / :not_found
  {
    type: 'validation',
    pattern: /render\s+json:.*,\s*status:\s*:(\w+)/,
    nameTemplate: (m) => `rails_status_${m[1]}`,
    behaviorTemplate: (m) => `Request rejected with status :${m[1]}`,
    conditionTemplate: (m) => `render json with status :${m[1]}`,
  },

  // ── Null / blank guards ────────────────────────────────────────────────────
  {
    type: 'validation',
    pattern: /if\s*\(?\s*([\w.]+)\s*(?:==\s*null|===\s*null|===\s*undefined|is\s+None|\.nil\?|\.blank\?|\.empty\?)\s*\)?/,
    nameTemplate: (m) => `null_check_${toSnakeCase(m[1].replace(/\./g, '_'))}`,
    behaviorTemplate: (m) => `${m[1]} must not be null/empty`,
    conditionTemplate: (m) => `${m[1]} == null`,
  },

  // ── Authorization / permission guards ─────────────────────────────────────
  {
    type: 'authorization',
    pattern: /if\s*\(?\s*!?\s*(?:user\.)?(?:isAdmin|hasRole|hasPermission|can|authorize|authenticated)\s*\(?([^)]*)\)?/i,
    nameTemplate: (m) => `authorization_${toSnakeCase(m[1] || 'check')}`,
    behaviorTemplate: (m) => `Access denied — insufficient permissions`,
    conditionTemplate: (m) => `!isAuthorized(${(m[1] ?? '').trim()})`,
  },

  // ── Balance / capacity / limit checks ─────────────────────────────────────
  {
    type: 'business_logic',
    pattern: /if\s*\(?\s*(\w+)\s*>\s*(\w+)\s*\)?.*(?:throw|raise|return\s+4)/i,
    nameTemplate: (m) => `limit_exceeded_${toSnakeCase(m[1])}`,
    behaviorTemplate: (m) => `${m[1]} must not exceed ${m[2]}`,
    conditionTemplate: (m) => `${m[1]} > ${m[2]}`,
  },
];

// ─── Endpoint heuristics ──────────────────────────────────────────────────────

/** Attempt to associate a rule with the nearest HTTP route/endpoint annotation. */
function guessEndpoint(lines: string[], ruleLineIdx: number): string | undefined {
  // Search up to 40 lines above for common routing patterns
  const lookupLines = lines.slice(Math.max(0, ruleLineIdx - 40), ruleLineIdx);

  // Spring: @GetMapping("/path") / @PostMapping / @RequestMapping
  for (let i = lookupLines.length - 1; i >= 0; i--) {
    const m = lookupLines[i].match(/@(Get|Post|Put|Patch|Delete|Request)Mapping\s*\(\s*["']([^"']+)["']/i);
    if (m) return `${m[1].toUpperCase()} ${m[2]}`;
  }

  // FastAPI: @router.get("/path") / @app.post
  for (let i = lookupLines.length - 1; i >= 0; i--) {
    const m = lookupLines[i].match(/@(?:router|app)\.(get|post|put|patch|delete)\s*\(\s*["']([^"']+)["']/i);
    if (m) return `${m[1].toUpperCase()} ${m[2]}`;
  }

  // Express: router.get('/path') / app.post('/path')
  for (let i = lookupLines.length - 1; i >= 0; i--) {
    const m = lookupLines[i].match(/(?:router|app)\.(get|post|put|patch|delete)\s*\(\s*["']([^"']+)["']/i);
    if (m) return `${m[1].toUpperCase()} ${m[2]}`;
  }

  // Rails: resources :name / get '/path'
  for (let i = lookupLines.length - 1; i >= 0; i--) {
    const m = lookupLines[i].match(/(?:get|post|put|patch|delete)\s*["']([^"']+)["']/i);
    if (m) return `${lookupLines[i].trim().split(/\s/)[0].toUpperCase()} ${m[1]}`;
  }

  return undefined;
}

// ─── Core inference function ─────────────────────────────────────────────────

/**
 * Infer business rules from a single service source file.
 */
export function inferRulesFromFile(filePath: string): InferredBusinessRule[] {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }

  const lines   = content.split('\n');
  const rules: InferredBusinessRule[] = [];
  const seen    = new Set<string>();

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    for (const ip of INFERENCE_PATTERNS) {
      const match = line.match(ip.pattern);
      if (!match) continue;

      const condition     = ip.conditionTemplate(match);
      const sourceLocation = `${filePath}:${lineIdx + 1}`;
      const dedupKey      = `${filePath}:${lineIdx}:${condition}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      const name     = ip.nameTemplate(match);
      const id       = `${toSnakeCase(path.basename(filePath, path.extname(filePath)))}_${name}_${lineIdx + 1}`;
      const endpoint = guessEndpoint(lines, lineIdx);

      rules.push({
        id,
        name,
        rule_source: 'inferred',
        type: ip.type,
        endpoint,
        condition,
        expected_behavior: ip.behaviorTemplate(match),
        source_location: sourceLocation,
        code_snippet: line.trim().slice(0, 200),
        specificKeywords: extractSpecificKeywords(condition),
      });
    }
  }

  return rules;
}

/**
 * Run inference across all provided service source files.
 *
 * @param serviceFiles - Paths to service/application source files
 * @param warnings     - Mutable array; warnings are pushed here
 */
export function inferBusinessRules(
  serviceFiles: string[],
  warnings: string[] = [],
): BusinessRuleInferenceResult {
  if (serviceFiles.length === 0) {
    warnings.push('No service source files provided; business rule inference skipped.');
    return { rules: [], filesAnalyzed: 0, inferred: true, warnings };
  }

  const allRules: InferredBusinessRule[] = [];
  let filesAnalyzed = 0;

  for (const fp of serviceFiles) {
    const fileRules = inferRulesFromFile(fp);
    if (fileRules.length > 0) {
      allRules.push(...fileRules);
    }
    filesAnalyzed++;
  }

  return {
    rules: allRules,
    filesAnalyzed,
    inferred: true,
    warnings,
  };
}

/**
 * Write inferred business rules to the reports directory.
 * Returns the path of the written file.
 */
export function writeInferredBusinessRules(
  result: BusinessRuleInferenceResult,
  reportsDir: string,
): string {
  fs.mkdirSync(reportsDir, { recursive: true });
  const outputPath = path.join(reportsDir, 'inferred-business-rules.json');
  const output = {
    generated_at: new Date().toISOString(),
    rule_source: 'inferred',
    files_analyzed: result.filesAnalyzed,
    rule_count: result.rules.length,
    rules: result.rules,
  };
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');
  return outputPath;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export const KEYWORD_STOP_WORDS = new Set([
  'http', 'exception', 'error', 'errors', 'throw', 'throws', 'raise', 'raises',
  'new', 'return', 'returns', 'status', 'response', 'request', 'abort',
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'not', 'has',
  'can', 'cant', 'be', 'been', 'must', 'will', 'was', 'are', 'have',
  'its', 'too', 'also', 'just', 'only', 'than', 'then', 'when',
]);

/**
 * Extract the most specific identifiable terms from a rule condition string.
 * Prioritises quoted field names and message fragments over generic identifiers.
 */
export function extractSpecificKeywords(condition: string): string[] {
  const kwSet = new Set<string>();

  // 1. Extract contents of quoted strings (field names, messages)
  // Minimum length of 2 prevents single-character tokens like punctuation or abbreviations
  // from polluting the keyword set (e.g. single-char matches from `{ e: [...] }`).
  const quotedMatches = condition.match(/['"]([^'"]{2,})['"]/g) ?? [];
  for (const q of quotedMatches) {
    const inner = q.slice(1, -1);
    // Split on common separators and add each non-trivial token
    inner.toLowerCase().split(/[\s\-_.,!?:;/\\]+/).forEach((tok) => {
      if (tok.length >= 2 && !KEYWORD_STOP_WORDS.has(tok) && /[a-z]/.test(tok)) {
        kwSet.add(tok);
      }
    });
  }

  // 2. Extract object key identifiers from patterns like { fieldName: [...] }
  const objKeyMatches = condition.match(/\{\s*(?:'([^']+)'|"([^"]+)"|(\w+))\s*:/g) ?? [];
  for (const m of objKeyMatches) {
    const inner = m.replace(/^\{\s*/, '').replace(/\s*:$/, '').replace(/['"]/g, '').toLowerCase();
    if (inner.length >= 2 && !KEYWORD_STOP_WORDS.has(inner)) {
      kwSet.add(inner);
    }
  }

  // 3. Camel-case parts of exception / class names (e.g. "HttpException" → "http")
  //    but only non-stop identifiers of reasonable length
  const identifiers = condition.match(/\b[A-Za-z][A-Za-z0-9]{2,}\b/g) ?? [];
  for (const id of identifiers) {
    // Split camelCase into parts
    const parts = id.replace(/([A-Z])/g, ' $1').toLowerCase().trim().split(/\s+/);
    for (const part of parts) {
      if (part.length >= 3 && !KEYWORD_STOP_WORDS.has(part)) {
        kwSet.add(part);
      }
    }
  }

  return [...kwSet];
}

function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/__+/g, '_');
}
