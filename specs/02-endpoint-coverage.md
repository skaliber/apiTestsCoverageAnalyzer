# 02 - Endpoint Coverage

This feature calculates how thoroughly the test suite exercises each API endpoint defined in the specification.

## Objective

Identify which endpoints (combination of path and HTTP method) are tested by existing API tests and compute coverage metrics. Provide a clear report indicating untested endpoints so developers know where to focus new tests.

## Steps for the agent

1. **Parse the API specification**  
   - Read the provided OpenAPI/Swagger document (JSON or YAML).  
   - Extract the list of paths and the operations under each path (e.g. GET `/users`, POST `/payments/{id}`).

2. **Scan the test suite**  
   - Walk through the `tests/` directory and identify files that perform API calls.  
   - Detect which endpoints each test targets. This can be achieved by static analysis (looking for strings containing the base URL and path) or by intercepting HTTP calls during test execution.  
   - Normalise paths by replacing parameter values with path parameters defined in the spec (e.g. `/payments/123` → `/payments/{paymentId}`).

3. **Compute coverage**  
   - For each endpoint from the spec, determine whether there is at least one test exercising it.  
   - Generate a percentage: `(number of tested endpoints \u00f7 total endpoints) \u00d7 100`.  
   - Consider each HTTP method separately.

4. **Report results**  
   - Produce a machine\-readable JSON summary (e.g. `reports/endpoint-coverage.json`) and a human\-readable Markdown or HTML report.  
   - Highlight untested endpoints and group them by path or service domain.

5. **Validation**  
   - Use a sample OpenAPI spec and a sample test suite in `sample/` to verify that the tool correctly identifies tested and untested endpoints.  
   - Manually count endpoints and cross\-check with tool output.  
   - If discrepancies are found, refine the path normalisation or test detection logic until results match manual analysis.

## Completion criteria

The agent should not stop until:
- The endpoint parsing and test scanning routines are implemented.  
- The tool outputs accurate coverage metrics and reports.  
- Validation against a sample project shows that the computed coverage matches manual counts.
