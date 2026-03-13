import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class UserService {
  constructor(private http: HttpClient) {}

  login(credentials: { email: string; password: string }): Observable<any> {
    return this.http.post(`${environment.api_url}/users/login`, { user: credentials });
  }

  register(user: { email: string; username: string; password: string }): Observable<any> {
    return this.http.post(`${environment.api_url}/users`, { user });
  }

  getCurrentUser(): Observable<any> {
    return this.http.get(`${environment.api_url}/user`);
  }

  updateUser(user: any): Observable<any> {
    return this.http.put(`${environment.api_url}/user`, { user });
  }
}
