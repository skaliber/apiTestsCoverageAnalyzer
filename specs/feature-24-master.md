# Feature 24 — Cascaded Multi-Stage Coverage Mapping Engine
## Complete Specification, Pattern Catalog, Behavioral Rules & Test Requirements

**Version:** 3.0 — Master Document  
**Status:** Authoritative  
**Scope:** Full implementation reference — pipeline spec, language pattern catalog, scanner behavioral rules, test writing requirements, and self-scanning obligations

> This is the single source of truth for Feature 24. All previous documents (v1.0, v2.0, companion pattern catalog) are superseded by this file.

---

## Table of Contents

1. [Goal & Coverage Targets](#1-goal--coverage-targets)
2. [Pipeline Execution Order](#2-pipeline-execution-order)
3. [Stage 1 — SCA](#3-stage-1--sca-software-composition-analysis)
4. [Stage 2 — AST Structural Analysis](#4-stage-2--ast-structural-analysis)
5. [Stage 3 — TIA Test Impact Analysis](#5-stage-3--tia-test-impact-analysis)
6. [Stage 4 — IAST Runtime Instrumentation](#6-stage-4--iast-runtime-instrumentation)
7. [Stage 5 — DAST Runtime Probing](#7-stage-5--dast-runtime-probing)
8. [Stage 6 — Graph Merge & Conflict Resolution](#8-stage-6--graph-merge--conflict-resolution)
9. [Coverage Knowledge Graph](#9-coverage-knowledge-graph)
10. [Confidence Model](#10-confidence-model)
11. [Coverage Map Output Schema](#11-coverage-map-output-schema)
12. [Language Pattern Catalog — Java / Spring Boot](#12-language-pattern-catalog--java--spring-boot)
13. [Language Pattern Catalog — Kotlin](#13-language-pattern-catalog--kotlin)
14. [Language Pattern Catalog — JavaScript / TypeScript](#14-language-pattern-catalog--javascript--typescript)
15. [Language Pattern Catalog — Python](#15-language-pattern-catalog--python)
16. [Cross-Language: Assertion Patterns](#16-cross-language-assertion-patterns)
17. [Cross-Language: Mock & Stub Patterns](#17-cross-language-mock--stub-patterns)
18. [Cross-Language: E2E Framework Patterns](#18-cross-language-e2e-framework-patterns)
19. [Cross-Language: Hidden / Abstract Layer Patterns](#19-cross-language-hidden--abstract-layer-patterns)
20. [Scanner Behavioral Rules & Hard Limits](#20-scanner-behavioral-rules--hard-limits)
21. [Test Writing Requirements](#21-test-writing-requirements)
22. [Self-Scanning & Example Project Obligations](#22-self-scanning--example-project-obligations)
23. [Acceptance Criteria](#23-acceptance-criteria)
24. [Expected Analyzer Insights](#24-expected-analyzer-insights)

---

## 1. Goal & Coverage Targets

Build a cascaded scanning engine that progressively analyzes a repository across multiple analysis layers, resolving ambiguity that no single layer can resolve alone. The engine must correctly infer coverage even when assertions, endpoints, or test logic are hidden behind:

- utility / helper abstractions
- abstract base test classes
- shared fixture layers
- parameterized test factories
- mock / stub boundaries
- imported constant maps (URL resolution)
- dynamic test factories (`@TestFactory`, `test.each`, `pytest.mark.parametrize`)

The final output is a **Coverage Knowledge Graph** — a structured evidence graph linking code artifacts to test coverage, runtime observations, and confidence scores.

### Coverage Targets

| Layer | What Is Mapped |
|---|---|
| Endpoints | Route definitions, HTTP methods, path params |
| Parameters | Query params, request body fields, headers |
| Business Rules | Validation logic, conditional branches |
| Integration Flows | Cross-service calls, message queues, DB access |
| Error Handling | Exception branches, error responses, fallback paths |
| Security | Auth annotations, permission checks, token flows |
| Performance | Rate limiters, timeouts, retry policies |
| Unit Tests | Function/class-level assertions |
| Integration Tests | Cross-layer execution evidence |
| E2E Tests | Full-flow user journey coverage |

---

## 2. Pipeline Execution Order

The scan pipeline executes in this fixed sequence. Each stage enriches the graph produced by all previous stages before passing it forward.

```
SCA → AST → TIA → IAST → DAST → Graph Merge
 1      2     3      4      5         6
```

**Static-only mode:** Stages 4 (IAST) and 5 (DAST) are optional when runtime execution is unavailable. The engine must produce valid output from stages 1–3 alone, with confidence capped at `medium`.

**Stage contracts:**
- Every stage must emit its own diagnostic block even if it produced zero findings.
- Every stage must record the list of files it scanned and the list it skipped.
- No stage may mutate the output of a previous stage in place — each stage appends to the graph.

---

## 3. Stage 1 — SCA (Software Composition Analysis)

### Purpose

Identify technologies, frameworks, testing ecosystems, and mocking libraries so all subsequent stages can activate the correct heuristics. SCA runs first because AST pattern matching depends on knowing which annotations, decorators, and idioms to look for.

### Files to Scan

| Language | Files |
|---|---|
| Java / Kotlin | `pom.xml`, `build.gradle`, `build.gradle.kts`, `settings.gradle`, `settings.gradle.kts`, `gradle.properties` |
| JavaScript / TypeScript | `package.json`, `yarn.lock`, `pnpm-lock.yaml`, `package-lock.json`, `.npmrc` |
| Python | `requirements.txt`, `requirements-dev.txt`, `pyproject.toml`, `setup.py`, `setup.cfg`, `Pipfile` |
| Generic | `Dockerfile*`, `docker-compose*.yml`, `.github/workflows/*.yml`, `.gitlab-ci.yml`, `Jenkinsfile`, `Makefile`, `.tool-versions`, `.nvmrc` |

### Output Schema

```yaml
sca:
  languages: []               # e.g. ["java", "typescript"]
  frameworks: []              # e.g. ["spring-boot", "express", "nestjs", "fastapi"]
  httpClients: []             # e.g. ["axios", "retrofit", "okhttp", "httpx"]
  testFrameworks: []          # e.g. ["jest", "junit5", "pytest", "kotest", "mocha"]
  assertionLibraries: []      # e.g. ["assertj", "chai", "hamcrest"]
  securityLibraries: []       # e.g. ["spring-security", "passport", "python-jose"]
  performanceTools: []        # e.g. ["k6", "gatling", "locust", "jmeter"]
  mockingLibraries: []        # e.g. ["mockito", "mockk", "jest.mock", "sinon", "unittest.mock"]
  e2eFrameworks: []           # e.g. ["cypress", "playwright", "selenium", "cucumber"]
  dependencyVersions: {}      # all resolved versions
  ciPlatform: string          # github-actions | gitlab-ci | jenkins | none
```

> `mockingLibraries` and `e2eFrameworks` are required fields. Their presence activates mock-boundary detection and E2E pattern matching in later stages.

---

## 4. Stage 2 — AST Structural Analysis

### Purpose

Build the initial structural graph by parsing source code. Every node and edge created in this stage is marked `sourceStage: ast`.

### Detection Targets

- Endpoints (routes, controller mappings, router registrations)
- Controllers, services, repositories
- Method parameters and their validation rules
- Error and exception branches
- Security annotations and guards
- Test definitions, assertions, fixtures, helpers, and base test classes

### Abstract Layer Traversal

**This is the single most critical capability for accurate coverage mapping.** A single-pass AST scanner that only inspects the direct test body will systematically under-report coverage whenever assertion or endpoint logic is delegated to a shared layer.

#### The Problem

```typescript
// helpers/BaseApiTest.ts
class BaseApiTest {
  assertSuccess(res) { expect(res.status).toBe(200); }       // assertion here
  callEndpoint(path) { return this.client.get(path); }       // endpoint call here
}

// tests/UserTest.ts
class UserTest extends BaseApiTest {
  it("creates user", () => {
    const res = this.callEndpoint("/users");                  // no direct assertion
    this.assertSuccess(res);                                  // no visible expect()
  });
}
```

Without traversal, `UserTest` appears to have zero assertions and no resolved endpoint. Both signals are false negatives.

#### Resolution Strategy (mandatory, in order)

1. **Inheritance chain resolution** — when a test class `extends` / `implements` another class, recursively resolve all inherited methods before scoring assertion coverage. Apply to: Java `extends`, Kotlin `: Base()`, TypeScript `extends`, Python class inheritance.

2. **Import-based helper resolution** — when a test file imports a module and calls a function from it, follow the import and resolve the called function's full body. Apply even when the import is dynamic (`require()`, `importlib`, `__import__`).

3. **Fixture injection resolution** — when a test receives objects via setup functions (`@BeforeEach`, `beforeEach()`, `setUp()`, pytest fixtures, `@Autowired`), trace the fixture/injection source and resolve the full method body of any called methods.

4. **Page Object / helper object resolution** — when a test calls a method on an injected helper object (e.g., `this.userPage.navigate()`), resolve the class definition of that object type and traverse its methods.

5. **Traversal depth cap: 5 levels.** Beyond depth 5, mark the node `resolution: partial` and record the unresolved chain in diagnostics. Never fail silently.

#### URL Constant Resolution

```typescript
// config/routes.ts
export const ROUTES = { users: "/api/v1/users", admin: "/api/v1/admin" };

// tests/UserTest.ts
import { ROUTES } from "../config/routes";
cy.visit(ROUTES.users);          // must resolve to "/api/v1/users"
request(app).get(ROUTES.users);  // same
```

The engine must:
- Follow import paths to the source file
- Resolve object property access to literal string values
- Support nested constant objects (`ROUTES.v1.users`)
- If resolution fails: store as `url-resolution: symbolic`, record the unresolved expression, and flag in diagnostics — never discard the node

### Node Types

```yaml
nodeTypes:
  # Production code nodes
  - endpoint
  - parameter
  - controller
  - service
  - repository
  - model
  - exception-branch
  - route
  - file
  - class
  - function

  # Test nodes
  - test-file
  - test-suite
  - test-case
  - assertion
  - fixture
  - helper
  - base-test-class       # abstract base or utility class containing shared test logic

  # Derived nodes (populated by TIA/IAST enrichment)
  - mock-boundary         # marks where a mock replaces a real dependency call
  - param-variant         # one expansion of a parameterized test
```

### Edge Types

```yaml
edgeTypes:
  - defines               # file/class defines an endpoint or function
  - calls                 # function calls another
  - validates             # parameter or rule validates input
  - throws                # method throws an exception
  - handles               # handler catches an exception
  - tests                 # test case maps to a code artifact
  - asserts               # assertion targets a value from a code artifact
  - extends               # test class inherits from base class
  - imports-helper        # test file imports a utility module
  - mocks                 # test replaces a real dependency with a mock
  - resolves-to           # symbolic URL resolves to literal endpoint
  - param-expands-to      # parameterized test expands to a variant node
```

---

## 5. Stage 3 — TIA (Test Impact Analysis)

### Purpose

Map test artifacts to code nodes and endpoints, classify each test by layer, detect mock boundaries, expand parameterized tests, and resolve hidden coverage signals via abstract layer traversal.

### Evidence Sources (evaluated in priority order)

1. **Explicit URL literals** — string literals directly matching a known endpoint path
2. **Resolved URL constants** — constants traced to literal paths via import resolution
3. **Import graph** — which production modules the test file imports directly
4. **Page objects and fixture objects** — method calls on objects whose class definition references endpoints
5. **Naming conventions** — directory path, file name, describe/context block labels
6. **Framework metadata** — `@Tag`, `@Category`, `pytest.mark.*`, Cucumber tags
7. **Helper utilities** — via abstract layer traversal (Stage 2, resolution strategy)

### Test Layer Classification

| Layer | Detection Signals |
|---|---|
| `unit` | No HTTP client, no DB client, all dependencies mocked, file in `unit/` or no special directory |
| `component` | Some dependencies real, some mocked; no HTTP call to a running server |
| `integration` | `@SpringBootTest`, `@DataJpaTest`, `APITestCase`, `TestRestTemplate`, file in `integration/` |
| `api` | `supertest`, `MockMvc`, `TestRestTemplate`, `httpx.AsyncClient`, HTTP calls to in-process server |
| `e2e` | Cypress, Playwright, Selenium, Cucumber, file in `e2e/` or `cypress/` or `playwright/` |
| `performance` | k6, Gatling, Locust, JMeter, file in `performance/` or `load-tests/` |
| `security` | File in `security/`, tag `security`, imports pentest/auth testing libraries |

### Mock Boundary Detection

When a test uses any pattern listed in Section 17, the engine must:
1. Create a `mock-boundary` node linked to the mocked artifact
2. Record which real node is being replaced (`mockedNodeId`)
3. Attach the boundary to the coverage mapping of that path
4. Prevent any coverage path with a `mock-boundary` from being classified as `integration-covered`

```yaml
mockBoundary:
  testId: string
  mockedNodeId: string        # the real service, repository, or function being replaced
  mockingLibrary: string
  mockType: return-value | exception | spy | partial | timer | env
  effect: coverage-limited    # real execution path not confirmed
```

### Parameterized Test Expansion

When any parameterized test pattern is detected (see each language section for patterns), the engine must:

1. Parse the parameter table / source
2. Create one `param-variant` node per row / combination
3. Link each variant to the parent test via `param-expands-to` edge
4. Map endpoint and assertion evidence independently for each variant
5. Record `variantCount: N` on the parent test node
6. If the parameter source is a method or external class that cannot be statically resolved, record `variantCount: unresolvable` and flag in diagnostics — never skip the test entirely

### Directory & Naming Patterns

**Integration test directories**
```
src/test/integration/
src/it/
integration/
integration-tests/
tests/integration/
test/integration/
__tests__/integration/
```

**E2E test directories**
```
cypress/
cypress/e2e/
e2e/
tests/e2e/
playwright/
playwright/tests/
browser-tests/
acceptance/
features/
stories/
```

**Performance test directories**
```
performance/
perf/
load-tests/
k6/
gatling/src/test/scala/
jmeter/
locust/
```

**Integration test naming patterns**
```
*IntegrationTest*, *Integration_Test*, *_integration_test*
*ApiTest*, *Api_Test*, *_api_test*
*ComponentTest*, *IT (suffix only)
describe("integration ..."), context("integration ...")
@Tag("integration"), @Category(IntegrationTest.class)
pytest.mark.integration
```

**E2E test naming patterns**
```
*.cy.ts, *.cy.js
*.e2e.ts, *.e2e-spec.ts, *.e2e.js
*.feature
describe("e2e ..."), describe("end-to-end ...")
@Tag("e2e"), pytest.mark.e2e
```

---

## 6. Stage 4 — IAST Runtime Instrumentation

### Purpose

Confirm which structural nodes are actually executed at runtime. IAST evidence is the strongest signal for upgrading confidence from `medium` to `high`. IAST must record which test layer triggered each event.

### Captured Event Types

| Event Type | Description |
|---|---|
| `route-entered` | HTTP route handler was invoked |
| `middleware-executed` | Middleware / filter / interceptor ran |
| `service-invoked` | Service layer method was called |
| `repository-accessed` | DB query or repository method executed |
| `exception-handled` | Exception handler branch was triggered |
| `response-generated` | Response was serialized and returned |
| `validation-triggered` | Validation logic ran on an input |
| `security-check-executed` | Auth / permission check ran |

### Event Model

```yaml
iastEvent:
  testId: string
  runtimeSessionId: string
  eventType: route-entered | middleware-executed | service-invoked | repository-accessed | exception-handled | response-generated | validation-triggered | security-check-executed
  nodeId: string
  timestamp: string
  callerTestLayer: unit | component | integration | api | e2e | performance | security
  callerTestFile: string
  callerTestCase: string
```

> `callerTestLayer`, `callerTestFile`, and `callerTestCase` are required. Without them, graph merge cannot distinguish runtime confirmation from an E2E run vs. a unit test that happens to spin up a partial context.

---

## 7. Stage 5 — DAST Runtime Probing

### Purpose

Externally validate which endpoints are reachable and how they respond to valid, invalid, and unauthenticated requests — independently of any knowledge of the codebase.

### Probing Strategy

1. Use the endpoint list from AST stage as the probe candidate set
2. Probe each candidate with minimal valid inputs (reachability)
3. Probe with missing required fields (validation response)
4. Probe with malformed types (type validation)
5. Probe without credentials (auth enforcement)
6. Probe with valid credentials but insufficient permissions (authorization)

### Output Schema

```yaml
dast:
  probedEndpoints: []
  reachableEndpoints: []
  unreachableEndpoints: []          # in AST but not found by DAST
  observedStatusCodes: {}           # { "GET /users": [200, 401, 404] }
  authRequiredEndpoints: []         # returned 401/403 without credentials
  authorizationEnforcedEndpoints: [] # returned 403 with valid but low-privilege token
  unexpectedResponses: []
  validationResponses: []           # returned 400/422 on invalid input
  serverErrorResponses: []          # returned 500 — potential untested error branch
```

### DAST vs AST Conflict Rules

| DAST Result | AST Declared | Action |
|---|---|---|
| Not reachable | Endpoint exists | Emit `conflict: dast-unreachable`, `dastReachable: false` |
| Reachable, no auth check | `@Secured` present | Emit `conflict: security-annotation-not-enforced` |
| Returns 500 | No error handler mapped | Emit `conflict: unhandled-server-error` |
| New endpoint found | Not in AST | Emit `conflict: undeclared-endpoint`, add node with `sourceStage: dast` |

---

## 8. Stage 6 — Graph Merge & Conflict Resolution

### Purpose

Combine all stage outputs into one Coverage Knowledge Graph, apply merge rules, resolve contradictions, and compute final confidence scores.

### Merge Rules

| Condition | Action |
|---|---|
| AST + TIA agree on endpoint-test link | Create edge, `confidence: medium` |
| AST + TIA + IAST confirm same link | Upgrade to `confidence: high` |
| AST + TIA + IAST + DAST all confirm | Upgrade to `confidence: verified` |
| AST + TIA + IAST + DAST + assertions confirmed | `confidence: verified`, `assertionConfirmed: true` |
| AST declares endpoint, DAST cannot reach it | `dastReachable: false`, emit conflict, cap at `medium` |
| TIA maps test, IAST never fires that route | Flag `runtimeConfirmed: false` |
| Assertion found only in base class | Resolve via inheritance, `assertionSource: inherited` |
| Mock boundary on integration test path | `coverageClass: mock-covered`, never `integration-covered` |
| DAST finds endpoint not in AST | Add node `sourceStage: dast`, emit conflict `undeclared-endpoint` |
| Two stages produce contradictory node types | Emit `conflict: stage-disagreement`, keep both nodes, flag for human review |

### Conflict Node Schema

```yaml
conflict:
  conflictId: string
  nodeId: string
  type: dast-unreachable | runtime-unconfirmed | stage-disagreement | security-annotation-not-enforced | unhandled-server-error | undeclared-endpoint
  stages: []              # which stages reported conflicting evidence
  stageOutputs: {}        # raw evidence from each conflicting stage
  detail: string
  suggestedAction: string
  severity: info | warning | error
```

---

## 9. Coverage Knowledge Graph

### Node Types

```
endpoint          service           repository
test              runtime-event     dependency
mock-boundary     conflict          base-test-class
param-variant     fixture           helper
```

### Edge Types

```
calls             tests             executes
depends-on        observed-by       extends
mocks             resolves-to       conflicts-with
param-expands-to  imports-helper    asserts
validates         throws            handles
```

### Example Relationship Map

```
E2E Test
   │ tests
   ▼
Endpoint ──calls──► Service ──calls──► Repository
   │                   │                    │
   │           (mock-boundary)         [DB confirmed
   │                   │                by IAST]
Integration Test ──tests──► Service   [coverage-limited: mock-covered]
   │
Unit Test ──tests──► Service.validateUser()
                          │
                    [base-test-class]
                    BaseServiceTest.assertValid()
```

---

## 10. Confidence Model

### Confidence Levels

| Level | Meaning |
|---|---|
| `low` | Only static AST evidence; no test linkage |
| `medium` | AST + TIA agree; no runtime confirmation |
| `high` | Static + at least one runtime stage (IAST or DAST) confirm |
| `verified` | All stages confirm + assertion is traced and confirmed |

### Confidence Scoring Rules

| Evidence Present | Confidence |
|---|---|
| AST only (no TIA link) | `low` |
| AST + TIA | `medium` |
| AST + TIA + IAST **or** DAST | `high` |
| AST + TIA + IAST + DAST | `high` (both runtime stages) |
| AST + TIA + IAST + DAST + assertion confirmed | `verified` |
| Any `mock-boundary` on the path | Cap at `medium`, never `high` |
| `resolution: partial` on any traversal node | Cap at `medium` |
| `url-resolution: symbolic` on endpoint | Cap at `medium` |
| Static-only mode active (no IAST/DAST) | Cap at `medium` globally |

### Coverage Mapping Schema

```yaml
coverageMapping:
  itemId: string
  itemType: endpoint | service | repository | error-branch | security-path | validation-rule
  linkedTests: []
  sourceStages: []                  # which stages contributed evidence
  confidence: low | medium | high | verified
  coverageClass: unit-covered | component-covered | integration-covered | api-covered | e2e-covered | mock-covered | uncovered
  mockBoundaries: []                # mock-boundary node IDs on this path
  assertionSource: direct | inherited | fixture | helper | unresolved
  assertionConfirmed: boolean
  dastReachable: true | false | not-probed
  runtimeConfirmed: boolean
  urlResolution: literal | symbolic | unresolved
  conflicts: []
  traversalDepth: number            # how deep abstract layer traversal went
```

---

## 11. Coverage Map Output Schema

```yaml
coverageMap:
  graph:
    nodes: []
    edges: []
  sections:
    endpoints: []
    parameters: []
    integrationFlows: []
    security: []
    errorHandling: []
    performance: []
  diagnostics:
    sca: {}
    ast:
      filesScanned: []
      filesSkipped: []
      unresolvedTraversals: []
      symbolicUrls: []
    tia:
      testsClassified: {}           # { unit: N, integration: N, e2e: N, ... }
      mockBoundariesDetected: N
      paramVariantsExpanded: N
      unresolvedParameterSources: []
    iast:
      eventsRecorded: N
      nodesConfirmed: []
    dast:
      endpointsProbed: N
      conflicts: []
    merge:
      conflicts: []
  summary:
    totalEndpoints: 0
    coveredEndpoints: 0
    verifiedEndpoints: 0
    uncoveredEndpoints: 0
    mockLimitedPaths: 0
    unresolvedAbstractions: 0
    conflictCount: 0
    coverageByLayer:
      unit: 0
      component: 0
      integration: 0
      api: 0
      e2e: 0
```

---

## 12. Language Pattern Catalog — Java / Spring Boot

> All patterns listed in this section must be recognized by the AST and TIA stages. Patterns marked `[HIDDEN]` are those most likely to cause false "uncovered" results if not handled — they hide assertions or endpoints behind abstraction.

### 12.1 Endpoint Definition

```java
// Controller annotations
@RestController
@Controller
@RequestMapping("/api/users")
@RequestMapping(value = "/users", method = RequestMethod.GET)

// Method-level HTTP mappings
@GetMapping("/users")
@PostMapping("/users")
@PutMapping("/users/{id}")
@PatchMapping("/users/{id}")
@DeleteMapping("/users/{id}")
@GetMapping(value = "/users", produces = MediaType.APPLICATION_JSON_VALUE)

// Spring WebFlux — reactive
RouterFunction<ServerResponse> route(...)
route(GET("/users"), handler::getAll)         // [HIDDEN] functional routing
route(POST("/users"), handler::create)

// Feign clients — hidden remote endpoints
@FeignClient(name = "user-service", url = "${service.url}")
@GetMapping("/internal/users")               // [HIDDEN] — remote endpoint call

// JAX-RS (Jersey, RESTEasy, Quarkus)
@Path("/users")
@GET, @POST, @PUT, @DELETE, @PATCH
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
```

### 12.2 Parameter Patterns

```java
@PathVariable String id
@PathVariable("userId") Long userId
@RequestParam String filter
@RequestParam(required = false, defaultValue = "0") int page
@RequestBody UserDto body
@RequestHeader("Authorization") String token
@RequestHeader(value = "X-Tenant-Id", required = false) String tenantId
@CookieValue("session") String session
@MatrixVariable Map<String, String> vars       // [HIDDEN]
@ModelAttribute UserForm form                  // [HIDDEN] form binding
MultipartFile file                             // [HIDDEN] file upload param
```

### 12.3 Validation

```java
// Bean Validation (Jakarta / javax)
@Valid, @Validated
@NotNull, @NotBlank, @NotEmpty
@Size(min=1, max=255)
@Min, @Max, @DecimalMin, @DecimalMax
@Pattern(regexp = "...")
@Email
@Positive, @PositiveOrZero
@Future, @Past
@AssertTrue, @AssertFalse

// Custom constraint                           [HIDDEN]
@Constraint(validatedBy = MyValidator.class)
implements ConstraintValidator<MyAnnotation, String>

// Manual validation
if (dto.getName() == null) throw new ValidationException(...)
bindingResult.hasErrors()
```

### 12.4 Security Annotations

```java
@Secured("ROLE_ADMIN")
@PreAuthorize("hasRole('ADMIN')")
@PreAuthorize("hasAuthority('WRITE') and #id == principal.id")
@PostAuthorize("returnObject.owner == principal.username")  // [HIDDEN]
@RolesAllowed("ADMIN")
@PermitAll, @DenyAll
@EnableMethodSecurity
@EnableGlobalMethodSecurity(prePostEnabled = true)

// Security config DSL                         [HIDDEN]
http.authorizeHttpRequests(auth -> auth
    .requestMatchers("/admin/**").hasRole("ADMIN")
    .requestMatchers("/api/**").authenticated()
    .anyRequest().permitAll()
)
```

### 12.5 Exception / Error Branches

```java
@ExceptionHandler(UserNotFoundException.class)
@ControllerAdvice
@RestControllerAdvice
@ResponseStatus(HttpStatus.NOT_FOUND)
throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "...")

// Typed exceptions to detect as branches
EntityNotFoundException, AccessDeniedException
MethodArgumentNotValidException
HttpMessageNotReadableException
ConstraintViolationException
OptimisticLockingFailureException           // [HIDDEN]
DataIntegrityViolationException             // [HIDDEN]
```

### 12.6 Test Patterns — JUnit 5

```java
// Test annotations
@Test
@ParameterizedTest
@RepeatedTest
@TestFactory                                // [HIDDEN] dynamic test generation
@TestTemplate                               // [HIDDEN]
@Nested                                     // [HIDDEN] nested suites
@DisplayName("human readable name")
@Tag("integration"), @Tag("e2e"), @Tag("smoke")
@Disabled

// Lifecycle
@BeforeEach, @AfterEach, @BeforeAll, @AfterAll
@ExtendWith(SpringExtension.class)
@ExtendWith(MockitoExtension.class)

// Parameterized sources
@ValueSource(strings = {"a", "b"})
@CsvSource({"1,Alice", "2,Bob"})
@MethodSource("provideArgs")               // [HIDDEN] args from static method
@EnumSource(Status.class)
@ArgumentsSource(MyProvider.class)         // [HIDDEN] external provider class
@CsvFileSource(resources = "/data.csv")    // [HIDDEN] external file

// Spring integration test
@SpringBootTest(webEnvironment = RANDOM_PORT)
@WebMvcTest(UserController.class)
@DataJpaTest
@AutoConfigureMockMvc
MockMvc mockMvc
TestRestTemplate restTemplate
WebTestClient webTestClient

// MockMvc fluent assertions                [HIDDEN chain — each .andExpect is an assertion]
mockMvc.perform(get("/users"))
    .andExpect(status().isOk())
    .andExpect(jsonPath("$.name").value("Alice"))
    .andExpect(jsonPath("$.items").isArray())
    .andExpect(header().string("Content-Type", containsString("json")))
```

### 12.7 Repository / DB Patterns

```java
extends JpaRepository<User, Long>
extends CrudRepository<User, Long>
extends MongoRepository<User, String>
extends ReactiveMongoRepository<User, String>  // [HIDDEN] reactive
@Query("SELECT u FROM User u WHERE u.email = :email")
@Query(value = "SELECT * FROM users", nativeQuery = true)
@Modifying @Query("UPDATE ...")             // [HIDDEN] mutating query

// MyBatis
@Mapper
@Select("SELECT * FROM users WHERE id = #{id}")
@Insert, @Update, @Delete, @Results

// JDBC Template
jdbcTemplate.query(sql, rowMapper)
jdbcTemplate.update(sql, params)
namedParameterJdbcTemplate.queryForObject(...)
jdbcTemplate.batchUpdate(sql, batchArgs)    // [HIDDEN]
```

---

## 13. Language Pattern Catalog — Kotlin

### 13.1 Endpoint Patterns

```kotlin
// Spring (same annotations as Java)
@RestController
@GetMapping("/users")

// Ktor
routing {
    get("/users") { ... }
    post("/users") { ... }
    put("/users/{id}") { ... }
    delete("/users/{id}") { ... }
    route("/api/v1") {
        get("/health") { ... }             // [HIDDEN] nested routing block
        authenticate("jwt") {
            get("/secure") { ... }         // [HIDDEN] auth-scoped route
        }
    }
}

// Ktor type-safe routing                  [HIDDEN]
get<UserRoute> { route -> ... }
@Location("/users/{id}") data class UserRoute(val id: Int)
```

### 13.2 Kotlin-specific Test Patterns

```kotlin
// Kotest styles                           [HIDDEN — each style has different node structure]
class UserSpec : FunSpec({ test("creates user") { ... } })
class UserSpec : BehaviorSpec({
    given("a user") { `when`("created") { then("returns 201") { ... } } }
})
class UserSpec : DescribeSpec({
    describe("UserService") { it("creates user") { ... } }
})
class UserSpec : ShouldSpec({ should("return user by id") { ... } })
class UserSpec : StringSpec({ "creates user" { ... } })
class UserSpec : ExpectSpec({ context("UserService") { expect("creates") { ... } } })
class UserSpec : FeatureSpec({ feature("user") { scenario("create") { ... } } })

// Kotest assertions
result shouldBe expected
result shouldNotBe null
result shouldHaveSize 3
result.shouldThrow<NotFoundException>()
result shouldContain "Alice"
result shouldBeInstanceOf User::class
result shouldMatch regex
withClue("message") { result shouldBe expected }  // [HIDDEN] clue wrapper

// Coroutine tests                         [HIDDEN]
runTest { suspendFunction() }
@Test fun `test name`() = runTest { ... }

// Backtick test names                     [HIDDEN — must parse as test name]
@Test fun `user should be created with valid data`() { }

// MockK
mockk<UserRepository>()
spyk(realService)
every { repo.findById(1L) } returns user
every { repo.findById(any()) } returnsMany listOf(user1, user2)  // [HIDDEN]
every { repo.method() } answers { firstArg<Long>() }            // [HIDDEN]
coEvery { repo.suspendMethod() } returns user                    // [HIDDEN] coroutine
slot<User>()                                                     // [HIDDEN] capture
verify(exactly = 1) { repo.save(any()) }
coVerify { repo.suspendSave(any()) }
confirmVerified(repo)
excludeRecords { repo.hashCode() }                               // [HIDDEN]
```

---

## 14. Language Pattern Catalog — JavaScript / TypeScript

### 14.1 Express

```typescript
// Direct registration
app.get('/users', handler)
app.post('/users', handler)
app.put('/users/:id', handler)
app.patch('/users/:id', handler)
app.delete('/users/:id', handler)
app.all('/users', handler)
app.use('/api', router)                    // [HIDDEN] sub-router mount

// Router
const router = express.Router()
router.get('/', handler)
router.route('/users').get(getUsers).post(createUser)  // [HIDDEN] chained

// Middleware-as-endpoint                  [HIDDEN]
app.use((req, res, next) => { res.json({}) })
```

### 14.2 Fastify

```typescript
fastify.get('/users', opts, handler)
fastify.post('/users', { schema: {...} }, handler)
fastify.register(plugin, { prefix: '/api/v1' })  // [HIDDEN] prefix plugin

// Route schema (also validation + param signal)
schema: {
  params: { type: 'object', properties: { id: { type: 'integer' } } },
  body: { ... },
  querystring: { ... },
  response: { 200: { ... }, 404: { ... } }      // [HIDDEN] response schemas
}
```

### 14.3 NestJS

```typescript
// Controller
@Controller('users')
@Controller({ path: 'users', version: '1' })   // [HIDDEN] versioned

// HTTP method decorators
@Get(), @Post(), @Put(), @Patch(), @Delete(), @All(), @Options(), @Head()
@Get(':id'), @Get('search/:term')
@Get(':id/profile')                            // [HIDDEN] nested resource

// Parameters
@Param('id') id: string
@Query('filter') filter: string
@Body() dto: CreateUserDto
@Headers('authorization') auth: string
@Req() req: Request
@Res() res: Response
@Ip() ip: string
@Session() session: Record<string, any>
@HostParam('subdomain') subdomain: string      // [HIDDEN]
@UploadedFile() file: Express.Multer.File      // [HIDDEN]

// Validation (class-validator)
@IsString(), @IsNumber(), @IsEmail()
@IsNotEmpty(), @IsOptional()
@MinLength(3), @MaxLength(100)
@IsEnum(Status)
@ValidateNested({ each: true })               // [HIDDEN]
@Type(() => CreateAddressDto)                 // [HIDDEN] nested transform
@Transform(({ value }) => ...)

// Guards and security
@UseGuards(AuthGuard)
@UseGuards(RolesGuard)
@Roles('admin')
@Public()                                     // [HIDDEN] custom decorator
@SetMetadata('roles', ['admin'])
@ApiSecurity('bearer')

// Exception filters
@UseFilters(HttpExceptionFilter)
@Catch(HttpException)
implements ExceptionFilter
throw new HttpException('Not found', HttpStatus.NOT_FOUND)
throw new NotFoundException()
throw new BadRequestException()
throw new UnauthorizedException()
throw new ForbiddenException()
throw new ConflictException()
throw new InternalServerErrorException()
throw new UnprocessableEntityException()      // [HIDDEN]
```

### 14.4 Test Patterns — Jest

```typescript
// Test structure
describe('UserService', () => { })
it('creates user', () => { })
test('creates user', () => { })
describe.each(table)(name, fn)               // [HIDDEN] parameterized suite
test.each(table)(name, fn)                   // [HIDDEN] parameterized test
it.each`email  | valid`                      // [HIDDEN] tagged template syntax
describe.only, it.only, test.only
describe.skip, it.skip, test.skip

// Lifecycle
beforeAll, afterAll, beforeEach, afterEach

// Assertions
expect(x).toBe(y)
expect(x).toEqual(y)
expect(x).toStrictEqual(y)
expect(x).toMatchObject({ name: 'Alice' })
expect(x).toContain(item)
expect(x).toHaveLength(3)
expect(fn).toThrow(), expect(fn).toThrow(Error), expect(fn).toThrow('msg')
expect(spy).toHaveBeenCalledWith(args)
expect(spy).toHaveBeenCalledTimes(n)
expect(x).toMatchSnapshot()                  // [HIDDEN]
expect(x).toMatchInlineSnapshot(`...`)        // [HIDDEN]
expect.assertions(n)                          // [HIDDEN] asserts count guard
expect.hasAssertions()                        // [HIDDEN]
expect.extend({ toBeValid(r) { } })           // [HIDDEN] custom matcher
expect(user).toBeValid()

// Async
await expect(promise).resolves.toBe(value)
await expect(promise).rejects.toThrow(Error)
```

### 14.5 Mock Patterns — Jest

```typescript
jest.mock('./userService')
jest.mock('./userService', () => ({ getUser: jest.fn() }))
jest.fn()
jest.spyOn(object, 'method')
jest.spyOn(object, 'method').mockReturnValue(value)
jest.spyOn(object, 'method').mockImplementation(() => { })
mockFn.mockResolvedValue(value)
mockFn.mockRejectedValue(error)
mockFn.mockImplementationOnce(fn)             // [HIDDEN] one-shot
jest.useFakeTimers()                          // [HIDDEN] timer mock
jest.advanceTimersByTime(ms)
jest.runAllTimers()
jest.spyOn(global, 'fetch').mockResolvedValue(...)  // [HIDDEN] fetch mock

// __mocks__ directory                        [HIDDEN — not co-located with test]
// __mocks__/userService.ts exports auto-mock implementation

// Module-level mock at top                   [HIDDEN — distance from test body]
jest.mock('axios')
const mockedAxios = axios as jest.Mocked<typeof axios>
```

### 14.6 Supertest / HTTP Test Patterns

```typescript
import request from 'supertest'
request(app).get('/users').expect(200)
request(app).post('/users').send(body).expect(201)
request(app).get('/users').set('Authorization', 'Bearer token').expect(200)
.expect('Content-Type', /json/)
.expect(res => { expect(res.body.name).toBe('Alice') })  // [HIDDEN] callback assertion
```

---

## 15. Language Pattern Catalog — Python

### 15.1 FastAPI

```python
@app.get("/users")
@app.post("/users")
@app.put("/users/{user_id}")
@app.patch("/users/{user_id}")
@app.delete("/users/{user_id}")
@app.options("/users")
@app.head("/users")

# APIRouter
router = APIRouter(prefix="/api/v1", tags=["users"])
@router.get("/users")
app.include_router(router)                    # [HIDDEN] router registration
app.include_router(router, prefix="/v2")      # [HIDDEN] versioned mount

# Parameters
async def get_user(user_id: int)             # path param (type-inferred)
async def search(q: str = Query(...))
async def create(body: UserCreate)            # Pydantic model body
async def auth(token: str = Header(...))
async def cookie(sid: str = Cookie(...))
async def depends(service = Depends(get_service))  # [HIDDEN] DI

# Pydantic validation (v1 and v2)
class UserCreate(BaseModel):
    name: str
    email: EmailStr
    age: int = Field(gt=0, lt=150)
    status: StatusEnum
    tags: List[str] = []
    nested: AddressModel                      # [HIDDEN] nested model

@validator('email')                           # [HIDDEN] field validator v1
@field_validator('email')                     # [HIDDEN] field validator v2
@model_validator(mode='after')                # [HIDDEN] object validator v2

# Security / auth
Depends(get_current_user)                     # [HIDDEN] auth via dependency
@app.get("/admin", dependencies=[Depends(verify_admin)])  # [HIDDEN]
OAuth2PasswordBearer(tokenUrl="token")
HTTPBearer()

# Exception handlers
@app.exception_handler(HTTPException)
raise HTTPException(status_code=404, detail="Not found")
raise HTTPException(status_code=422, detail=[...])
raise RequestValidationError(errors)          # [HIDDEN]
```

### 15.2 Django / DRF

```python
# urls.py
path('users/', views.UserListView.as_view())
path('users/<int:pk>/', views.UserDetailView.as_view())
re_path(r'^users/(?P<pk>\d+)/$', view)
include('users.urls')                         # [HIDDEN] nested URL conf

# ViewSet
class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer

@action(detail=True, methods=['post'])        # [HIDDEN] custom action
@action(detail=False, methods=['get'])
router = DefaultRouter()
router.register(r'users', UserViewSet)

# Function-based views
@api_view(['GET', 'POST'])
def user_list(request): ...

# Permissions
permission_classes = [IsAuthenticated]
permission_classes = [IsAuthenticated, IsAdminUser]
@permission_classes([AllowAny])

# Serializer validation
class UserSerializer(serializers.ModelSerializer):
    def validate_email(self, value): ...      # [HIDDEN] field validator
    def validate(self, data): ...             # [HIDDEN] object validator
    validators = [UniqueTogetherValidator(...)]

# Exceptions
from rest_framework.exceptions import ValidationError, NotFound, PermissionDenied
raise ValidationError("..."), raise NotFound("...")
```

### 15.3 Flask

```python
@app.route('/users', methods=['GET'])
@app.route('/users', methods=['POST'])
@app.route('/users/<int:user_id>', methods=['GET', 'PUT', 'DELETE'])
@blueprint.route('/users')                    # [HIDDEN] Blueprint
app.register_blueprint(users_bp, url_prefix='/api')

# Flask-RESTful
class UserResource(Resource):
    def get(self, user_id): ...
    def post(self): ...
api.add_resource(UserResource, '/users', '/users/<int:user_id>')

@app.errorhandler(404)
@app.errorhandler(ValidationError)
abort(404), abort(400, description="Bad request")
```

### 15.4 Test Patterns — pytest

```python
def test_create_user(): ...
class TestUserService:
    def test_create(self): ...

# Fixtures                                    [HIDDEN — assertions inside fixtures]
@pytest.fixture
def user_service(db): return UserService(db)

@pytest.fixture(autouse=True)               # [HIDDEN] auto-applied
def reset_db(): ...

@pytest.fixture(scope="module")
@pytest.fixture(scope="session")

# conftest.py                                [HIDDEN — shared fixtures across dirs]
# Any conftest.py applies to all tests in its subtree

# Parametrize                                [HIDDEN — variants not individually listed]
@pytest.mark.parametrize("email,valid", [
    ("a@b.com", True),
    ("invalid", False),
])
@pytest.mark.parametrize("user", indirect=True)  # [HIDDEN] indirect fixture

# Marks
@pytest.mark.integration, @pytest.mark.e2e
@pytest.mark.slow, @pytest.mark.skip, @pytest.mark.xfail
@pytest.mark.asyncio                        # async test

# Assertions
assert x == y
assert x is not None
assert x in collection
assert len(x) == 3
with pytest.raises(ValueError): ...
with pytest.raises(ValueError, match="pattern"): ...
```

### 15.5 Django Test Patterns

```python
class UserAPITest(APITestCase):
    def setUp(self): ...
    def test_list(self):
        response = self.client.get('/api/users/')
        self.assertEqual(response.status_code, 200)

    def test_create(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post('/api/users/', data)
        self.assertContains(response, 'Alice')

# Django assertions
self.assertEqual(response.status_code, 200)
self.assertContains(response, text)
self.assertNotContains(response, text)
self.assertRedirects(response, url)
self.assertFormError(response, form, field, error)  # [HIDDEN]
self.assertQuerySetEqual(qs, values)
self.assertRaises(ValueError, fn)
self.assertAlmostEqual(x, y, places=2)      # [HIDDEN]
```

---

## 16. Cross-Language Assertion Patterns

The scanner must detect all of the following regardless of whether they appear directly in the test body or inside a helper, base class, or fixture. Every match must create an `assertion` node.

### 16.1 Java / Kotlin — JUnit 5 + AssertJ + Hamcrest

```java
// JUnit 5
assertEquals(expected, actual)
assertNotEquals(a, b)
assertTrue(condition)
assertFalse(condition)
assertNull(value)
assertNotNull(value)
assertThrows(Exception.class, () -> ...)
assertDoesNotThrow(() -> ...)
assertAll("group", () -> assertEquals(...), () -> assertTrue(...))  // [HIDDEN]
assertIterableEquals(expected, actual)
assertArrayEquals(expected, actual)
assertTimeout(Duration.ofSeconds(1), () -> ...)                     // [HIDDEN]
assertTimeoutPreemptively(Duration.ofSeconds(1), () -> ...)         // [HIDDEN]

// AssertJ
assertThat(x).isEqualTo(y)
assertThat(x).isNotNull()
assertThat(x).isInstanceOf(Type.class)
assertThat(x).satisfies(v -> { ... })        // [HIDDEN] lambda body
assertThat(list).hasSize(3)
assertThat(list).extracting("name").contains("Alice")              // [HIDDEN]
assertThat(list).extracting(User::getName).containsExactly("Alice")// [HIDDEN]
assertThatThrownBy(() -> ...).isInstanceOf(NotFoundException.class)
assertThatCode(() -> ...).doesNotThrowAnyException()
assertThat(x).as("description").isNotNull() // [HIDDEN] described assertion

// Hamcrest
assertThat(x, is(y))
assertThat(list, hasItem("Alice"))
assertThat(x, allOf(notNullValue(), instanceOf(User.class)))       // [HIDDEN]
assertThat(x, either(is("a")).or(is("b")))                         // [HIDDEN]
```

### 16.2 JavaScript / TypeScript

```typescript
// Jest / Vitest
expect(x).toBe(y)
expect(x).toEqual(y)
expect(x).toStrictEqual(y)
expect(x).toMatchObject({...})
expect(x).toContain(item)
expect(x).toHaveLength(3)
expect(fn).toThrow()
expect(spy).toHaveBeenCalledWith(args)
expect(x).toMatchSnapshot()                  // [HIDDEN]
expect(x).toMatchInlineSnapshot(`...`)        // [HIDDEN]
expect.assertions(n)                          // [HIDDEN]
expect.hasAssertions()                        // [HIDDEN]
expect(user).toBeValid()                      // [HIDDEN] custom matcher

// Chai
expect(x).to.equal(y)
expect(x).to.deep.equal(y)
expect(x).to.be.null
expect(x).to.be.an('array')
expect(fn).to.throw(Error)
x.should.equal(y)                             // [HIDDEN] should style
assert.equal(x, y)                            // [HIDDEN] assert style
assert.deepEqual(x, y)
assert.throws(() => fn(), Error)
```

### 16.3 Python

```python
# pytest
assert x == y
assert x is not None
assert x in collection
assert len(x) == 3
pytest.raises(ValueError)
pytest.approx(0.1 + 0.2)

# unittest
self.assertEqual(x, y)
self.assertIn(x, collection)
self.assertIsInstance(x, Type)
self.assertRaises(ValueError, fn)
self.assertAlmostEqual(x, y, places=2)       # [HIDDEN]
self.assertRegex(text, pattern)              # [HIDDEN]
self.assertDictContainsSubset(expected, actual)  # [HIDDEN]
self.assertMultiLineEqual(first, second)     # [HIDDEN]
```

---

## 17. Cross-Language Mock & Stub Patterns

Every pattern below must create a `mock-boundary` node. The real node being replaced must be identified and linked.

### 17.1 Java — Mockito

```java
@Mock UserRepository userRepo
@Spy RealService realService
@Captor ArgumentCaptor<User> captor          // [HIDDEN] capture for assertion
@InjectMocks UserService userService
@MockBean UserRepository userRepo            // Spring Boot context
@SpyBean UserService userService

Mockito.mock(UserService.class)
Mockito.spy(realService)
when(repo.findById(1L)).thenReturn(Optional.of(user))
when(repo.findById(any())).thenThrow(new RuntimeException())
when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0))  // [HIDDEN]
doReturn(value).when(spy).method()
doThrow(exception).when(spy).method()
doAnswer(inv -> ...).when(spy).method()      // [HIDDEN]
doNothing().when(spy).voidMethod()

verify(repo, times(1)).save(any())
verify(repo, never()).delete(any())
verifyNoInteractions(repo)
verifyNoMoreInteractions(repo)
captor.capture(), captor.getValue()          // [HIDDEN] assertion via captor
```

### 17.2 JavaScript — Jest / Sinon

```typescript
jest.mock('module'), jest.mock('module', factory)
jest.fn()
jest.spyOn(obj, 'method')
mockFn.mockReturnValue(val)
mockFn.mockResolvedValue(val)
mockFn.mockRejectedValue(err)
mockFn.mockImplementation(fn)
mockFn.mockImplementationOnce(fn)            // [HIDDEN]
jest.useFakeTimers()                         // [HIDDEN] timer mock
jest.spyOn(global, 'fetch').mockResolvedValue(...) // [HIDDEN]

// Sinon
sinon.stub(service, 'method').returns(value)
sinon.mock(service).expects('method').once()
sinon.fake.returns(value)
sinon.useFakeTimers()                        // [HIDDEN]
```

### 17.3 Python

```python
from unittest.mock import Mock, MagicMock, patch, AsyncMock, call

@patch('module.ClassName')
@patch.object(instance, 'method')
@patch.dict(os.environ, {'KEY': 'value'})    # [HIDDEN] env mock
@patch('builtins.open', mock_open(read_data='...'))  # [HIDDEN]

mock = Mock(return_value=user)
mock = MagicMock()
mock = AsyncMock(return_value=user)          # [HIDDEN] async mock
mock.method.side_effect = ValueError("...")
mock.method.side_effect = [val1, val2]       # [HIDDEN] sequential returns
mock_obj.assert_called_once_with(args)
mock_obj.assert_called_with(args)
mock_obj.assert_not_called()
mock_obj.assert_has_calls([call(1), call(2)])  # [HIDDEN]

# pytest-mock
def test_x(mocker):
    mocker.patch('module.function')
    mocker.patch.object(service, 'method')
    mocker.MagicMock()
    mocker.AsyncMock()                       # [HIDDEN]
```

### 17.4 Kotlin — MockK

```kotlin
mockk<UserService>()
spyk(realService)
relaxed = true                               // [HIDDEN] relaxed mock
every { service.method() } returns value
every { service.method() } throws Exception()
every { service.method() } returnsMany listOf(a, b)  // [HIDDEN]
every { service.method() } answers { firstArg<Long>() }  // [HIDDEN]
coEvery { service.suspend() } returns value  // [HIDDEN] coroutine mock
slot<User>()                                  // [HIDDEN] capture slot
val slot = slot<User>(); every { repo.save(capture(slot)) } just Runs

verify(exactly = 1) { service.method() }
coVerify { service.suspend() }
confirmVerified(service)
excludeRecords { service.hashCode() }        // [HIDDEN]
```

---

## 18. Cross-Language E2E Framework Patterns

### 18.1 Cypress

```typescript
// File patterns
*.cy.ts, *.cy.js, *.spec.ts (inside cypress/)

// Navigation / HTTP calls
cy.visit('/users')
cy.visit(ROUTES.users)                        // [HIDDEN] needs URL resolution
cy.request('GET', '/api/users')
cy.request({ method: 'POST', url: '/api/users', body: {...} })

// Intercepts                                 [HIDDEN — intercepted routes are endpoints]
cy.intercept('GET', '/api/users', fixture).as('getUsers')
cy.intercept('POST', '/api/users').as('createUser')
cy.wait('@createUser').its('response.statusCode').should('eq', 201)

// Assertions
cy.get('[data-testid="user-name"]').should('contain', 'Alice')
cy.get('form').should('be.visible')
cy.url().should('include', '/users')
cy.location('pathname').should('eq', '/users')

// Custom commands                            [HIDDEN — assertion in commands.ts]
cy.login('admin')
Cypress.Commands.add('login', (role) => { cy.request('/api/login', ...) })

// Fixtures
cy.fixture('user.json').as('userData')        // [HIDDEN]
```

### 18.2 Playwright

```typescript
// File patterns
*.spec.ts, *.test.ts (in playwright/), *.e2e.ts

// Navigation
await page.goto('/users')
await page.goto(ROUTES.users)                // [HIDDEN] URL resolution

// API request context
await request.get('/api/users')
await request.post('/api/users', { data: body })
await request.fetch('/api/users', { method: 'DELETE' })

// Route interception                         [HIDDEN]
await page.route('/api/users', route => route.fulfill({ json: mockData }))
await page.route('**/api/**', route => route.continue())

// Assertions
await expect(page).toHaveURL('/users')
await expect(page.locator('[data-testid="name"]')).toHaveText('Alice')
await expect(response).toBeOK()
await expect(page).toHaveTitle('Users')

// Page Object Model                          [HIDDEN — endpoint in page object]
class UserPage {
    async navigate() { await this.page.goto('/users') }
    async assertLoaded() { await expect(this.heading).toBeVisible() }
}
// Scanner must traverse into PageObject class methods
```

### 18.3 Cucumber / Gherkin

```gherkin
# .feature files
Feature: User Management
  Scenario: Create user
    Given I am authenticated as admin
    When I POST to "/api/users" with body {"name": "Alice"}
    Then the response status should be 201
    And the response body should contain "Alice"

  Scenario Outline:
    When I submit email "<email>"
    Then validation result is "<valid>"
    Examples:
      | email      | valid |
      | a@b.com    | true  |
      | invalid    | false |

# Tags
@integration, @e2e, @smoke, @regression, @wip
```

### 18.4 Selenium / WebDriver

```java
// Java
driver.get("http://localhost:8080/users");
driver.findElement(By.id("submit")).click();
new WebDriverWait(driver, Duration.ofSeconds(10))
    .until(ExpectedConditions.visibilityOfElementLocated(By.id("result")));
assertEquals("Alice", driver.findElement(By.id("name")).getText());
```

---

## 19. Cross-Language Hidden / Abstract Layer Patterns

These are the patterns most commonly responsible for false "uncovered" results. The scanner must handle all of them.

### 19.1 Shared Base Test Classes

```java
// Java
public abstract class BaseControllerTest {
    protected MockMvc mockMvc;
    protected void assertOk(ResultActions result) throws Exception {
        result.andExpect(status().isOk());              // assertion here
    }
    protected ResultActions get(String url) throws Exception {
        return mockMvc.perform(MockMvcRequestBuilders.get(url));
    }
}
// Scanner must: detect extends BaseControllerTest, resolve assertOk() and get() bodies
```

```typescript
// TypeScript
class BaseApiTest {
    protected client = supertest(app);
    async assertCreated(path: string, body: object) {
        const res = await this.client.post(path).send(body);
        expect(res.status).toBe(201);                   // assertion here
        return res;
    }
}
// Scanner must: resolve assertCreated(), extract expect(res.status).toBe(201)
```

### 19.2 Fixture Functions Containing Assertions

```typescript
// Jest
function expectUserShape(user: any) {
    expect(user.id).toBeDefined();
    expect(user.email).toMatch(/@/);
    expect(user.createdAt).toBeInstanceOf(Date);
}
// used as: expectUserShape(response.body)
// Scanner must: follow the call, extract all expect() calls inside
```

```python
# pytest
def assert_user_response(response):
    assert response.status_code == 200
    assert "id" in response.json()
    assert response.json()["email"] is not None
# used as: assert_user_response(client.get("/users/1"))
# Scanner must: follow the call, extract all assert statements
```

### 19.3 URL Constants in Shared Files

```typescript
// constants/endpoints.ts
export const API = {
    v1: {
        users: {
            list: '/api/v1/users',
            detail: (id: string) => `/api/v1/users/${id}`,  // [HIDDEN] function form
        }
    }
};

// tests/UserTest.ts
cy.request(API.v1.users.list)
cy.request(API.v1.users.detail('123'))   // scanner must detect function-form URL
```

### 19.4 Parameterized Tests from External Sources

```java
// JUnit 5 @MethodSource
@ParameterizedTest
@MethodSource("provideUserInputs")           // [HIDDEN] — source is a separate method
void testValidation(String email, boolean valid) { ... }

static Stream<Arguments> provideUserInputs() {
    return Stream.of(
        Arguments.of("a@b.com", true),
        Arguments.of("invalid", false)
    );
}
// Scanner must: find provideUserInputs(), parse the Stream, create param-variant nodes
```

```python
# pytest indirect fixtures
@pytest.mark.parametrize("user_fixture", ["admin", "readonly"], indirect=True)
def test_access(user_fixture, client):
    response = client.get('/api/protected')
    assert response.status_code == 200
# Scanner must: detect indirect=True, record variant count = 2
```

### 19.5 Dynamic Test Factories

```java
// JUnit 5 @TestFactory
@TestFactory
Stream<DynamicTest> testAllEndpoints() {
    return endpoints.stream().map(endpoint ->
        DynamicTest.dynamicTest("test " + endpoint, () -> {
            mockMvc.perform(get(endpoint)).andExpect(status().isOk());
        })
    );
}
// Scanner must: detect @TestFactory, attempt to resolve endpoints list, mark as dynamic
```

```typescript
// Jest dynamic test generation
const endpoints = ['/users', '/orders', '/products'];
endpoints.forEach(endpoint => {
    test(`GET ${endpoint} returns 200`, async () => {
        const res = await request(app).get(endpoint);
        expect(res.status).toBe(200);
    });
});
// Scanner must: detect forEach loop over string array, expand to test variants
```

### 19.6 Mixin / Trait Test Patterns

```python
# Python mixin
class AuthMixin:
    def assert_requires_auth(self, url):
        response = self.client.get(url)
        self.assertEqual(response.status_code, 401)   # assertion here

class UserViewTest(AuthMixin, APITestCase):
    def test_list_requires_auth(self):
        self.assert_requires_auth('/api/users/')      # no visible assertion
# Scanner must: resolve AuthMixin.assert_requires_auth(), extract assertEqual
```

---

## 20. Scanner Behavioral Rules & Hard Limits

These rules are non-negotiable. Violating any of them is a scanner defect, not a configuration option.

### 20.1 Completeness Rules

**RULE-01 — Never discard a node due to resolution failure.**
If abstract layer traversal fails, the node must still be created with `resolution: partial` and the failure recorded in diagnostics. Silent discard is forbidden.

**RULE-02 — Never skip a file due to encoding or parse errors.**
If a file cannot be parsed, record it in `filesSkipped` with the error reason. Continue scanning all other files.

**RULE-03 — Never assume a test has no assertions because no assertion is visible in its direct body.**
Always apply abstract layer traversal (up to depth 5) before marking `assertionSource: unresolved`.

**RULE-04 — Never classify a mock-covered path as integration-covered.**
A test that mocks its dependencies has not exercised the real integration path. This must be enforced in graph merge regardless of the test's directory location or naming.

**RULE-05 — Never silently cap at depth limit.**
When traversal depth 5 is reached, the node must be marked `resolution: partial`, the unresolved chain must be recorded, and a diagnostic entry must be emitted.

### 20.2 Accuracy Rules

**RULE-06 — Confidence must reflect the worst contributor on the path, not the best.**
If any node on the coverage path has a `mock-boundary`, the entire path is capped at `medium`. If any node has `resolution: partial`, the path is capped at `medium`.

**RULE-07 — Parameterized tests must not be counted as a single test.**
Each variant must be a separate `param-variant` node. Aggregate coverage statistics must not count a parameterized test as "1 test" unless it has exactly 1 variant.

**RULE-08 — URL resolution must not be assumed from partial matches.**
If a URL constant resolves to a string that does not match any known endpoint pattern, it must be stored as `url-resolution: symbolic`, not silently matched to the closest endpoint.

**RULE-09 — DAST must not override AST node types.**
If DAST finds a route not in AST, it must create a new node with `sourceStage: dast` and emit a conflict. It must not modify the AST node.

**RULE-10 — Dynamic test factories must not be silently skipped.**
`@TestFactory`, `test.each` loops, `forEach` test generation — all must create at minimum one node with `type: dynamic-test-factory`. If variants cannot be statically resolved, `variantCount: unresolvable` must be set.

### 20.3 Output Rules

**RULE-11 — Every scan must produce a complete output even if all stages fail.**
The output schema must always be present. Empty arrays and zero counts are valid. Null output is not.

**RULE-12 — Diagnostics must always include files scanned and files skipped.**
Every stage must emit `filesScanned: [...]` and `filesSkipped: [{file, reason}]`.

**RULE-13 — Conflicts must always include suggested actions.**
Every `conflict` node must have a non-empty `suggestedAction` field. Generic "investigate further" is not acceptable. The suggestion must be specific to the conflict type.

**RULE-14 — Summary statistics must be computed last, after graph merge.**
No intermediate stage may write to the `summary` block. It is populated exclusively by Stage 6.

### 20.4 Performance Rules

**RULE-15 — AST traversal must not follow circular imports.**
The engine must maintain a visited-file set per traversal chain. Circular imports must be detected and broken with a `cycle-detected` flag on the node.

**RULE-16 — No stage may block on a single file for more than 30 seconds.**
Files that exceed the timeout must be added to `filesSkipped` with `reason: timeout`.

**RULE-17 — DAST probing must respect a configurable rate limit.**
Default: 10 requests/second. The limit must be configurable. Probing must never proceed without a rate limit set.

---

## 21. Test Writing Requirements

The scanner engine itself must be covered by the following tests. This section defines what tests must exist, what they must cover, and what patterns they must use.

### 21.1 Unit Tests

Unit tests must cover every detection function in isolation, with all external dependencies mocked.

**Required unit test files:**

```
tests/unit/
├── ast/
│   ├── endpoint-detector.test.ts        # all endpoint annotation patterns per language
│   ├── param-extractor.test.ts          # all parameter patterns per language
│   ├── assertion-detector.test.ts       # all assertion patterns per language
│   ├── mock-boundary-detector.test.ts   # all mock patterns per language
│   ├── traversal.test.ts                # abstract layer traversal, depth limit, cycles
│   └── url-resolver.test.ts             # constant resolution, nested objects, function forms
├── tia/
│   ├── layer-classifier.test.ts         # unit/integration/e2e classification
│   ├── param-expander.test.ts           # parameterized test expansion
│   └── mock-boundary-recorder.test.ts   # mock boundary creation and linking
├── confidence/
│   ├── scorer.test.ts                   # all confidence scoring rules
│   └── mock-cap.test.ts                 # mock boundary caps confidence at medium
└── merge/
    ├── conflict-detector.test.ts        # all conflict types
    └── merge-rules.test.ts              # all merge rule combinations
```

**Unit test requirements:**

- Every pattern in Sections 12–19 must have at least one unit test that verifies it is detected correctly
- Every `[HIDDEN]` pattern must have a dedicated unit test proving it is not missed
- Every behavioral rule in Section 20 must have a unit test for the violation case (i.e., the test must fail if the rule is broken)
- Parameterized test patterns must expand correctly — test with 0, 1, 3, and 10 variants
- Abstract layer traversal must be tested at depths 1, 2, 3, 5, and 6 (depth 6 must produce `resolution: partial`)
- URL constant resolution must be tested for: direct string, one-level object property, two-level nested, function-form, unresolvable

**Unit test code standards:**

```typescript
// Each unit test must follow this pattern:
describe('EndpointDetector', () => {
    describe('Java Spring Boot', () => {
        it('detects @GetMapping on method', () => { ... })
        it('detects @GetMapping with produces= attribute', () => { ... })
        it('detects RouterFunction functional routing [HIDDEN]', () => { ... })
        it('detects @FeignClient as remote endpoint [HIDDEN]', () => { ... })
    })
    describe('NestJS', () => {
        it('detects versioned @Controller [HIDDEN]', () => { ... })
        ...
    })
})
```

### 21.2 Integration Tests

Integration tests must run the full scan pipeline (or a subset of stages) against real fixture codebases. They must not mock internal scanner stages.

**Required integration test files:**

```
tests/integration/
├── pipeline/
│   ├── sca-to-ast.test.ts               # SCA output feeds correct AST heuristics
│   ├── ast-to-tia.test.ts               # AST graph feeds TIA correctly
│   ├── tia-to-merge.test.ts             # TIA feeds graph merge
│   └── full-pipeline.test.ts            # SCA→AST→TIA→Merge (static-only mode)
├── fixtures/
│   ├── java-spring/                     # minimal Spring Boot project
│   ├── typescript-nestjs/               # minimal NestJS project
│   ├── python-fastapi/                  # minimal FastAPI project
│   ├── with-base-class/                 # project with abstract test base class
│   ├── with-url-constants/              # project using URL constant maps
│   ├── with-mock-boundaries/            # integration tests that mock dependencies
│   └── with-parameterized-tests/        # parameterized test patterns
└── assertions/
    ├── abstract-layer-traversal.test.ts # full pipeline on with-base-class fixture
    ├── url-constant-resolution.test.ts  # full pipeline on with-url-constants fixture
    └── confidence-scoring.test.ts       # verify confidence levels on known fixtures
```

**Integration test requirements:**

- The `with-base-class` fixture must produce `assertionSource: inherited` for at least one node
- The `with-url-constants` fixture must produce at least one resolved literal URL from a constant
- The `with-mock-boundaries` fixture must produce `coverageClass: mock-covered` for at least one integration test
- The `with-parameterized-tests` fixture must produce multiple `param-variant` nodes
- Every integration test must assert on the final `coverageMap` output schema, not on intermediate stage outputs
- Integration tests must run in under 30 seconds each

### 21.3 Cypress E2E Tests

Cypress tests cover the scanner's HTTP API surface (report endpoint, scan trigger endpoint, status endpoint) from the outside.

**Required Cypress test files:**

```
cypress/e2e/
├── scan-api/
│   ├── trigger-scan.cy.ts               # POST /api/scans — starts a scan
│   ├── scan-status.cy.ts                # GET /api/scans/:id/status
│   ├── scan-results.cy.ts               # GET /api/scans/:id/results
│   └── scan-errors.cy.ts                # error responses, validation, 404
├── coverage-report/
│   ├── coverage-map.cy.ts               # coverage map structure and fields
│   ├── confidence-levels.cy.ts          # confidence values present in output
│   └── conflict-listing.cy.ts           # conflicts surfaced in diagnostics
└── fixtures/
    ├── sample-scan-request.json
    └── expected-coverage-map.json
```

**Cypress test requirements:**

- All Cypress tests must use `cy.intercept()` for any external dependencies, never real network calls
- URL patterns in tests must use a shared `ROUTES` constant file (to test the scanner's own URL constant resolution — dogfooding)
- Each test must assert on `cy.response().its('status')` AND on at least one body field
- Tests must cover: 200, 201, 400, 404, 422, 500 response codes
- Tests must cover authenticated and unauthenticated requests
- All `cy.visit()` and `cy.request()` calls must use base URL from `cypress.config.ts`, never hardcoded

### 21.4 Documentation Tests

Documentation tests verify that all code examples in this document (and in generated reports) are syntactically valid and produce the expected output.

**Required doc test files:**

```
tests/doctests/
├── yaml-schemas.test.ts                 # all YAML schemas in this doc are valid
├── code-examples.test.ts                # all code snippets compile without errors
└── output-contracts.test.ts            # coverageMap output matches documented schema
```

**Documentation test requirements:**

- Every YAML schema block in this document must be validated against the live TypeScript interface definitions
- Every code example tagged as a test pattern must be parseable by the scanner's own AST parser (dogfooding)
- The `coverageMap` output schema must match the TypeScript types exactly — no fields in the schema that are not in the type, and no fields in the type that are not in the schema
- Doc tests must be run in CI on every PR that modifies this document

---

## 22. Self-Scanning & Example Project Obligations

### 22.1 Self-Scanning

The scanner must be able to scan its own source code and produce a valid coverage map. This is a mandatory CI step, not an optional check.

**Self-scan must produce:**

- At minimum `medium` confidence for every public function in the scanner's API layer
- Zero `uncovered` nodes in the scanner's own endpoint definitions
- At least one `verified` confidence node (the scan trigger endpoint, covered by Cypress)
- A `summary.coverageByLayer` showing coverage in at least `unit`, `integration`, and `e2e` layers

**Self-scan behavioral rules:**

- The self-scan must run as part of `npm test` / `pytest` / `gradle test`
- The self-scan must fail the build if `summary.uncoveredEndpoints > 0`
- The self-scan must fail the build if `summary.conflictCount > 10` (more than 10 unresolved conflicts indicates scanner drift)
- The self-scan result must be written to `coverage-report/self-scan-latest.json` and committed on main branch

**Self-scan scope:**

```
src/                         # scanner source — must be scanned
├── ast/                     # AST stage implementation
├── tia/                     # TIA stage implementation
├── iast/                    # IAST stage implementation
├── dast/                    # DAST stage implementation
├── merge/                   # Graph merge implementation
├── api/                     # HTTP API layer
└── output/                  # Output schema and serializers

tests/                       # scanner tests — must be scanned as test artifacts
cypress/                     # E2E tests — must be scanned as e2e artifacts
```

### 22.2 Example Project Scanning

The scanner must ship with an `examples/` directory containing at minimum one project per supported language. Each example project must be scannable by the scanner and must produce a known, committed coverage map.

**Required example projects:**

```
examples/
├── java-spring-boot/
│   ├── src/main/java/          # Spring Boot REST API
│   ├── src/test/java/          # JUnit 5 tests (unit + integration + MockMvc)
│   └── expected-coverage.json  # committed expected output
│
├── kotlin-ktor/
│   ├── src/main/kotlin/
│   ├── src/test/kotlin/        # Kotest tests
│   └── expected-coverage.json
│
├── typescript-nestjs/
│   ├── src/                    # NestJS controllers + services
│   ├── test/                   # Jest unit tests
│   ├── test/integration/       # Supertest integration tests
│   └── expected-coverage.json
│
├── python-fastapi/
│   ├── app/                    # FastAPI routes + services
│   ├── tests/unit/             # pytest unit tests
│   ├── tests/integration/      # pytest integration tests
│   └── expected-coverage.json
│
└── mixed-abstract-layers/
    ├── (any language)
    ├── # Must contain: base test class, URL constant map,
    │   # parameterized tests, mock boundaries, helper utilities
    └── expected-coverage.json
```

**Example project scanning requirements:**

- Every example project must produce a coverage map that **exactly matches** its `expected-coverage.json`
- This match is enforced in CI via `npm run scan:examples` / equivalent
- If the scanner output diverges from `expected-coverage.json`, the build fails
- `expected-coverage.json` must be updated manually with a review step — it cannot be auto-updated by CI
- The `mixed-abstract-layers` example must produce:
  - At least one node with `assertionSource: inherited`
  - At least one node with `assertionSource: fixture`
  - At least one node with `url-resolution: literal` resolved from a constant
  - At least one `mock-boundary` node
  - At least one `param-variant` node

**Example project scan command:**

```bash
# Run scanner on all example projects and compare to expected output
npm run scan:examples

# Run scanner on a specific example
npm run scan -- --project examples/java-spring-boot --compare expected-coverage.json

# Run self-scan
npm run scan:self

# Run full test suite including self-scan and example project scans
npm test
```

---

## 23. Acceptance Criteria

Feature 24 is complete when **all** of the following conditions are met.

### Pipeline

- [ ] Pipeline executes in order: SCA → AST → TIA → IAST → DAST → Graph Merge
- [ ] Pipeline produces valid output when IAST and DAST are unavailable (static-only mode)
- [ ] Each stage emits its own diagnostic block with `filesScanned` and `filesSkipped`
- [ ] No stage mutates the output of a previous stage

### Pattern Recognition

- [ ] All endpoint patterns in Sections 12–15 are recognized
- [ ] All `[HIDDEN]` patterns in Sections 12–19 are recognized and tested
- [ ] All assertion patterns in Section 16 create `assertion` nodes
- [ ] All mock patterns in Section 17 create `mock-boundary` nodes
- [ ] All E2E patterns in Section 18 are classified correctly

### Abstract Layer Traversal

- [ ] Inheritance chain resolution works to depth 5
- [ ] Import-based helper resolution works to depth 5
- [ ] Fixture injection resolution works for all supported frameworks
- [ ] URL constant resolution handles direct strings, nested objects, and function forms
- [ ] Depth cap produces `resolution: partial`, never silent discard
- [ ] Circular imports are detected and broken

### Parameterized Tests

- [ ] All parameterized patterns produce `param-variant` nodes
- [ ] `@MethodSource` is resolved to variant count
- [ ] Unresolvable sources are recorded as `variantCount: unresolvable`
- [ ] Dynamic test factories (`@TestFactory`, `test.each`) produce at least one node

### Mock Boundaries

- [ ] All mock patterns from Section 17 produce `mock-boundary` nodes
- [ ] Mock-covered paths never reach `confidence: high`
- [ ] `mockType` is recorded for every boundary

### Graph & Confidence

- [ ] All merge rules from Section 8 are applied correctly
- [ ] All conflict types from Section 8 are emitted
- [ ] Confidence reflects the weakest contributor on each path
- [ ] Summary statistics are computed after graph merge only

### Behavioral Rules

- [ ] All 17 rules from Section 20 are enforced
- [ ] Each rule has a corresponding unit test for the violation case

### Tests

- [ ] All unit test files from Section 21.1 exist and pass
- [ ] All integration test files from Section 21.2 exist and pass
- [ ] All Cypress test files from Section 21.3 exist and pass
- [ ] All doc test files from Section 21.4 exist and pass
- [ ] All tests run in CI on every PR

### Self-Scanning

- [ ] Self-scan runs as part of `npm test`
- [ ] Self-scan produces ≥ `medium` confidence for all public API functions
- [ ] Self-scan fails build if `uncoveredEndpoints > 0`
- [ ] Self-scan result committed to `coverage-report/self-scan-latest.json`

### Example Projects

- [ ] All 5 example projects exist and are scannable
- [ ] Every example project matches its `expected-coverage.json`
- [ ] `mixed-abstract-layers` produces all required node types
- [ ] `npm run scan:examples` fails if output diverges from expected

---

## 24. Expected Analyzer Insights

The engine must be capable of generating the following classes of insight from its output. Each insight type must be tested in the integration test suite.

```
"This endpoint is structurally defined, runtime-observed, and exercised by both
 integration and E2E tests — confidence: verified."

"This workflow has E2E coverage but the service-layer error branches are never
 triggered in any test layer — coverageClass: uncovered for exception-branch nodes."

"Security dependencies exist but no test validates the authentication path. The
 endpoint returns 401 in DAST probing, confirming auth is enforced but untested."

"This integration test mocks the repository layer — service logic has
 mock-covered confidence; database interaction is not confirmed."

"Assertion for POST /api/users was found in BaseApiTest.assertCreated(),
 resolved via inheritance from UserApiTest at depth 2 — assertionSource: inherited."

"Endpoint GET /admin/reports is defined in AST but was not reachable during DAST
 probing — conflict: dast-unreachable, possible auth restriction or missing route
 registration."

"Parameterized test testEmailValidation expanded to 6 variants —
 5 variants covered validation success path, 1 variant covered validation error path."

"URL constant ROUTES.v1.users.list resolved to '/api/v1/users' from
 config/routes.ts — url-resolution: literal, endpoint linked."

"URL ROUTES.admin.secret could not be statically resolved —
 url-resolution: symbolic, confidence capped at medium."

"Dynamic test factory testAllEndpoints detected — variantCount: unresolvable,
 endpoint list is runtime-dynamic. Manual review required."
```
