# CI/CD Integration

The analyzer runs as a single zero-argument command. Place a `config.yaml` at the repo root and call `analyze` in your pipeline.

## Quick setup

1. Add `config.yaml` to your project root (see [Configuration Reference](configuration.md))
2. Add a CI step that runs `analyze`

## GitHub Actions

```yaml
name: API Coverage Analysis

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  api-coverage:
    name: API Test Coverage
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      # config.yaml at repo root controls all scan behaviour
      - name: Run full analysis
        run: analyze

      - name: Upload reports
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: coverage-reports
          path: reports/
          retention-days: 30
```

### Using a custom config per environment

```yaml
      - name: Run analysis (staging profile)
        run: analyze --config ./configs/staging.yaml
```

### Threshold enforcement

Set `qualityGate.failBuildOnThresholdMiss: true` in `config.yaml` to fail the build when coverage falls below any threshold:

```yaml
qualityGate:
  enabled: true
  failBuildOnThresholdMiss: true
  mode: strict

thresholds:
  global: 80
  endpoint: 90
```

## Jenkins

```groovy
pipeline {
  agent any

  stages {
    stage('Install') {
      steps { sh 'npm ci' }
    }

    stage('API Coverage') {
      steps {
        // config.yaml at workspace root controls all scan behaviour
        sh 'analyze'
      }
      post {
        always {
          archiveArtifacts artifacts: 'reports/**', allowEmptyArchive: true
          junit 'reports/coverage-summary-junit.xml'
        }
      }
    }
  }
}
```

## No-config behaviour

If `config.yaml` is absent, `analyze` runs the full default profile and emits a warning to stdout. The build does **not** fail by default — set `analysis.failOnConfigMissing: true` to change this.

## See also

- [Configuration Reference](configuration.md)
- [Thresholds](thresholds.md)
- [Migration Guide](migration-to-config-yaml.md)
