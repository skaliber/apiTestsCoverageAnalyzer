# Contributing to API Test Coverage Analyzer

Thank you for considering contributing! Please read this guide before submitting changes.

## Quick links

- [Development setup](#development-setup)
- [Running tests](#running-tests)
- [Coding standards](#coding-standards)
- [Commit messages](#commit-messages)
- [Pull request process](#pull-request-process)
- [Full contributing guide in the docs →](https://skaliber.github.io/apiTestsCoverageAnalyzer/reference/contributing)

## Development setup

```bash
git clone https://github.com/skaliber/apiTestsCoverageAnalyzer.git
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

Open an issue at https://github.com/skaliber/apiTestsCoverageAnalyzer/issues with the **bug** label. Include:

- Steps to reproduce
- Expected behaviour
- Actual behaviour
- Node.js version (`node --version`)
- OS

## Requesting features

Open an issue with the **enhancement** label and describe the use case.
