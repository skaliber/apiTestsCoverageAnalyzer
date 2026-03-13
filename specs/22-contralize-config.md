entralized Configuration, Optional CLI Flags, and Agnostic Discovery Engine

## Overview

This feature introduces a **centralized configuration system and intelligent discovery engine** for the API Test Coverage Analyzer.

The system must support two key behaviors:

1. **Centralized configuration control** through a single configuration file (`qintel-analyzer.yaml`).
2. **Agnostic project discovery**, allowing the analyzer to operate even when explicit files such as business rules or integration flows do not exist.

The analyzer must be able to automatically infer missing artifacts by analyzing **service code and test code**.

---

# Core Principles

The analyzer must operate according to these principles:

- Configuration is centralized.
- CLI flags are optional overrides.
- The analyzer can run **without configuration files**.
- The analyzer must **not treat specification or rule files as coverage evidence**.
- If rule files are missing, the analyzer must **infer them automatically from code and tests**.

---

# Files That Must NOT Count as Test Coverage Evidence

The analyzer must explicitly **exclude certain file types from coverage calculations**.

These files must be treated as **metadata only**, not as sources of test coverage:

## Excluded from coverage detection

The following files **must never be interpreted as test execution evidence**:

- OpenAPI / Swagger specifications
- Business rule definition files
- Integration flow YAML definitions
- configuration files
- documentation files

Examples:


openapi.yaml
openapi.json
business-rules.yaml
integration-flows.yaml
qintel-analyzer.yaml


These files may define expectations or metadata but **must not be counted as coverage evidence**.

Coverage must only come from:

- executable tests
- test frameworks
- integration test suites
- E2E tests
- BDD scenarios

---

# Agnostic Project Discovery

The analyzer must support **agnostic discovery of project structure**.

This means it must be capable of operating even when explicit files are missing.

The discovery engine must automatically detect:

- API specifications
- service code
- test files
- contracts
- load testing artifacts
- security reports

If these artifacts are not explicitly configured, the analyzer must search for them automatically.

---

# Intelligent Artifact Discovery

The analyzer must attempt to locate the following files automatically if they are not defined in configuration:

### API specifications

Search patterns:


**/openapi.yaml
**/openapi.yml
**/swagger.yaml
**/swagger.yml
**/openapi.json


### Test files

Search patterns:


**/.test.
**/.spec.
**/Test.
**/Tests.


### Contract files


**/.pact.json
/contracts//.json


### Performance test results


/jmeter//.jtl
/k6//.json


### Security reports


/zap//.json
/trivy//.json


---

# Business Rule Inference Engine

If **business rule definition files do not exist**, the analyzer must automatically infer business rules.

This inference must be based on:

- service logic
- validation rules
- authorization logic
- conditional branches
- exception flows

## Example inference sources

Business rules may be inferred from patterns such as:


if (amount > balance)
throw InsufficientFundsException

if (!user.isAdmin())
throw UnauthorizedException

if (request.email == null)
return 400


These must be interpreted as **business constraints**.

The analyzer must generate internal business rule models such as:


rule: insufficient_balance
endpoint: POST /payments
condition: amount > balance
expected_behavior: payment rejected


---

# Integration Flow Inference Engine

If **integration flow YAML files do not exist**, the analyzer must construct flows automatically.

This requires analyzing:

- service code
- API call sequences
- test sequences
- Cucumber scenarios
- chained requests

## Example inferred flow

Test code:


createUser()
login()
createPayment()
refundPayment()


The analyzer should infer a flow:


User lifecycle

POST /users

POST /login

POST /payments

POST /payments/refund


Flows must be generated automatically and used to compute **integration coverage**.

---

# Service-to-Test Mapping Engine

The analyzer must contain an engine capable of mapping:


service code
↓
endpoints
↓
test interactions


The engine must:

1. parse service code
2. detect endpoint definitions
3. detect internal validation logic
4. detect error conditions
5. map tests invoking those endpoints
6. detect sequences of calls

From this information the analyzer must generate:

- inferred business rules
- inferred integration flows
- inferred negative scenarios

---

# Generated Rule Artifacts

If rule files do not exist, the analyzer must internally generate:


.inferred-business-rules.json
.inferred-integration-flows.json


These should be written into the reports directory for transparency.

Example:


reports/inferred-business-rules.json
reports/inferred-integration-flows.json


---

# Configuration Structure

Configuration remains centralized in:


qintel-analyzer.yaml


Example configuration:

```yaml
version: 1

analysis:
  agnosticDiscovery: true
  inferBusinessRules: true
  inferIntegrationFlows: true

inputs:
  spec:
    - ./openapi.yaml

scans:
  endpoint: true
  parameter: true
  business: true
  integration: true
  error: true
  security: true
Reporting Behavior

Reports must clearly indicate whether rules were:

provided explicitly

inferred automatically

Example:

Business Rule Coverage

Source: inferred
Rules detected: 12
Rules covered: 8
Coverage: 66%
Warning Behavior

If explicit rule files are missing, the analyzer should display a warning but continue execution.

Example:

No business-rules.yaml file detected.
Business rules will be inferred automatically.
Testing Requirements

The following scenarios must be tested:

Unit tests

business rule inference

integration flow inference

service-to-test mapping

Integration tests

project with rule files

project without rule files

project with partial rule files

End-to-end tests

Ensure the analyzer produces identical reports regardless of whether rules were:

provided

inferred

Acceptance Criteria

This feature is complete when:

Specification files are excluded from coverage evidence.

Business rule files are excluded from coverage evidence.

Integration flow YAML files are excluded from coverage evidence.

The analyzer can run without rule files.

Business rules can be inferred from service code.

Integration flows can be inferred from test execution patterns.

Generated inferred artifacts are written to reports.

Reports distinguish inferred vs explicit rules.

Tests verify inference behavior.

Documentation explains inference behavior.

Final User Experience

The analyzer must support a fully automatic workflow:

npx api-tests-coverage analyze

Even without configuration or rule files, the analyzer should:

discover the API specification

discover tests

infer business rules

infer integration flows

generate coverage reports
# Configuration Resolution and Override Rules

The analyzer must support a deterministic configuration resolution system.

Configuration values must be resolved using the following precedence order:

1. **CLI flags**
2. **`qintel-analyzer.yaml` configuration file**
3. **built-in default configuration**

Example:

If the configuration file defines:

```yaml
thresholds:
  endpoint: 90

and the CLI command is executed as:

analyze --threshold-endpoint 100

then the effective configuration must be:

endpoint threshold = 100

The analyzer must log configuration overrides clearly:

Configuration override detected:
endpoint threshold overridden via CLI → 100
Default Built-in Configuration

If no configuration file exists, the analyzer must run using a safe built-in configuration.

Example default profile:

analysis:
  agnosticDiscovery: true
  inferBusinessRules: true
  inferIntegrationFlows: true

scans:
  endpoint: true
  parameter: true
  business: true
  integration: true
  error: true
  security: true
  compatibility: true
  performance: true

reports:
  formats:
    - json
    - html
    - junit
    - markdown

This ensures the analyzer is usable immediately without any setup.

File Classification Engine

The analyzer must contain a file classification engine responsible for determining file roles.

The engine must categorize files into the following classes:

Category	Description
specification	API definition files
service_code	application source code
test_code	unit/integration/e2e tests
bdd_scenarios	Cucumber or Gherkin features
contracts	contract testing artifacts
performance	load testing artifacts
security_reports	security scanning outputs
configuration	analyzer configuration
metadata	business rule / integration definitions

Example classification logic:

*.feature → bdd_scenarios
*.test.* → test_code
*.spec.* → test_code
openapi.yaml → specification
business-rules.yaml → metadata
integration-flows.yaml → metadata

Only files classified as test_code or bdd_scenarios may contribute to coverage evidence.

Discovery Engine Architecture

The agnostic discovery system must follow a structured pipeline.

project root
   ↓
file system scan
   ↓
file classification
   ↓
artifact grouping
   ↓
analysis pipelines

Steps:

scan repository tree

classify files

detect language types

group files by function

feed appropriate engines

Language Detection

The analyzer must detect project languages automatically.

Language detection must support:

Java

Kotlin

Python

Ruby

JavaScript

TypeScript

Detection methods include:

file extensions

build files

framework imports

Examples:

pom.xml → Java project
build.gradle → Kotlin/Java
package.json → Node project
requirements.txt → Python
Gemfile → Ruby

Detected languages must influence:

AST parser selection

test framework detection

service code analysis engine

Test Framework Detection

The analyzer must detect which test frameworks are used.

Supported frameworks include:

Java

JUnit

TestNG

RestAssured

Python

pytest

unittest

Ruby

RSpec

Minitest

JavaScript

Jest

Mocha

Cypress

Playwright

BDD

Cucumber

Gherkin

Detected frameworks must determine how test code is parsed.

Coverage Evidence Rules

Coverage evidence must come exclusively from:

executable test functions

BDD scenarios

integration tests

e2e test scripts

Coverage must never be inferred from documentation or configuration.

Examples of valid coverage evidence:

GET /users/{id}
executed inside testUsersById()

Examples of invalid coverage evidence:

GET /users/{id}
defined in openapi.yaml
Inference Safety Rules

When generating inferred rules, the analyzer must ensure:

explicit rule files always take precedence

inferred rules never overwrite explicit rules

inferred rules remain clearly labeled

inferred rules remain traceable to code

Example:

rule_source: inferred
source_location: services/paymentService.ts:42
Inferred Artifact Export

When inference occurs, the analyzer must produce exportable artifacts.

These artifacts allow teams to convert inferred knowledge into explicit definitions.

Generated files:

reports/inferred-business-rules.json
reports/inferred-integration-flows.json
reports/inferred-endpoints.json

Optional CLI export:

analyze --export-inferred-rules

This command generates:

generated-business-rules.yaml
generated-integration-flows.yaml

which users may adopt as official configuration.

AI-Friendly Analysis Output

Each report must include an AI-readable Markdown section summarizing:

missing endpoints

uncovered business rules

missing integration flows

potential negative test scenarios

Example:

## Suggested Tests

POST /payments/refund

Missing coverage scenarios:
- refund with invalid payment id
- refund exceeding payment amount
- unauthorized refund attempt

These summaries must be embedded into report pages but collapsed by default in dashboards.

CI Pipeline Behavior

The analyzer must support CI environments.

When executed in CI:

npx api-tests-coverage analyze

the analyzer must:

discover artifacts

compute coverage

generate reports

emit PR summary

enforce thresholds

Example PR summary:

API Coverage Summary

Endpoint Coverage: 91%
Business Rule Coverage: 76%
Integration Flow Coverage: 63%

Missing coverage:
- POST /payments/refund
- insufficient_balance rule
Performance Considerations

The discovery and inference engine must support:

incremental scanning

caching parsed AST trees

parallel file parsing

configurable call graph depth

The analyzer must remain suitable for large repositories and CI pipelines.

Documentation Requirements

Documentation must clearly explain:

agnostic discovery behavior

inferred rule generation

configuration precedence

excluded files

coverage evidence sources

Examples must demonstrate:

project with explicit rules

project without rule files

inferred coverage behavior

Final Workflow

The analyzer must support the following minimal workflow:

npx api-tests-coverage analyze

Even with no configuration and no rule files, the analyzer must be able to:

discover project structure

locate API specifications

detect service code

detect test files

infer business rules

infer integration flows

compute coverage

generate reports

produce AI-friendly analysis summaries