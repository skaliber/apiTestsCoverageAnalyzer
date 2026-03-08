#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ANALYZER_ROOT="$(cd "$PROJECT_DIR/../.." && pwd)"
ANALYZER_CMD="node $ANALYZER_ROOT/dist/src/index.js"

cd "$PROJECT_DIR"

echo "=== Wallets/Payments API Coverage Analysis ==="
echo ""

echo "[1/6] Running tests with coverage..."
./node_modules/.bin/jest --coverage --forceExit
echo ""

echo "[2/6] Running endpoint coverage analysis..."
$ANALYZER_CMD endpoint-coverage \
  --spec openapi.yaml \
  --tests "tests/**/*.test.ts" \
  --format json,html \
  || echo "endpoint-coverage completed"
echo ""

echo "[3/6] Running business rule coverage..."
$ANALYZER_CMD business-coverage \
  --rules business-rules.yaml \
  --tests "tests/**/*.test.ts" \
  --format json,html \
  || echo "business-coverage completed"
echo ""

echo "[4/6] Running security coverage..."
$ANALYZER_CMD security-coverage \
  --spec openapi.yaml \
  --tests "tests/**/*.test.ts" \
  --format json,html \
  || echo "security-coverage completed"
echo ""

echo "[5/6] Running error scenario coverage..."
$ANALYZER_CMD error-coverage \
  --spec openapi.yaml \
  --tests "tests/**/*.test.ts" \
  --format json,html \
  || echo "error-coverage completed"
echo ""

echo "[6/6] Running coverage intelligence analysis..."
$ANALYZER_CMD coverage-intelligence \
  --reports-dir reports \
  --out-dir reports \
  --project-name wallets-payments-api \
  --languages typescript \
  --frameworks jest \
  || echo "coverage-intelligence completed"
echo ""

echo "=== Analysis complete. Reports saved to reports/ ==="
