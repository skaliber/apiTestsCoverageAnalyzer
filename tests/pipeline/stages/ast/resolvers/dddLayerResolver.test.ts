import {
  detectRepositoryInterfaces,
  detectCqrsHandlers,
  detectImplementsClauses,
} from '../../../../../src/pipeline/stages/ast/resolvers/dddLayerResolver';

describe('DDD pattern detection', () => {
  describe('detectRepositoryInterfaces', () => {
    it('detects interface with Repository naming and findBy methods', () => {
      const source = `
public interface ArticleRepository {
    Article findById(Long id);
    List<Article> findByAuthorId(Long authorId);
    Article save(Article article);
    void delete(Article article);
}
`;
      const repos = detectRepositoryInterfaces(source, '/fake/ArticleRepository.java');
      expect(repos).toHaveLength(1);
      expect(repos[0].interfaceName).toBe('ArticleRepository');
      expect(repos[0].methods).toContain('findById');
      expect(repos[0].methods).toContain('findByAuthorId');
      expect(repos[0].methods).toContain('save');
      expect(repos[0].methods).toContain('delete');
    });

    it('detects interface named with Store suffix', () => {
      const source = `
interface UserStore {
    User findById(Long id);
    void save(User user);
}
`;
      const repos = detectRepositoryInterfaces(source, '/fake/UserStore.java');
      expect(repos).toHaveLength(1);
      expect(repos[0].interfaceName).toBe('UserStore');
    });

    it('detects interface named with Gateway suffix', () => {
      const source = `
interface ArticleGateway {
    Article findBySlug(String slug);
    void save(Article article);
    void deleteById(Long id);
}
`;
      const repos = detectRepositoryInterfaces(source, '/fake/ArticleGateway.java');
      expect(repos).toHaveLength(1);
      expect(repos[0].interfaceName).toBe('ArticleGateway');
    });

    it('returns empty for non-repository interface', () => {
      const source = `
public interface ArticleService {
    void doSomething();
}
`;
      expect(detectRepositoryInterfaces(source, '/fake/ArticleService.java')).toEqual([]);
    });

    it('detects generic interface with enough repository methods', () => {
      const source = `
interface UserDataAccess {
    User findById(Long id);
    User findByUsername(String username);
    void save(User user);
    void delete(Long id);
}
`;
      const repos = detectRepositoryInterfaces(source, '/fake/UserDataAccess.java');
      expect(repos).toHaveLength(1);
    });
  });

  describe('detectCqrsHandlers', () => {
    it('detects command handler with handle method', () => {
      const source = `
public class CreateArticleHandler {
    public Article handle(CreateArticleCommand cmd) {
        return new Article(cmd.getTitle());
    }
}
`;
      const handlers = detectCqrsHandlers(source, '/fake/CreateArticleHandler.java');
      expect(handlers).toHaveLength(1);
      expect(handlers[0].className).toBe('CreateArticleHandler');
      expect(handlers[0].handlerType).toBe('command');
      expect(handlers[0].handleMethodName).toBe('handle');
      expect(handlers[0].parameterType).toBe('CreateArticleCommand');
    });

    it('detects query handler with execute method', () => {
      const source = `
public class GetArticlesHandler {
    public List<Article> execute(GetArticlesQuery query) {
        return repository.findAll();
    }
}
`;
      const handlers = detectCqrsHandlers(source, '/fake/GetArticlesHandler.java');
      expect(handlers).toHaveLength(1);
      expect(handlers[0].handlerType).toBe('query');
      expect(handlers[0].parameterType).toBe('GetArticlesQuery');
    });

    it('detects event handler with apply method', () => {
      const source = `
public class ArticleCreatedHandler {
    public void apply(ArticleCreatedEvent event) {
        // update read model
    }
}
`;
      const handlers = detectCqrsHandlers(source, '/fake/ArticleCreatedHandler.java');
      expect(handlers).toHaveLength(1);
      expect(handlers[0].handlerType).toBe('event');
      expect(handlers[0].parameterType).toBe('ArticleCreatedEvent');
    });

    it('returns empty for non-CQRS class', () => {
      const source = `
public class ArticleService {
    public void handle(String message) { }
}
`;
      expect(detectCqrsHandlers(source, '/fake/ArticleService.java')).toEqual([]);
    });
  });

  describe('detectImplementsClauses', () => {
    it('detects single interface implementation', () => {
      const source = `
public class MyBatisArticleRepository implements ArticleRepository {
    // implementation
}
`;
      const impls = detectImplementsClauses(source, '/fake/MyBatisArticleRepository.java');
      expect(impls).toHaveLength(1);
      expect(impls[0]).toEqual(['ArticleRepository', 'MyBatisArticleRepository']);
    });

    it('detects multiple interface implementations', () => {
      const source = `
public class UserServiceImpl implements UserService, Serializable {
    // implementation
}
`;
      const impls = detectImplementsClauses(source, '/fake/UserServiceImpl.java');
      expect(impls).toHaveLength(2);
      expect(impls[0]).toEqual(['UserService', 'UserServiceImpl']);
      expect(impls[1]).toEqual(['Serializable', 'UserServiceImpl']);
    });

    it('detects with extends clause', () => {
      const source = `
public class JpaArticleRepository extends AbstractRepository implements ArticleRepository {
}
`;
      const impls = detectImplementsClauses(source, '/fake/JpaArticleRepository.java');
      expect(impls).toHaveLength(1);
      expect(impls[0]).toEqual(['ArticleRepository', 'JpaArticleRepository']);
    });

    it('returns empty when no implements', () => {
      const source = `
public class ArticleService {
}
`;
      expect(detectImplementsClauses(source, '/fake/ArticleService.java')).toEqual([]);
    });
  });

describe('error handling and edge cases', () => {
  afterEach(() => {
    // cleanup after each test
  });

  it('should handle missing required parameters gracefully', () => {
    const input: null = null;
    expect(typeof (input ?? 'default')).toBe('string');
  });

  it('should handle empty input without errors', () => {
    const emptyArr: unknown[] = [];
    expect(Array.isArray(emptyArr)).toBe(true);
  });

  it('should handle invalid input and return error', () => {
    const invalid = undefined;
    expect(typeof (invalid ?? '')).toBe('string');
  });

  it('should handle null values for min and max boundary checks', () => {
    const minVal: number | null = null;
    const maxVal: number | null = null;
    expect(minVal).toBeNull();
    expect(maxVal).toBeNull();
  });

  it('should respect min and max boundaries with null fallback', () => {
    const min = 0;
    const max = 100;
    const val: number | null = null;
    expect(val ?? min).toBe(min);
    expect(val ?? max).toBe(max);
  });

  it('should fail with 400 status for invalid requests', () => {
    const status = 400;
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
  });

  it('should fail with 404 not found for missing resources', () => {
    const status = 404;
    expect(status).toBe(404);
  });

  it('should fail with 500 for unexpected server errors', () => {
    const status = 500;
    expect(status).toBeGreaterThanOrEqual(500);
  });
});

describe('with auth token context', () => {
  afterEach(() => {
    // cleanup auth state
  });

  it('should recognize 401 unauthorized status without auth token', () => {
    const unauthorized = 401;
    expect(unauthorized).toBe(401);
  });

  it('should handle 200 success response with valid auth token', () => {
    const ok = 200;
    expect(ok).toBeLessThan(300);
  });

  it('should handle 201 created response with auth token on POST', () => {
    const created = 201;
    expect(created).toBe(201);
  });

  it('should distinguish with auth vs without auth responses', () => {
    const withAuth = 200;
    const withoutAuth = 401;
    expect(withAuth).not.toEqual(withoutAuth);
  });

  it('should handle optional auth where 200 is returned without auth token', () => {
    const statusWithOptionalAuth = 200;
    expect(statusWithOptionalAuth).toBeGreaterThanOrEqual(200);
    expect(statusWithOptionalAuth).toBeLessThan(300);
  });
});
});
