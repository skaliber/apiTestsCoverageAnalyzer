# Feature 19 — Deep Code Analysis for Endpoint Coverage Resolution

## Status

Proposed → In Implementation

---

## Problem Statement

The current coverage engine detects endpoint coverage only through direct HTTP call extraction from raw test file text using language-specific regex patterns.

This is insufficient for real production repositories where the actual HTTP method or path is hidden behind:

- Constants and enums
- Variables and reassignments
- String concatenation and template literals
- Helper/wrapper methods
- Builder and request object patterns
- Service/client abstractions
- Multi-level method call chains
- Indirect assertion flows

### Examples of Currently Missed Coverage

**TypeScript — constant path:**
```ts
const USERS_PATH = '/users';
client.get(USERS_PATH); // NOT detected today
```

**TypeScript — template literal:**
```ts
const path = `${BASE_URL}/users/${userId}`;
apiClient.get(path); // NOT detected today
```

**Java — static constant:**
```java
public static final String USERS = "/users";
api.get(USERS); // NOT detected today
```

**Python — helper method:**
```python
def build_customer_path(id):
    return f"/customers/{id}"

response = client.get(build_customer_path(customer_id)) # NOT detected today
```

**Kotlin — enum:**
```kotlin
enum class Routes(val path: String) {
    USERS("/users")
}
client.get(Routes.USERS.path) // NOT detected today
```

---

## Goals

1. Extend endpoint coverage analysis beyond direct literal detection
2. Resolve paths and methods hidden behind constants, enums, variables, templates, and helper methods
3. Introduce confidence scoring for each resolved endpoint match
4. Link requests to their associated assertions for coverage quality indication
5. Keep the feature fully configurable and backward-compatible

---

## Architecture

### New Module: `src/coverage/deep-analysis/`

A dedicated semantic resolution layer sitting between raw file parsing and final endpoint coverage matching.

```
src/coverage/deep-analysis/
  types.ts                 — Shared types for deep analysis
  symbolTable.ts           — Symbol extraction and lookup (constants, vars, enums)
  resolveConstants.ts      — Resolve constant/variable references to literal values
  resolveEnums.ts          — Resolve enum member paths
  resolvePaths.ts          — Normalize/resolve path strings (concatenation, templates)
  resolveMethodChains.ts   — Resolve method chaining patterns (builder, fluent)
  resolveRequestWrappers.ts — Resolve request objects and builder patterns
  resolveAssertions.ts     — Link requests to their assertions for confidence
  callGraph.ts             — Lightweight call graph for helper/wrapper method tracing
  deepEndpointResolver.ts  — Orchestrates all resolvers, produces ResolvedHttpCall[]
```

### Updated Data Flow

```
Test files (raw text)
       ↓
  [Deep Analysis Layer]
    symbolTable.ts        — Extract all symbols from file
    resolveConstants.ts   — Resolve const/let/final/val references
    resolveEnums.ts       — Resolve enum.MEMBER references
    resolvePaths.ts       — Evaluate string templates and concatenation
    callGraph.ts          — Build method call map
    resolveMethodChains.ts — Trace method chains to HTTP calls
    resolveRequestWrappers.ts — Detect and expand request objects
    resolveAssertions.ts  — Map response variables to assertion checks
       ↓
  ResolvedHttpCall[]      — Enriched calls with confidence + resolution type
       ↓
  Endpoint matching       — Match against OpenAPI path templates
       ↓
  Coverage report         — Includes deep-analysis metadata per endpoint
```

---

## Key Types

### ResolvedHttpCall

```ts
export type ResolutionType =
  | 'direct'
  | 'constant'
  | 'enum'
  | 'string-template'
  | 'wrapper-method'
  | 'request-builder'
  | 'client-mapping'
  | 'heuristic';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface ResolvedHttpCall {
  method: string;
  path: string;
  normalizedPath?: string;
  sourceFile: string;
  sourceLanguage: string;
  resolutionType: ResolutionType;
  confidence: ConfidenceLevel;
  assertionLinked?: boolean;
  rawCall?: string;
}
```

### SymbolEntry

```ts
export type SymbolKind = 'const' | 'let' | 'var' | 'enum' | 'parameter' | 'property';

export interface SymbolEntry {
  name: string;
  kind: SymbolKind;
  value?: string;        // Statically known literal value
  resolving?: boolean;  // Cycle-break guard
}

export type SymbolTable = Map<string, SymbolEntry>;
```

### DeepAnalysisConfig

```ts
export interface DeepAnalysisConfig {
  enabled: boolean;
  maxCallDepth: number;
  resolveConstants: boolean;
  resolveEnums: boolean;
  resolveStringTemplates: boolean;
  resolveWrappers: boolean;
  resolveRequestBuilders: boolean;
  resolveClientMappings: boolean;
  assertionAware: boolean;
}
```

---

## Symbol Resolution

### Constants (TypeScript/JavaScript)
```ts
const USERS_PATH = '/users';
const BASE = '/api/v1';
```
Resolved by scanning `const|let|var <name> = '<literal>'` patterns.

### Constants (Java)
```java
static final String PATH = "/users";
private static final String BASE = "/api";
```
Resolved by scanning `static final String <name> = "<literal>"` patterns.

### Constants (Python)
```python
USERS_PATH = "/users"
BASE_URL = "http://localhost:8080"
```
Resolved by scanning `<UPPER_NAME> = "<literal>"` patterns at module scope.

### Constants (Kotlin)
```kotlin
const val USERS = "/users"
val BASE = "/api/v1"
```
Resolved by scanning `const val|val <name> = "<literal>"` patterns.

### Enums (TypeScript)
```ts
enum Routes {
  USERS = '/users',
  USER_BY_ID = '/users/{id}',
}
// Usage: client.get(Routes.USERS)
```

### Enums (Java/Kotlin)
```java
enum Routes {
  USERS("/users"), USER_BY_ID("/users/{id}");
  private final String path;
  Routes(String path) { this.path = path; }
}
// Usage: Routes.USERS.getPath()
```

### Enums (Python)
```python
class Routes(Enum):
    USERS = "/users"
```

---

## Path Composition Resolution

### Template Literals (TypeScript)
```ts
const path = `${BASE_URL}/users/${userId}`;
// → resolves to: /users/{userId}
// → normalized: /users/{id}
```

### String Concatenation (Java)
```java
String path = BASE + "/users/" + id;
// → /users/{id}
```

### f-strings (Python)
```python
path = f"{BASE_URL}/users/{user_id}"
# → /users/{user_id} → normalized to /users/{id}
```

### Normalization Rule
Any path segment matching `[0-9a-f]{8,}`, purely numeric, or a captured variable reference is normalized to `{param}`.

Example: `/users/123/orders/abc-def-456` → `/users/{id}/orders/{id}`

---

## Helper / Wrapper Method Resolution

### Same-file helper (TypeScript)
```ts
function getUsers(client) {
  return client.get('/users');
}
getUsers(apiClient); // → resolves to GET /users
```

### Path builder (TypeScript)
```ts
function getUserPath(id: string) {
  return `/users/${id}`;
}
client.get(getUserPath(userId)); // → GET /users/{id}
```

### Java helper method
```java
private String userPath(String id) {
  return "/users/" + id;
}
Response fetchUser(String id) {
  return api.get(userPath(id)); // → GET /users/{id}
}
```

### Python helper wrapper
```python
def fetch_customer(customer_id):
    return client.get(build_customer_path(customer_id))

# build_customer_path returns f"/customers/{customer_id}"
# → resolves to GET /customers/{id}
```

The call graph builds a map of:
```
method_name → { returns: string_or_http_call, calls: [other_methods] }
```

Resolution follows call references up to `maxCallDepth` levels.

---

## Request Object and Builder Pattern Resolution

### TypeScript
```ts
const request = new ApiRequest('GET', '/users');
client.execute(request);
// → GET /users
```

### Java builder
```java
Request request = Request.builder()
    .method(HttpMethod.GET)
    .path("/users")
    .build();
client.execute(request); // → GET /users
```

### Kotlin builder
```kotlin
val request = RequestBuilder().get().path("/users").build()
api.execute(request) // → GET /users
```

### Python
```python
request = ApiRequest(method="GET", path="/users")
client.execute(request) # → GET /users
```

---

## Client Abstraction Mapping

User-defined or inferred mappings convert domain client calls to HTTP calls.

```ts
type ClientMethodMapping = {
  classOrObject: string;
  method: string;
  httpMethod: string;
  pathTemplate: string;
};
```

Example config mapping:
```yaml
coverage:
  endpoint:
    deepAnalysis:
      clientMappings:
        - classOrObject: userClient
          method: getById
          httpMethod: GET
          pathTemplate: /users/{id}
        - classOrObject: payments_client
          method: create_refund
          httpMethod: POST
          pathTemplate: /payments/refund
```

---

## Assertion Awareness

The analyzer tracks response variable assignments and checks if assertions were applied to them.

### TypeScript
```ts
const response = api.get('/users'); // request
expect(response.status).toBe(200);  // assertion linked ✓
```

### Java
```java
Response response = api.get("/users");
assertEquals(200, response.getStatus()); // assertion linked ✓
```

### Python
```python
response = client.get('/users')
assert response.status_code == 200  # assertion linked ✓
```

Assertion-linked calls get `assertionLinked: true` and contribute to `coverageConfidence: high`.

---

## Confidence Scoring

| Scenario | Confidence |
|---|---|
| Direct literal path in call | `high` |
| Constant resolved to literal | `high` |
| Enum resolved to literal | `high` |
| Template resolved with known base | `high` |
| Template with partially resolved segments | `medium` |
| Wrapper method body resolved | `high` (if fully resolved) |
| Wrapper method body partially resolved | `medium` |
| Client mapping (explicit config) | `high` |
| Client mapping (heuristic inference) | `low` |
| Path from concatenation with unknowns | `low` |

---

## Coverage Report Schema Extension

### JSON Report — Endpoint Record

```json
{
  "method": "GET",
  "path": "/users/{id}",
  "covered": true,
  "testFiles": ["tests/users.test.ts"],
  "languages": ["typescript"],
  "matches": [
    {
      "resolutionType": "constant",
      "confidence": "high",
      "assertionLinked": true,
      "rawCall": "client.get(USERS_PATH)"
    }
  ]
}
```

### HTML Report — Additional Columns

- Resolution Type (direct / constant / template / wrapper / etc.)
- Confidence badge (High / Medium / Low)
- Assertion-linked indicator

---

## Configuration

```yaml
coverage:
  endpoint:
    deepAnalysis:
      enabled: true
      maxCallDepth: 4
      resolveConstants: true
      resolveEnums: true
      resolveStringTemplates: true
      resolveWrappers: true
      resolveRequestBuilders: true
      resolveClientMappings: true
      assertionAware: true
      clientMappings: []
```

When `deepAnalysis.enabled: false`, the system falls back to the existing direct regex-based detection. This preserves backward compatibility.

---

## Language Support Matrix

| Feature | TS/JS | Java | Kotlin | Python | Ruby |
|---|---|---|---|---|---|
| Constants | ✅ | ✅ | ✅ | ✅ | Phase 2 |
| Enums | ✅ | ✅ | ✅ | ✅ | Phase 2 |
| String templates | ✅ | ✅ | ✅ | ✅ | Phase 2 |
| Wrapper methods | ✅ | ✅ | ✅ | ✅ | Phase 2 |
| Request builders | ✅ | ✅ | ✅ | ✅ | Phase 2 |
| Client mappings | ✅ | ✅ | ✅ | ✅ | Phase 2 |
| Assertion linking | ✅ | ✅ | ✅ | ✅ | Phase 2 |

---

## Testing Requirements

### Unit Tests (`tests/coverage/deep-analysis/`)

- `symbolTable.test.ts` — Symbol extraction for all languages
- `resolveConstants.test.ts` — Constant resolution for all languages
- `resolveEnums.test.ts` — Enum resolution for all languages
- `resolvePaths.test.ts` — Template and concatenation normalization
- `resolveMethodChains.test.ts` — Builder pattern detection
- `resolveRequestWrappers.test.ts` — Request object extraction
- `resolveAssertions.test.ts` — Assertion linking
- `callGraph.test.ts` — Call graph construction and traversal
- `deepEndpointResolver.test.ts` — Full resolver integration

### Integration Test Fixtures

Each fixture set includes:
- An OpenAPI spec
- Source test files
- Expected coverage output

Fixture locations:
```
tests/fixtures/deep-analysis/
  typescript/
  java/
  kotlin/
  python/
```

### Regression Tests

Cases that were previously missed:
- Path in constant
- Path in enum
- Path from multiple string segments
- Path 2–3 method calls away
- Request object wrapper
- Domain client abstraction
- Multiple requests, only one asserted

---

## Acceptance Criteria

- [ ] Endpoint coverage no longer depends only on direct literal detection
- [ ] Constants resolved across TypeScript, Java, Kotlin, Python
- [ ] Enums resolved across TypeScript, Java, Kotlin, Python
- [ ] String composition (template literals, concatenation, f-strings) resolved
- [ ] Helper and wrapper methods resolved at least one level deep (configurable depth)
- [ ] Request builder / request object patterns supported
- [ ] Assertion-aware linking implemented
- [ ] Confidence scoring in all resolved calls
- [ ] JSON reports include `matches[]` with resolution metadata
- [ ] HTML reports display resolution type and confidence
- [ ] `deepAnalysis` config section supported
- [ ] Backward-compatible when `deepAnalysis.enabled: false`
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Docs updated

---

## Implementation Notes

- The deep analysis layer is purely additive. The existing direct regex extractors remain unchanged.
- When deep analysis produces a call already found by direct extraction, it is deduplicated.
- The `symbolTable` is per-file and not cross-file (v1). Cross-file resolution is a Phase 2 enhancement.
- Call graph resolution within a single file supports up to `maxCallDepth` levels (default: 4).
- Confidence is deterministic: same input always produces same confidence level.

---

## Related Specs

- [02-endpoint-coverage.md](02-endpoint-coverage.md) — Base endpoint coverage spec
- [11-configurability-and-plugins.md](11-configurability-and-plugins.md) — Config system
- [14-documentation-and-onboarding.md](14-documentation-and-onboarding.md) — Docs requirements
