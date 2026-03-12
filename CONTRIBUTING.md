# Contributing to API Test Coverage Analyzer

Thank you for considering contributing! Please read this guide before submitting changes.

## Quick links

- [Development setup](#development-setup)
- [Running tests](#running-tests)
- [Coding standards](#coding-standards)
- [Commit messages](#commit-messages)
- [Pull request process](#pull-request-process)
- [Full contributing guide in the docs →](https://q-intel.github.io/apiTestsCoverageAnalyzer/reference/contributing)

## Development setup

```bash
git clone https://github.com/q-intel/apiTestsCoverageAnalyzer.git
cd apiTestsCoverageAnalyzer
npm install
npm run build
npm test
```

## Running tests

```bash
npm test                                        # all tests
npx jest tests/endpointCoverage.test.ts        # single file
npx jest --coverage                            # with coverage report
```

## Coding standards

- TypeScript 5.x, `"strict": true`
- CommonJS modules (`"module": "commonjs"`)
- Use `fast-glob` for file globbing (not `globby` – ESM-only)
- Use `js-yaml` for YAML parsing
- Use `getLogger()` from `src/observability.ts` instead of `console.log`
- Every new module in `src/` must have a corresponding test in `tests/`

## Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(scope): short summary
fix(scope): short summary
docs(scope): short summary
test(scope): short summary
```

## Pull request process

1. Fork the repo and create a feature branch from `main`.
2. Make changes with focused commits.
3. Ensure `npm test` and `npm run build` pass.
4. Open a pull request against `main` with a clear description.
5. At least one maintainer review is required before merging.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). Please be respectful and inclusive.

## Reporting bugs

Open an issue at https://github.com/q-intel/apiTestsCoverageAnalyzer/issues with the **bug** label. Include:

- Steps to reproduce
- Expected behaviour
- Actual behaviour
- Node.js version (`node --version`)
- OS

## Requesting features

Open an issue with the **enhancement** label and describe the use case.

## Publishing

### Releasing a new version

1. Bump the version in `package.json` following [semver](https://semver.org/):
   ```bash
   npm version patch   # 1.0.0 → 1.0.1
   npm version minor   # 1.0.0 → 1.1.0
   npm version major   # 1.0.0 → 2.0.0
   ```
2. Push the commit and the auto-created tag:
   ```bash
   git push && git push --tags
   ```
3. The `.github/workflows/publish.yml` workflow triggers automatically on the new tag and:
   - Runs tests (`npm test`)
   - Builds the library and action (`npm run build`)
   - Publishes the package to npm (`npm publish`)
   - Creates a GitHub Release with the compiled `dist/` archive attached

### Setting up npm publishing

The publish workflow requires an `NPM_TOKEN` repository secret. To configure it:

1. Create an npm automation token at [npmjs.com → Access Tokens](https://www.npmjs.com/settings/~/tokens).
2. Add it as a repository secret named `NPM_TOKEN` in **Settings → Secrets and variables → Actions**.

### Updating the GitHub Action

The GitHub Action lives in `action/src/index.ts` and is compiled into `dist/action/src/index.js` by the root TypeScript build (`npm run build`).

To add new inputs or outputs:
1. Add the input/output definition to `action/action.yml`.
2. Read the new input with `core.getInput('my-input')` in `action/src/index.ts`.
3. Set a new output with `core.setOutput('my-output', value)`.
4. Update `README.md` action inputs/outputs tables.
5. Add a test case in `.github/workflows/test-action.yml`.

### Testing changes locally

Use [act](https://github.com/nektos/act) to simulate GitHub Actions locally:

```bash
# Install act
brew install act   # macOS
# or follow https://nektosact.com/installation/index.html

# Run the test-action workflow locally
act push -W .github/workflows/test-action.yml

# Run only the endpoint coverage job
act push -W .github/workflows/test-action.yml -j test-action-endpoint
```

### Adding new coverage types

1. Implement the analysis logic in `src/<type>Coverage.ts`.
2. Export a wrapper function from `src/lib/index.ts` (e.g. `analyzeMyType`).
3. Add a CLI command in `src/index.ts`.
4. Add the coverage type to the `coverage-types` input handling in `action/src/index.ts`.
5. Expose new threshold input/output in `action/action.yml`.
6. Write unit tests in `tests/<type>Coverage.test.ts`.
7. Update the CLI reference and action documentation in the README and `docs/`.
