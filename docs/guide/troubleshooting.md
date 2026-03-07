# Troubleshooting & FAQ

## Installation issues

### `node: command not found`

Node.js is not installed or not on your `PATH`.

**Fix:** Download and install Node.js ≥ 18 from [nodejs.org](https://nodejs.org) or use a version manager like `nvm`:

```bash
nvm install 20
nvm use 20
```

### `npm install` fails with peer dependency errors

**Fix:** Use `npm install --legacy-peer-deps` or update to npm ≥ 9.

---

## Spec parsing

### "Analyzer fails to locate the spec file"

```
Error: ENOENT: no such file or directory, open 'openapi.yaml'
```

**Fix:** Check the `--spec` path. Use an absolute path or ensure you are running the command from the correct working directory.

### "Spec parsing failed: unexpected token"

The spec file is not valid YAML or JSON.

**Fix:** Validate your spec with a linter such as [Redocly CLI](https://redocly.com/docs/cli/) or the online [Swagger Editor](https://editor.swagger.io).

---

## Test detection

### "Tests are not detected" / `coveredItems: 0`

**Possible causes:**

1. **Wrong glob pattern** – the `--tests` argument does not match any files.

   ```bash
   # Debug: list matched files
   node -e "const g = require('fast-glob'); g.sync('your/pattern/**/*.ts').forEach(f => console.log(f))"
   ```

2. **TypeScript not compiled** – if running against `dist/`, the test files may not be compiled there.

   **Fix:** Always pass the source `tests/` directory, not `dist/`.

3. **Test description does not match endpoint pattern** – the analyzer looks for `METHOD /path` strings in test descriptions. Ensure your test names include e.g. `GET /users`.

### "No coverage data is generated"

The test files exist but no coverage is found.

**Fix:** Review the test descriptions:
- Endpoint coverage: descriptions must contain `GET /users`, `POST /orders`, etc.
- Business rules: descriptions must contain `@businessRule rule-id`.
- Integration flows: descriptions must contain `@flow flow-id`.

---

## Threshold failures

### "Build failed: endpoint coverage 75% is below threshold 80%"

This is the expected behaviour when coverage drops below a threshold.

**Fix:**
1. Write more tests to cover the missing endpoints.
2. Or, if the endpoints are intentionally untested (internal, deprecated), exclude them in `coverage.config.json`:

```json
{
  "exclude": {
    "paths": ["/internal/*", "/deprecated/*"],
    "methods": ["OPTIONS", "HEAD"]
  }
}
```

---

## Plugin issues

### "Plugin failed to load"

```
Warning: Plugin ./plugins/my-plugin.js failed to load
```

**Possible causes:**

1. The plugin file does not exist at the given path.
2. The plugin does not export an `analyze` function.
3. The plugin has a syntax error or imports a missing dependency.

**Fix:**

```bash
# Test the plugin directly
node -e "const p = require('./plugins/my-plugin.js'); console.log(typeof p.analyze)"
# Should print: function
```

---

## Report generation

### "Reports directory not found"

The `reports/` directory does not exist.

**Fix:** The directory is created automatically. If it was deleted, create it:

```bash
mkdir -p reports
```

### HTML report looks broken

**Fix:** Open the HTML file directly in a browser (double-click), not via `file://` with restricted CSP. Alternatively, serve it with a local HTTP server:

```bash
npx serve reports/
```

---

## Performance

### Analysis is slow for large test suites

**Fix:**
1. Use more specific glob patterns: `tests/api/**/*.test.ts` instead of `**/*.ts`.
2. Exclude large non-test files.
3. Run individual coverage commands in parallel in CI using matrix jobs.

---

## Debugging tips

### Enable verbose logging

Set the `LOG_LEVEL` environment variable:

```bash
LOG_LEVEL=debug node dist/index.js endpoint-coverage --spec openapi.yaml --tests "tests/**/*.ts"
```

### Node.js debug output

```bash
NODE_DEBUG=* node dist/index.js endpoint-coverage ...
```

### Inspect a generated report

```bash
cat reports/endpoint-coverage.json | jq '.details.items[] | select(.covered == false)'
```

---

## FAQ

**Q: Does the tool modify my test files?**
No. It reads them as text and looks for annotation keywords. No files are written.

**Q: Does it work with JavaScript test files?**
Yes. Use `--tests "tests/**/*.{ts,js}"` to include both.

**Q: Can I use it without an OpenAPI spec?**
Only commands that require a spec (endpoint, parameter, security, perf-resilience, compatibility) need `--spec`. Business rule, integration flow, and error coverage use separate YAML files.

**Q: How do I skip the build step?**
Use `ts-node`:
```bash
node -r ts-node/register src/index.ts endpoint-coverage ...
```

**Q: Can I run multiple config files?**
Not currently. Use the `--config` flag to point to a specific file per run.

**Q: Does it support OpenAPI 2.x (Swagger)?**
Yes. The tool uses `@apidevtools/swagger-parser` which handles both Swagger 2.x and OpenAPI 3.x.

## Getting help

- [Open an issue](https://github.com/q-intel/apiTestsCoverageAnalyzer/issues) on GitHub.
- [Read the contributing guide →](/reference/contributing)
