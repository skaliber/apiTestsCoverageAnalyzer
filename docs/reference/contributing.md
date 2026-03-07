# Contributing

Thank you for your interest in contributing to the API Test Coverage Analyzer! This guide explains how to set up your development environment, run tests, and submit changes.

## Code of Conduct

Please read our [Code of Conduct](https://github.com/q-intel/apiTestsCoverageAnalyzer/blob/main/CODE_OF_CONDUCT.md) before participating. We are committed to fostering a welcoming and inclusive community.

## Ways to contribute

- **Report bugs** – open a [GitHub issue](https://github.com/q-intel/apiTestsCoverageAnalyzer/issues/new?template=bug_report.md).
- **Request features** – open an issue with the `enhancement` label.
- **Fix bugs / implement features** – fork the repo, make changes, and open a pull request.
- **Improve documentation** – edit files in `docs/` and submit a PR.
- **Write plugins** – see [Extending via Plugins](../guide/plugins.md).

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
npm run docs:check  # validate links, sidebar, and assets, then build
npm run docs:preview  # serve the built static site (production preview)
npm run docs:test   # run Cypress navigation/link tests (requires docs:preview running)
```

Run the full docs validation locally before opening a PR:

```bash
npm run docs:check
```

## Project structure

See [Architecture →](./architecture.md) for a detailed description of each module.

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
- [ ] Docs check passes (`npm run docs:check`).
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

## Documentation contributor guide

### How docs routing works

The documentation site is built with [VitePress](https://vitepress.dev). All source
files live under `docs/`. VitePress uses **cleanUrls mode**: a file at
`docs/guide/getting-started.md` is served at `/guide/getting-started` (no `.md`
extension in the URL).

The sidebar and navigation links are declared in `docs/.vitepress/config.mts`.

### How to write internal links

Use **relative `.md` paths** for links between docs pages. These work both in the deployed VitePress site and when the Markdown is viewed directly on GitHub:

```markdown
<!-- ✅ Correct – relative path with .md extension (works on GitHub and in VitePress) -->
See [CLI Reference](../reference/cli.md) for all options.

<!-- ✅ Correct – relative path with fragment -->
See [--language flag](../reference/cli.md#supported-languages).

<!-- ❌ Avoid – absolute VitePress paths break when Markdown is viewed on GitHub -->
See [CLI Reference](/reference/cli) for all options.
```

### How to reference image assets

Place screenshots and images in `docs/assets/screenshots/` and reference them
using **relative paths** from the page that uses them:

```markdown
<!-- from docs/guide/interpreting-reports.md -->
![Overview dashboard](../assets/screenshots/overview-dashboard.png)
```

Do **not** place documentation assets in `docs/public/`. The `public/` directory
is reserved for root-level site assets (e.g. `logo.svg`, `favicon.ico`) that must
be served at the site root path.

### How to add a new page

1. Create `docs/<section>/<page-name>.md`.
2. Add a sidebar entry in `docs/.vitepress/config.mts`:
   ```ts
   { text: 'My Page', link: '/<section>/<page-name>' }
   ```
3. Add the route to the Cypress test list in `cypress/e2e/docs-links.cy.js`.
4. Run `npm run docs:check` to validate everything.

### How to run docs validation locally

```bash
# 1. Validate sidebar, internal links, and assets (fast, no server needed)
npm run docs:check

# 2. Start the dev server and browse interactively
npm run docs:dev

# 3. Build and run E2E browser tests
npm run docs:build
npm run docs:preview &
npm run docs:test
```

### How to troubleshoot broken links

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `docs:check` fails with "broken absolute link" | A `/guide/...` or `/reference/...` link in a `.md` file points to a page that doesn't exist | Check the target path in `docs/` and fix the link or create the missing page |
| `docs:check` fails with "Sidebar link … no matching .md file" | A `link:` entry in `config.mts` points to a page that hasn't been created yet | Create the page or remove the sidebar entry |
| Cypress test fails with `expected link … to return 2xx` | A page that was referenced and rendered in HTML no longer exists | Fix the broken link in the source `.md` file |
| VitePress build prints dead-link warning | An internal `[text](/path)` link is broken | Run `npm run docs:check` to identify the exact file and link |
| Logo missing in site header | `docs/public/logo.svg` was deleted | Restore the file (see `docs/public/logo.svg`) |
