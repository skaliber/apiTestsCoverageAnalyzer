import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ArticlesService } from '../app/services/articles.service';
import { environment } from '../environments/environment';

describe('ArticlesService', () => {
  let service: ArticlesService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [ArticlesService]
    });
    service = TestBed.inject(ArticlesService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should fetch articles', () => {
    service.getArticles().subscribe(data => {
      expect(data).toBeTruthy();
    });
    const req = httpMock.expectOne(`${environment.api_url}/articles`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('should create article', () => {
    service.createArticle({ title: 'Test', body: 'Body' }).subscribe();
    const req = httpMock.expectOne(`${environment.api_url}/articles`);
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('should get article by slug', () => {
    service.getArticle('test-slug').subscribe();
    const req = httpMock.expectOne(`${environment.api_url}/articles/test-slug`);
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('should update article', () => {
    service.updateArticle('test-slug', { title: 'Updated' }).subscribe();
    const req = httpMock.expectOne(`${environment.api_url}/articles/test-slug`);
    expect(req.request.method).toBe('PUT');
    req.flush({});
  });

  it('should delete article', () => {
    service.deleteArticle('test-slug').subscribe();
    const req = httpMock.expectOne(`${environment.api_url}/articles/test-slug`);
    expect(req.request.method).toBe('DELETE');
    req.flush({});
  });

  it('should favorite article', () => {
    service.favoriteArticle('test-slug').subscribe();
    const req = httpMock.expectOne(`${environment.api_url}/articles/test-slug/favorite`);
    expect(req.request.method).toBe('POST');
    req.flush({});
  });
});
