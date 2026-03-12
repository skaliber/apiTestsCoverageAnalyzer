/**
 * HapiJS pattern detector (Feature 27, Sub-PR 8)
 *
 * Detects:
 * 1. server.route({ method, path, options: { auth, validate, handler } })
 * 2. Joi validator chains: Joi.string().required(), Joi.number().min().max().default()
 * 3. auth: 'jwt' = required, auth: { mode: 'try' } = optional
 * 4. Boom error responses: Boom.notFound(), Boom.unauthorized()
 */

export interface HapiRoute {
  method: string;
  path: string;
  auth?: HapiAuth;
  validation?: HapiValidation;
  sourceFile: string;
  line?: number;
}

export interface HapiAuth {
  strategy?: string;
  mode: 'required' | 'optional' | 'try';
}

export interface HapiValidation {
  queryParams: string[];
  payloadParams: string[];
}

export interface HapiBoomError {
  errorType: string;
  statusCode?: number;
  sourceFile: string;
  line?: number;
}

/** Map Boom methods to HTTP status codes */
const BOOM_STATUS_MAP: Record<string, number> = {
  badRequest: 400,
  unauthorized: 401,
  forbidden: 403,
  notFound: 404,
  conflict: 409,
  badData: 422,
  internal: 500,
  badImplementation: 500,
  notImplemented: 501,
  badGateway: 502,
  serverUnavailable: 503,
  gatewayTimeout: 504,
};

/**
 * Detect HapiJS route definitions from source text.
 */
export function detectHapiRoutes(sourceText: string, filePath: string): HapiRoute[] {
  const routes: HapiRoute[] = [];
  const lines = sourceText.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Look for method: 'GET' and path: '/articles' patterns close together
    const methodMatch = line.match(/method\s*:\s*['"](\w+)['"]/);
    if (!methodMatch) continue;

    const method = methodMatch[1].toUpperCase();

    // Find path in nearby lines (within 5 lines)
    let path = '';
    let auth: HapiAuth | undefined;
    let validation: HapiValidation | undefined;

    for (let j = Math.max(0, i - 3); j < Math.min(i + 10, lines.length); j++) {
      const nearLine = lines[j];

      // path: '/articles/{slug}'
      const pathMatch = nearLine.match(/path\s*:\s*['"]([^'"]+)['"]/);
      if (pathMatch) path = pathMatch[1];

      // auth: 'jwt' or auth: 'simple'
      const authSimple = nearLine.match(/auth\s*:\s*['"](\w+)['"]/);
      if (authSimple) {
        auth = { strategy: authSimple[1], mode: 'required' };
      }

      // auth: { mode: 'try' } or auth: { mode: 'optional' } — single-line case
      const authMode = nearLine.match(/(?:auth|mode)\s*:\s*[{]?\s*mode\s*:\s*['"](\w+)['"]/);
      if (authMode) {
        auth = {
          strategy: auth?.strategy,
          mode: authMode[1] === 'try' || authMode[1] === 'optional' ? 'optional' : 'required',
        };
      } else if (/auth\s*:\s*\{/.test(nearLine) || /auth\s*\{/.test(nearLine)) {
        // Multi-line auth object: scan the next 5 lines for mode: 'try' / 'optional'
        for (let m = j + 1; m < Math.min(j + 6, lines.length); m++) {
          const modeMatch = lines[m].match(/mode\s*:\s*['"](\w+)['"]/);
          if (modeMatch) {
            auth = {
              strategy: auth?.strategy,
              mode: modeMatch[1] === 'try' || modeMatch[1] === 'optional' ? 'optional' : 'required',
            };
            break;
          }
        }
      }

      // auth: false
      if (/auth\s*:\s*false/.test(nearLine)) {
        auth = undefined; // Public route
      }

      // validate.query or validate.payload with Joi
      if (/validate\s*:/.test(nearLine)) {
        const queryParams: string[] = [];
        const payloadParams: string[] = [];

        // Scan validation block
        for (let k = j; k < Math.min(j + 15, lines.length); k++) {
          const valLine = lines[k];
          // query: { ... } — extract Joi fields from same line and subsequent lines
          if (/query\s*:/.test(valLine)) {
            // Same-line extraction
            const paramMatch = valLine.match(/(\w+)\s*:\s*Joi\./g);
            if (paramMatch) {
              for (const pm of paramMatch) {
                const name = pm.match(/(\w+)\s*:/)?.[1];
                if (name) queryParams.push(name);
              }
            }
            // Multi-line extraction: scan subsequent lines for fieldName: Joi. patterns
            for (let q = k + 1; q < Math.min(k + 16, lines.length); q++) {
              const subLine = lines[q];
              if (/}\s*[),]/.test(subLine) || /]\s*,/.test(subLine)) break;
              const fieldMatch = subLine.match(/(\w+)\s*:\s*Joi\./g);
              if (fieldMatch) {
                for (const fm of fieldMatch) {
                  const name = fm.match(/(\w+)\s*:/)?.[1];
                  if (name && !queryParams.includes(name)) queryParams.push(name);
                }
              }
            }
          }
          // payload: { ... } — extract Joi fields from same line and subsequent lines
          if (/payload\s*:/.test(valLine)) {
            // Same-line extraction
            const paramMatch = valLine.match(/(\w+)\s*:\s*Joi\./g);
            if (paramMatch) {
              for (const pm of paramMatch) {
                const name = pm.match(/(\w+)\s*:/)?.[1];
                if (name) payloadParams.push(name);
              }
            }
            // Multi-line extraction: scan subsequent lines for fieldName: Joi. patterns
            for (let q = k + 1; q < Math.min(k + 16, lines.length); q++) {
              const subLine = lines[q];
              if (/}\s*[),]/.test(subLine) || /]\s*,/.test(subLine)) break;
              const fieldMatch = subLine.match(/(\w+)\s*:\s*Joi\./g);
              if (fieldMatch) {
                for (const fm of fieldMatch) {
                  const name = fm.match(/(\w+)\s*:/)?.[1];
                  if (name && !payloadParams.includes(name)) payloadParams.push(name);
                }
              }
            }
          }
        }

        if (queryParams.length > 0 || payloadParams.length > 0) {
          validation = { queryParams, payloadParams };
        }
      }
    }

    if (path) {
      routes.push({ method, path, auth, validation, sourceFile: filePath, line: i + 1 });
    }
  }

  return routes;
}

/**
 * Detect Boom error responses.
 */
export function detectBoomErrors(sourceText: string, filePath: string): HapiBoomError[] {
  const errors: HapiBoomError[] = [];
  const lines = sourceText.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/Boom\.(\w+)\s*\(/);
    if (match) {
      const errorType = match[1];
      errors.push({
        errorType,
        statusCode: BOOM_STATUS_MAP[errorType],
        sourceFile: filePath,
        line: i + 1,
      });
    }
  }

  return errors;
}
