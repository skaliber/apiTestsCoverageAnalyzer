# Contributing

Thank you for your interest in contributing to the API Test Coverage Analyzer! This guide explains how to set up your development environment, run tests, and submit changes.

## Code of Conduct

Please read our [Code of Conduct](https://github.com/skaliber/apiTestsCoverageAnalyzer/blob/main/CODE_OF_CONDUCT.md) before participating. We are committed to fostering a welcoming and inclusive community.

## Ways to contribute

- **Report bugs** – open a [GitHub issue](https://github.com/skaliber/apiTestsCoverageAnalyzer/issues/new?template=bug_report.md).
- **Request features** – open an issue with the `enhancement` label.
- **Fix bugs / implement features** – fork the repo, make changes, and open a pull request.
- **Improve documentation** – edit files in `docs/` and submit a PR.
- **Write plugins** – see [Extending via Plugins](/guide/plugins).

## Development setup

### 1. Fork and clone

```bash
git clone https://github.com/<your-username>/apiTestsCoverageAnalyzer.git
cd apiTestsCoverageAnalyzer
```

### 2. Install dependencies

```bash
npm install
```

### 3. Build

```bash
npm run build   # tsc → dist/
```

### 4. Run tests

```bash
npm test        # jest with ts-jest
```

Run a single test file:

```bash
npx jest tests/endpointCoverage.test.ts
```

Run tests with coverage:

```bash
npx jest --coverage
```

### 5. Work on the UI dashboard

```bash
cd dashboard
npm install
npm run dev    # Vite dev server on http://localhost:5173
npm test       # Vitest unit tests
```

### 6. Work on docs

```bash
npm run docs:dev    # VitePress dev server on http://localhost:5174
npm run docs:build  # build static site → docs/.vitepress/dist/
```

## Project structure

See [Architecture →](/reference/architecture) for a detailed description of each module.

## Coding standards

- **Language**: TypeScript 5.x, `"strict": true`.
- **Module system**: CommonJS (`"module": "commonjs"`) for Node.js CLI compatibility.
- **File globbing**: use `fast-glob` (not `globby`, which is ESM-only).
- **YAML parsing**: use `js-yaml`.
- **Logging**: use the `getLogger()` helper from `src/observability.ts` (do not use `console.log` in production code).
- **Tests**: Jest + ts-jest. Place unit tests in `tests/` mirroring the `src/` structure. Each new module must have a corresponding test file.
- **No unused imports**: run `tsc --noEmit` before opening a PR.

## Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short summary>

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `perf`.

Examples:

```
feat(endpoint-coverage): add support for OpenAPI 3.1
fix(reporting): escape HTML special chars in endpoint names
docs(contributing): add section on plugin development
test(security-coverage): add injection scenario tests
```

## Branch workflow

1. Create a feature branch from `main`:

   ```bash
   git checkout -b feat/my-feature
   ```

2. Make focused commits.
3. Push and open a pull request against `main`.
4. The CI pipeline (`github-actions.yaml`) must pass before merging.
5. At least one review approval is required.

## Pull request checklist

- [ ] Tests pass locally (`npm test`).
- [ ] Build succeeds (`npm run build`).
- [ ] New functionality has corresponding tests.
- [ ] Documentation updated if needed (`docs/`).
- [ ] Commit messages follow Conventional Commits.
- [ ] PR description explains the motivation and approach.

## Adding a new coverage type

1. Create `src/<type>Coverage.ts` following the pattern of existing engines.
2. Export the result builder function and add a new Commander command in `src/index.ts`.
3. Add tests in `tests/<type>Coverage.test.ts`.
4. Document the new command in `docs/reference/cli.md`.
5. Add threshold support in `src/config.ts` and `src/reporting.ts`.

## Versioning and releases

The project uses [Semantic Versioning](https://semver.org/). Releases are tagged on `main`.

To create a release (maintainers only):

```bash
npm version patch   # or minor / major
git push --follow-tags
```

The CI pipeline publishes the new version to npm automatically.
