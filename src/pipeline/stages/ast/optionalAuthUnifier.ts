/**
 * Optional auth unifier (Feature 27, Sub-PR 9)
 *
 * Normalizes all framework-specific auth classifications to a unified SecurityClassification.
 * Maps framework-specific patterns:
 *   Flask @jwt_optional → { optional: true }
 *   Express auth.optional / credentialsRequired: false → { optional: true }
 *   HapiJS auth: { mode: 'try' } → { optional: true }
 *   Spring @PreAuthorize → { required: true }
 *   Angular route guard → depends on guard type
 */

import type { SecurityClassification } from '../../../ast/astTypes';

export interface AuthClassificationEntry {
  framework: string;
  sourcePattern: string;
  classification: SecurityClassification;
}

/**
 * Framework-specific auth pattern → unified SecurityClassification.
 */
export function unifyAuthClassification(
  framework: string,
  pattern: string,
): SecurityClassification | undefined {
  const key = `${framework}:${pattern}`.toLowerCase();

  // Flask patterns — use word-boundary regex to avoid matching e.g. "@jwt_required_custom"
  if (/^flask:@?jwt_required\b/.test(key)) {
    return { type: 'jwt', required: true, optional: false, sourcePattern: pattern };
  }
  if (/^flask:@?jwt_optional\b/.test(key)) {
    return { type: 'jwt', required: false, optional: true, sourcePattern: pattern };
  }
  if (/^flask:@?login_required\b/.test(key)) {
    return { type: 'session', required: true, optional: false, sourcePattern: pattern };
  }

  // Express patterns — use word-boundary regex for precise matching
  if (/^express:auth\.required\b/.test(key) || /^express:credentialsrequired:\s*true\b/.test(key)) {
    return { type: 'jwt', required: true, optional: false, sourcePattern: pattern };
  }
  if (/^express:auth\.optional\b/.test(key) || /^express:credentialsrequired:\s*false\b/.test(key)) {
    return { type: 'jwt', required: false, optional: true, sourcePattern: pattern };
  }
  if (/^express:passport\.authenticate\b/.test(key)) {
    return { type: 'jwt', required: true, optional: false, sourcePattern: pattern };
  }

  // HapiJS patterns (framework may be 'hapi' or 'hapijs')
  const isHapi = /^hapi(?:js)?:/.test(key);
  if (isHapi && /\bauth\b/.test(key) && /\bmode\b/.test(key) && (/\btry\b/.test(key) || /\boptional\b/.test(key))) {
    return { type: 'jwt', required: false, optional: true, sourcePattern: pattern };
  }
  if (isHapi && /\bauth\b/.test(key) && !/\bfalse\b/.test(key) && !/\btry\b/.test(key) && !/\boptional\b/.test(key)) {
    return { type: 'jwt', required: true, optional: false, sourcePattern: pattern };
  }

  // Spring patterns — include @RolesAllowed and @WithMockUser
  if (/^spring:@?preauthorize\b/.test(key) || /^spring:@?secured\b/.test(key) || /^spring:@?rolesallowed\b/.test(key)) {
    return { type: 'custom', required: true, optional: false, sourcePattern: pattern };
  }
  if (/^spring:@?withmockuser\b/.test(key)) {
    return { type: 'custom', required: true, optional: false, sourcePattern: pattern };
  }

  return undefined;
}

/**
 * Detect auth coverage gaps.
 */
export interface AuthCoverageGap {
  type: 'missing-401-test' | 'missing-optional-dual-path';
  endpointPath: string;
  security: SecurityClassification;
  sourceFile: string;
}

/**
 * Analyze auth coverage gaps in endpoints vs tests.
 */
export function detectAuthCoverageGaps(
  endpoints: Array<{ path: string; security?: SecurityClassification; sourceFile: string }>,
  testAssertionPaths: Set<string>,
): AuthCoverageGap[] {
  const gaps: AuthCoverageGap[] = [];

  for (const ep of endpoints) {
    if (!ep.security) continue;

    if (ep.security.required && !testAssertionPaths.has(ep.path)) {
      gaps.push({
        type: 'missing-401-test',
        endpointPath: ep.path,
        security: ep.security,
        sourceFile: ep.sourceFile,
      });
    }

    if (ep.security.optional && !testAssertionPaths.has(ep.path)) {
      gaps.push({
        type: 'missing-optional-dual-path',
        endpointPath: ep.path,
        security: ep.security,
        sourceFile: ep.sourceFile,
      });
    }
  }

  return gaps;
}
