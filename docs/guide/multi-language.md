# Multi-Language Test Support

The analyzer can detect API calls and measure endpoint coverage in test suites written in **TypeScript, JavaScript, Java, Kotlin, Python, Ruby, and Cucumber/Gherkin**.

## How language detection works

By default (`--language auto`) the analyzer inspects each test file's extension and selects the appropriate HTTP-call extractor:

| Extension | Language | Extractor |
|-----------|----------|-----------|
| `.ts`, `.tsx` | TypeScript | JS/TS patterns (supertest, axios, fetch) |
| `.js`, `.jsx` | JavaScript | JS/TS patterns |
| `.java` | Java | RestAssured, MockMvc, WebTestClient, OkHttp |
| `.kt`, `.kts` | Kotlin | Ktor client, Kotest + RestAssured |
| `.py` | Python | requests, httpx, Flask/Django test client |
| `.rb` | Ruby | Rails request specs, HTTParty, Faraday |
| `.feature` | Cucumber | Gherkin steps + step-definition files |

You can also declare languages explicitly with `--language <lang>` (see [CLI Reference](/reference/cli#supported-languages)).

## Supported frameworks

### Java

| Framework | Detection patterns |
|-----------|--------------------|
| **RestAssured** | `.when().get("/path")`, `.when().post("/path")`, `given().get("/path")`, `RestAssured.get("/path")` |
| **Spring MockMvc** | `perform(get("/path"))`, `perform(post("/path"))`, `perform(MockMvcRequestBuilders.get("/path"))` |
| **Spring WebTestClient** | `webTestClient.get().uri("/path")`, `webTestClient.post().uri("/path")` |
| **OkHttp / Ktor client** | `client.get("/path")`, `client.post("/path")` |
| Quoted method strings | `"GET /path"`, `"POST /path"` (in test descriptions or assertions) |

Recognised test runners: **JUnit 4**, **JUnit 5**, **TestNG**, **Kotest** (for Kotlin).

### Kotlin

The Kotlin extractor uses the same patterns as Java (RestAssured, MockMvc, WebTestClient) and additionally recognises:

| Framework | Detection patterns |
|-----------|--------------------|
| **Ktor client** | `client.get("$baseUrl/path")`, `client.post("$baseUrl/path")` |
| **Kotest** | `describe / context / it` blocks containing HTTP calls |

### Python

| Framework | Detection patterns |
|-----------|--------------------|
| **requests** | `requests.get('/path')`, `requests.post('/path')`, full URLs (`http://host/path`) |
| **httpx** | `httpx.get('/path')`, `httpx.post('/path')` |
| **Flask test client** | `client.get('/path')`, `client.post('/path')` |
| **Django test client** | `self.client.get('/path')`, `self.client.post('/path')` |
| Quoted method strings | `'GET /path'`, `"POST /path"` |

Recognised test runners: **pytest**, **unittest**.

### Ruby

| Framework | Detection patterns |
|-----------|--------------------|
| **Rails request specs** | `get '/path'`, `post '/path'`, `put '/path'`, `delete '/path'` |
| **HTTParty** | `HTTParty.get('/path')`, `HTTParty.post('/path')` |
| **Faraday** | `conn.get('/path')`, `connection.post('/path')` |
| Quoted method strings | `"GET /path"`, `'POST /path'` |

Recognised test runners: **RSpec**, **Minitest**, Rails integration tests.

### Cucumber / Gherkin

The Cucumber extractor processes both `.feature` files and step-definition source files.

**Feature file step patterns:**

```gherkin
When I send a GET request to /users
When I make a POST request to /users
When I call "GET /users"
```

**Step definition files** (`.java`, `.kt`, `.py`, `.rb`, `.js`, `.ts`) are scanned using the respective language extractor. For example, a Ruby step definition that calls `HTTParty.get('/users')` will be counted as a `GET /users` call.

Supported Gherkin parsers: any — the extractor reads raw `.feature` text using lightweight regex patterns.

## Running multi-language analysis

### Single language

```bash
# Java
node dist/index.js endpoint-coverage \
  --spec openapi.yaml \
  --tests "src/test/**/*.java" \
  --language java

# Python
node dist/index.js endpoint-coverage \
  --spec openapi.yaml \
  --tests "tests/**/*.py" \
  --language python

# Ruby RSpec
node dist/index.js endpoint-coverage \
  --spec openapi.yaml \
  --tests "spec/**/*.rb" \
  --language ruby

# Cucumber
node dist/index.js endpoint-coverage \
  --spec openapi.yaml \
  --tests "features/**/*.feature" \
  --language cucumber
```

### Multiple languages in one run

Pass a comma-separated list or repeat the flag. The analyzer scans all matching test files and aggregates coverage:

```bash
node dist/index.js endpoint-coverage \
  --spec openapi.yaml \
  --tests "{src/test/**/*.java,spec/**/*.rb}" \
  --language java,ruby \
  --threshold-endpoint 80
```

### Auto-detection (default)

When no `--language` is given, the analyzer infers the language of each file from its extension. This works seamlessly for mixed-language test directories:

```bash
node dist/index.js endpoint-coverage \
  --spec openapi.yaml \
  --tests "{src/test/**/*.java,tests/**/*.py,spec/**/*.rb}"
```

## Language plugins

Four ready-made plugins are provided for use in CI or custom workflows. Add them to `coverage.config.json` for reporting that is separate from the core endpoint-coverage analysis:

```json
{
  "plugins": [
    "./plugins/java-analyzer.js",
    "./plugins/python-analyzer.js",
    "./plugins/ruby-analyzer.js",
    "./plugins/cucumber-analyzer.js"
  ]
}
```

Each plugin produces a separate `CoverageResult` in the final report:

| Plugin file | Result type | Language |
|-------------|------------|----------|
| `plugins/java-analyzer.js` | `endpoint-java` | Java & Kotlin |
| `plugins/python-analyzer.js` | `endpoint-python` | Python |
| `plugins/ruby-analyzer.js` | `endpoint-ruby` | Ruby |
| `plugins/cucumber-analyzer.js` | `endpoint-cucumber` | Cucumber / Gherkin |

## Sample test files

Sample tests for each language are provided under `sample/tests/`:

```
sample/tests/
├── java/
│   └── UserApiTest.java          # JUnit 5 + RestAssured
├── kotlin/
│   └── UserApiSpec.kt            # Kotest + Ktor client
├── python/
│   └── test_users.py             # pytest + requests
├── ruby/
│   └── users_spec.rb             # RSpec request specs
└── cucumber/
    ├── features/
    │   └── users.feature         # Gherkin scenarios
    └── step_definitions/
        └── users_steps.rb        # Ruby step definitions (HTTParty)
```

All samples target the same `sample/openapi.yaml` spec, covering `GET /users`, `POST /users`, `GET /users/{id}`, `GET /orders`, and `POST /orders` (with `PUT /users/{id}` and `DELETE /users/{id}` left as intentional gaps).

## The `languages` field in reports

After analysis, each endpoint in the JSON report includes a `languages` array listing which language(s) covered it:

```json
{
  "endpoints": [
    {
      "method": "GET",
      "path": "/users",
      "covered": true,
      "testFiles": [
        "src/test/java/UserApiTest.java",
        "tests/test_users.py"
      ],
      "languages": ["java", "python"]
    },
    {
      "method": "DELETE",
      "path": "/users/{id}",
      "covered": false,
      "testFiles": [],
      "languages": []
    }
  ]
}
```

The HTML report renders a **Languages** column in the coverage table so you can see coverage gaps at a glance.

## Writing tests the analyzer can detect

### Java (RestAssured)

```java
@Test
void listUsers_returnsOk() {
    given()
        .when()
        .get("/users")
        .then()
        .statusCode(200);
}
```

### Kotlin (Ktor)

```kotlin
it("returns 200 for GET /users") {
    val response = client.get("$baseUrl/users")
    response.status shouldBe HttpStatusCode.OK
}
```

### Python (pytest + requests)

```python
def test_list_users_returns_200():
    response = requests.get(f"{BASE_URL}/users")
    assert response.status_code == 200
```

### Ruby (RSpec request spec)

```ruby
it 'GET /users returns 200' do
  get '/users'
  expect(response.status).to eq(200)
end
```

### Cucumber (Gherkin)

```gherkin
Scenario: List all users
  When I send a GET request to /users
  Then the response status should be 200
```

```ruby
# step definition
When('I send a GET request to {word}') do |path|
  @response = HTTParty.get("#{BASE_URL}#{path}")
end
```

## Next steps

- [CLI Reference: --language option →](/reference/cli#supported-languages)
- [Extending via Plugins →](/guide/plugins)
- [Writing Effective Tests →](/guide/writing-tests)
