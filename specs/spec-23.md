# Spec 23 — Coverage Analyzer Intelligence & Industry-Grade Diagnostics

## Purpose

This document extends **Spec 23** with more detailed technical guidance, practical implementation advice, and industry-inspired patterns for each analyzer section.

The goal is not only to improve UI explanations but to evolve the analyzer into a **diagnostic engineering tool** that combines ideas from:

- static code analysis
- test coverage analytics
- security scanning
- flow discovery
- AI-generated explainability
- developer-facing diagnostics

This spec is intended to help the implementing agent make better choices about:
- parser selection
- evidence modeling
- section-specific heuristics
- UI component strategy
- empty-state behavior
- recommendation quality
- performance and extensibility

---

## 1. Product Positioning

The analyzer should move beyond “coverage percentage viewer” and become a **coverage evidence platform**.

It should answer these questions clearly:

- What exactly was scanned?
- What was matched directly?
- What was inferred heuristically?
- What evidence is strong vs weak?
- Which project conventions were recognized?
- Which conventions were unsupported?
- What should be tested next?
- What should another AI or engineer inspect next?

The intended end-state is closer to:

```text
API Coverage Analyzer
+ Evidence Explorer
+ Flow Discovery Tool
+ Security Signal Scanner
+ Error Coverage Inspector
+ AI Handoff Layer
```

---

## 2. Recommended Analyzer Architecture

The analyzer should be split into clear layers.

### 2.1 Discovery Layer

Responsible for detecting:
- languages
- frameworks
- package managers
- source roots
- test roots
- spec/config roots
- build systems
- dependency manifests

Recommended outputs:
- detected languages
- detected frameworks
- repository structure snapshot
- likely test directories
- ignored/generated/vendor folders
- parser support matrix for this repo

### 2.2 Parsing Layer

Responsible for:
- AST parsing
- fallback text scanning
- route detection
- annotation detection
- test matcher extraction
- dependency extraction

This layer should expose both:
- structured AST-based evidence
- degraded fallback evidence when parsing fails

### 2.3 Evidence Layer

Responsible for producing normalized evidence items, such as:
- endpoint definitions
- parameter definitions
- business rule hints
- error conditions
- security signals
- integration flows
- performance signals
- matching test evidence

### 2.4 Intelligence Layer

Responsible for:
- confidence scoring
- risk scoring
- gap prioritization
- false-positive detection hints
- false-negative suspicion hints
- AI-friendly narrative generation

### 2.5 Presentation Layer

Responsible for:
- section summaries
- expandable row diagnostics
- markdown rendering
- code evidence
- Mermaid source and visual diagrams
- local validation commands
- fallback templates when section data is sparse

---

## 3. Recommended Parsing and Detection Strategy

AST-first is good, but AST-only is not enough.

Use a **hybrid detection pipeline**:

1. AST parsing where supported
2. framework-specific heuristics
3. normalized string-pattern matching
4. test correlation
5. fallback low-confidence inference

### 3.1 TypeScript / JavaScript

Recommended primary tooling:
- `ts-morph` for TypeScript projects
- Babel parser / ESTree for JavaScript
- optional `tree-sitter` support for broader mixed-mode scanning

Good for detecting:
- imports
- function calls
- router definitions
- decorators
- test syntax
- object literals used in route registration

### 3.2 Java

Recommended primary tooling:
- `JavaParser`

Good for detecting:
- Spring annotations
- method signatures
- exception handlers
- class-level mappings
- test annotations
- assertion patterns

### 3.3 Kotlin

Recommended options:
- Kotlin compiler PSI-based parsing
- fallback text heuristics if PSI integration is too heavy initially

### 3.4 Multi-language strategy

If the project grows, design the engine so language adapters can be plugged in later.

Suggested abstraction:
- `LanguageScanner`
- `FrameworkDetector`
- `EvidenceExtractor`
- `TestMatcher`
- `DiagnosticEmitter`

---

## 4. Evidence Model Upgrade

Instead of only saying “covered yes/no”, create a richer evidence model.

### 4.1 Evidence item structure

```yaml
id: string
itemType: endpoint | parameter | business-rule | flow | security | error | performance | finding
status: covered | uncovered | partial | inferred | unknown
confidence: low | medium | high
detectionMode:
  - direct
  - inferred
  - heuristic
sourceLocations: []
testLocations: []
supportingEvidence: []
contradictingEvidence: []
scannerNotes: []
errors: []
matchedFrameworks: []
matchedLibraries: []
riskScore: 0
depthScore: 0
```

### 4.2 Why this matters

This model supports:
- expandable UI
- confidence-based sorting
- better AI summaries
- traceability
- future diff/trend analysis

---

## 5. Evidence Graph Recommendation

Introduce an internal graph representation.

Example:

```text
Endpoint -> Controller -> Service -> Repository -> Exception -> Test
```

Potential node types:
- endpoint
- route
- controller
- service
- repository
- event publisher
- event consumer
- external dependency
- test case
- assertion
- security mechanism
- error path

Potential edge types:
- defines
- calls
- validates
- throws
- handles
- tests
- asserts
- publishes
- consumes

This graph does not need to be exposed directly in v1 UI, but should be used internally to improve:
- integration flow discovery
- error linking
- recommendation generation
- evidence confidence

---

## 6. Section-by-Section Technical Guidance

## 6.1 Overview

### Problem
Overview currently reports pass/fail too optimistically.

### Technical recommendation
Add a derived interpretation layer using:
- threshold status
- confidence
- evidence depth
- fragility risk
- missing-data warnings

### Suggested derived fields

```yaml
thresholdStatus: pass | fail
confidenceRating: low | medium | high
evidenceDepth: shallow | moderate | deep
fragilityRisk: low | medium | high
blindSpots: []
```

### UI recommendation
Each overview card should expand to show:
- counting logic
- included evidence sources
- excluded evidence sources
- unsupported framework notes
- top files contributing to the score
- top files suspected to contain uncounted coverage

### Good inspiration
The spirit should be similar to how modern engineering dashboards explain not only the metric, but whether the metric is trustworthy.

---

## 6.2 Endpoints

### Problem
Rows show covered/uncovered without explaining route evidence or test evidence.

### Recommended detection inputs
- controller/router annotations
- route registration calls
- GraphQL resolver signatures if applicable
- path constants
- request matchers in tests
- framework-specific endpoint declarations

### Recommended endpoint evidence sources

#### Spring Boot / Java
- `@GetMapping`
- `@PostMapping`
- `@PutMapping`
- `@DeleteMapping`
- `@RequestMapping`

#### Express / Node
- `router.get(...)`
- `router.post(...)`
- `app.use(...)`

#### NestJS
- `@Controller`
- `@Get`
- `@Post`

#### AngularJS / frontend proxy style
- `$http.get(...)`
- `$http.post(...)`
- service wrappers around `$http`
- route config that implies API access patterns

### Matching strategy
Combine:
1. endpoint definition evidence
2. test-side request evidence
3. assertion evidence
4. path normalization
5. method normalization
6. parameter normalization

### Recommended endpoint row details
Each expanded row should show:
- canonical endpoint identity
- matched definitions
- matched tests
- rejected candidate tests
- path normalization notes
- method normalization notes
- confidence rationale
- missing edge cases

### Suggested technical additions
Add a “match explanation” object:

```yaml
matchExplanation:
  routeDefined: true
  routeTestedDirectly: true
  assertionDetected: false
  namingOnlyMatch: false
  normalizedPathMatch: true
```

---

## 6.3 Parameters

### Problem
Coverage often says endpoint covered, but parameter behavior is unclear.

### Recommended parameter sources
- path params
- query params
- request body fields
- validation annotations
- schema validators
- DTO fields
- OpenAPI fragments if present, but not as coverage evidence

### Recommended parameter test signals
- explicit parameterized requests
- invalid/missing parameter tests
- boundary value tests
- assertion on validation messages/status

### UI recommendation
Parameter rows should support expanders showing:
- where parameter was defined
- whether it is required/optional/inferred
- which tests exercised valid cases
- which tests exercised invalid/missing cases
- whether type/range/pattern validation is observed

### Suggested parameter-specific scoring
Separate:
- presence coverage
- validation coverage
- negative-path coverage

---

## 6.4 Business Rules

### Problem
Business rules often exist implicitly in service logic and are not surfaced well.

### Detection ideas
Look for:
- conditional branches
- domain-specific validators
- custom exceptions
- enum-based status gates
- method names suggesting rules
- assertions in tests that verify business outcomes

### Recommended evidence sources
- `if` branches around domain state
- guard clauses
- custom validation utilities
- service-layer exception throws
- tests asserting business semantics, not just status codes

### Recommendation
Create business rule evidence with categories like:
- eligibility rule
- state transition rule
- ownership/access rule
- data integrity rule
- workflow rule

### UI recommendation
Expanded business rule details should show:
- inferred rule statement in plain language
- code evidence
- related tests
- confidence
- gap explanation

---

## 6.5 Integration Flows

### Problem
Flows are shown too simply and lack confidence/explanation.

### Recommended detection sources
- controller → service → repository chains
- service → external client
- event publish / event consume chains
- orchestration methods
- test scenarios that traverse multiple layers

### Strong flow evidence
- a test triggers an entry point
- downstream calls are visible in code
- assertions verify resulting state or response

### Weak flow evidence
- naming-only flow inference
- multi-step code path inferred without matching tests

### Recommended flow extraction output

```yaml
flow:
  id: string
  name: string
  entrypoint: string
  steps: []
  downstreamDependencies: []
  matchedTests: []
  status: covered | uncovered | partial | inferred
  confidence: low | medium | high
```

### Visualization recommendation
Keep Mermaid for portability, but consider designing the model so a richer renderer can be added later.

Use both:
- raw Mermaid source
- rendered Mermaid diagram
- human-readable step list
- pseudocode summary

### Optional future UI path
If flows become large, switch diagram rendering to a richer node-edge UI while keeping Mermaid export for markdown portability.

---

## 6.6 Security

### Problem
“No data available” is too weak and hides whether the scanner looked for anything meaningful.

### Security scan categories
The section should explicitly report whether it scanned for:

- authentication mechanisms
- authorization checks
- token processing
- route guards / filters / interceptors
- validation/sanitization
- CORS and CSRF-related config where relevant
- dependency manifests and security-related libraries
- security-related tests
- insecure patterns if supported

### Stack-specific guidance

#### Spring Boot
Look for:
- Spring Security config
- filter chains
- `@PreAuthorize`
- `@Secured`
- auth exception handlers
- CSRF config
- JWT filters
- test annotations around security contexts

#### Node / Express
Look for:
- auth middleware
- JWT verification
- session middleware
- route-level guards
- validation middleware

#### AngularJS / older frontend repos
Look for:
- route resolve/guard logic
- `$http` interceptors
- token storage/access
- auth service wrappers
- role-based UI guards
- CSP headers only if backend/config artifacts exist in repo

### Recommended UI fallback when no findings exist
Still show:
- files scanned
- manifests scanned
- auth-related signals found or not found
- parser limitations
- unsupported patterns
- suggested next steps based on stack

### Important rule
If the analyzer only detects “security-related file presence”, it must not imply true security coverage.

---

## 6.7 Error Handling

### Problem
Error scenario lists are useful, but not deep enough.

### Recommended error categories
- validation
- authentication
- authorization
- parsing/serialization
- null/guard conditions
- resource not found
- business conflict/state conflict
- infrastructure failure
- upstream dependency failure
- timeout/retry exhaustion

### Recommended code signals
- `throw`
- guard clauses
- validation exceptions
- null checks
- custom exception classes
- framework exception handlers
- fallback methods
- catch-and-map logic

### Recommended test signals
- expected error status assertions
- exception assertions
- error body assertions
- retry/failure-path simulation
- missing auth token tests
- invalid payload tests

### UI recommendation
Each error row should expose:
- source location
- exception type
- category
- related endpoint/component
- matched negative tests
- suggested missing test cases
- pseudocode explanation of failure path

### Suggested “missing test pattern” helper
Generate a targeted template per framework:

```text
Suggested test:
- send request without Authorization header
- expect 401/403
- assert error body contract
- assert no state mutation
```

---

## 6.8 Performance & Resilience

### Problem
The current empty state gives no useful information.

### Recommended performance scan categories
- load testing tools
- performance test folders
- resilience libraries
- timeouts
- retry/backoff
- circuit breakers
- bulkheads
- rate limiting
- caching
- pool sizing config
- request/response timing assertions

### Tool/library signals to search for
- Gatling
- JMeter
- k6
- Locust
- artillery
- resilience4j
- Hystrix
- retry libs
- timeout config
- circuit breaker config
- cache annotations/config
- HTTP client timeout settings
- DB pool settings

### Stack-specific suggestions

#### Spring Boot
Recommend:
- `performance/` or `load-tests/` module
- Gatling Java/Scala scenarios
- resilience tests around downstream failures
- timeout verification
- connection pool sanity checks

#### Node
Recommend:
- k6 or artillery
- timeout assertions
- retry policy verification
- load tests for high-traffic routes

#### Frontend-heavy project
Recommend:
- API mock latency tests
- retry/offline behavior tests
- interceptor timeout handling checks

### Important rule
Do not pretend performance coverage exists just because timeout config is present.

---

## 6.9 Coverage Intelligence

### Problem
The section is too short and does not really prioritize work.

### Recommendation
Make this section the “decision engine”.

It should synthesize:
- section-level confidence
- highest-risk uncovered areas
- likely false positives
- likely false negatives
- weak assertion patterns
- areas where threshold pass is misleading

### Suggested intelligence scoring dimensions
- exposure
- business criticality
- auth sensitivity
- error gap severity
- evidence weakness
- stack parser confidence
- missing negative-path tests
- missing flow coverage

### Example derived concepts
- high route presence, low test depth
- good positive-path evidence, weak negative coverage
- security artifacts present, test evidence absent
- strong endpoint mapping, weak parameter validation
- high error-path density, low negative test evidence

### Recommendation row should include
- title
- rationale
- evidence basis
- affected files
- affected endpoints
- expected effort
- expected value
- suggested owner
- test type recommendation
- confidence

---

## 7. AI-Friendly Analysis Guidance

AI-friendly sections should not be tiny summaries.

They should be treated as:
- engineer-readable explanation
- AI handoff context
- onboarding helper
- review artifact

### Required AI analysis template

```md
### What was analyzed
...

### How it was analyzed
...

### Strong evidence found
...

### Weak or missing evidence
...

### Confidence and caveats
...

### Likely risks
...

### Recommended next actions
...

### AI handoff notes
...
```

### Section-specific requirement
Where useful, embed:
- code fences
- pseudocode
- directory snapshot
- likely local commands
- Mermaid source

### Empty section rule
If no strong findings exist, generate a **context-rich fallback** instead of “No data available”.

---

## 8. Repository Diagnostics and Transparency

The scanner should emit diagnostics globally and per section.

### Recommended diagnostics fields
- scanned paths
- ignored paths
- excluded files
- parse failures
- unsupported syntax/framework patterns
- fallback heuristics triggered
- manifests found
- packages detected
- source/test file counts
- section-specific evidence counts

### Why this matters
This is critical for:
- AngularJS gaps
- mixed monorepos
- partially supported stacks
- debugging false negatives
- debugging suspicious false positives

---

## 9. AngularJS and Hard-to-Parse Legacy Repos

### Problem
AngularJS and similar legacy patterns often break modern AST assumptions.

### Recommended AngularJS-specific heuristics

Detect:
- `angular.module(...)`
- `.controller(...)`
- `.service(...)`
- `.factory(...)`
- `.config(...)`
- ui-router state definitions
- ngRoute config
- `$http`
- wrapper services over `$http`
- custom API client services
- older Jasmine/Karma test layouts

### Confidence guidance
If AngularJS support is heuristic-heavy:
- mark low/medium confidence explicitly
- show which files were parsed only via fallback mode
- show unsupported constructs in diagnostics

### Recommendation
Build an adapter specifically for “legacy JavaScript app conventions” instead of treating AngularJS as normal modern TS/JS only.

---

## 10. Commands and Local Validation Guidance

The analyzer should emit local validation hints derived from project artifacts.

### Potential command sources
- `package.json` scripts
- `pom.xml`
- `build.gradle`
- `Makefile`
- CI workflow files
- test config files
- cypress config
- Playwright config

### Output requirement
Commands must be labeled as:
- detected
- likely inferred
- fallback suggestion

Example:

```bash
# Detected from package.json
npm test

# Likely E2E command
npx cypress run

# Suggested analyzer command
api-coverage-analyzer scan --report coverage-summary.json
```

---

## 11. UI Component Recommendations

The UI should be built from reusable diagnostics-first components.

Suggested components:
- `ExpandableEvidenceRow`
- `EvidencePanel`
- `MatchExplanationPanel`
- `ScanDiagnosticsPanel`
- `AiAnalysisBlock`
- `MermaidSourcePanel`
- `MermaidRenderPanel`
- `LocalValidationPanel`
- `ConfidenceBadge`
- `RiskBadge`
- `CoverageDepthBadge`

### UX guidance
- expanders should open fast
- long AI sections should be readable
- code blocks should be copyable
- filters/search should remain visible
- empty states should still be helpful

---

## 12. Theme Handling Guidance

### Problem
Dark/light mode is broken.

### Recommendation
Centralize theme decisions.

Theme-sensitive elements include:
- tables
- markdown content
- badges
- Mermaid containers
- charts
- code blocks
- expanders
- diagrams

### Important requirement
Covered / partial / uncovered colors must remain accessible in both themes.

### Testing guidance
Include E2E coverage for:
- persisted theme
- section panel rendering in both themes
- diagram legibility
- code block contrast
- table row hover/expand states

---

## 13. Testing Strategy for the Analyzer UI

This work needs both unit and E2E coverage.

### Unit test focus
- confidence scoring
- match explanation formatting
- diagnostics fallback generation
- AI summary templating
- command inference
- empty-state logic
- risk scoring logic

### E2E test focus
- overview expanders
- endpoint row expanders
- parameter row expanders
- business rule row expanders
- integration flow expanders
- Mermaid visual render
- security fallback panel
- performance fallback panel
- intelligence filtering
- dark/light mode
- diagnostics and code block visibility

### Important principle
Do not only verify page loads. Verify evidence visibility and trust-building details.

---

## 14. Performance and Scalability of the Analyzer

Large repositories can make this expensive.

### Recommended implementation ideas
- lazy evaluation for section detail payloads
- caching parse results
- incremental scan support later
- optional worker-based parallel scanning
- normalized evidence objects to avoid duplicate heavy recomputation

### Prioritization
For initial implementation:
1. correctness
2. explainability
3. diagnostics quality
4. performance optimizations

But the data model should not block future scaling work.

---

## 15. Extensibility and Plugin Direction

The analyzer should be designed to support future pluggable detectors.

Example structure:

```text
plugins/
  java/
  node/
  angularjs/
  spring/
  express/
  security/
  performance/
```

Recommended extension points:
- language detector
- framework detector
- evidence extractor
- recommendation enricher
- diagnostics enricher

This will help the project grow without turning the scanner into one giant hardcoded file.

---

## 16. Recommended Prioritization Order

Implement in this order:

### Phase 1 — Trustworthiness foundation
- richer evidence model
- scan diagnostics
- expandable rows
- overview interpretation improvements
- AI fallback templates

### Phase 2 — Section depth
- endpoint evidence expansion
- error handling details
- integration flow explainability
- security fallback depth
- performance fallback depth

### Phase 3 — Intelligence
- better recommendation engine
- confidence scoring improvements
- false-confidence warnings
- ownership/effort suggestions

### Phase 4 — Stack maturity
- AngularJS heuristics
- legacy JS support
- more framework adapters
- plugin model improvements

### Phase 5 — UX polish
- theme fix
- Mermaid improvements
- readability polish
- chart/diagram consistency

---

## 17. Updated Acceptance Criteria

This extended spec is complete only when:

### Overview
- overview cards expose deeper diagnostics
- pass/fail is not presented as confidence
- confidence, depth, and fragility are visible

### Endpoints
- each row expands into evidence-rich diagnostics
- route/test/assertion evidence is visible
- rejected matches are visible where feasible

### Parameters
- parameter-level validation depth is surfaced
- positive vs negative parameter coverage is distinguishable

### Business Rules
- inferred rule explanations are human-readable
- service-layer/domain-rule evidence is surfaced

### Integration Flows
- flow rows are expandable
- Mermaid source is shown
- Mermaid is rendered visually
- flow confidence and evidence are visible

### Security
- empty sections still show meaningful scan context
- security signal presence is separated from actual security test coverage
- unsupported patterns are disclosed

### Error Handling
- every row is expandable
- error categories are visible
- suggested missing tests are concrete and stack-aware

### Performance
- empty sections still explain what was searched
- project-specific performance recommendations are shown
- resilience signals are distinguished from true performance test evidence

### Intelligence
- recommendations are expandable
- rationale and evidence are visible
- false-confidence warnings are surfaced

### Diagnostics
- scanned files and parser limitations are visible
- repo structure snapshot is available
- local validation commands are shown with confidence labels

### Theme
- dark/light rendering works consistently

### Testing
- unit and E2E coverage exist for the new trust/explanation features

---

## 18. Final Instruction to the Implementing Agent

Do not implement this as a cosmetic markdown expansion only.

This work is about:
- evidence transparency
- trustworthiness
- explainability
- stack-aware guidance
- future extensibility

The analyzer should become something an engineer can trust even when the answer is:

- “covered, but weakly”
- “likely uncovered, but parser confidence is low”
- “security signals exist, but test evidence is absent”
- “threshold passed, but confidence remains shallow”
- “the repo was scanned broadly, but this framework is only partially supported”

That honesty is a feature, not a failure.
