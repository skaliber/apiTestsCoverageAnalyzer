import {
  detectAngularHttpCalls,
  detectAngularInjections,
  detectAngularGuards,
  detectAngularInterceptors,
  detectAngularTestSetup,
  hasAngularHttpClient,
} from '../../../src/languages/javascript/angularDetector';

describe('detectAngularHttpCalls', () => {
  it('detects this.http.get() calls', () => {
    const source = `
@Injectable({ providedIn: 'root' })
export class ArticlesService {
  constructor(private http: HttpClient) {}

  getArticles() {
    return this.http.get<Article[]>('/api/articles');
  }
}
`;
    const calls = detectAngularHttpCalls(source, '/fake/articles.service.ts');
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('GET');
    expect(calls[0].urlPattern).toBe('/api/articles');
    expect(calls[0].usesEnvironmentUrl).toBe(false);
  });

  it('detects this.http.post() calls', () => {
    const source = `
createArticle(article: Article) {
  return this.http.post('/api/articles', article);
}
`;
    const calls = detectAngularHttpCalls(source, '/fake/service.ts');
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
  });

  it('detects environment URL usage', () => {
    const source = `
getArticles() {
  return this.http.get(\`\${environment.apiUrl}/articles\`);
}
`;
    const calls = detectAngularHttpCalls(source, '/fake/service.ts');
    expect(calls).toHaveLength(1);
    expect(calls[0].usesEnvironmentUrl).toBe(true);
  });

  it('detects httpClient alias', () => {
    const source = `
constructor(private httpClient: HttpClient) {}

getData() {
  return this.httpClient.get('/api/data');
}
`;
    const calls = detectAngularHttpCalls(source, '/fake/service.ts');
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('GET');
  });

  it('returns empty for non-HTTP code', () => {
    const source = `export class AppComponent { title = 'app'; }`;
    expect(detectAngularHttpCalls(source, '/fake/app.component.ts')).toEqual([]);
  });
});

describe('detectAngularInjections', () => {
  it('detects constructor injection', () => {
    const source = `
export class ArticlesComponent {
  constructor(private articlesService: ArticlesService) {}
}
`;
    const injections = detectAngularInjections(source, '/fake/articles.component.ts');
    expect(injections.some((i) => i.serviceClass === 'ArticlesService')).toBe(true);
    expect(injections[0].style).toBe('constructor');
  });

  it('detects inject() function style', () => {
    const source = `
export class ArticlesComponent {
  private articlesService = inject(ArticlesService);
}
`;
    const injections = detectAngularInjections(source, '/fake/articles.component.ts');
    expect(injections.some((i) => i.serviceClass === 'ArticlesService')).toBe(true);
    expect(injections.find((i) => i.serviceClass === 'ArticlesService')!.style).toBe('inject-fn');
  });

  it('detects HttpClient injection', () => {
    const source = `
export class DataService {
  constructor(private http: HttpClient) {}
}
`;
    const injections = detectAngularInjections(source, '/fake/data.service.ts');
    expect(injections.some((i) => i.serviceClass === 'HttpClient')).toBe(true);
  });
});

describe('detectAngularGuards', () => {
  it('detects functional CanActivateFn guard', () => {
    const source = `
export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  return authService.isLoggedIn();
};
`;
    const guards = detectAngularGuards(source, '/fake/auth.guard.ts');
    expect(guards).toHaveLength(1);
    expect(guards[0].name).toBe('authGuard');
    expect(guards[0].type).toBe('functional');
    expect(guards[0].guardType).toBe('CanActivate');
  });

  it('detects class-based CanActivate guard', () => {
    const source = `
export class AuthGuard implements CanActivate {
  canActivate(route: ActivatedRouteSnapshot): boolean {
    return this.authService.isLoggedIn();
  }
}
`;
    const guards = detectAngularGuards(source, '/fake/auth.guard.ts');
    expect(guards).toHaveLength(1);
    expect(guards[0].name).toBe('AuthGuard');
    expect(guards[0].type).toBe('class-based');
    expect(guards[0].guardType).toBe('CanActivate');
  });

  it('detects ResolveFn guard', () => {
    const source = `
export const articleResolver: ResolveFn<Article> = (route) => {
  return inject(ArticlesService).getArticle(route.params['slug']);
};
`;
    const guards = detectAngularGuards(source, '/fake/article.resolver.ts');
    expect(guards).toHaveLength(1);
    expect(guards[0].guardType).toBe('Resolve');
    expect(guards[0].type).toBe('functional');
  });

  it('returns empty for non-guard code', () => {
    const source = `export class AppComponent { }`;
    expect(detectAngularGuards(source, '/fake/app.component.ts')).toEqual([]);
  });
});

describe('detectAngularInterceptors', () => {
  it('detects class-based HttpInterceptor', () => {
    const source = `
export class AuthInterceptor implements HttpInterceptor {
  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return next.handle(req);
  }
}
`;
    const interceptors = detectAngularInterceptors(source, '/fake/auth.interceptor.ts');
    expect(interceptors).toHaveLength(1);
    expect(interceptors[0].name).toBe('AuthInterceptor');
    expect(interceptors[0].type).toBe('class-based');
  });

  it('detects functional HttpInterceptorFn', () => {
    const source = `
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthService).getToken();
  return next(req.clone({ setHeaders: { Authorization: token } }));
};
`;
    const interceptors = detectAngularInterceptors(source, '/fake/auth.interceptor.ts');
    expect(interceptors).toHaveLength(1);
    expect(interceptors[0].name).toBe('authInterceptor');
    expect(interceptors[0].type).toBe('functional');
  });
});

describe('detectAngularTestSetup', () => {
  it('detects HttpClientTestingModule usage', () => {
    const source = `
TestBed.configureTestingModule({
  imports: [HttpClientTestingModule],
  providers: [ArticlesService]
});
const httpMock = TestBed.inject(HttpTestingController);
`;
    const setup = detectAngularTestSetup(source, '/fake/articles.service.spec.ts');
    expect(setup.usesHttpClientTestingModule).toBe(true);
  });

  it('detects httpMock.expectOne assertions', () => {
    const source = `
service.getArticles().subscribe();
const req = httpMock.expectOne('/api/articles');
expect(req.request.method).toBe('GET');
req.flush([]);
httpMock.expectOne('/api/tags');
`;
    const setup = detectAngularTestSetup(source, '/fake/service.spec.ts');
    expect(setup.httpMockExpectations).toEqual(['/api/articles', '/api/tags']);
  });

  it('detects provideHttpClientTesting', () => {
    const source = `
TestBed.configureTestingModule({
  providers: [provideHttpClientTesting(), ArticlesService]
});
`;
    const setup = detectAngularTestSetup(source, '/fake/service.spec.ts');
    expect(setup.usesHttpClientTestingModule).toBe(true);
  });
});

describe('hasAngularHttpClient', () => {
  it('returns true for HttpClient import', () => {
    expect(hasAngularHttpClient('import { HttpClient } from "@angular/common/http"')).toBe(true);
  });

  it('returns true for this.http.get usage', () => {
    expect(hasAngularHttpClient('return this.http.get("/api/data")')).toBe(true);
  });

  it('returns false for plain component', () => {
    expect(hasAngularHttpClient('export class AppComponent { }')).toBe(false);
  });
});
