# AGENTS.md — Execution Rules for AI Coding Agents

This repository is maintained with the help of AI coding agents.  
If you are an AI agent working in this repository, you **must follow these rules strictly**.

These rules exist to ensure that the project remains **stable, production-grade, testable, and deterministic**.

Failure to follow them leads to broken builds, incomplete implementations, or misleading reports.

---

# 1. Completion Rule

A task is **NOT complete** until ALL of the following are true:

1. The implementation is finished.
2. The code compiles and builds.
3. All affected tests are updated.
4. **All test layers pass**, not just unit tests.
5. Documentation is updated.
6. CI behavior still works.
7. Generated reports and summaries still work.

Do not stop when code compiles.  
Do not stop when only unit tests pass.

---

# 2. Mandatory Test Execution

When modifying code, you **must run every relevant test layer**.

This repository may contain multiple test layers:

- unit tests
- integration tests
- end-to-end tests
- Cypress browser tests
- configuration validation tests
- documentation build tests
- analyzer self-analysis tests
- CI summary/report generation tests

If a layer exists and may be affected by your change, you must run it.

You are **not allowed to complete a task while any relevant tests are failing**.

---

# 3. Use the Makefile

If a `Makefile` exists, it is the **canonical execution interface**.

Prefer Makefile targets over custom shell commands.

Typical targets may include:


make install
make build
make lint
make test
make test-unit
make test-integration
make test-e2e
make docs-build
make self-analysis
make ci


If you add a new workflow or capability, add the appropriate target to the Makefile.

CI pipelines should rely on the Makefile.

---

# 4. CI Integrity

The CI system must reflect the real health of the project.

Rules:

- CI must fail if tests fail.
- CI must fail if coverage thresholds are missed.
- CI must fail if report generation breaks.
- CI must fail if docs build fails.

Do not bypass CI checks.

Quality gates must be enforced **inside the analyzer library**, not via shell scripting.

---

# 5. Coverage and Metrics

Coverage and scanning results must follow strict semantics.

Valid metric states are:

- PASS
- FAIL
- SKIPPED
- N/A

Invalid states include:

- `0% PASS`
- `warning + pass`
- ambiguous mixed states

Metrics must always be evaluated through a **central metric evaluation model**.

All implemented metric types must appear in summaries.

---

# 6. Central Configuration

Configuration must be centralized.

Preferred configuration file:


config.yaml


Rules:

- The analyzer must run with **no config file** using default behavior.
- If the config file is missing, show a **warning** but still run full analysis.
- If a config file is provided, it overrides defaults.

Do not introduce scattered configuration files.

All scanning configuration must come from the central config.

---

# 7. Reporting and Summaries

Reports and summaries must be consistent across:

- CLI output
- GitHub Actions summaries
- PR comments
- Jenkins build summaries
- dashboard views
- static report pages

Rules:

- All metrics that ran must appear.
- Disabled metrics must be `SKIPPED`.
- Non-applicable metrics must be `N/A`.
- Summaries must include **AI-friendly interpretation**.

Do not render raw scanner outputs directly.

---

# 8. MCP / AI Integration Rules

If you modify AI or MCP integrations:

- prompts must remain centralized
- responses must be normalized before rendering
- no raw model output should be displayed
- sensitive values must be redacted
- provide fallback behavior if MCP is unavailable

AI output must be deterministic and mapped into a structured template.

---

# 9. Security Scanner Rules

Security scanning must follow these rules:

- scanners must be configurable
- scanner results must normalize into a common format
- findings must appear in summaries
- severity thresholds must integrate with quality gates

Never hide security findings silently.

---

# 10. Documentation Discipline

Documentation must always reflect the real behavior of the system.

Whenever behavior changes, update:

- README
- configuration documentation
- CLI reference
- CI/CD guide
- scanning documentation
- dashboard documentation
- examples

Documentation must be:

- concise
- deterministic
- AI-friendly
- consistent with the codebase

Do not leave outdated documentation.

---

# 11. Business Rules

If the analyzer implements business rules:

- keep the rules aligned with actual capabilities
- update rules when capabilities change
- add tests verifying the rules

Do not allow rules to drift from implementation.

---

# 12. Self-Analysis Capability

The analyzer must be capable of analyzing **its own repository**.

If you change metrics, summaries, scanning behavior, or configuration:

- update the self-analysis workflow
- update self-analysis tests
- ensure reports still generate correctly

Self-analysis must remain stable.

---

# 13. Code Quality Expectations

Avoid:

- duplicate implementations
- hidden configuration paths
- fragile string parsing
- silent failures
- partially implemented features

Prefer:

- typed models
- centralized logic
- deterministic evaluation
- clear error messages

---

# 14. Safe Refactoring

If refactoring:

- migrate callers to the new implementation
- remove obsolete code paths
- update tests
- update documentation

Do not leave parallel implementations unless necessary for migration.

---

# 15. When Unsure

If you are unsure whether a test, report, config, or doc is affected:

Assume it **is affected** and verify.

Always prioritize:

1. correctness
2. completeness
3. test stability
4. documentation accuracy
5. CI reliability