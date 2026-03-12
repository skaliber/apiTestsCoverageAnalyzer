import {
  composeUrl,
  normalizePath,
  normalizePathParams,
  composeFrameworkUrl,
} from '../../../../src/pipeline/stages/ast/baseUrlComposer';

describe('composeUrl', () => {
  it('joins path segments with slashes', () => {
    expect(composeUrl('/api', 'articles')).toBe('/api/articles');
  });

  it('handles leading and trailing slashes', () => {
    expect(composeUrl('/api/', '/articles/')).toBe('/api/articles');
  });

  it('handles empty segments', () => {
    expect(composeUrl('', '/api', '', 'articles')).toBe('/api/articles');
  });

  it('handles undefined segments', () => {
    expect(composeUrl(undefined, '/api', undefined, 'articles')).toBe('/api/articles');
  });

  it('returns / for no valid segments', () => {
    expect(composeUrl('', undefined)).toBe('/');
  });

  it('removes double slashes', () => {
    expect(composeUrl('/api/', '/articles')).toBe('/api/articles');
  });

  it('handles single segment', () => {
    expect(composeUrl('/articles')).toBe('/articles');
  });
});

describe('normalizePath', () => {
  it('ensures leading slash', () => {
    expect(normalizePath('api/articles')).toBe('/api/articles');
  });

  it('removes double slashes', () => {
    expect(normalizePath('//api//articles')).toBe('/api/articles');
  });

  it('removes trailing slash', () => {
    expect(normalizePath('/api/articles/')).toBe('/api/articles');
  });

  it('preserves root path', () => {
    expect(normalizePath('/')).toBe('/');
  });

  it('handles empty string', () => {
    expect(normalizePath('')).toBe('/');
  });
});

describe('normalizePathParams', () => {
  it('converts Flask <param> to {param}', () => {
    expect(normalizePathParams('/articles/<slug>')).toBe('/articles/{slug}');
  });

  it('converts Flask <type:param> to {param}', () => {
    expect(normalizePathParams('/users/<int:user_id>')).toBe('/users/{user_id}');
  });

  it('converts Express :param to {param}', () => {
    expect(normalizePathParams('/articles/:slug')).toBe('/articles/{slug}');
  });

  it('preserves already-correct {param} syntax', () => {
    expect(normalizePathParams('/articles/{slug}')).toBe('/articles/{slug}');
  });

  it('handles multiple parameters', () => {
    expect(normalizePathParams('/users/<int:id>/posts/<post_id>')).toBe('/users/{id}/posts/{post_id}');
  });
});

describe('composeFrameworkUrl', () => {
  it('composes Flask URL with mount prefix and route', () => {
    const url = composeFrameworkUrl('flask', {
      mountPrefix: '/api',
      routePath: '/articles/<slug>',
    });
    expect(url).toBe('/api/articles/{slug}');
  });

  it('composes Spring URL with class prefix and method path', () => {
    const url = composeFrameworkUrl('spring', {
      classPrefix: '/articles',
      routePath: '/{slug}',
    });
    expect(url).toBe('/articles/{slug}');
  });

  it('composes Express URL with multiple segments', () => {
    const url = composeFrameworkUrl('express', {
      mountPrefix: '/api',
      routePath: '/articles/:slug',
    });
    expect(url).toBe('/api/articles/{slug}');
  });

  it('composes URL with base URL', () => {
    const url = composeFrameworkUrl('vue', {
      baseUrl: 'https://api.example.com',
      routePath: '/articles',
    });
    expect(url).toBe('https://api.example.com/articles');
  });

  it('handles route path only', () => {
    const url = composeFrameworkUrl('hapi', {
      routePath: '/api/articles/{slug}',
    });
    expect(url).toBe('/api/articles/{slug}');
  });
});
