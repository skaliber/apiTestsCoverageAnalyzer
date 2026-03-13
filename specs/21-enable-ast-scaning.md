Migrate the Analyzer from Text/Regex Scanning to a Full Multi-Language AST-Based Analysis Engine

You are an AI coding agent tasked with redesigning the **API Test Coverage Analyzer** so that endpoint/coverage/security/business/integration analysis no longer depends primarily on text scanning and regex heuristics, but instead uses a **comprehensive AST-based architecture across all supported languages**.

This is not a partial upgrade for one or two languages.  
This must be a **multi-language architecture**, designed and implemented so the analyzer can deeply analyze all supported languages in a consistent way.

The supported languages in scope are:

- Java
- Kotlin
- Python
- Ruby
- JavaScript
- TypeScript
- Cucumber with Ruby step definitions
- Cucumber with Java step definitions
- Cucumber with Kotlin step definitions
- Cucumber with JavaScript/TypeScript step definitions if applicable

Your mission is to introduce a true AST-driven static analysis engine that can support:

- deep endpoint resolution
- parameter coverage detection
- business rule mapping
- integration flow mapping
- error coverage inference
- security test/scanner mapping
- assertion-aware coverage confidence
- wrapper/helper/request-builder resolution
- path-template normalization
- cross-language consistency in reporting

Do **not stop** until:
- the architecture is implemented across all supported languages
- the old text/regex-only path is either replaced or kept only as fallback
- all affected reports are updated
- all test layers are updated
- all tests pass
- docs are updated
- examples are updated where needed
- CI still works
- self-analysis still works

---

# 1. Primary Goal

Refactor the analyzer into a **language-agnostic AST analysis platform** with language-specific parsers and analyzers.

The current model is primarily:

```text
file text
→ regex / string heuristics
→ detect HTTP call
→ match endpoint

The target model must become:

source file
→ language parser
→ AST
→ symbol resolution
→ call graph / wrapper resolution
→ HTTP interaction reconstruction
→ assertion linkage
→ endpoint/parameter/business/security mapping
→ coverage/scanning report

This architecture must work comprehensively across all supported languages, not just JavaScript/TypeScript.

2. Supported Language Coverage Requirements
You must define and implement support for all of the following:
Java
Support:
	•	JUnit 4 / 5 style tests
	•	TestNG where feasible
	•	RestAssured patterns
	•	MockMvc / WebTestClient where feasible
	•	helper methods
	•	constants
	•	enums
	•	static constants
	•	request builders
	•	wrapper methods
	•	service/client abstractions
Kotlin
Support:
	•	JUnit / Kotest patterns
	•	Ktor client patterns
	•	Spring Kotlin patterns where feasible
	•	object constants
	•	enums
	•	builders / DSL-like request composition
	•	wrapper methods
	•	helper abstractions
Python
Support:
	•	pytest
	•	unittest where feasible
	•	requests/httpx
	•	FastAPI / Flask / Django test clients where feasible
	•	constants
	•	f-strings
	•	helper functions
	•	wrapper clients
	•	request objects/dicts
Ruby
Support:
	•	RSpec
	•	Minitest where feasible
	•	Rails request specs / integration tests where feasible
	•	HTTParty / Net::HTTP / Faraday patterns
	•	constants
	•	modules
	•	helper methods
	•	wrappers
	•	service objects
JavaScript / TypeScript
Support:
	•	Jest and common Node test patterns
	•	fetch / axios / supertest / request clients
	•	constants
	•	enums
	•	template literals
	•	helper functions
	•	wrapper clients
	•	request builders
	•	service abstractions
Cucumber
Support feature files plus step definitions for:
	•	Ruby
	•	Java
	•	Kotlin
	•	JavaScript/TypeScript if present
The analyzer must:
	•	parse .feature files
	•	resolve step definitions
	•	trace step definitions to underlying HTTP execution paths
	•	map those to endpoints and other metrics

3. Core Architectural Requirement
Create a formal multi-language analysis architecture.
Suggested structure:

src/
  ast/
    parserRegistry.ts
    parseFile.ts
    astTypes.ts
    languageCapabilities.ts

  languages/
    java/
      parser.ts
      symbolResolver.ts
      callResolver.ts
      httpInteractionExtractor.ts
      assertionResolver.ts
      cucumberResolver.ts
    kotlin/
    python/
    ruby/
    javascript/
    typescript/

  coverage/
    endpoint/
    parameter/
    business/
    integration/
    error/
    security/

  analysis/
    symbolTable/
    callGraph/
    requestModel/
    assertionLinking/
    confidence/
    pathNormalization/

You may refine the structure, but the final design must clearly separate:
	•	generic orchestration
	•	language-specific parsing
	•	language-specific resolution logic
	•	generic coverage/scanning/reporting logic

4. Parser Strategy
Implement a parser strategy that supports all required languages.
Required principle
The analyzer must use real AST parsing, not only regex scanning.
Acceptable approaches
You may use:
	•	Tree-sitter as the primary unified parsing approach
	•	or language-specific parsers behind a common interface
	•	or a hybrid of both
Strong preference
Use a design that allows:
	•	a single analyzer core
	•	many language plugins
	•	uniform AST abstraction or normalized semantic output
Deliverable
Implement a LanguageAnalyzer contract such as:

interface LanguageAnalyzer {
  language: SupportedLanguage;
  parse(filePath: string, content: string): ParsedSourceFile;
  buildSemanticModel(parsed: ParsedSourceFile, context: AnalysisContext): SemanticModel;
  extractHttpInteractions(model: SemanticModel): ResolvedHttpInteraction[];
  extractAssertions(model: SemanticModel): ResolvedAssertion[];
  extractBusinessRuleReferences?(model: SemanticModel): BusinessRuleRef[];
  extractFlowReferences?(model: SemanticModel): FlowRef[];
}

Every supported language must implement this contract, directly or through layered composition.

5. Semantic Model Requirements
For every language, build a semantic model that supports at minimum:
	•	local variables
	•	constants
	•	enums or equivalent
	•	string literals
	•	string interpolation / concatenation
	•	method/function calls
	•	request builder patterns
	•	helper/wrapper functions
	•	imported or referenced symbols where feasible
	•	class/object/module method calls
	•	response/assertion linkage
	•	basic call graph traversal
Do not stop at syntax-level AST nodes.You must produce a usable semantic layer.

6. Endpoint Resolution Requirements
The endpoint coverage engine must support endpoint discovery from all supported languages when endpoint data is hidden behind:
	•	constants
	•	enums
	•	helper methods
	•	wrapper methods
	•	request builders
	•	client abstractions
	•	composed paths
	•	interpolated strings
	•	chained builders
	•	step-definition indirection
	•	utility methods
	•	factory objects
Examples to support across languages:
	•	direct string literal calls
	•	const USERS = "/users"
	•	enum/object/module route values
	•	buildUserPath(id)
	•	client.fetchUser(id)
	•	Request.builder().method(GET).path("/users").build()
	•	step definitions that call helper classes which call the HTTP client
For every reconstructed call, resolve:
	•	HTTP method
	•	raw path
	•	normalized path
	•	resolution type
	•	confidence
	•	source file
	•	source language

7. Parameter Coverage Requirements
The parameter coverage engine must become AST/semantic-aware.
It must support detecting parameter scenarios from all supported languages:
	•	valid values
	•	invalid values
	•	missing values
	•	boundary values
	•	null/empty values
	•	malformed types
	•	oversized/undersized strings
	•	invalid enums
	•	missing required fields
This must work even when request bodies or params are built through:
	•	builders
	•	helper methods
	•	payload factories
	•	dictionaries/maps/objects
	•	typed DTOs / request classes
	•	fixture generators
You must not rely only on naive text search for "statusCode == 400".
The engine must infer parameter test intent from semantic structure.

8. Business Rule Coverage Requirements
Business rule coverage must work across all languages.
Support ways to identify business-rule-linked tests via:
	•	annotations
	•	decorators
	•	metadata
	•	tags
	•	comments
	•	structured step tags in Cucumber
	•	config-based test-to-rule mapping if needed
Examples:
	•	Java annotations
	•	Kotlin annotations
	•	Python decorators or comments
	•	Ruby metadata/tags
	•	Cucumber tags like @businessRule_ruleId
The business rule engine must:
	•	resolve rule identifiers from tests/scenarios
	•	map tests to business rules
	•	report covered/uncovered rules consistently across languages

9. Integration Flow Requirements
Integration flow coverage must support multi-language AST-based flow resolution.
It must detect:
	•	multi-step endpoint sequences
	•	event + API mixed flows where supported
	•	wrapper/helper path resolution
	•	Cucumber scenario flow mapping
	•	request chains through helper abstractions
For every flow, determine:
	•	steps covered
	•	missing steps
	•	test files / feature files linked
	•	languages involved
	•	confidence of mapping
Flow pages and summaries must remain language-agnostic while preserving language metadata.

10. Error Coverage Requirements
Error coverage must be improved using AST/semantic analysis across all languages.
It must detect negative scenarios not just from simple status assertions but from:
	•	invalid request builders
	•	missing field construction
	•	invalid enum/type creation
	•	unauthenticated/unauthorized requests
	•	nonexistent IDs
	•	malformed payloads
	•	assertion chains validating error responses
Error analysis must become semantic enough to infer the scenario category where possible:
	•	missing parameter
	•	invalid parameter
	•	unauthorized
	•	forbidden
	•	not found
	•	conflict
	•	server error
	•	validation error

11. Security Coverage Requirements
Security coverage and security test mapping must work across all languages.
It must support semantic detection of:
	•	auth header omission
	•	invalid tokens
	•	insufficient role/scope
	•	injection payloads
	•	XSS-like payloads
	•	unsafe input patterns
	•	cookie/session assertions
	•	rate-limit scenarios
	•	sensitive data exposure checks
This must work whether the tests are written directly or through:
	•	helper clients
	•	wrappers
	•	test DSLs
	•	Cucumber steps
You must also keep security scanner integration consistent with this architecture where relevant.

12. Assertion-Linking Requirement
Introduce assertion-aware confidence for all supported languages.
For each reconstructed HTTP interaction, determine whether it is meaningfully linked to assertions.
Examples:
	•	response variable asserted
	•	chained fluent assertion
	•	response body/status assertion
	•	exception assertion
	•	error-message assertion
Every interaction should have metadata like:
	•	assertionLinked
	•	assertionType
	•	coverageConfidence
This should improve trust in results and help distinguish:
	•	incidental calls
	•	meaningful covered behavior

13. Confidence and Resolution Types
Every resolved interaction must include:
	•	resolutionType
	•	confidence
	•	assertionLinked
	•	sourceLanguage
Example types:
	•	direct
	•	constant
	•	enum
	•	interpolated-path
	•	wrapper-method
	•	request-builder
	•	client-abstraction
	•	cucumber-step
	•	heuristic
Confidence levels:
	•	high
	•	medium
	•	low
All reports must surface this metadata.

14. Cross-Language Consistency Requirement
Even though language analyzers differ internally, the final normalized model must be consistent across languages.
Create common normalized types for:
	•	HTTP interactions
	•	assertions
	•	business rule refs
	•	flow refs
	•	parameter scenarios
	•	coverage evidence
This is mandatory so reports, summaries, dashboards, and AI analysis do not become language-specific chaos.

15. Fallback and Hybrid Behaviour
Do not remove all text/regex heuristics blindly.
Implement a hybrid architecture:
	1	AST + semantic analysis first
	2	fallback heuristics where AST resolution is incomplete
	3	confidence scoring to reflect weaker matches
This ensures coverage does not regress while the AST engine matures.
Fallback heuristics must be clearly marked as lower confidence.

16. Configuration Requirements
Extend central config.yaml to support AST analysis.
Example:

analysis:
  ast:
    enabled: true
    fallbackHeuristics: true
    maxCallDepth: 4
    assertionAware: true
    languages:
      java:
        enabled: true
      kotlin:
        enabled: true
      python:
        enabled: true
      ruby:
        enabled: true
      javascript:
        enabled: true
      typescript:
        enabled: true
      cucumber:
        enabled: true

Allow per-language toggles and tuning where needed.

17. Reporting Requirements
Update all relevant reports to include AST-driven metadata.
At minimum:
	•	endpoint coverage JSON/HTML
	•	parameter coverage JSON/HTML
	•	business coverage JSON/HTML
	•	integration coverage JSON/HTML
	•	security/error reports
	•	AI-friendly markdown summaries
	•	dashboard detail pages
Must include fields such as:
	•	source language
	•	test files
	•	feature files if applicable
	•	resolution type
	•	confidence
	•	assertion-linked flag
	•	direct vs indirect match

18. Example Projects Update
Update the examples/ projects so they meaningfully exercise AST-based multi-language analysis.
Each example should include cases for:
	•	constants
	•	wrappers
	•	builders
	•	helper clients
	•	indirect calls
	•	Cucumber step indirection where relevant
The examples must become regression fixtures for the AST engine.

19. Testing Requirements
Do not stop until all tests pass.
Unit tests
Add language-specific unit tests for:
	•	parser invocation
	•	symbol resolution
	•	constant resolution
	•	enum resolution
	•	string interpolation resolution
	•	helper/wrapper resolution
	•	request builder resolution
	•	assertion linkage
	•	confidence scoring
For every language.
Integration tests
Add integration fixtures per language with:
	•	OpenAPI spec
	•	test files
	•	expected resolved interactions
	•	expected endpoint coverage
	•	expected parameter/error/security coverage where relevant
Must include:
	•	Java
	•	Kotlin
	•	Python
	•	Ruby
	•	JavaScript
	•	TypeScript
	•	Cucumber Ruby
	•	Cucumber Java
	•	Cucumber Kotlin if supported
	•	Cucumber JS/TS if supported
End-to-end / dashboard tests
Add or update browser tests to verify:
	•	indirect coverage renders correctly
	•	confidence badges render
	•	language filters work if present
	•	AI summary panels include language-aware interpretations
	•	no report page breaks due to new metadata

20. Documentation Requirements
Update documentation comprehensively.
At minimum update:
	•	README
	•	architecture docs
	•	language support docs
	•	config docs
	•	endpoint coverage docs
	•	parameter coverage docs
	•	business rules docs
	•	Cucumber support docs
	•	examples docs
	•	AI-friendly summary docs if applicable
Document:
	•	the analyzer is now AST-based
	•	supported languages
	•	supported resolution patterns
	•	confidence scoring
	•	fallback heuristics
	•	limitations per language
	•	how to extend language support
	•	how to debug resolution failures
All docs must be:
	•	structured
	•	concise
	•	deterministic
	•	AI-friendly

21. Backward Compatibility
Preserve compatibility where reasonable.
If old text-based behavior existed, keep it as fallback while migrating, but ensure:
	•	AST path is primary
	•	reports clearly indicate resolution type
	•	new engine does not silently reduce detection quality

22. Acceptance Criteria
This task is complete only if all of the following are true:
	1	the analyzer uses AST parsing as the primary path for all supported languages
	2	all supported languages have analyzer implementations
	3	endpoint resolution works beyond direct literals
	4	parameter analysis is AST/semantic-aware
	5	business rule mapping works across languages
	6	integration flow mapping works across languages
	7	error/security inference is improved semantically
	8	assertion linkage exists
	9	confidence scoring exists
	10	reports include new metadata
	11	examples are updated
	12	docs are updated
	13	unit tests cover all languages
	14	integration tests cover all languages
	15	dashboard/e2e tests pass
	16	the analyzer still works if some AST resolution falls back to heuristics

23. Execution Rules
Work incrementally but do not stop early.
For each language:
	1	implement parser integration
	2	implement semantic model
	3	implement HTTP interaction extraction
	4	implement assertion linkage
	5	add unit tests
	6	add integration tests
	7	update reports
	8	update docs
At the end:
	•	run the full unit test suite
	•	run the full integration suite
	•	run end-to-end/dashboard tests
	•	verify all supported languages work
	•	verify reports are stable
	•	verify documentation matches reality
Do not stop until everything above is implemented and passing.
