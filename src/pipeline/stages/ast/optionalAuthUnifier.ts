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

  // Flask patterns
  if (key.includes('flask:@jwt_required') || key.includes('flask:jwt_required')) {
    return { type: 'jwt', required: true, optional: false, sourcePattern: pattern };
  }
  if (key.includes('flask:@jwt_optional') || key.includes('flask:jwt_optional')) {
    return { type: 'jwt', required: false, optional: true, sourcePattern: pattern };
  }
  if (key.includes('flask:@login_required') || key.includes('flask:login_required')) {
    return { type: 'session', required: true, optional: false, sourcePattern: pattern };
  }

  // Express patterns
  if (key.includes('express:auth.required') || key.includes('express:credentialsrequired: true')) {
    return { type: 'jwt', required: true, optional: false, sourcePattern: pattern };
  }
  if (key.includes('express:auth.optional') || key.includes('express:credentialsrequired: false')) {
    return { type: 'jwt', required: false, optional: true, sourcePattern: pattern };
  }
  if (key.includes('express:passport.authenticate')) {
    return { type: 'jwt', required: true, optional: false, sourcePattern: pattern };
  }

  // HapiJS patterns (framework may be 'hapi' or 'hapijs')
  const isHapi = key.startsWith('hapi:') || key.startsWith('hapijs:');
  if (isHapi && key.includes('auth') && key.includes('mode') && (key.includes('try') || key.includes('optional'))) {
    return { type: 'jwt', required: false, optional: true, sourcePattern: pattern };
  }
  if (isHapi && key.includes('auth') && !key.includes('false') && !key.includes('try') && !key.includes('optional')) {
    return { type: 'jwt', required: true, optional: false, sourcePattern: pattern };
  }

  // Spring patterns
  if (key.includes('spring:@preauthorize') || key.includes('spring:@secured')) {
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
