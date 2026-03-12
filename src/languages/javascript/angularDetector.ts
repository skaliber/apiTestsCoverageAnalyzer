/**
 * Angular pattern detector (Feature 27, Sub-PR 7)
 *
 * Detects:
 * 1. @Injectable services with HttpClient injection
 * 2. this.http.get/post/put/delete/patch() API calls
 * 3. inject(HttpClient) functional style
 * 4. environment.api_url usage
 * 5. CanActivateFn / CanActivateChildFn / CanDeactivateFn / ResolveFn guards
 * 6. implements HttpInterceptor / HttpInterceptorFn interceptors
 * 7. TestBed.configureTestingModule with HttpClientTestingModule
 * 8. httpMock.expectOne(url) assertion nodes
 * 9. signal<T>(), toSignal() patterns
 */

export interface AngularHttpCall {
  method: string;
  urlPattern: string;
  usesEnvironmentUrl: boolean;
  sourceFile: string;
  line?: number;
}

export interface AngularInjection {
  /** Class that receives the injection */
  consumerClass: string;
  /** Service class being injected */
  serviceClass: string;
  /** Injection style: constructor, inject function, decorator */
  style: 'constructor' | 'inject-fn';
  sourceFile: string;
  line?: number;
}

export interface AngularGuard {
  name: string;
  type: 'functional' | 'class-based';
  guardType: 'CanActivate' | 'CanActivateChild' | 'CanDeactivate' | 'Resolve' | 'CanMatch';
  sourceFile: string;
  line?: number;
}

export interface AngularInterceptor {
  name: string;
  type: 'class-based' | 'functional';
  sourceFile: string;
  line?: number;
}

export interface AngularTestSetup {
  usesHttpClientTestingModule: boolean;
  httpMockExpectations: string[];
  sourceFile: string;
}

/**
 * Detect Angular HttpClient API calls from source text.
 */
export function detectAngularHttpCalls(sourceText: string, filePath: string): AngularHttpCall[] {
  const calls: AngularHttpCall[] = [];
  const lines = sourceText.split('\n');

  // this.http.METHOD<Type>('url') or this.httpClient.METHOD('url')
  const httpCallPattern = /this\.(?:http|httpClient)\.(get|post|put|patch|delete|head|options)(?:<[^>]+>)?\s*\(\s*[`'"]([^`'"]+)[`'"]/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(httpCallPattern);
    if (match) {
      const usesEnvironmentUrl = match[2].includes('environment') || match[2].includes('${');
      calls.push({
        method: match[1].toUpperCase(),
        urlPattern: match[2],
        usesEnvironmentUrl,
        sourceFile: filePath,
        line: i + 1,
      });
    }
  }

  // Also detect template literal calls: this.http.get(`${this.apiUrl}/articles`)
  const templatePattern = /this\.(?:http|httpClient)\.(get|post|put|patch|delete)(?:<[^>]+>)?\s*\(\s*`([^`]+)`/g;
  let tmatch;
  while ((tmatch = templatePattern.exec(sourceText)) !== null) {
    const url = tmatch[2];
    // Avoid duplicates
    if (!calls.some((c) => c.urlPattern === url)) {
      const lineNum = sourceText.substring(0, tmatch.index).split('\n').length;
      calls.push({
        method: tmatch[1].toUpperCase(),
        urlPattern: url,
        usesEnvironmentUrl: url.includes('environment') || url.includes('${'),
        sourceFile: filePath,
        line: lineNum,
      });
    }
  }

  return calls;
}

/**
 * Detect Angular constructor injections and inject() calls.
 */
export function detectAngularInjections(sourceText: string, filePath: string): AngularInjection[] {
  const injections: AngularInjection[] = [];
  const lines = sourceText.split('\n');

  let currentClass = '';
  let inConstructorParams = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track current class
    const classMatch = line.match(/class\s+(\w+)/);
    if (classMatch) currentClass = classMatch[1];

    // Track constructor parameter block boundaries
    if (/\bconstructor\s*\(/.test(line)) {
      inConstructorParams = true;
    }
    if (inConstructorParams && line.includes(')')) {
      // Process this line (it's still inside the constructor params), then close
      // We'll close after checking for injections below
    }

    // Constructor injection: constructor(private http: HttpClient)
    // Only match visibility-modified parameters when inside a constructor(...) block
    if (inConstructorParams) {
      const ctorParamPattern = /(?:private|protected|public|readonly)\s+(\w+)\s*:\s*(\w+)/g;
      let ctorMatch;
      while ((ctorMatch = ctorParamPattern.exec(line)) !== null) {
        if (currentClass) {
          injections.push({
            consumerClass: currentClass,
            serviceClass: ctorMatch[2],
            style: 'constructor',
            sourceFile: filePath,
            line: i + 1,
          });
        }
      }
    }

    // Close the constructor param block after processing (handles closing paren on same line)
    if (inConstructorParams && line.includes(')')) {
      inConstructorParams = false;
    }

    // Functional inject: inject(HttpClient)
    const injectMatch = line.match(/(\w+)\s*=\s*inject\s*\(\s*(\w+)\s*\)/);
    if (injectMatch && currentClass) {
      injections.push({
        consumerClass: currentClass,
        serviceClass: injectMatch[2],
        style: 'inject-fn',
        sourceFile: filePath,
        line: i + 1,
      });
    }
  }

  return injections;
}

/**
 * Detect Angular guards (functional and class-based).
 */
export function detectAngularGuards(sourceText: string, filePath: string): AngularGuard[] {
  const guards: AngularGuard[] = [];
  const lines = sourceText.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Functional guard: export const authGuard: CanActivateFn = ...
    const functionalMatch = line.match(/(?:export\s+)?(?:const|let)\s+(\w+)\s*:\s*(CanActivateFn|CanActivateChildFn|CanDeactivateFn|ResolveFn|CanMatchFn)/);
    if (functionalMatch) {
      const guardTypeMap: Record<string, AngularGuard['guardType']> = {
        CanActivateFn: 'CanActivate',
        CanActivateChildFn: 'CanActivateChild',
        CanDeactivateFn: 'CanDeactivate',
        ResolveFn: 'Resolve',
        CanMatchFn: 'CanMatch',
      };
      guards.push({
        name: functionalMatch[1],
        type: 'functional',
        guardType: guardTypeMap[functionalMatch[2]] ?? 'CanActivate',
        sourceFile: filePath,
        line: i + 1,
      });
      continue;
    }

    // Class-based guard: implements CanActivate
    const classMatch = line.match(/class\s+(\w+).*implements\s+(?:.*,\s*)?(CanActivate|CanActivateChild|CanDeactivate|Resolve|CanMatch)/);
    if (classMatch) {
      guards.push({
        name: classMatch[1],
        type: 'class-based',
        guardType: classMatch[2] as AngularGuard['guardType'],
        sourceFile: filePath,
        line: i + 1,
      });
    }
  }

  return guards;
}

/**
 * Detect Angular HTTP interceptors.
 */
export function detectAngularInterceptors(sourceText: string, filePath: string): AngularInterceptor[] {
  const interceptors: AngularInterceptor[] = [];
  const lines = sourceText.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Class-based: implements HttpInterceptor
    const classMatch = line.match(/class\s+(\w+).*implements\s+(?:.*,\s*)?HttpInterceptor/);
    if (classMatch) {
      interceptors.push({
        name: classMatch[1],
        type: 'class-based',
        sourceFile: filePath,
        line: i + 1,
      });
      continue;
    }

    // Functional: HttpInterceptorFn
    const fnMatch = line.match(/(?:export\s+)?(?:const|let)\s+(\w+)\s*:\s*HttpInterceptorFn/);
    if (fnMatch) {
      interceptors.push({
        name: fnMatch[1],
        type: 'functional',
        sourceFile: filePath,
        line: i + 1,
      });
    }
  }

  return interceptors;
}

/**
 * Detect Angular test setup patterns (HttpClientTestingModule, httpMock).
 */
export function detectAngularTestSetup(sourceText: string, filePath: string): AngularTestSetup {
  const usesHttpClientTestingModule =
    /HttpClientTestingModule|provideHttpClientTesting/.test(sourceText);

  const httpMockExpectations: string[] = [];
  const expectOnePattern = /httpMock\.expectOne\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
  let match;
  while ((match = expectOnePattern.exec(sourceText)) !== null) {
    httpMockExpectations.push(match[1]);
  }

  return { usesHttpClientTestingModule, httpMockExpectations, sourceFile: filePath };
}

/**
 * Check if source text contains Angular HttpClient usage.
 */
export function hasAngularHttpClient(sourceText: string): boolean {
  return /HttpClient|this\.http\.(get|post|put|patch|delete)/.test(sourceText);
}
