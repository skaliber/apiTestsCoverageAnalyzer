import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ProfileService {
  constructor(private http: HttpClient) {}

  getProfile(username: string): Observable<any> {
    return this.http.get(`${environment.api_url}/profiles/${username}`);
  }

  followUser(username: string): Observable<any> {
    return this.http.post(`${environment.api_url}/profiles/${username}/follow`, {});
  }

  unfollowUser(username: string): Observable<any> {
    return this.http.delete(`${environment.api_url}/profiles/${username}/follow`);
  }
}
