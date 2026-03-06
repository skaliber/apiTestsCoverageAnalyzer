# 05 - Integration Flow Coverage

This feature measures how well the test suite exercises multi-step workflows and interactions between services.

## Objective

In distributed systems, a single user action can trigger a chain of API calls, database operations, message queue events, and external service invocations. The analyser should track these flows and determine whether end-to-end integration paths are covered by tests.

## Steps for the agent

1. **Model integration flows**  
   - Allow the user to describe expected flows as a sequence of events (e.g. API call → event published → downstream service call). This can be defined via a YAML/JSON flow file or inferred from the system design.  
   - Identify key steps and the services/components involved.

2. **Capture test execution traces**  
   - Instrument the system under test or use logs to capture the actual sequence of calls/events when integration tests run.  
   - For each test, record the ordered list of endpoints, topics, and external services invoked.

3. **Match traces to expected flows**  
   - Compare the captured traces with the defined integration flows.  
   - Determine which flows are fully exercised, partially exercised, or never exercised.  
   - Account for variations (e.g. optional steps or branching paths).

4. **Generate coverage metrics**  
   - Calculate the percentage of flows covered by at least one test.  
   - For partially covered flows, highlight missing steps.

5. **Reporting and visualisation**  
   - Output a report showing which flows are covered and their status (complete, partial, missing).  
   - Provide visual diagrams (e.g. sequence diagrams) where possible to illustrate coverage.

6. **Validation**  
   - Use a sample integration flow definition and sample integration tests in the `sample/` directory.  
   - Verify that the analyser correctly matches test traces to flows and identifies uncovered paths.  
   - Refine matching logic until results align with manual tracing.

## Completion criteria

The agent should not stop until:
- Integration flow definitions can be ingested.  
- Test traces are captured and mapped to flows.  
- Coverage reports accurately reflect which flows are covered and visualisations are generated where applicable.
