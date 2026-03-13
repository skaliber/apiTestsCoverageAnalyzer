import { HttpInterceptorFn } from '@angular/common/http';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = localStorage.getItem('jwtToken');
  if (token) {
    const authReq = req.clone({
      setHeaders: { Authorization: `Token ${token}` }
    });
    return next(authReq);
  }
  return next(req);
};
