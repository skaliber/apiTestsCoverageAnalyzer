# =============================================================================
#  API Test Coverage Analyzer — Makefile
# =============================================================================
#
#  Central entrypoint for development, CI, and self-analysis workflows.
#  All CI pipelines call these targets; no pipeline contains inline coverage
#  logic.  Threshold enforcement is delegated exclusively to the analyzer
#  library (process exit code governs pass/fail — no shell string-parsing).
#
#  Usage:
#    make help               Print this help
#    make install            Install all Node.js dependencies
#    make build              Compile TypeScript → dist/
#    make test               Run the full test suite
#    make self-analysis-all  Run all metrics against this repository
#    make ci                 Full CI pipeline (install → build → test → analyze)
#
# =============================================================================

# ── Configurable variables ─────────────────────────────────────────────────────
NODE          ?= node
NPM           ?= npm
ANALYZER_CMD  ?= $(NODE) dist/src/index.js
SELF_SPEC     ?= openapi.self-analysis.yaml
SELF_TESTS    ?= tests/**/*.ts
SELF_RULES    ?= business-rules.self-analysis.yaml
SELF_FLOWS    ?= integration-flows.self-analysis.yaml
SELF_LOAD     ?= load-results.self-analysis.json
SELF_CONFIG   ?= config.yaml
SELF_SAMPLE_SPEC     ?= sample/openapi.yaml
SELF_SAMPLE_PARAMS   ?= sample/openapi-parameters.yaml
SELF_SAMPLE_ERRORS   ?= sample/openapi-errors.yaml
SELF_SAMPLE_SECURITY ?= sample/openapi.yaml
SELF_SAMPLE_TESTS    ?= sample/tests/**/*.ts
REPORTS_DIR   ?= reports
SITE_DIR      ?= site

# Output formats for all self-analysis runs
FORMATS       ?= json,html,csv,junit

# ── Phony targets ──────────────────────────────────────────────────────────────
.PHONY: help install build lint clean reports-clean \
        test test-unit test-integration test-e2e test-e2e-docs test-e2e-dashboard test-smoke docs-build \
        self-analysis-endpoint self-analysis-parameter self-analysis-business \
        self-analysis-integration self-analysis-error self-analysis-security \
        self-analysis-performance self-analysis-compatibility \
        self-analysis-all security-scan \
        summary pr-summary build-summary \
        dashboard \
        examples-analyze-all examples-analyze examples-dashboard examples-test-structure \
        ci

# ── Default target ─────────────────────────────────────────────────────────────
.DEFAULT_GOAL := help

# =============================================================================
#  HELP
# =============================================================================

help: ## Print this help message
	@echo ""
	@echo "  API Test Coverage Analyzer — Makefile targets"
	@echo "  =============================================="
	@grep -E '^[a-zA-Z_-]+:.*?##' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-30s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "  Configurable variables (override with make VAR=value):"
	@echo "    REPORTS_DIR   $(REPORTS_DIR)"
	@echo "    SELF_SPEC     $(SELF_SPEC)"
	@echo "    SELF_TESTS    $(SELF_TESTS)"
	@echo "    FORMATS       $(FORMATS)"
	@echo ""

# =============================================================================
#  SETUP AND BUILD
# =============================================================================

install: ## Install all Node.js dependencies
	$(NPM) ci --ignore-scripts

build: ## Compile TypeScript and produce dist/
	$(NPM) run build

lint: ## Run ESLint across the source tree
	$(NPM) run lint 2>/dev/null || echo "[lint] No lint script configured — skipping"

clean: ## Remove build artifacts, dist/, and temporary files
	rm -rf dist/
	rm -rf node_modules/.cache
	rm -rf .nyc_output coverage/

reports-clean: ## Remove all generated reports and summaries from reports/
	rm -rf $(REPORTS_DIR)/
	@echo "Reports directory cleaned."

# =============================================================================
#  TESTING
# =============================================================================

test: build ## Run all test suites (unit + integration + e2e)
	$(NPM) test -- --no-coverage
	$(MAKE) test-e2e-docs
	$(MAKE) test-e2e-dashboard

test-unit: build ## Run unit tests only (excludes integration and smoke)
	$(NPM) test -- --no-coverage --testPathIgnorePatterns="node_modules|dist|dashboard|examples|integration|smoke"

test-integration: ## Run integration tests only
	$(NPM) test -- --no-coverage --testPathPattern="integration" --testPathIgnorePatterns="node_modules|dist|dashboard|examples"

test-e2e: ## Run all Cypress end-to-end tests (docs + dashboard)
	$(MAKE) test-e2e-docs
	$(MAKE) test-e2e-dashboard

test-e2e-docs: ## Run Cypress docs link tests (mirrors CI test-links job)
	$(NPM) run docs:build
	$(NPM) run docs:preview > /dev/null 2>&1 &
	npx wait-on http://localhost:4173/apiTestsCoverageAnalyzer --timeout 30000
	unset ELECTRON_RUN_AS_NODE && $(NPM) run docs:test; EXIT=$$?; kill $$(lsof -t -i tcp:4173 2>/dev/null) 2>/dev/null || true; exit $$EXIT

test-e2e-dashboard: ## Run Cypress dashboard tests (mirrors CI test-dashboard job)
	cd dashboard && $(NPM) run build
	cd dashboard && $(NPM) run preview -- --host 127.0.0.1 > /dev/null 2>&1 &
	npx wait-on http://127.0.0.1:4173 --timeout 30000
	unset ELECTRON_RUN_AS_NODE && $(NPM) run dashboard:test; EXIT=$$?; kill $$(lsof -t -i tcp:4173 2>/dev/null) 2>/dev/null || true; exit $$EXIT

test-smoke: ## Run self-analysis smoke test
	$(NPM) test -- --no-coverage --testPathPattern="smoke"

docs-build: ## Build the VitePress documentation site
	$(NPM) run docs:build

# =============================================================================
#  SELF-ANALYSIS — PER METRIC
# =============================================================================

self-analysis-endpoint: build ## Run endpoint coverage against this repository
	@mkdir -p $(REPORTS_DIR)
	$(ANALYZER_CMD) endpoint-coverage \
	  --config "$(SELF_CONFIG)" \
	  --spec "$(SELF_SPEC)" \
	  --tests "$(SELF_TESTS)" \
	  --format "$(FORMATS)" \
	  --threshold-endpoint 100

self-analysis-parameter: build ## Run parameter coverage against this repository
	@mkdir -p $(REPORTS_DIR)
	$(ANALYZER_CMD) parameter-coverage \
	  --config "$(SELF_CONFIG)" \
	  --spec "$(SELF_SPEC)" \
	  --tests "$(SELF_TESTS)" \
	  --format "$(FORMATS)" \
	  --threshold-parameter 100

self-analysis-business: build ## Run business rule coverage against this repository
	@mkdir -p $(REPORTS_DIR)
	$(ANALYZER_CMD) business-coverage \
	  --config "$(SELF_CONFIG)" \
	  --rules "$(SELF_RULES)" \
	  --tests "$(SELF_TESTS)" \
	  --format "$(FORMATS)" \
	  --threshold-business 100

self-analysis-integration: build ## Run integration flow coverage against this repository
	@mkdir -p $(REPORTS_DIR)
	$(ANALYZER_CMD) integration-coverage \
	  --config "$(SELF_CONFIG)" \
	  --flows "$(SELF_FLOWS)" \
	  --tests "$(SELF_TESTS)" \
	  --format "$(FORMATS)" \
	  --threshold-integration 100

self-analysis-error: build ## Run error scenario coverage against this repository
	@mkdir -p $(REPORTS_DIR)
	$(ANALYZER_CMD) error-coverage \
	  --config "$(SELF_CONFIG)" \
	  --spec "$(SELF_SPEC)" \
	  --tests "$(SELF_TESTS)" \
	  --format "$(FORMATS)" \
	  --threshold-error 100

self-analysis-security: build ## Run security control coverage against this repository
	@mkdir -p $(REPORTS_DIR)
	$(ANALYZER_CMD) security-coverage \
	  --config "$(SELF_CONFIG)" \
	  --spec "$(SELF_SPEC)" \
	  --tests "$(SELF_TESTS)" \
	  --format "$(FORMATS)" \
	  --threshold-security 100

self-analysis-performance: build ## Run performance/resilience coverage against this repository
	@mkdir -p $(REPORTS_DIR)
	$(ANALYZER_CMD) perf-resilience-coverage \
	  --config "$(SELF_CONFIG)" \
	  --spec "$(SELF_SPEC)" \
	  --tests "$(SELF_TESTS)" \
	  --load-results "$(SELF_LOAD)" \
	  --format "$(FORMATS)" \
	  --threshold-response-ms 200 \
	  --threshold-error-rate 0.01

self-analysis-compatibility: build ## Run compatibility/contract coverage against this repository
	@mkdir -p $(REPORTS_DIR)
	$(ANALYZER_CMD) compatibility-check \
	  --old-spec "sample/v1.yaml" \
	  --new-spec "sample/v2.yaml" \
	  --format "$(FORMATS)" \
	  --threshold-compat 100

# =============================================================================
#  SELF-ANALYSIS — AGGREGATED
# =============================================================================

self-analysis-all: build ## Run ALL metric types, produce all reports, apply all thresholds
	@echo "==========================================================="
	@echo "  Running self-analysis across all metric types"
	@echo "==========================================================="
	@mkdir -p $(REPORTS_DIR)

	@echo ""
	@echo "[1/8] Endpoint coverage..."
	$(ANALYZER_CMD) endpoint-coverage \
	  --config "$(SELF_CONFIG)" \
	  --spec "$(SELF_SPEC)" \
	  --tests "$(SELF_TESTS)" \
	  --format "$(FORMATS)" \
	  --threshold-endpoint 100

	@echo ""
	@echo "[2/8] Parameter coverage..."
	$(ANALYZER_CMD) parameter-coverage \
	  --config "$(SELF_CONFIG)" \
	  --spec "$(SELF_SPEC)" \
	  --tests "$(SELF_TESTS)" \
	  --format "$(FORMATS)" \
	  --threshold-parameter 100

	@echo ""
	@echo "[3/8] Business rule coverage..."
	$(ANALYZER_CMD) business-coverage \
	  --config "$(SELF_CONFIG)" \
	  --rules "$(SELF_RULES)" \
	  --tests "$(SELF_TESTS)" \
	  --format "$(FORMATS)" \
	  --threshold-business 100

	@echo ""
	@echo "[4/8] Integration flow coverage..."
	$(ANALYZER_CMD) integration-coverage \
	  --config "$(SELF_CONFIG)" \
	  --flows "$(SELF_FLOWS)" \
	  --tests "$(SELF_TESTS)" \
	  --format "$(FORMATS)" \
	  --threshold-integration 100

	@echo ""
	@echo "[5/8] Error scenario coverage..."
	$(ANALYZER_CMD) error-coverage \
	  --config "$(SELF_CONFIG)" \
	  --spec "$(SELF_SPEC)" \
	  --tests "$(SELF_TESTS)" \
	  --format "$(FORMATS)" \
	  --threshold-error 100

	@echo ""
	@echo "[6/8] Security control coverage..."
	$(ANALYZER_CMD) security-coverage \
	  --config "$(SELF_CONFIG)" \
	  --spec "$(SELF_SPEC)" \
	  --tests "$(SELF_TESTS)" \
	  --format "$(FORMATS)" \
	  --threshold-security 100

	@echo ""
	@echo "[7/8] Performance/resilience coverage..."
	$(ANALYZER_CMD) perf-resilience-coverage \
	  --config "$(SELF_CONFIG)" \
	  --spec "$(SELF_SPEC)" \
	  --tests "$(SELF_TESTS)" \
	  --load-results "$(SELF_LOAD)" \
	  --format "$(FORMATS)"

	@echo ""
	@echo "[8/8] Coverage intelligence engine..."
	$(ANALYZER_CMD) coverage-intelligence \
	  --reports-dir "$(REPORTS_DIR)" \
	  --out-dir "$(REPORTS_DIR)" \
	  --project-name "api-test-coverage-analyzer"

	@echo ""
	@echo "==========================================================="
	@echo "  Self-analysis complete. Reports in $(REPORTS_DIR)/"
	@echo "==========================================================="

# =============================================================================
#  SECURITY SCANNING
# =============================================================================

security-scan: build ## Run security scanner(s) (Trivy + Semgrep if available)
	@mkdir -p $(REPORTS_DIR)
	@echo "[security-scan] Running Trivy filesystem scan..."
	trivy fs --format json --scanners vuln,secret \
	  --output $(REPORTS_DIR)/trivy.json . 2>/dev/null || \
	  echo "[security-scan] Trivy not installed - skipping"
	@echo "[security-scan] Running Semgrep SAST scan..."
	semgrep scan --json --config p/default src/ \
	  > $(REPORTS_DIR)/semgrep.json 2>/dev/null || \
	  echo "[security-scan] Semgrep not installed - skipping"
	@echo "[security-scan] Enforcing security gate..."
	$(ANALYZER_CMD) security-scan \
	  --trivy-report "$(REPORTS_DIR)/trivy.json" \
	  --semgrep-report "$(REPORTS_DIR)/semgrep.json" \
	  --fail-on-critical true \
	  --max-secrets 0 2>/dev/null || true

# =============================================================================
#  SUMMARIES AND REPORTING
# =============================================================================

summary: ## Generate intelligence + summary reports for all metrics
	@mkdir -p $(REPORTS_DIR)
	$(ANALYZER_CMD) coverage-intelligence \
	  --reports-dir "$(REPORTS_DIR)" \
	  --out-dir "$(REPORTS_DIR)" \
	  --project-name "api-test-coverage-analyzer" 2>/dev/null || true
	$(ANALYZER_CMD) coverage-summary-report \
	  --reports-dir "$(REPORTS_DIR)" \
	  --out-dir "$(REPORTS_DIR)" \
	  --project-name "api-test-coverage-analyzer"
	@echo "Summary written to $(REPORTS_DIR)/"

pr-summary: summary ## Generate PR summary markdown (alias — pr-summary.md written by coverage-summary-report)

build-summary: summary ## Generate build summary markdown (alias — build-summary.md written by coverage-summary-report)

# =============================================================================
#  DASHBOARD
# =============================================================================

dashboard: self-analysis-all summary ## Run full analysis then open the live dashboard
	@echo "==========================================================="
	@echo "  Starting dashboard with real reports at http://localhost:5173"
	@echo "  Press Ctrl-C to stop."
	@echo "==========================================================="
	cd dashboard && $(NPM) run dev -- --mode real

dashboard-build: ## Build the static dashboard (required before running `api-tests-coverage serve`)
	cd dashboard && $(NPM) run build
	@echo "Dashboard built to dashboard/dist/"

dashboard-serve: self-analysis-all summary dashboard-build ## Full analysis + serve built dashboard via CLI
	@echo "==========================================================="
	@echo "  Starting static dashboard on http://localhost:4000"
	@echo "  Press Ctrl-C to stop."
	@echo "==========================================================="
	node dist/src/index.js serve --open

# =============================================================================
#  CI ENTRYPOINT
# =============================================================================

ci: install build test self-analysis-all summary ## Full CI pipeline: install → build → test → self-analysis → summary
	@echo "==========================================================="
	@echo "  CI pipeline complete."
	@echo "==========================================================="

# =============================================================================
#  EXAMPLE PROJECTS
# =============================================================================

EXAMPLE ?= typescript

examples-test-structure: ## Verify all example project directories have required files
	$(NPM) test -- --no-coverage --testPathPattern="integration/examples"

examples-analyze: build ## Run full analysis against a single example (EXAMPLE=<name>)
	@echo "Analyzing example: $(EXAMPLE)"
	@test -d examples/$(EXAMPLE) || (echo "Example '$(EXAMPLE)' not found in examples/"; exit 1)
	@test -f examples/$(EXAMPLE)/openapi.yaml || (echo "examples/$(EXAMPLE)/openapi.yaml not found"; exit 1)
	@mkdir -p examples/$(EXAMPLE)/reports
	@LANG=$$(grep -E '^  language:' examples/$(EXAMPLE)/config.yaml 2>/dev/null | head -1 | awk '{print $$2}' || echo 'typescript'); \
	 TESTS_DIR=$$(ls -d examples/$(EXAMPLE)/tests/tests-complete examples/$(EXAMPLE)/src/test examples/$(EXAMPLE)/spec/requests/spec-complete examples/$(EXAMPLE)/features 2>/dev/null | head -1 || echo "examples/$(EXAMPLE)/tests"); \
	 RDIR="examples/$(EXAMPLE)/reports"; \
	 SPEC="examples/$(EXAMPLE)/openapi.yaml"; \
	 echo "  Language: $$LANG"; \
	 echo "  Tests:    $$TESTS_DIR"; \
	 echo "  Reports:  $$RDIR"; \
	 echo "[1/7] Endpoint coverage..."; \
	 $(ANALYZER_CMD) endpoint-coverage \
	   --spec "$$SPEC" --tests "$$TESTS_DIR/**/*" \
	   --language "$$LANG" --config "examples/$(EXAMPLE)/config.yaml" \
	   --format "json,html" --output "$$RDIR" 2>/dev/null || true; \
	 echo "[2/7] Parameter coverage..."; \
	 $(ANALYZER_CMD) parameter-coverage \
	   --spec "$$SPEC" --tests "$$TESTS_DIR/**/*" \
	   --language "$$LANG" --config "examples/$(EXAMPLE)/config.yaml" \
	   --format "json,html" --output "$$RDIR" 2>/dev/null || true; \
	 echo "[3/7] Business rule coverage..."; \
	 if [ -f "examples/$(EXAMPLE)/business-rules.yaml" ]; then \
	   $(ANALYZER_CMD) business-coverage \
	     --rules "examples/$(EXAMPLE)/business-rules.yaml" \
	     --tests "$$TESTS_DIR/**/*" --language "$$LANG" \
	     --format "json,html" --output "$$RDIR" 2>/dev/null || true; \
	 else echo "  (no business-rules.yaml — skipped)"; fi; \
	 echo "[4/7] Integration flow coverage..."; \
	 if [ -f "examples/$(EXAMPLE)/integration-flows.yaml" ]; then \
	   $(ANALYZER_CMD) integration-coverage \
	     --flows "examples/$(EXAMPLE)/integration-flows.yaml" \
	     --tests "$$TESTS_DIR/**/*" --language "$$LANG" \
	     --format "json,html" --output "$$RDIR" 2>/dev/null || true; \
	 else echo "  (no integration-flows.yaml — skipped)"; fi; \
	 echo "[5/7] Error scenario coverage..."; \
	 $(ANALYZER_CMD) error-coverage \
	   --spec "$$SPEC" --tests "$$TESTS_DIR/**/*" \
	   --language "$$LANG" --config "examples/$(EXAMPLE)/config.yaml" \
	   --format "json,html" --output "$$RDIR" 2>/dev/null || true; \
	 echo "[6/7] Security coverage..."; \
	 $(ANALYZER_CMD) security-coverage \
	   --spec "$$SPEC" --tests "$$TESTS_DIR/**/*" \
	   --language "$$LANG" --config "examples/$(EXAMPLE)/config.yaml" \
	   --format "json,html" --output "$$RDIR" 2>/dev/null || true; \
	 echo "[7/7] Intelligence + summary..."; \
	 $(ANALYZER_CMD) coverage-intelligence \
	   --reports-dir "$$RDIR" --out-dir "$$RDIR" \
	   --project-name "$(EXAMPLE)" 2>/dev/null || true; \
	 $(ANALYZER_CMD) coverage-summary-report \
	   --reports-dir "$$RDIR" --out-dir "$$RDIR" \
	   --project-name "$(EXAMPLE)" 2>/dev/null || true
	@echo "Reports written to examples/$(EXAMPLE)/reports/"

examples-dashboard: build ## Run full analysis on an example then open the dashboard (EXAMPLE=<name>)
	@test -d examples/$(EXAMPLE) || (echo "Example '$(EXAMPLE)' not found in examples/"; exit 1)
	$(MAKE) examples-analyze EXAMPLE=$(EXAMPLE)
	@echo "==========================================================="
	@echo "  Starting dashboard for $(EXAMPLE) at http://localhost:5173"
	@echo "  Press Ctrl-C to stop."
	@echo "==========================================================="
	cd dashboard && REPORTS_OVERRIDE="$(CURDIR)/examples/$(EXAMPLE)/reports" $(NPM) run dev -- --mode real

examples-analyze-all: build ## Run analyzer against all example projects
	@echo "==========================================================="
	@echo "  Running analyzer against all example projects"
	@echo "==========================================================="
	@for EXAMPLE in typescript java-spring-complex python-fastapi-complex \
	    ruby-rails-complex cucumber-ruby-complex cucumber-java-complex \
	    kotlin-ktor-complex javascript-node-express-complex; do \
	  if [ -d "examples/$$EXAMPLE" ] && [ -f "examples/$$EXAMPLE/openapi.yaml" ]; then \
	    echo ""; \
	    echo "--- $$EXAMPLE ---"; \
	    $(MAKE) examples-analyze EXAMPLE=$$EXAMPLE || true; \
	  else \
	    echo "[SKIP] examples/$$EXAMPLE not found or missing openapi.yaml"; \
	  fi; \
	done
	@echo ""
	@echo "==========================================================="
	@echo "  All examples analyzed."
	@echo "==========================================================="
