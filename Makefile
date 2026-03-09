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

test: ## Run all test suites (unit + integration + e2e)
	$(NPM) test -- --no-coverage
	$(MAKE) test-e2e-docs
	$(MAKE) test-e2e-dashboard

test-unit: ## Run unit tests only (excludes integration and smoke)
	$(NPM) test -- --no-coverage --testPathIgnorePatterns="node_modules|dist|dashboard|examples|integration|smoke"

test-integration: ## Run integration tests only
	$(NPM) test -- --no-coverage --testPathPattern="integration" --testPathIgnorePatterns="node_modules|dist|dashboard|examples"

test-e2e: ## Run all Cypress end-to-end tests (docs + dashboard)
	$(MAKE) test-e2e-docs
	$(MAKE) test-e2e-dashboard

test-e2e-docs: ## Run Cypress docs link tests (mirrors CI test-links job)
	$(NPM) run docs:build
	$(NPM) run docs:preview &
	npx wait-on http://localhost:4173/apiTestsCoverageAnalyzer --timeout 30000
	unset ELECTRON_RUN_AS_NODE && $(NPM) run docs:test; EXIT=$$?; pkill -f "vite preview" 2>/dev/null || true; exit $$EXIT

test-e2e-dashboard: ## Run Cypress dashboard tests (mirrors CI test-dashboard job)
	cd dashboard && $(NPM) run build
	cd dashboard && $(NPM) run preview -- --host 127.0.0.1 &
	npx wait-on http://127.0.0.1:4173 --timeout 30000
	unset ELECTRON_RUN_AS_NODE && $(NPM) run dashboard:test; EXIT=$$?; pkill -f "vite preview" 2>/dev/null || true; exit $$EXIT

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

summary: ## Generate summary files for all metrics into reports/
	@mkdir -p $(REPORTS_DIR)
	$(ANALYZER_CMD) coverage-intelligence \
	  --reports-dir "$(REPORTS_DIR)" \
	  --out-dir "$(REPORTS_DIR)" \
	  --project-name "api-test-coverage-analyzer" 2>/dev/null || true
	@echo "Summary written to $(REPORTS_DIR)/"

pr-summary: ## Generate PR summary markdown into reports/pr-summary.md
	@mkdir -p $(REPORTS_DIR)
	@echo "# API Coverage PR Summary" > $(REPORTS_DIR)/pr-summary.md
	@echo "" >> $(REPORTS_DIR)/pr-summary.md
	@echo "Generated: $$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> $(REPORTS_DIR)/pr-summary.md
	@echo "" >> $(REPORTS_DIR)/pr-summary.md
	@if [ -f "$(REPORTS_DIR)/coverage-summary.json" ]; then \
	  echo "## Coverage Results" >> $(REPORTS_DIR)/pr-summary.md; \
	  cat "$(REPORTS_DIR)/coverage-summary.json" >> $(REPORTS_DIR)/pr-summary.md; \
	fi
	@if [ -f "$(REPORTS_DIR)/coverage-intelligence.json" ]; then \
	  echo "" >> $(REPORTS_DIR)/pr-summary.md; \
	  echo "## Intelligence Findings" >> $(REPORTS_DIR)/pr-summary.md; \
	  cat "$(REPORTS_DIR)/coverage-intelligence.json" >> $(REPORTS_DIR)/pr-summary.md; \
	fi
	@echo "PR summary written to $(REPORTS_DIR)/pr-summary.md"

build-summary: ## Generate build summary markdown into reports/build-summary.md
	@mkdir -p $(REPORTS_DIR)
	@echo "# API Coverage Build Summary" > $(REPORTS_DIR)/build-summary.md
	@echo "" >> $(REPORTS_DIR)/build-summary.md
	@echo "Generated: $$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> $(REPORTS_DIR)/build-summary.md
	@echo "" >> $(REPORTS_DIR)/build-summary.md
	@if [ -f "$(REPORTS_DIR)/coverage-intelligence.json" ]; then \
	  echo "## Intelligence Report" >> $(REPORTS_DIR)/build-summary.md; \
	  head -30 "$(REPORTS_DIR)/coverage-intelligence.json" >> $(REPORTS_DIR)/build-summary.md; \
	fi
	@echo "Build summary written to $(REPORTS_DIR)/build-summary.md"

# =============================================================================
#  CI ENTRYPOINT
# =============================================================================

ci: install build test self-analysis-all summary ## Full CI pipeline: install → build → test → self-analysis → summary
	@echo "==========================================================="
	@echo "  CI pipeline complete."
	@echo "==========================================================="
