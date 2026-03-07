/**
 * OWASP ZAP output normalizer.
 * Converts ZAP JSON/XML findings to the common SecurityFinding model.
 */
import {
  SecurityFinding,
  FindingCategory,
  FindingSeverity,
} from '../types';

// ─── ZAP native types ─────────────────────────────────────────────────────────

interface ZapAlert {
  alert?: string;
  name?: string;
  riskdesc?: string;
  riskcode?: string | number;
  confidence?: string | number;
  description?: string;
  uri?: string;
  url?: string;
  method?: string;
  solution?: string;
  reference?: string;
  cweid?: string | number;
  wascid?: string | number;
  sourceid?: string;
  pluginid?: string;
  instances?: Array<{
    uri?: string;
    method?: string;
    evidence?: string;
  }>;
}

interface ZapSite {
  '@name'?: string;
  '@host'?: string;
  alerts?: ZapAlert[];
  // ZAP also nests alerts differently in some versions
  [key: string]: unknown;
}

interface ZapOutput {
  // Standard ZAP JSON format
  site?: ZapSite | ZapSite[];
  // Flat format
  alerts?: ZapAlert[];
}

// ─── Severity mapping ─────────────────────────────────────────────────────────

function mapZapSeverity(riskdesc: string | undefined, riskcode: string | number | undefined): FindingSeverity {
  const desc = (riskdesc ?? '').toLowerCase();
  const code = Number(riskcode ?? -1);

  if (desc.startsWith('critical') || code === 4) return 'CRITICAL';
  if (desc.startsWith('high') || code === 3) return 'HIGH';
  if (desc.startsWith('medium') || code === 2) return 'MEDIUM';
  return 'LOW';
}

// ─── Category mapping ─────────────────────────────────────────────────────────

const ZAP_CATEGORY_PATTERNS: Array<{ pattern: RegExp; category: FindingCategory }> = [
  { pattern: /authentication|csrf|anti.forgery|brute.force|session.fixation|auth.bypass/i, category: 'auth' },
  { pattern: /authorization|access.control|privilege|insecure.direct.object/i, category: 'auth' },
  { pattern: /ssl|tls|certificate|cipher|transport.security|https|weak.cipher|insecure.transport/i, category: 'crypto' },
  { pattern: /information.disclosure|sensitive.data|data.exposure|stack.trace|error.message|server.banner/i, category: 'data-exposure' },
  { pattern: /misconfiguration|security.header|csp|cors|clickjacking|x.frame|x.content.type/i, category: 'misconfig' },
  { pattern: /session|cookie|samesite|httponly|secure.flag/i, category: 'auth' },
  { pattern: /injection|sqli|xss|cross.site|path.traversal|parameter.tamper|directory.traversal|template.injection|command.injection/i, category: 'injection' },
];

function mapZapCategory(alertName: string): FindingCategory {
  for (const { pattern, category } of ZAP_CATEGORY_PATTERNS) {
    if (pattern.test(alertName)) return category;
  }
  return 'dast';
}

function parseEndpoint(uri: string | undefined): { method?: string; path?: string } | undefined {
  if (!uri) return undefined;
  try {
    const url = new URL(uri);
    return { path: url.pathname };
  } catch {
    return { path: uri };
  }
}

// ─── Alert extraction ─────────────────────────────────────────────────────────

function extractAlerts(data: ZapOutput): ZapAlert[] {
  // Top-level alerts array
  if (Array.isArray(data.alerts) && data.alerts.length > 0) {
    return data.alerts;
  }

  // site.alerts (single or array of sites)
  const sites = data.site
    ? Array.isArray(data.site)
      ? data.site
      : [data.site]
    : [];

  const alerts: ZapAlert[] = [];
  for (const site of sites) {
    if (Array.isArray(site.alerts)) {
      alerts.push(...site.alerts);
    }
  }

  // Fallback: look for top-level key that looks like alerts
  if (alerts.length === 0) {
    for (const value of Object.values(data)) {
      if (Array.isArray(value) && value.length > 0 && value[0] && typeof value[0] === 'object') {
        const first = value[0] as Record<string, unknown>;
        if ('alert' in first || 'name' in first || 'riskdesc' in first) {
          alerts.push(...(value as ZapAlert[]));
          break;
        }
      }
    }
  }

  return alerts;
}

// ─── Normalizer ───────────────────────────────────────────────────────────────

/**
 * Parse ZAP JSON output and return normalized SecurityFindings.
 */
export function normaliseZapOutput(raw: unknown): SecurityFinding[] {
  const data = raw as ZapOutput;
  const alerts = extractAlerts(data);

  return alerts.map((alert): SecurityFinding => {
    const name = alert.alert ?? alert.name ?? 'Unknown ZAP finding';
    const uri = alert.uri ?? alert.url ?? alert.instances?.[0]?.uri;
    const method = alert.method ?? alert.instances?.[0]?.method;

    return {
      scanner: 'zap',
      category: mapZapCategory(name),
      severity: mapZapSeverity(alert.riskdesc, alert.riskcode),
      title: name,
      description: alert.description,
      ruleId: alert.pluginid ?? alert.sourceid,
      cwe: alert.cweid ? [`CWE-${alert.cweid}`] : undefined,
      endpoint: uri
        ? { ...parseEndpoint(uri), method: method?.toUpperCase() }
        : method
        ? { method: method.toUpperCase() }
        : undefined,
      scannerNativePayload: alert,
    };
  });
}
