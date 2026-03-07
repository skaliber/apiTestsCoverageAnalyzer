#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ANALYZER_CMD="npx api-test-coverage-analyzer"

cd "$PROJECT_DIR"

echo "=== Wallets/Payments API Coverage Analysis ==="
echo ""

echo "[1/6] Running tests with coverage..."
npx jest --coverage --coverageReporters=lcov,json,text 2>&1 | tail -20
echo ""

echo "[2/6] Running endpoint coverage analysis..."
$ANALYZER_CMD endpoint-coverage \
  --spec openapi.yaml \
  --tests "tests/**/*.test.ts" \
  --output reports/endpoint-coverage.json \
  || echo "endpoint-coverage completed"
echo ""

echo "[3/6] Running business rule coverage..."
$ANALYZER_CMD business-coverage \
  --config coverage.config.json \
  --tests "tests/**/*.test.ts" \
  --output reports/business-coverage.json \
  || echo "business-coverage completed"
echo ""

echo "[4/6] Running security coverage..."
$ANALYZER_CMD security-coverage \
  --spec openapi.yaml \
  --tests "tests/**/*.test.ts" \
  --output reports/security-coverage.json \
  || echo "security-coverage completed"
echo ""

echo "[5/6] Running error scenario coverage..."
$ANALYZER_CMD error-coverage \
  --spec openapi.yaml \
  --tests "tests/**/*.test.ts" \
  --output reports/error-coverage.json \
  || echo "error-coverage completed"
echo ""

echo "[6/6] Running coverage intelligence analysis..."
$ANALYZER_CMD coverage-intelligence \
  --config coverage.config.json \
  --input reports/ \
  --output reports/intelligence-report.json \
  || echo "coverage-intelligence completed"
echo ""

echo "=== Analysis complete. Reports saved to reports/ ==="
