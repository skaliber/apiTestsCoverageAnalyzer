# 04 - Business Logic Coverage

This feature evaluates how comprehensively the test suite covers the business rules and scenarios encoded in the API.

## Objective

Beyond individual endpoints and parameters, APIs implement complex workflows and domain-specific rules (e.g. payments cannot exceed account balance, refunds only allowed within 30 days). The analyser should map these business rules to tests and detect untested scenarios.

## Steps for the agent

1. **Define business logic sources**  
   - Accept a specification of business rules, which may be described in accompanying documentation (e.g. API design docs, ADRs, or YAML/JSON files listing scenarios).  
   - Represent each rule or scenario with a unique identifier, description, involved endpoints, and expected outcomes.

2. **Map tests to business rules**  
   - Analyse test names, descriptions, tags, and assertions to identify which business rule they exercise.  
   - Use heuristics such as keywords (e.g. “insufficient funds”) and combinations of endpoints to infer scenario coverage.  
   - Optionally allow developers to annotate tests with the corresponding business rule IDs to improve accuracy.

3. **Compute coverage**  
   - For each business rule, determine whether there is at least one corresponding test.  
   - If multiple test cases cover different sub-paths of a rule (e.g. success vs. failure), track them separately.

4. **Report results**  
   - Generate a report listing all business rules and indicating which are covered, partially covered, or not covered.  
   - Include links to the associated tests for traceability.  
   - Highlight untested rules so product owners can prioritise test creation.

5. **Validation**  
   - Provide a sample set of business rules and tests in the `sample/` directory.  
   - Verify that the analyser correctly maps tests to rules and identifies missing coverage.  
   - Refine keyword extraction and matching algorithms until the tool’s mapping matches manual review.

## Completion criteria

The agent should not stop until:
- A mechanism to ingest business rule definitions is implemented.  
- Tests can be mapped to these rules automatically or via annotations.  
- Coverage metrics and reports correctly reflect which business rules are tested.
