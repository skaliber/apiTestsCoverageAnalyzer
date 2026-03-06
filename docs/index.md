---
layout: home

hero:
  name: API Test Coverage Analyzer
  text: Know exactly which parts of your API are tested
  tagline: Analyse endpoint, parameter, business-logic, security, performance, and resilience coverage against your OpenAPI specs. Generate rich reports. Enforce thresholds in CI.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: CLI Reference
      link: /reference/cli
    - theme: alt
      text: View on GitHub
      link: https://github.com/skaliber/apiTestsCoverageAnalyzer

features:
  - icon: 🔍
    title: Endpoint Coverage
    details: Discover which API endpoints defined in your OpenAPI spec are actually exercised by your test suite.
  - icon: 🧩
    title: Parameter Coverage
    details: Verify that each parameter is tested with valid, boundary, missing, and invalid values.
  - icon: 📋
    title: Business Rule Coverage
    details: Map test scenarios to named business rules and track which rules are validated.
  - icon: 🔗
    title: Integration Flow Coverage
    details: Ensure end-to-end integration flows across multiple endpoints are fully exercised.
  - icon: 🔒
    title: Security Coverage
    details: Check that authentication, authorisation, injection, and other OWASP security scenarios are tested.
  - icon: ⚡
    title: Performance & Resilience
    details: Integrate JMeter and k6 results to verify SLA compliance and chaos/resilience test coverage.
  - icon: 🔄
    title: Compatibility & Contracts
    details: Detect breaking changes between API versions and verify Pact consumer contracts.
  - icon: 📊
    title: Rich Reports
    details: Generate JSON, HTML, CSV, and JUnit reports. View them in the built-in UI dashboard or upload to your CI system.
  - icon: 🔌
    title: Plugin Architecture
    details: Extend the analyzer with custom coverage types (e.g. GraphQL schema coverage) via a simple plugin interface.
---
