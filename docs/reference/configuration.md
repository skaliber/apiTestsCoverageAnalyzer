# Configuration Schema

> **This page is superseded.** The analyzer now uses a single `config.yaml` file.
> See [`docs/guides/configuration.md`](../guides/configuration.md) for the complete reference.

## Migrating from `coverage.config.json`

If you have an existing `coverage.config.json`, see
[`docs/guides/migration-to-config-yaml.md`](../guides/migration-to-config-yaml.md) for the
field-by-field migration guide.

## CLI flag precedence

```
CLI flag > config.yaml > built-in default
```

Deprecated `--threshold-*` CLI flags still work but emit a deprecation warning. Migrate values
to the `thresholds` block in `config.yaml`.
