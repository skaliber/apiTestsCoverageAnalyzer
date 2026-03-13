import {
  detectFactoryBoyFactories,
  detectWebtestCalls,
  webtestCallsToHttpCalls,
  detectPytestFixtures,
  hasWebtestTestApp,
  hasRealDbFixtures,
  usesFactoryBoy,
} from '../../../src/languages/python/testPatternDetector';

// ─── Factory Boy Detection ──────────────────────────────────────────────────

describe('detectFactoryBoyFactories', () => {
  it('detects a simple Factory Boy factory with Meta.model', () => {
    const source = `
import factory

class ArticleFactory(factory.Factory):
    class Meta:
        model = Article
    title = factory.Faker('sentence')
    body = factory.Faker('paragraph')
`;
    const factories = detectFactoryBoyFactories(source, '/fake/factories.py');
    expect(factories).toHaveLength(1);
    expect(factories[0].className).toBe('ArticleFactory');
    expect(factories[0].modelName).toBe('Article');
    expect(factories[0].subFactories).toEqual([]);
    expect(factories[0].sourceFile).toBe('/fake/factories.py');
  });

  it('detects SubFactory references', () => {
    const source = `
class ArticleFactory(factory.Factory):
    class Meta:
        model = Article
    author = factory.SubFactory(UserFactory)
    category = factory.SubFactory('CategoryFactory')
`;
    const factories = detectFactoryBoyFactories(source, '/fake/factories.py');
    expect(factories).toHaveLength(1);
    expect(factories[0].subFactories).toEqual(['UserFactory', 'CategoryFactory']);
  });

  it('detects RelatedFactoryList references', () => {
    const source = `
class UserFactory(factory.Factory):
    class Meta:
        model = User
    articles = factory.RelatedFactoryList(ArticleFactory, size=3)
`;
    const factories = detectFactoryBoyFactories(source, '/fake/factories.py');
    expect(factories).toHaveLength(1);
    expect(factories[0].relatedFactoryLists).toEqual(['ArticleFactory']);
  });

  it('detects DjangoModelFactory subclass', () => {
    const source = `
class UserFactory(factory.DjangoModelFactory):
    class Meta:
        model = User
    username = factory.Faker('user_name')
`;
    const factories = detectFactoryBoyFactories(source, '/fake/factories.py');
    expect(factories).toHaveLength(1);
    expect(factories[0].className).toBe('UserFactory');
    expect(factories[0].modelName).toBe('User');
  });

  it('detects multiple factories in one file', () => {
    const source = `
class UserFactory(factory.Factory):
    class Meta:
        model = User

class ArticleFactory(factory.Factory):
    class Meta:
        model = Article
    author = factory.SubFactory(UserFactory)
`;
    const factories = detectFactoryBoyFactories(source, '/fake/factories.py');
    expect(factories).toHaveLength(2);
    expect(factories[0].className).toBe('UserFactory');
    expect(factories[1].className).toBe('ArticleFactory');
  });

  it('returns empty array when no factories found', () => {
    const source = `
class Article:
    def __init__(self):
        pass
`;
    expect(detectFactoryBoyFactories(source, '/fake/models.py')).toEqual([]);
  });
});

// ─── webtest API Call Detection ─────────────────────────────────────────────

describe('detectWebtestCalls', () => {
  it('detects simple testapp.get calls', () => {
    const source = `
response = testapp.get('/api/articles')
`;
    const calls = detectWebtestCalls(source, '/fake/test.py');
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('GET');
    expect(calls[0].path).toBe('/api/articles');
  });

  it('detects post_json calls', () => {
    const source = `
response = testapp.post_json('/api/articles', {'title': 'Hello'})
`;
    const calls = detectWebtestCalls(source, '/fake/test.py');
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].path).toBe('/api/articles');
  });

  it('detects put_json and delete calls', () => {
    const source = `
testapp.put_json('/api/articles/1', {'title': 'Updated'})
testapp.delete('/api/articles/1')
`;
    const calls = detectWebtestCalls(source, '/fake/test.py');
    expect(calls).toHaveLength(2);
    expect(calls[0].method).toBe('PUT');
    expect(calls[1].method).toBe('DELETE');
  });

  it('detects calls with various variable names', () => {
    const source = `
app.get('/api/articles')
client.post_json('/api/articles', {})
`;
    const calls = detectWebtestCalls(source, '/fake/test.py');
    expect(calls).toHaveLength(2);
    expect(calls[0].method).toBe('GET');
    expect(calls[1].method).toBe('POST');
  });

  it('returns empty array for non-webtest code', () => {
    const source = `
x = 1 + 2
print("hello")
`;
    expect(detectWebtestCalls(source, '/fake/test.py')).toEqual([]);
  });
});

describe('webtestCallsToHttpCalls', () => {
  it('converts webtest calls to SemanticHttpCall objects', () => {
    const calls = [
      { method: 'GET', path: '/api/articles', sourceFile: '/fake/test.py', line: 5 },
      { method: 'POST', path: '/api/articles', sourceFile: '/fake/test.py', line: 10 },
    ];
    const httpCalls = webtestCallsToHttpCalls(calls);
    expect(httpCalls).toHaveLength(2);
    expect(httpCalls[0].method).toBe('GET');
    expect(httpCalls[0].rawPathArg).toBe('/api/articles');
    expect(httpCalls[0].resolutionType).toBe('direct');
    expect(httpCalls[0].confidence).toBe('high');
    expect(httpCalls[1].method).toBe('POST');
  });
});

// ─── pytest Fixture Detection ───────────────────────────────────────────────

describe('detectPytestFixtures', () => {
  it('detects a simple @pytest.fixture', () => {
    const source = `
@pytest.fixture
def app():
    return create_app()
`;
    const fixtures = detectPytestFixtures(source, '/fake/conftest.py');
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0].name).toBe('app');
    expect(fixtures[0].scope).toBe('function');
    expect(fixtures[0].dependencies).toEqual([]);
  });

  it('detects fixture with scope', () => {
    const source = `
@pytest.fixture(scope='session')
def db(app):
    return setup_db(app)
`;
    const fixtures = detectPytestFixtures(source, '/fake/conftest.py');
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0].name).toBe('db');
    expect(fixtures[0].scope).toBe('session');
    expect(fixtures[0].dependencies).toEqual(['app']);
  });

  it('detects fixture dependencies (parameters)', () => {
    const source = `
@pytest.fixture
def testapp(app, db):
    return TestApp(app)
`;
    const fixtures = detectPytestFixtures(source, '/fake/conftest.py');
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0].name).toBe('testapp');
    expect(fixtures[0].dependencies).toEqual(['app', 'db']);
  });

  it('ignores "request" parameter as dependency', () => {
    const source = `
@pytest.fixture
def user(request, db):
    return create_user(db)
`;
    const fixtures = detectPytestFixtures(source, '/fake/conftest.py');
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0].dependencies).toEqual(['db']);
  });

  it('detects multiple fixtures', () => {
    const source = `
@pytest.fixture(scope='session')
def app():
    return create_app()

@pytest.fixture
def db(app):
    return init_db(app)

@pytest.fixture
def testapp(app):
    return TestApp(app)
`;
    const fixtures = detectPytestFixtures(source, '/fake/conftest.py');
    expect(fixtures).toHaveLength(3);
    expect(fixtures.map((f) => f.name)).toEqual(['app', 'db', 'testapp']);
  });
});

// ─── Utility Functions ──────────────────────────────────────────────────────

describe('hasWebtestTestApp', () => {
  it('returns true when TestApp is present', () => {
    expect(hasWebtestTestApp('testapp = TestApp(app)')).toBe(true);
  });

  it('returns false when TestApp is absent', () => {
    expect(hasWebtestTestApp('import pytest\ndef test_foo(): pass')).toBe(false);
  });
});

describe('hasRealDbFixtures', () => {
  it('returns true when db fixture parameter is present', () => {
    expect(hasRealDbFixtures('def test_create(db):\n    pass')).toBe(true);
  });

  it('returns true when db_session fixture parameter is present', () => {
    expect(hasRealDbFixtures('def test_create(db_session):\n    pass')).toBe(true);
  });

  it('returns true when create_engine is present', () => {
    expect(hasRealDbFixtures('engine = create_engine("sqlite://")')).toBe(true);
  });

  it('returns false for mock-only code', () => {
    expect(hasRealDbFixtures('mock.patch("db")\ndef test_foo(): pass')).toBe(false);
  });
});

describe('usesFactoryBoy', () => {
  it('returns true for factory import', () => {
    expect(usesFactoryBoy('import factory')).toBe(true);
  });

  it('returns true for from factory import', () => {
    expect(usesFactoryBoy('from factory import Factory')).toBe(true);
  });

  it('returns true for factory.Factory usage', () => {
    expect(usesFactoryBoy('class UserFactory(factory.Factory):')).toBe(true);
  });

  it('returns false for unrelated code', () => {
    expect(usesFactoryBoy('def test_foo(): pass')).toBe(false);
  });
});
