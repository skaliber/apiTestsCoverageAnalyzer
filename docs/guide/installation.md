# Installation

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | ≥ 18 LTS | Tested on Node 18 and 20. Uses CommonJS modules. |
| npm | ≥ 9 | Comes bundled with Node.js |
| Git | any | Required to clone the repository |

Check your versions:

```bash
node --version   # e.g. v20.12.0
npm --version    # e.g. 10.5.0
```

## Installation methods

### From source (recommended for development)

```bash
# 1. Clone the repository
git clone https://github.com/skaliber/apiTestsCoverageAnalyzer.git
cd apiTestsCoverageAnalyzer

# 2. Install dependencies
npm install

# 3. Build the TypeScript source
npm run build

# 4. Verify installation
node dist/index.js --help
```

### Using ts-node (no build step)

If you are iterating quickly you can skip the build step and run TypeScript directly:

```bash
node -r ts-node/register src/index.ts --help
```

### Global CLI via npm link

After cloning and installing dependencies, link the binary globally:

```bash
npm link
coverage-analyzer --help
```

> **Note:** The binary name exposed in `package.json` bin is `coverage-analyzer`. After `npm link` you can invoke it directly without the `node` prefix.

## Directory layout after installation

```
apiTestsCoverageAnalyzer/
├── dist/           # compiled JavaScript (after npm run build)
├── docs/           # documentation site (VitePress)
├── src/            # TypeScript source
├── tests/          # Jest unit tests
├── sample/         # example OpenAPI spec, test suites, load results, contracts
├── plugins/        # built-in sample plugin (graphql-coverage.js)
├── reports/        # generated reports land here (git-ignored by default)
├── dashboard/      # UI dashboard (Vite + React)
├── ci/             # CI/CD example configurations
├── coverage.config.json  # default configuration file
└── package.json
```

## Upgrading

Pull the latest changes and rebuild:

```bash
git pull origin main
npm install      # install any new dependencies
npm run build    # recompile
```

## Next steps

- [Getting Started →](/guide/getting-started)
- [CLI Reference →](/reference/cli)
