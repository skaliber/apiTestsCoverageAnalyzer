.PHONY: install test test-initial test-complete analyze analyze-initial clean all help

# ----------------------------------------------------------------------------
# Variables
# ----------------------------------------------------------------------------

PYTHON      := python3
PIP         := $(PYTHON) -m pip
PYTEST      := $(PYTHON) -m pytest
NPX         := npx
ANALYZER    := apiTestsCoverageAnalyzer

VENV        := .venv
ACTIVATE    := . $(VENV)/bin/activate

# ----------------------------------------------------------------------------
# Default target
# ----------------------------------------------------------------------------

all: install test analyze  ## Install deps, run tests, run analysis

# ----------------------------------------------------------------------------
# Installation
# ----------------------------------------------------------------------------

install:  ## Install all Python dependencies
	$(PIP) install -r requirements.txt

venv:  ## Create a virtual environment
	$(PYTHON) -m venv $(VENV)
	$(ACTIVATE) && $(PIP) install --upgrade pip && $(PIP) install -r requirements.txt

# ----------------------------------------------------------------------------
# Running the API
# ----------------------------------------------------------------------------

run:  ## Start the Development server with hot-reload
	uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

run-prod:  ## Start without hot-reload
	uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4

# ----------------------------------------------------------------------------
# Tests
# ----------------------------------------------------------------------------

test: test-complete  ## Alias for test-complete

test-initial:  ## Run the partial (initial) test suite only
	$(PYTEST) tests/tests-initial/ -v --tb=short

test-complete:  ## Run the full coverage test suite
	$(PYTEST) tests/tests-complete/ -v --tb=short

test-all:  ## Run every test file (initial + complete)
	$(PYTEST) tests/ -v --tb=short

test-security:  ## Run security-focused tests only
	$(PYTEST) tests/tests-complete/test_security.py -v

test-cov:  ## Run full suite with HTML coverage report
	$(PYTEST) tests/tests-complete/ \
		--cov=app \
		--cov-report=html:reports/coverage-html \
		--cov-report=term-missing \
		-v

# ----------------------------------------------------------------------------
# Analysis
# ----------------------------------------------------------------------------

analyze:  ## Analyze full test coverage against the OpenAPI spec
	$(NPX) $(ANALYZER) \
		--config config.yaml \
		--test-dir tests/tests-complete \
		--output-dir reports/analysis-complete

analyze-initial:  ## Analyze initial (partial) test coverage
	$(NPX) $(ANALYZER) \
		--config config.yaml \
		--test-dir tests/tests-initial \
		--output-dir reports/analysis-initial

# ----------------------------------------------------------------------------
# Cleaning
# ----------------------------------------------------------------------------

clean:  ## Remove generated artifacts
	rm -rf reports/
	rm -rf __pycache__/ app/__pycache__/ app/**/__pycache__/ tests/**/__pycache__/
	rm -rf .pytest_cache/
	rm -rf .coverage htmlcov/
	find . -name "*.pyc" -delete

# ----------------------------------------------------------------------------
# Help
# ----------------------------------------------------------------------------

help:  ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| sort \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-22s\033[0m %s\n", $$1, $$2}'
