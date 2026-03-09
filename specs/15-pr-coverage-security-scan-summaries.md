# PR Coverage & Security Scan Summaries Built Into the Library and CI Integrations

## Primary Goal

Implement a **built-in summary engine** that:

- Generates PR/build summaries for:
  - Endpoint coverage
  - Parameter coverage
  - Business coverage
  - Integration flow coverage
  - Error coverage
  - Security coverage
  - Performance/resilience coverage
  - Compatibility/contract coverage
  - Security scanner results (Semgrep / Trivy / ZAP / optional scanners)
- Is **owned by the library**, not by consumers
- Works consistently across:
  - Local CLI runs
  - GitHub Action
  - Jenkins integration
- Includes only the sections that are actually relevant:
  - If a gate is enabled and evaluated, include it
  - If a gate is disabled or that category was not run, omit it
  - If a scanner was not enabled, omit it
- Produces summaries that are:
  - Human-friendly
  - AI-friendly
  - Deterministic
  - Markdown-first
  - Safe for PR comments, build summaries, and published reports

---

## Requirements

### 1. Summary Engine

Create a dedicated summary module:

```
src/summary/
src/summary/buildSummary.ts
src/summary/prSummary.ts
src/summary/markdownRenderer.ts
```

This module must accept the final normalized analysis results and produce:

- PR summary markdown
- Build summary markdown
- Per-category summary markdown
- Machine-readable summary JSON

#### Required output files

| File | Description |
|------|-------------|
| `reports/pr-summary.md` | PR comment markdown |
| `reports/build-summary.md` | Build/CI summary markdown |
| `reports/summary.json` | Machine-readable summary |

#### Public API

```ts
generateBuildSummary(results, config): Promise<SummaryResult>
generatePrSummary(results, config): Promise<SummaryResult>
```

```ts
type SummaryResult = {
  markdown: string;
  sections: Array<{
    id: string;
    title: string;
    included: boolean;
    gateEvaluated: boolean;
    passed?: boolean;
    markdown: string;
  }>;
  json: unknown;
};
```

---

### 2. Summary Content Rules

For every enabled coverage type or enabled scanner, include:

- What was analyzed
- How many files were analyzed
- How many tests were analyzed
- What spec/rules/flows/contracts were used
- Total items
- Covered items
- Uncovered items
- Coverage percentage
- Threshold / gate used
- Pass/fail result
- Top gaps
- Recommended next actions

#### Example section structure

```markdown
## Endpoint Coverage

**Status:** PASS
**Gate:** enabled
**Threshold:** 100%
**Actual Coverage:** 92.4%

### Scope
- Spec file: `openapi.yaml`
- Test files analyzed: 34
- Endpoints analyzed: 57

### Results
- Covered endpoints: 53
- Uncovered endpoints: 4

### Main Gaps
- `POST /payments/refund`
- `DELETE /users/{id}`
- `PATCH /limits/{id}`

### Recommended Next Work
- Add positive and negative test coverage for `POST /payments/refund`
- Add authz test coverage for `DELETE /users/{id}`
```

This same structure must be adapted for:

- Parameters
- Business rules
- Flows
- Security
- Errors
- Performance/resilience
- Compatibility
- Security scans

---

### 3. Gate-Aware Inclusion Logic

#### Inclusion rules

A section **must be included** only if:

- That analyzer or scanner actually ran, or
- Its gate was configured and evaluated

A section **must be omitted** if:

- The analyzer was not run
- The scanner was disabled
- The gate is disabled and there are no results

#### Gate display rules

If a gate exists:

- Show threshold
- Show pass/fail
- Show why it failed

If no gate exists:

- Show `Gate: not configured`
- Do not invent pass/fail
- Still show results if analysis ran

#### Example

| Scenario | Behavior |
|----------|----------|
| Security scanner ran, gate disabled | Include scanner results; show `Gate: not configured` |
| Compatibility did not run at all | Omit entire compatibility section |

---

### 4. GitHub Actions Integration

The GitHub Action must use the library summary engine internally.

#### Required behavior

- Generate PR summary markdown automatically
- Publish it into:
  - GitHub Actions Step Summary
  - Optional PR comment
- Expose top-level outputs:
  - `overallStatus`
  - `overallCoverage`
  - `failedGates`
  - `summaryPath`

| Trigger | Behavior |
|---------|----------|
| Pull Request | Post or update PR comment when configured; include only relevant sections |
| Push | Write summary to Actions job summary |
| Gate failure | Still generate summary and upload artifacts; fail action only after generation |

#### Required tests

- Summary generated with all sections
- Summary omits disabled sections
- Summary renders failed gates correctly
- Action summary content matches library output
- PR comment markdown is valid and stable

---

### 5. Jenkins Integration

Implement a Jenkins-friendly summary publishing path, also driven by the library.

#### Required behavior

- Generate `build-summary.md`
- Generate `build-summary.html` if needed
- Expose a Jenkins-consumable summary artifact
- Optionally generate a small `summary.txt` fallback for console use
- Integrate with existing Jenkins examples

#### Jenkins output requirements

- Archive summary artifacts
- Publish HTML summary page if configured
- Include gate outcomes
- Omit non-run analyzers/scanners

#### Jenkins example

Update `ci/examples/jenkins-pipeline.groovy` to show the minimal integration needed by teams. Teams must not need to write custom parsing logic.

---

### 6. Security Scanning Summary Support

Extend the summary engine so security scanning results from Semgrep, Trivy, ZAP, and optional future scanners are summarized in a dedicated **Security Scanning** section.

#### Required content per scanner

- Scanner name
- Whether it ran successfully
- What was scanned
- Counts by severity
- Major findings
- Whether the scanner gate passed
- Whether findings block the build

#### Example

```markdown
## Security Scanning

**Status:** FAIL
**Gate:** enabled

### Semgrep
- Files scanned: 124
- Critical: 0
- High: 2
- Medium: 7
- Gate result: FAIL

### Trivy
- Dependency manifests scanned: 8
- Critical vulns: 1
- High vulns: 3
- Secrets: 0
- Misconfig high: 1
- Gate result: FAIL

### Main Blocking Findings
- High severity SQL injection risk in `src/payments/refund.ts`
- Critical dependency vulnerability in `jackson-databind`
- High severity IaC misconfiguration in `deploy/k8s/ingress.yaml`
```

If a scanner is disabled, do not include it.

---

### 7. AI-Friendly Summary Format

Everything documented and generated must be AI-friendly:

- Short paragraphs
- Stable headings
- Predictable field names
- Bullet lists for gaps and recommendations
- Explicit pass/fail wording
- No decorative fluff
- No ambiguous phrases like "looks okay"
- No hidden meaning in icons only

#### AI summary output files

| File | Description |
|------|-------------|
| `reports/ai-summary.md` | AI-optimized markdown |
| `reports/ai-summary.json` | AI-optimized JSON |

The AI markdown must be optimized for reuse by agents that may later:

- Generate missing tests
- Propose fixes
- Prioritize technical debt
- Create issues

AI summary must include:

- Analyzed inputs
- Files/tests/specs/flows/contracts scanned
- Exact gaps
- Exact failed gates
- Recommended next steps
- Highest priority remediation items

---

### 8. Summary Landing Page in Published Reports

If the build produces published static reports or GitHub Pages output, include:

- Overview page with embedded rendered summary
- Per-category pages with embedded category summary
- Security scanning page with embedded scanner summary

Dashboard page requirements:

- Show AI-friendly summary collapsed by default
- Allow expand/collapse
- Include raw markdown download option

---

### 9. Testing Requirements

#### Unit tests

Write thorough unit tests for:

- Section inclusion logic
- Gate-aware rendering
- Scanner-aware rendering
- Markdown generation
- Pass/fail status logic
- Omission of non-run analyzers
- AI summary structure

#### Integration tests

Add integration tests that:

- Run analyzers with realistic sample data
- Generate summaries
- Verify files are created
- Verify summary content for GitHub Actions mode
- Verify summary content for Jenkins mode
- Verify build still produces summaries when gate fails

#### Cypress tests

Add Cypress tests for dashboard behavior:

- AI summary panel exists on each page
- AI summary is collapsed by default
- AI summary expands correctly
- Rendered markdown is visible
- Hidden/omitted sections are truly absent
- Security scanning page shows scanner results correctly
- Dashboard page reflects failed gates
- Screenshots can be captured successfully for docs

---

### 10. Documentation Updates

Update all relevant documentation, and make it AI-friendly.

#### Files to update

- `README.md`
- `docs/`
- CI integration docs
- GitHub Action docs
- Jenkins docs
- Security scanning docs
- Dashboard docs
- AI summary docs

#### Documentation must explain

- What summaries are generated
- Where they are stored
- How PR summaries work
- How build summaries work
- How gates affect inclusion
- That teams do not need to write custom fail logic
- How GitHub Action and Jenkins consume built-in summaries
- How to enable/disable PR comment publishing
- How to configure thresholds/gates
- How to use AI-friendly markdown outputs

#### Required screenshots for docs

- GitHub Actions summary
- Dashboard AI summary collapsed
- Dashboard AI summary expanded
- Security scanning summary page
- Failed gate summary example

---

### 11. Backwards Compatibility

Do not break existing:

- CLI usage
- Report generation
- GitHub Action usage unless versioned intentionally
- Jenkins example semantics

If existing config does not mention summary settings:

- Use safe defaults
- Generate summaries automatically when reports are generated

---

### 12. Configuration

Add config support in `coverage.config.json`:

```json
{
  "summary": {
    "enabled": true,
    "generatePrSummary": true,
    "generateBuildSummary": true,
    "generateAiSummary": true,
    "includeOnlyEvaluatedSections": true,
    "publishPrComment": true,
    "publishGithubStepSummary": true,
    "publishJenkinsSummary": true
  }
}
```

Also support CLI overrides where relevant.

---

### 13. Acceptance Criteria

The feature is complete only if **all** of the following are true:

1. PR/build summary generation lives inside the library
2. GitHub Action uses the built-in summary engine
3. Jenkins integration uses the built-in summary engine
4. Summaries include every enabled coverage/scanner result
5. Summaries omit analyzers/scanners that did not run
6. Summaries reflect gates only when gates were evaluated
7. Gate failures are clearly shown
8. Build can fail from library logic without custom consumer scripts
9. Reports and summaries are still generated when gates fail
10. AI-friendly markdown outputs are produced
11. Documentation is updated
12. Unit tests pass
13. Integration tests pass
14. Cypress tests pass

---

### 14. Execution Instructions

Work iteratively without stopping early. For every change:

1. Implement
2. Run tests
3. Fix failures
4. Update docs
5. Rerun tests

#### Definition of Done

- All unit tests pass
- All integration tests pass
- All Cypress tests pass
- Docs are updated
- Generated summaries are AI-friendly
- No relevant section is missing or incorrectly included
