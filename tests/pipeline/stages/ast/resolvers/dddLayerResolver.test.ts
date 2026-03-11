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
});
