# Feature 27 — Universal Project Structure Agnostic Pattern Recognition
## Scanner Must Detect Coverage Regardless of How a Project is Organized

**Version:** 1.0  
**Status:** Authoritative  
**Companion to:** Feature 24 Master Document  
**Reference Codebases:** gothinkster/realworld ecosystem (Angular, React, Node/Express, Spring Boot DDD/CQRS, Flask Blueprints, NestJS, Vue, Slim PHP, HapiJS)

> The core defect this feature fixes: the scanner currently fails whenever a project does not match the structural assumptions baked into the AST stage. Flask endpoints are missed because Blueprints are registered separately from where routes are defined. Spring endpoints are missed because DDD layers mean the controller is an adapter, not the source of truth. Angular API calls are missed because HttpClient calls live inside `@Injectable` services injected via constructor, not in component files. This feature eliminates all structural assumptions. The scanner must discover patterns, not assume folder names.

---

## Table of Contents

1. [Root Problem: Structure Assumptions Are Defects](#1-root-problem-structure-assumptions-are-defects)
2. [Universal Discovery Strategy](#2-universal-discovery-strategy)
3. [Python — Flask Blueprint + flask-apispec + JWT Patterns](#3-python--flask-blueprint--flask-apispec--jwt-patterns)
4. [Python — Factory Boy + webtest + pytest Chains](#4-python--factory-boy--webtest--pytest-chains)
5. [Java/Kotlin — DDD / CQRS / Hexagonal Architecture Patterns](#5-javakotlin--ddd--cqrs--hexagonal-architecture-patterns)
6. [Java — MyBatis XML Mapper Patterns](#6-java--mybatis-xml-mapper-patterns)
7. [Java — GraphQL + DGS Framework Patterns](#7-java--graphql--dgs-framework-patterns)
8. [Node.js — Express Middleware-as-Auth Patterns](#8-nodejs--express-middleware-as-auth-patterns)
9. [Node.js — Mongoose Model + Validation Patterns](#9-nodejs--mongoose-model--validation-patterns)
10. [Angular — HttpClient Service Injection Patterns](#10-angular--httpclient-service-injection-patterns)
11. [Angular — Route Guards, Resolvers, Interceptors](#11-angular--route-guards-resolvers-interceptors)
12. [Angular — TestBed + HttpClientTestingModule Patterns](#12-angular--testbed--httpclienttestingmodule-patterns)
13. [Angular — Signal-based and inject() Patterns](#13-angular--signal-based-and-inject-patterns)
14. [Vue — Vuex + axios Service Patterns](#14-vue--vuex--axios-service-patterns)
15. [PHP — Slim Framework + Eloquent + JWT Patterns](#15-php--slim-framework--eloquent--jwt-patterns)
16. [HapiJS — Route + Joi Validation + Boom Error Patterns](#16-hapijs--route--joi-validation--boom-error-patterns)
17. [Cross-Project: Optional Auth Patterns](#17-cross-project-optional-auth-patterns)
18. [Cross-Project: API Base URL Resolution](#18-cross-project-api-base-url-resolution)
19. [Cross-Project: Error Middleware Patterns](#19-cross-project-error-middleware-patterns)
20. [Scanner Behavioral Rules — Structure Agnosticism](#20-scanner-behavioral-rules--structure-agnosticism)
21. [Example Project Registry](#21-example-project-registry)
22. [Acceptance Criteria](#22-acceptance-criteria)

---

## 1. Root Problem: Structure Assumptions Are Defects

The scanner today implicitly assumes:

- Routes are in files named `routes/`, `controllers/`, or `views/`
- Test files are co-located with source or in a sibling `test/` folder
- API calls are in component files (not service files injected into them)
- Auth is done via annotations on the route function itself
- Parameters are defined on the same line as the route decorator

Every one of these assumptions is violated by at least one gothinkster repo. Here is the evidence:

| Project | Violated Assumption | Effect |
|---|---|---|
| flask-realworld | Blueprint routes have `url_prefix` registered 3 files away from the `@blueprint.route()` call | Every URL is computed wrong — scanner sees `/articles` instead of `/api/articles` |
| flask-realworld | `@use_kwargs({...})` is the only place parameters are declared | Scanner sees zero parameters on every endpoint |
| flask-realworld | `@jwt_optional` is separate from `@jwt_required` | Scanner classifies optional-auth endpoints as fully public |
| spring-boot-realworld | DDD: controllers are in `application/` package, domain logic in `domain/`, persistence in `infrastructure/` | Scanner cannot link controller → service → repository because there are no `@Service`/`@Repository` annotations — only domain interfaces |
| spring-boot-realworld | MyBatis queries are in XML files (`mapper/*.xml`), not in Java annotations | Scanner sees zero DB queries |
| spring-boot-realworld | REST and GraphQL implemented simultaneously on the same domain | Scanner must not double-count coverage |
| node-express-realworld | Auth middleware is `router.use(auth.required)` applied to an entire router, not per-route | Scanner misses auth on all routes in that router |
| node-express-realworld | Error handling is a 4-argument Express middleware registered at the end of `routes/api/index.js` | Scanner misses the error handling branch entirely |
| angular-realworld | All HTTP calls are in `@Injectable` service classes, zero HTTP calls in components | Scanner sees no API calls in `.component.ts` files and reports zero coverage |
| angular-realworld | `canActivate` guards are functional (`CanActivateFn`) since Angular 14, not class-based | Scanner only detects class-based guards |
| vue-realworld | Vuex actions make API calls via an `ApiService` singleton | Scanner cannot link component dispatch → action → HTTP call |

**Non-negotiable rule:** the scanner must not have structural assumptions. It must prove from code that a file is a route, a test, or a service — not infer it from its folder name or decorator.

---

## 2. Universal Discovery Strategy

### 2.1 File-First, Structure-Agnostic Discovery

The scanner must treat every source file as a potential host for any node type. The discovery algorithm is:

```
FOR every file in the repository:
  1. Parse the file using the appropriate language parser (detected from extension)
  2. Run ALL pattern detectors against the parsed AST regardless of file path
  3. Assign detected nodes to the file
  4. Do NOT filter or skip pattern detection based on directory name
```

**What this means in practice:**

- A route defined in `conduit/articles/views.py` is detected the same way as one in `routes/articles.js`
- An HTTP call inside `src/app/core/services/articles.service.ts` is detected the same way as one in `components/ArticleList.tsx`
- A Vuex action containing `axios.get('/api/articles')` is detected the same way as a `fetch()` in a component

### 2.2 Cross-File Resolution Pass

After all files are individually parsed, the scanner runs a **cross-file resolution pass** that stitches together nodes split across files:

```
RESOLUTION TARGETS (must all be resolved in this pass):
  - Blueprint url_prefix: route node + registration node → full URL
  - Express router.use(prefix, router): sub-router routes + prefix → full URL
  - Angular @Injectable service: HTTP call node + component inject() → api-call linked to component
  - Vuex action: HTTP call node + store.dispatch() in component → api-call linked to component
  - DDD domain interface: controller command → domain service → infrastructure repository
  - MyBatis mapper XML: @Mapper interface method → XML query body → repository node
  - GraphQL schema file: .graphqls definitions → resolver methods → endpoint nodes
```

This pass is non-optional. A scanner that does not run cross-file resolution will systematically produce incorrect URL nodes and missing links.

### 2.3 Unresolved Node Policy

If cross-file resolution cannot complete a link (e.g., the registration file is outside the scan root):

- The partial node must still be created
- It must be flagged: `resolution: cross-file-unresolved`
- The diagnostic must name the missing file and the missing value
- The node must not be silently discarded
- Confidence on this node is capped at `low`

---

## 3. Python — Flask Blueprint + flask-apispec + JWT Patterns

### 3.1 Blueprint Route → Full URL Resolution

**The problem in flask-realworld:**

```python
# conduit/articles/views.py
blueprint = Blueprint('articles', __name__)

@blueprint.route('/api/articles', methods=('GET',))   # URL looks complete but may not be
def get_articles(): ...

# conduit/app.py — separate file
def register_blueprints(app):
    app.register_blueprint(articles_blueprint)           # no prefix here, so URL is as-is
    # BUT: if this were:
    app.register_blueprint(articles_blueprint, url_prefix='/v2')  # URL becomes /v2/api/articles
```

**Required detection algorithm:**

```
STEP 1: Find all Blueprint() constructor calls → create blueprint-registry entry
        { name: 'articles', varName: 'blueprint', file: 'conduit/articles/views.py' }

STEP 2: Find all @blueprint.route() decorators in every file
        { path: '/api/articles', methods: ['GET'], blueprintVarName: 'blueprint', file: ... }

STEP 3: Find all app.register_blueprint() calls in every file
        { blueprintImportName: 'articles_blueprint', urlPrefix: None }

STEP 4: Match blueprint var across files via import resolution:
        views.py exports blueprint → app.py imports as articles_blueprint

STEP 5: Compose final URL:
        urlPrefix (if any) + route path = final URL
        None + '/api/articles' = '/api/articles'
        '/v2' + '/api/articles' = '/v2/api/articles'

STEP 6: Create endpoint node with resolved full URL
        NEVER create an endpoint node before Step 5 is complete
```

### 3.2 @use_kwargs Parameter Extraction

```python
# All of these forms must produce parameter nodes:

# Dict of field objects
@use_kwargs({'tag': fields.Str(), 'author': fields.Str(), 'limit': fields.Int(load_default=20)})

# Required fields
@use_kwargs({'email': fields.Email(required=True), 'password': fields.Str(required=True)})

# Explicit location
@use_kwargs({'token': fields.Str()}, location='headers')
@use_kwargs({'q': fields.Str()}, location='query')
@use_kwargs({'data': UserSchema()}, location='json')     # schema instance as body

# Marshmallow schema class passed directly
@use_kwargs(UserSchema)                                  # must follow UserSchema definition
@use_kwargs(ArticleSchema(only=('title', 'body')))       # partial schema

# Location inference rule (non-negotiable):
# GET, HEAD, DELETE, OPTIONS → default location = 'query'
# POST, PUT, PATCH → default location = 'json' (body)
# Must be overridden by explicit location= kwarg
```

### 3.3 @marshal_with Response Schema

```python
@marshal_with(article_schema)              # produces response-schema node, status=200
@marshal_with(articles_schema)
@marshal_with(article_schema, code=201)   # status=201
@marshal_with(None, code=204)             # empty body response
@marshal_with(error_schema, code=422)     # error response schema
```

### 3.4 @jwt_required vs @jwt_optional

```python
# Hard auth — unauthorized request returns 401
@jwt_required                              # flask-jwt-extended v3 bare decorator
@jwt_required()                            # flask-jwt-extended v4+ called decorator

# Optional auth — request proceeds with or without JWT
# current_user is None if no JWT provided
@jwt_optional                              # v3
@jwt_required(optional=True)              # v4+

# Fresh token required
@jwt_required(fresh=True)                 # requires non-refresh token

# Refresh token endpoint
@jwt_required(refresh=True)              # only valid for refresh tokens

# Scanner must create separate security nodes:
# @jwt_required → security: { type: 'jwt', required: true, optional: false }
# @jwt_optional → security: { type: 'jwt', required: false, optional: true }
# NEVER classify @jwt_optional as unsecured — it is auth-aware
```

### 3.5 Decorator Stack Association

In flask-apispec, decorators are stacked. The scanner must associate ALL decorators in a stack to the same endpoint:

```python
@blueprint.route('/api/articles/<slug>/favorite', methods=('POST', 'DELETE'))
@jwt_required                    # security node
@use_kwargs({'slug': fields.Str()})  # parameter node
@marshal_with(article_schema)    # response node
def favorite_article(slug, **kwargs):
    ...
```

**Non-negotiable:** all four decorators belong to `favorite_article`. The scanner must group decorators by the function they decorate, not by proximity in the file.

---

## 4. Python — Factory Boy + webtest + pytest Chains

### 4.1 Factory Boy — Test Data Factories

```python
# factories.py
import factory
from conduit.models import User, Article, Tag

class UserFactory(factory.Factory):
    class Meta:
        model = User
    username = factory.Sequence(lambda n: f'user{n}')
    email = factory.LazyAttribute(lambda o: f'{o.username}@example.com')
    password = 'password'

class ArticleFactory(factory.Factory):
    class Meta:
        model = Article
    title = factory.Faker('sentence')
    slug = factory.LazyAttribute(lambda o: o.title.lower().replace(' ', '-'))
    author = factory.SubFactory(UserFactory)       # [HIDDEN] nested factory
    tags = factory.RelatedFactoryList(TagFactory)  # [HIDDEN] related factory list
```

**Scanner must:**
- Detect `factory.Factory` subclasses as test-factory nodes
- Extract `model =` from `Meta` class as the linked production model
- Detect `SubFactory` and `RelatedFactoryList` as factory-composition edges
- When a test calls `UserFactory()` or `UserFactory.create()`, create a test-setup node linked to the `User` model — this constitutes DB-layer test evidence

### 4.2 webtest Assertion Patterns

```python
from webtest import TestApp

# Setup (usually in conftest.py)
testapp = TestApp(app)

# HTTP calls — all must produce api-call nodes + assertion nodes
res = testapp.get('/api/articles')
res = testapp.post_json('/api/users', {'user': {'email': 'a@b.com', 'password': 'pw'}})
res = testapp.put_json('/api/user', {'user': {'bio': 'new bio'}}, headers={'Authorization': f'Token {token}'})
res = testapp.delete('/api/articles/slug')

# Assertions on webtest responses — all must produce assertion nodes
assert res.status_code == 200
assert res.json['user']['email'] == 'a@b.com'
res.mustcontain('slug')                            # [HIDDEN] webtest-specific assertion
assert res.json['article']['favorited'] == True
assert 'errors' in res.json
```

**Scanner must detect:** `testapp.get`, `testapp.post_json`, `testapp.put_json`, `testapp.delete`, `testapp.patch_json` as api-call nodes. Each call must extract the URL and HTTP method.

### 4.3 pytest Fixture Chains

In flask-realworld, fixtures are chained: `user` depends on `db` which depends on `app`. The scanner must resolve the full chain.

```python
# conftest.py
@pytest.fixture
def app():
    _app = create_app(TestConfig)
    ctx = _app.test_request_context()
    ctx.push()
    yield _app
    ctx.pop()

@pytest.fixture
def db(app):                           # depends on app
    _db.app = app
    _db.create_all()
    yield _db
    _db.drop_all()

@pytest.fixture
def user(db):                          # depends on db
    user = UserFactory()
    db.session.add(user)
    db.session.commit()
    return user

@pytest.fixture
def testapp(app):                      # depends on app
    return TestApp(app)
```

**Resolution algorithm:**

```
STEP 1: Build fixture dependency graph for every conftest.py in the repo
STEP 2: For each test function, collect all fixtures it uses (direct + transitive)
STEP 3: When a test uses 'testapp', resolve: testapp → app → create_app(TestConfig)
STEP 4: When a test uses 'user', resolve: user → db → app → real DB is in scope
STEP 5: Mark test coverage as: db-interaction-confirmed = true (not mock-covered)
```

**Non-negotiable:** a test that receives a real `db` fixture is an integration test with real DB access. It must NOT be classified as `mock-covered` regardless of what other mocks exist in the test.

---

## 5. Java/Kotlin — DDD / CQRS / Hexagonal Architecture Patterns

### 5.1 The DDD Layer Problem

In spring-boot-realworld, the package structure is:

```
io.spring/
├── application/          ← controllers (REST/GraphQL adapters)
│   ├── article/
│   │   └── ArticleQueryService.java    ← CQRS read side
│   │   └── ArticleCommandService.java  ← CQRS write side
├── domain/               ← pure domain, no framework annotations
│   ├── article/
│   │   └── ArticleRepository.java      ← domain interface, NOT @Repository
│   │   └── Article.java                ← domain entity, NOT @Entity
├── infrastructure/       ← framework-specific implementations
│   ├── mybatis/
│   │   └── mapper/UserMapper.java       ← @Mapper interface
│   └── repository/
│       └── MyBatisArticleRepository.java ← implements ArticleRepository
```

**The scanner must NOT require `@Service`, `@Repository`, `@Component` to detect layers.**

Instead, the scanner must use structural inference:

```
INFERENCE RULES:
  - A class that extends/implements an interface named *Repository → is a repository
  - A class in a package named 'application', 'command', 'query', 'usecase' → is a service layer
  - A class in a package named 'infrastructure', 'persistence', 'adapter' → is infra layer
  - A class in a package named 'domain' → is domain layer
  - A class that has methods named execute(), handle(), apply() taking a *Command/*Query → is a CQRS handler
  - An interface with methods like findBy*(), save(), delete() → is a repository interface
```

### 5.2 CQRS Command/Query Handler Patterns

```java
// Command handler pattern
public class CreateArticleCommandExecutor {
    public ArticleData execute(CreateArticleCommand command) { ... }
}

// Query service pattern
public class ArticleQueryService {
    public ArticleData findBySlug(String slug, String currentUser) { ... }
    public ArticleDataList findByFilter(ArticleFilter filter) { ... }
}

// Application service wrapping commands
@RestController
public class ArticlesApi {
    @PostMapping("/api/articles")
    public ArticleResponse createArticle(@RequestBody ArticleParam param) {
        return articleCommandService.createArticle(param.getArticle(), currentUser);
    }
}
```

**Scanner must:** detect `createArticle(param.getArticle(), currentUser)` as a `service-invoked` edge from the controller, even though the service class has no `@Service` annotation.

### 5.3 Domain Repository Interface → Infrastructure Mapping

```java
// domain/article/ArticleRepository.java — interface, no annotations
public interface ArticleRepository {
    Optional<Article> findBySlug(String slug);
    Article save(Article article);
}

// infrastructure/repository/MyBatisArticleRepository.java
public class MyBatisArticleRepository implements ArticleRepository {
    @Autowired ArticleMapper articleMapper;        // MyBatis mapper

    @Override
    public Optional<Article> findBySlug(String slug) {
        return Optional.ofNullable(articleMapper.findBySlug(slug));
    }
}
```

**Scanner must:**
1. Find `ArticleRepository` interface → create `repository-interface` node
2. Find `MyBatisArticleRepository implements ArticleRepository` → link as implementation
3. Find `articleMapper.findBySlug(slug)` → follow to `ArticleMapper` → find the MyBatis query
4. Create chain: `controller → domain service → domain repository interface → infrastructure impl → mybatis mapper → SQL query`

---

## 6. Java — MyBatis XML Mapper Patterns

MyBatis queries live in XML files. The scanner must parse these XML files as first-class nodes.

### 6.1 Mapper Interface + XML Binding

```java
// Java interface
@Mapper
public interface ArticleMapper {
    ArticleData findBySlug(@Param("slug") String slug);
    List<ArticleData> findByFilter(ArticleFilter filter);
    void insert(Article article);
    void update(Article article);
    void delete(@Param("slug") String slug);
}
```

```xml
<!-- resources/mapper/ArticleMapper.xml -->
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN"
    "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="io.spring.infrastructure.mybatis.mapper.ArticleMapper">

    <select id="findBySlug" resultType="ArticleData">
        SELECT a.*, u.username as authorName
        FROM articles a
        JOIN users u ON a.author_id = u.id
        WHERE a.slug = #{slug}
    </select>

    <insert id="insert">
        INSERT INTO articles (slug, title, description, body, author_id)
        VALUES (#{slug}, #{title}, #{description}, #{body}, #{authorId})
    </insert>

    <update id="update">
        UPDATE articles SET title=#{title}, body=#{body} WHERE slug=#{slug}
    </update>

    <delete id="delete">
        DELETE FROM articles WHERE slug=#{slug}
    </delete>

    <!-- ResultMap — must be detected as DB schema evidence -->
    <resultMap id="articleResultMap" type="ArticleData">
        <id property="id" column="id"/>
        <result property="slug" column="slug"/>
        <association property="author" javaType="ProfileData">  <!-- [HIDDEN] -->
            <result property="username" column="authorName"/>
        </association>
    </resultMap>

    <!-- Dynamic SQL — must be detected as conditional branch -->
    <if test="tag != null">
        AND t.name = #{tag}
    </if>
    <choose>
        <when test="favorited != null">...</when>
        <otherwise>...</otherwise>
    </choose>
</mapper>
```

**Scanner must:**
- Parse all `resources/mapper/*.xml` files as `mybatis-mapper` nodes
- Match XML `namespace` attribute to the Java `@Mapper` interface FQCN
- Match XML `id` attributes to Java interface method names
- Create `repository-query` nodes for every `<select>`, `<insert>`, `<update>`, `<delete>`
- Detect `<if>`, `<choose>/<when>/<otherwise>`, `<foreach>` as conditional branch nodes
- Create the chain: Java interface method → XML query → SQL operation

---

## 7. Java — GraphQL + DGS Framework Patterns

spring-boot-realworld implements both REST and GraphQL. The scanner must handle both without double-counting.

### 7.1 GraphQL Schema File

```graphql
# resources/schema/schema.graphqls
type Query {
    article(slug: String!): Article
    articles(tag: String, author: String, favorited: String, limit: Int, offset: Int): ArticleConnection
    feed(limit: Int, offset: Int): ArticleConnection
    tags: [String!]!
}

type Mutation {
    createArticle(input: CreateArticleInput!): Article
    updateArticle(slug: String!, input: UpdateArticleInput!): Article
    deleteArticle(slug: String!): Boolean
    favoriteArticle(slug: String!): Article
    unfavoriteArticle(slug: String!): Article
}
```

**Scanner must:** parse `.graphqls` and `.graphql` files as `graphql-schema` nodes. Each `Query` and `Mutation` field is an `endpoint` node with `protocol: graphql`.

### 7.2 DGS Data Fetcher Patterns

```java
// DGS framework — Netflix GraphQL server for Spring Boot
@DgsComponent
public class ArticleDataFetcher {

    @DgsQuery                                          // maps to Query.article
    public ArticleData article(@InputArgument String slug) { ... }

    @DgsQuery(field = "articles")                      // explicit field name
    public ArticleConnection articles(
        @InputArgument String tag,
        @InputArgument String author,
        @InputArgument Integer limit,
        @InputArgument Integer offset
    ) { ... }

    @DgsMutation
    public ArticleData createArticle(@InputArgument CreateArticleInput input) { ... }

    @DgsMutation(field = "deleteArticle")
    public Boolean delete(@InputArgument String slug) { ... }

    @DgsData(parentType = "Article", field = "author")  // [HIDDEN] type resolver
    public ProfileData author(DgsDataFetchingEnvironment env) { ... }
}
```

**Scanner must:**
- Detect `@DgsComponent` as the host for data fetchers
- Detect `@DgsQuery`, `@DgsMutation`, `@DgsData` as endpoint nodes
- Match to schema definitions by field name (method name or explicit `field =` attribute)
- Create edge: `graphql-schema.Query.article → DgsQuery.article`

### 7.3 REST + GraphQL Deduplication

When the same domain operation is exposed via both REST and GraphQL:

```
REST:    POST /api/articles → ArticleCommandService.createArticle()
GraphQL: Mutation.createArticle → ArticleCommandService.createArticle()
```

**Both are valid endpoint nodes. They must NOT be merged into one.** Create two endpoint nodes (`protocol: rest` and `protocol: graphql`), both linked to the same `ArticleCommandService.createArticle()` service node. The service node's coverage is counted once.

---

## 8. Node.js — Express Middleware-as-Auth Patterns

In node-express-realworld, auth is applied to entire routers, not individual routes:

```javascript
// routes/api/index.js
const router = require('express').Router()

// Auth middleware applied to entire router — not on individual routes
router.use('/articles', require('./articles'))
router.use('/profiles', auth.optional, require('./profiles'))   // [HIDDEN] per-router optional auth
router.use('/tags', require('./tags'))
router.use('/user', auth.required, require('./user'))           // all /user routes require auth

// routes/auth.js
const auth = {
  required: jwt({ secret, ... }),                               // express-jwt middleware
  optional: jwt({ secret, credentialsRequired: false, ... })   // optional auth
}
```

**Scanner must:**
- Detect `router.use(path, middleware, router)` and `router.use(path, router)` patterns
- When `auth.required` appears between path and router in `router.use()`, mark ALL routes in that sub-router as `security: { required: true }`
- When `auth.optional` appears, mark ALL routes as `security: { optional: true }`
- This must propagate down through nested routers: if a router has `auth.required`, every route it mounts inherits that auth
- The auth middleware source file must be followed: `require('./auth')` → parse `auth.js` → extract `required` and `optional` properties

### 8.1 4-Argument Error Middleware

```javascript
// In Express, a 4-argument function is an error handler
app.use(function(err, req, res, next) {                       // [HIDDEN] error handler
    if (err.name === 'ValidationError') {
        return res.status(422).json({ errors: err.errors })
    }
    return next(err)
})

// routes/api/index.js error handler
router.use(function(err, req, res, next) {
    if (err.name === 'UnauthorizedError') {
        return res.status(401).json({ errors: { message: 'No authorization token was found' } })
    }
    next(err)
})
```

**Scanner must:** detect 4-argument Express middleware functions as `error-handler` nodes. Each `if (err.name === '...')` branch is an `exception-branch` node. `res.status(N)` calls inside error handlers produce `error-response` nodes.

---

## 9. Node.js — Mongoose Model + Validation Patterns

```javascript
// models/User.js
const UserSchema = new mongoose.Schema({
    username: { type: String, lowercase: true, unique: true, required: [true, "can't be blank"], index: true },
    email: { type: String, lowercase: true, unique: true, required: [true, "can't be blank"], match: [/\S+@\S+\.\S+/, 'is invalid'], index: true },
    bio: String,
    image: String,
    hash: String,
    salt: String
}, { timestamps: true })

// Instance methods — must be detected as service-layer functions
UserSchema.methods.validPassword = function(password) { ... }
UserSchema.methods.setPassword = function(password) { ... }
UserSchema.methods.generateJWT = function() { ... }         // [HIDDEN] JWT generation in model
UserSchema.methods.toAuthJSON = function() { ... }          // [HIDDEN] serialization method

// Static methods
UserSchema.statics.findByEmail = function(email) { ... }   // [HIDDEN]

// Middleware (pre/post hooks)
UserSchema.pre('save', function(next) { ... })             // [HIDDEN] pre-save hook
UserSchema.post('save', function(doc, next) { ... })       // [HIDDEN] post-save hook

// Virtuals
UserSchema.virtual('fullName').get(function() { ... })     // [HIDDEN]

// Plugin usage
UserSchema.plugin(uniqueValidator, { message: 'is already taken.' })  // [HIDDEN] plugin validation
```

**Scanner must:**
- Detect `mongoose.Schema({ ... })` field definitions as model fields with validation rules
- Detect `required`, `unique`, `match`, `min`, `max`, `enum` as validation nodes
- Detect `.methods.*` as service-layer function nodes on the model
- Detect `.pre()` and `.post()` hooks as lifecycle nodes
- Detect `uniqueValidator` plugin as a validation node

---

## 10. Angular — HttpClient Service Injection Patterns

**The core Angular problem:** zero HTTP calls are in `.component.ts` files. All HTTP calls are in `@Injectable` service files. The scanner must follow the injection chain.

### 10.1 Injectable Service Pattern

```typescript
// core/services/articles.service.ts
@Injectable({ providedIn: 'root' })
export class ArticlesService {
    constructor(private http: HttpClient) {}

    getArticles(params: ArticleListConfig): Observable<ArticleListResponse> {
        return this.http.get<ArticleListResponse>(`${environment.api_url}/articles`, { params })
    }

    getArticle(slug: string): Observable<ArticleResponse> {
        return this.http.get<ArticleResponse>(`${environment.api_url}/articles/${slug}`)
    }

    createArticle(article: Article): Observable<ArticleResponse> {
        return this.http.post<ArticleResponse>(`${environment.api_url}/articles`, { article })
    }

    updateArticle(article: Article): Observable<ArticleResponse> {
        return this.http.put<ArticleResponse>(`${environment.api_url}/articles/${article.slug}`, { article })
    }

    deleteArticle(slug: string): Observable<void> {
        return this.http.delete<void>(`${environment.api_url}/articles/${slug}`)
    }

    favorite(slug: string): Observable<ArticleResponse> {
        return this.http.post<ArticleResponse>(`${environment.api_url}/articles/${slug}/favorite`, {})
    }
}
```

**Scanner must:**
- Detect `HttpClient` injection via constructor or `inject(HttpClient)`
- Detect `this.http.get()`, `this.http.post()`, `this.http.put()`, `this.http.delete()`, `this.http.patch()` as `api-call` nodes
- Resolve `${environment.api_url}` by following `environment.ts` import
- Create `api-service` nodes for every `@Injectable` class that uses `HttpClient`

### 10.2 environment.ts URL Resolution

```typescript
// environments/environment.ts
export const environment = {
    production: false,
    api_url: 'https://conduit.productionready.io/api'
}

// environments/environment.prod.ts
export const environment = {
    production: true,
    api_url: 'https://conduit.productionready.io/api'
}
```

**Scanner must:**
- Follow `environment.api_url` to its definition in `environment.ts`
- Use the development `environment.ts` value for URL resolution (not prod)
- Compose full URL: `environment.api_url + '/articles'` → `https://conduit.productionready.io/api/articles`
- Store as both full URL and path pattern: `/api/articles`

### 10.3 Component → Service Injection Chain

```typescript
// home/home.component.ts
@Component({ selector: 'app-home', ... })
export class HomeComponent implements OnInit {
    constructor(
        private articlesService: ArticlesService,     // injection
        private userService: UserService,
        private tagService: TagService
    ) {}

    ngOnInit() {
        this.articlesService.getArticles(this.listConfig)  // [HIDDEN] API call in service
            .subscribe(data => this.articleList = data.articles)
    }
}
```

**Scanner must:**
- Detect constructor injection: `private articlesService: ArticlesService`
- When `this.articlesService.getArticles()` is called, follow to `ArticlesService.getArticles()`
- Create edge: `HomeComponent → ArticlesService → GET /api/articles`
- This edge is the consumer-coverage evidence that the endpoint is used

---

## 11. Angular — Route Guards, Resolvers, Interceptors

### 11.1 Class-based Guards (Angular < 14)

```typescript
@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate, CanActivateChild {
    constructor(private router: Router, private userService: UserService) {}

    canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean {
        if (this.userService.currentUser) return true
        this.router.navigateByUrl('/login')
        return false
    }
}
```

### 11.2 Functional Guards (Angular 14+)

```typescript
// New functional guard — must be detected differently
export const authGuard: CanActivateFn = (route, state) => {
    const userService = inject(UserService)             // inject() not constructor
    const router = inject(Router)
    return userService.isAuthenticated ? true : router.parseUrl('/login')
}

// Functional guard in route config
const routes: Routes = [
    {
        path: 'settings',
        component: SettingsComponent,
        canActivate: [authGuard]                        // function reference, not class
    }
]
```

**Scanner must:**
- Detect both `implements CanActivate` (class-based) and `CanActivateFn` type alias (functional)
- Detect `inject()` calls inside functional guards as DI resolutions
- Link guards to the routes they protect via `canActivate: [...]` array in route config

### 11.3 HTTP Interceptors

```typescript
// Class-based
@Injectable()
export class AuthInterceptor implements HttpInterceptor {
    intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
        const token = this.userService.getToken()
        if (token) {
            req = req.clone({ setHeaders: { Authorization: `Token ${token}` } })
        }
        return next.handle(req)
    }
}

// Functional interceptor (Angular 15+)                  [HIDDEN]
export const authInterceptor: HttpInterceptorFn = (req, next) => {
    const token = inject(UserService).getToken()
    return next(req.clone({ setHeaders: { Authorization: `Token ${token}` } }))
}
```

**Scanner must:** detect interceptors as `auth-interceptor` nodes and link them to all HTTP calls they affect (all calls, unless the interceptor has conditional logic excluding some URLs).

### 11.4 Route Resolver Patterns

```typescript
// Resolver — prefetches data before component activates
@Injectable({ providedIn: 'root' })
export class ArticleResolver implements Resolve<ArticleResponse> {
    resolve(route: ActivatedRouteSnapshot): Observable<ArticleResponse> {
        return this.articlesService.getArticle(route.params['slug'])  // API call in resolver
    }
}

// Functional resolver
export const articleResolver: ResolveFn<ArticleResponse> = (route) => {
    return inject(ArticlesService).getArticle(route.params['slug'])
}
```

**Scanner must:** detect resolver API calls as `api-call` nodes triggered by route navigation (layer: `routing`, not `component`).

---

## 12. Angular — TestBed + HttpClientTestingModule Patterns

Angular tests use `TestBed` and `HttpClientTestingModule`. These are the Angular equivalents of Jest mocks + supertest combined.

```typescript
// Component test
describe('ArticleListComponent', () => {
    let component: ArticleListComponent
    let httpMock: HttpTestingController
    let articlesService: ArticlesService

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [ArticleListComponent],
            imports: [HttpClientTestingModule],              // mock HTTP layer
            providers: [ArticlesService]
        }).compileComponents()

        httpMock = TestBed.inject(HttpTestingController)
        articlesService = TestBed.inject(ArticlesService)
    })

    afterEach(() => httpMock.verify())                      // verifies no unexpected requests

    it('loads articles on init', () => {
        const fixture = TestBed.createComponent(ArticleListComponent)
        fixture.detectChanges()                             // triggers ngOnInit

        // Expect and flush HTTP request
        const req = httpMock.expectOne(`${environment.api_url}/articles`)  // assertion + URL
        expect(req.request.method).toBe('GET')                              // method assertion
        req.flush({ articles: mockArticles, articlesCount: 2 })            // provide response

        fixture.detectChanges()
        expect(component.articles.length).toBe(2)          // state assertion
    })
})
```

**Scanner must:**
- Detect `HttpClientTestingModule` in `TestBed.configureTestingModule` → this is an integration test with mocked HTTP (layer: `api`, not `e2e`)
- Detect `httpMock.expectOne(url)` → this is an assertion that a specific URL was called
- The URL in `expectOne()` must be extracted and linked to the `api-call` node in the service
- Detect `req.request.method` assertions
- Detect `req.flush(data)` → this defines the mock response for that call
- `httpMock.verify()` → flag as mock-boundary-verified (all expected calls were made)

---

## 13. Angular — Signal-based and inject() Patterns

Angular 17+ uses signals and the `inject()` function extensively.

```typescript
// Signal-based component (Angular 17+)
@Component({...})
export class ArticleListComponent {
    private articlesService = inject(ArticlesService)    // inject() not constructor

    articles = signal<Article[]>([])
    isLoading = signal(true)

    ngOnInit() {
        this.articlesService.getArticles(this.listConfig)
            .subscribe(data => {
                this.articles.set(data.articles)         // signal.set() not this.prop =
                this.isLoading.set(false)
            })
    }
}

// Computed signals                                      [HIDDEN]
totalPages = computed(() => Math.ceil(this.articlesCount() / this.pageSize()))

// toSignal — wraps Observable as Signal                 [HIDDEN]
articles = toSignal(this.articlesService.getArticles(config), { initialValue: [] })
```

**Scanner must:**
- Detect `inject(ServiceClass)` as an injection — same as constructor injection
- Detect `signal<T>()` values as component state nodes
- Detect `toSignal(observable)` and follow the observable to its source API call

---

## 14. Vue — Vuex + axios Service Patterns

```javascript
// services/ApiService.js — singleton service
import axios from 'axios'

const ApiService = {
    init() {
        axios.defaults.baseURL = API_BASE_URL    // [HIDDEN] global base URL
    },
    get(resource, params) {
        return axios.get(`${resource}`, params)
    },
    post(resource, params) {
        return axios.post(`${resource}`, params)
    },
    put(resource, params) {
        return axios.put(`${resource}`, params)
    },
    delete(resource) {
        return axios.delete(resource)
    }
}

// store/modules/article.js — Vuex actions
const actions = {
    [FETCH_ARTICLES]({ commit }, params) {
        return ApiService.get('articles', { params })   // [HIDDEN] URL via string param
            .then(({ data }) => {
                commit(SET_ARTICLES, data.articles)
            })
    },
    [CREATE_ARTICLE]({ commit }, payload) {
        return ApiService.post('articles', { article: payload })
            .then(({ data }) => {
                commit(SET_ARTICLE, data.article)
            })
    }
}
```

**Scanner must:**
- Detect `axios.defaults.baseURL = ...` as the base URL for all subsequent calls
- Detect `ApiService.get('articles')` → compose with `baseURL` → `GET /api/articles`
- Detect Vuex `const actions = { [ACTION_NAME](...) { ... } }` as action nodes
- When a component calls `this.$store.dispatch('fetchArticles')` → link to the Vuex action → link to the API call

---

## 15. PHP — Slim Framework + Eloquent + JWT Patterns

```php
// routes.php
$app->get('/api/articles', ArticleController::class . ':index')
    ->add($container->get('optionalAuth'))               // [HIDDEN] optional auth middleware

$app->post('/api/articles', ArticleController::class . ':create')
    ->add($container->get('jwt'))                        // [HIDDEN] required auth middleware

$app->get('/api/articles/{slug}', ArticleController::class . ':show')

// Controller
class ArticleController {
    public function index(Request $req, Response $res, array $args): Response { ... }
    public function create(Request $req, Response $res, array $args): Response { ... }
    public function show(Request $req, Response $res, array $args): Response { ... }
}
```

**Scanner must:**
- Detect `$app->get('/path', Controller::class . ':method')` as endpoint nodes
- Detect `->add($container->get('jwt'))` as `security: { required: true }`
- Detect `->add($container->get('optionalAuth'))` as `security: { optional: true }`
- Detect `{slug}` in route paths as path parameters (Slim uses `{param}` not `:param`)

---

## 16. HapiJS — Route + Joi Validation + Boom Error Patterns

```javascript
// HapiJS route definition
server.route({
    method: 'GET',
    path: '/api/articles',
    options: {
        auth: { mode: 'try', strategy: 'jwt' },          // optional auth in Hapi
        validate: {
            query: Joi.object({
                tag: Joi.string(),
                author: Joi.string(),
                limit: Joi.number().integer().min(1).max(100).default(20),
                offset: Joi.number().integer().min(0).default(0)
            })
        },
        handler: async (request, h) => { ... }
    }
})

server.route({
    method: 'POST',
    path: '/api/articles',
    options: {
        auth: 'jwt',                                     // required auth
        validate: {
            payload: Joi.object({
                article: Joi.object({
                    title: Joi.string().required(),
                    body: Joi.string().required()
                }).required()
            })
        },
        handler: async (request, h) => { ... }
    }
})
```

**Scanner must:**
- Detect `server.route({ method, path, options })` as endpoint node
- Detect `options.auth: 'jwt'` as `security: { required: true }`
- Detect `options.auth: { mode: 'try' }` as `security: { optional: true }`
- Extract `options.validate.query` and `options.validate.payload` as parameter nodes with Joi constraints
- Detect Joi validators: `Joi.string()`, `Joi.number()`, `.required()`, `.min()`, `.max()`, `.default()`, `.email()`, `.valid()`

---

## 17. Cross-Project: Optional Auth Patterns

Every framework in the realworld ecosystem implements "optional auth" differently. The scanner must detect all of them and never classify them as "unsecured."

| Framework | Optional Auth Pattern | Scanner Action |
|---|---|---|
| Flask/flask-jwt-extended | `@jwt_optional` / `@jwt_required(optional=True)` | `security: { optional: true }` |
| Express/express-jwt | `jwt({ credentialsRequired: false })` | `security: { optional: true }` |
| HapiJS | `auth: { mode: 'try', strategy: 'jwt' }` | `security: { optional: true }` |
| Slim PHP | `->add($container->get('optionalAuth'))` | `security: { optional: true }` |
| Spring Security | `.requestMatchers("/public/**").permitAll()` with token parsed if present | `security: { optional: true }` |
| Angular Guard | `canActivate: []` (no guard) but interceptor adds token if present | `security: { optional: true }` |

**Non-negotiable:** an endpoint with optional auth is NOT the same as a public endpoint. It must be stored as a distinct security state. Coverage analysis must separately track:
- `auth-required` endpoints with no tests validating the 401 path → coverage gap
- `auth-optional` endpoints with no tests validating both authed and unauthed behavior → coverage gap

---

## 18. Cross-Project: API Base URL Resolution

Every project stores the API base URL differently:

| Project | Location | Pattern |
|---|---|---|
| Flask realworld | Blueprint `url_prefix` in `register_blueprints()` | Cross-file resolution (Section 3.1) |
| Node/Express | `app.use('/api', router)` in `app.js` | Express router mount |
| Angular | `environment.api_url` in `environments/environment.ts` | TS constant resolution |
| Vue | `axios.defaults.baseURL = API_BASE_URL` | Global axios config |
| React | `axios.create({ baseURL: process.env.REACT_APP_API_URL })` | Instance creation |
| Spring Boot | `@RequestMapping('/api')` on controller class | Controller-level mapping |
| NestJS | `@Controller({ path: 'articles', version: '1' })` | Controller decorator |
| Slim PHP | Route path starts with `/api/` explicitly | Explicit in path |
| HapiJS | Route path starts with `/api/` explicitly | Explicit in path |

**Non-negotiable URL composition rule:**

```
STEP 1: Find the global/app-level base path (varies per framework — see table above)
STEP 2: Find the router/blueprint/controller-level prefix (if any)
STEP 3: Find the method/route-level path
STEP 4: Concatenate: base + controller_prefix + method_path
STEP 5: Normalize: remove double slashes, ensure single leading slash
STEP 6: Create ONE endpoint node with the fully composed URL
NEVER create an endpoint node after STEP 2 alone — prefix is not a URL
```

---

## 19. Cross-Project: Error Middleware Patterns

Every project has error handling but in different forms:

```javascript
// Express 4-argument error handler
app.use((err, req, res, next) => { res.status(err.status || 500).json({ errors: err }) })

// Express validation error handler  
router.use(function(err, req, res, next) {
    if (err.name === 'ValidationError') return res.status(422).json(...)
    next(err)
})
```

```java
// Spring @ControllerAdvice
@RestControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler(EntityNotFoundException.class)
    public ResponseEntity<ErrorBody> handleNotFound(EntityNotFoundException ex) { ... }
}
```

```python
# Flask error handler
@app.errorhandler(422)
def handle_validation_error(err):
    return jsonify({'errors': err.data['messages']}), 422

# flask-apispec auto-generates 422 from Marshmallow validation failures
```

```typescript
// NestJS exception filter
@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
    catch(exception: HttpException, host: ArgumentsHost) { ... }
}
```

**Scanner must:** detect all of the above as `error-handler` nodes. Each handler must be linked to the endpoints it protects. For global handlers (`@ControllerAdvice`, `app.use()` at app level), link to ALL endpoints in that application scope.

---

## 20. Scanner Behavioral Rules — Structure Agnosticism

All rules from Feature 24 Section 20 apply. The following additional rules are non-negotiable.

**RULE-SA01 — Directory name must never be used as evidence of node type.**
A file named `services/auth.js` could contain routes. A file named `routes/helper.js` could contain utilities. The scanner determines node type from code content, never from path. Directory hints may be used as tie-breakers when content is ambiguous, but never as primary evidence.

**RULE-SA02 — Blueprint/Router prefix resolution is mandatory before any endpoint node is emitted.**
An endpoint node emitted before its full URL is computed is a defect, not a valid partial result. The scanner must complete the cross-file resolution pass before creating endpoint nodes.

**RULE-SA03 — Absence of @Service/@Repository annotations must not prevent service/repository node creation.**
DDD and Hexagonal architectures deliberately avoid framework annotations in domain layers. The scanner must use structural inference (package names, interface names, method signatures) to classify nodes.

**RULE-SA04 — Optional auth must always be distinguished from public access.**
An endpoint classified as `security: public` when it is actually `security: { optional: true }` is a defect. The distinction exists in every framework and must be detected in all of them.

**RULE-SA05 — MyBatis XML files are first-class source files.**
They must be parsed, not skipped. A MyBatis mapper interface with no detected queries is a false negative if the corresponding XML file was not scanned.

**RULE-SA06 — GraphQL schema files (.graphqls, .graphql) are first-class source files.**
Every `Query` and `Mutation` field in a schema file is an endpoint node. The schema file must be parsed regardless of its location.

**RULE-SA07 — Angular HttpClient calls in @Injectable services are API calls.**
The scanner must follow the injection chain: component injects service → service has HttpClient → service method makes HTTP call → that call is an api-call node linked to the component.

**RULE-SA08 — Vuex actions making API calls must be linked back to dispatching components.**
`this.$store.dispatch('fetchArticles')` in a component + `FETCH_ARTICLES` action calling `ApiService.get('articles')` must produce an unbroken chain: `component → action → api-call`.

**RULE-SA09 — Functional Angular guards (CanActivateFn) must be detected identically to class-based guards.**
The type alias `CanActivateFn`, `CanActivateChildFn`, `CanDeactivateFn`, `ResolveFn` must all be detected. Using `inject()` inside them instead of constructor injection must not break detection.

**RULE-SA10 — Webtest, TestApp, and similar HTTP test clients must be detected as API test evidence.**
`testapp.get('/api/articles')` is equivalent to `supertest(app).get('/api/articles')`. Both produce api-call nodes with the same semantics.

---

## 21. Example Project Registry

The following projects must be added to `examples/` in the scanner repo and must pass `npm run scan:examples`:

| Directory | Source | Language | Key Patterns |
|---|---|---|---|
| `examples/flask-realworld/` | gothinkster/flask-realworld-example-app | Python | Blueprint prefix resolution, use_kwargs, marshal_with, jwt_optional, Factory Boy, webtest |
| `examples/spring-boot-realworld/` | gothinkster/spring-boot-realworld-example-app | Java | DDD layers, CQRS, MyBatis XML, DGS GraphQL, REST+GraphQL dedup |
| `examples/node-express-realworld/` | gothinkster/node-express-realworld-example-app | JS | Router-level auth middleware, 4-arg error handler, Mongoose model methods |
| `examples/angular-realworld/` | gothinkster/angular-realworld-example-app | TypeScript | HttpClient in services, environment.ts URL, functional guards, TestBed |
| `examples/nestjs-realworld/` | lujakob/nestjs-realworld-example-app | TypeScript | NestJS decorators, TypeORM, Swagger |
| `examples/vue-realworld/` | gothinkster/vue-realworld-example-app | JS | Vuex actions, ApiService singleton, axios.defaults.baseURL |
| `examples/slim-php-realworld/` | gothinkster/slim-php-realworld-example-app | PHP | Slim routes, {param} syntax, Eloquent ORM, container middleware |
| `examples/hapijs-realworld/` | gothinkster/hapijs-realworld-example-app | JS | HapiJS route config object, Joi validation, Boom errors, auth.mode.try |

### Required Output for Each Example Project

Every example project must produce a `expected-coverage.json` that includes:

```yaml
minimumRequirements:
  totalEndpoints: "> 0"
  endpointsWithResolvedFullUrl: "== totalEndpoints"    # no partial URLs
  endpointsWithSecurityClassified: "> 0"               # at least some endpoints have auth
  optionalAuthEndpointsDetected: "> 0"                 # at least one optional-auth endpoint
  parametersDetected: "> 0"                            # no project has zero parameters
  conflictCount: "< 5"                                 # minimal unresolved conflicts
```

**Non-negotiable:** if a project scan produces `endpointsWithResolvedFullUrl < totalEndpoints`, the scan is considered failed. Partial URLs in the output are defects.

---

## 22. Acceptance Criteria

Feature 27 is complete when all of the following pass.

### Structure Agnosticism

- [ ] Scanner detects endpoints in files regardless of their directory name
- [ ] Scanner detects tests in files regardless of their directory name
- [ ] Scanner detects API calls in service files that are not components
- [ ] Scanner never emits an endpoint node with an unresolved URL prefix

### Flask Patterns

- [ ] Blueprint `url_prefix` is resolved across files before endpoint nodes are created
- [ ] `@use_kwargs({...})` produces parameter nodes with type and required flag
- [ ] `@marshal_with(schema)` produces response-schema nodes
- [ ] `@jwt_optional` produces `security: { optional: true }`, never `security: public`
- [ ] `@jwt_required(optional=True)` produces the same as `@jwt_optional`
- [ ] Factory Boy `factory.Factory` subclasses produce test-factory nodes
- [ ] `testapp.get/post_json/put_json/delete` produce api-call + assertion nodes
- [ ] pytest fixture chains are resolved: `test → fixture → db → app`

### Spring Boot DDD/CQRS

- [ ] Domain interfaces without `@Repository` are detected as repository nodes
- [ ] Application services without `@Service` are detected as service nodes
- [ ] CQRS command/query handlers are detected by method signature pattern
- [ ] MyBatis XML files are parsed and linked to `@Mapper` interfaces
- [ ] DGS `@DgsQuery` / `@DgsMutation` methods are detected as endpoints
- [ ] GraphQL schema `.graphqls` fields are parsed as endpoint nodes
- [ ] REST and GraphQL endpoints on the same domain operation are two nodes, not one

### Node.js Express

- [ ] `router.use(path, auth.required, subRouter)` marks all sub-routes as auth-required
- [ ] `router.use(path, auth.optional, subRouter)` marks all sub-routes as auth-optional
- [ ] 4-argument error middleware functions are detected as error-handler nodes
- [ ] Mongoose `.methods.*` functions are detected as model service nodes
- [ ] `mongoose.Schema({...})` field validators are detected as validation nodes

### Angular

- [ ] `HttpClient` calls inside `@Injectable` services are detected as api-call nodes
- [ ] `environment.api_url` is resolved to its string value for URL composition
- [ ] Constructor-injected services are followed to their HTTP calls
- [ ] `inject(HttpClient)` injection is detected identically to constructor injection
- [ ] Functional `CanActivateFn` guards are detected and linked to routes
- [ ] `HttpClientTestingModule` + `httpMock.expectOne(url)` produce assertion nodes
- [ ] HTTP interceptors are linked to all HTTP calls they affect

### Vue

- [ ] `axios.defaults.baseURL` is used as the base URL for all subsequent calls
- [ ] Vuex action objects produce action nodes with linked API calls
- [ ] `this.$store.dispatch('actionName')` in components links to the Vuex action

### PHP / HapiJS

- [ ] Slim `$app->get('/path', ...)` with `->add($container->get('jwt'))` produces secured endpoint
- [ ] Slim `{slug}` path syntax is detected as path parameter
- [ ] HapiJS `server.route({ method, path, options })` produces endpoint nodes
- [ ] HapiJS `auth: { mode: 'try' }` produces `security: { optional: true }`
- [ ] Joi validators inside `options.validate` produce parameter nodes

### Cross-Project

- [ ] Optional auth is distinguished from public in all 8 frameworks
- [ ] API base URL is composed correctly for all 8 projects
- [ ] All 8 example projects produce output with zero partial URLs
- [ ] All 8 example projects pass their `expected-coverage.json` comparison
- [ ] All 10 structure-agnostic behavioral rules are enforced
