import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ArticlesService {
  constructor(private http: HttpClient) {}

  getArticles(params?: { tag?: string; author?: string; limit?: number; offset?: number }): Observable<any> {
    let httpParams = new HttpParams();
    if (params?.tag) httpParams = httpParams.set('tag', params.tag);
    if (params?.author) httpParams = httpParams.set('author', params.author);
    return this.http.get(`${environment.api_url}/articles`, { params: httpParams });
  }

  getArticle(slug: string): Observable<any> {
    return this.http.get(`${environment.api_url}/articles/${slug}`);
  }

  createArticle(article: any): Observable<any> {
    return this.http.post(`${environment.api_url}/articles`, { article });
  }

  updateArticle(slug: string, article: any): Observable<any> {
    return this.http.put(`${environment.api_url}/articles/${slug}`, { article });
  }

  deleteArticle(slug: string): Observable<any> {
    return this.http.delete(`${environment.api_url}/articles/${slug}`);
  }

  favoriteArticle(slug: string): Observable<any> {
    return this.http.post(`${environment.api_url}/articles/${slug}/favorite`, {});
  }

  unfavoriteArticle(slug: string): Observable<any> {
    return this.http.delete(`${environment.api_url}/articles/${slug}/favorite`);
  }

  getComments(slug: string): Observable<any> {
    return this.http.get(`${environment.api_url}/articles/${slug}/comments`);
  }

  addComment(slug: string, body: string): Observable<any> {
    return this.http.post(`${environment.api_url}/articles/${slug}/comments`, { comment: { body } });
  }
}
