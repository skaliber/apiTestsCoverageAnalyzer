# 03 - Parameter Coverage

This feature assesses how well the test suite covers the inputs and parameters defined for each API endpoint.

## Objective

For each endpoint, examine how thoroughly tests exercise different categories of parameters—path parameters, query parameters, headers, and request body fields. Identify gaps in parameter testing so that edge cases and boundary values are not missed.

## Steps for the agent

1. **Extract parameters from the API specification**  
   - For every operation, list its path parameters, query parameters, header parameters, and request body schema fields.  
   - Determine constraints such as required/optional, data types, and value ranges from the spec.

2. **Analyse tests for parameter usage**  
   - Parse the test files to capture actual values provided for each parameter. This may involve static analysis of request construction or intercepting runtime requests.  
   - Categorise each provided value: typical valid value, boundary/extreme value (e.g. minimum, maximum), missing/undefined, malformed/invalid type, etc.

3. **Compute coverage metrics**  
   - For each parameter, determine whether tests include:
     - At least one valid value.
     - Boundary values for numeric or length‑constrained fields.
     - Missing/empty cases for optional parameters.
     - Invalid or malformed values to trigger error handling.
   - Calculate coverage percentages per parameter and aggregate across the API.

4. **Generate reports**  
   - Produce a detailed report listing parameters and which categories of values have been tested.  
   - Highlight parameters lacking certain categories (e.g. no tests for invalid email format).  
   - Output JSON and human‑readable formats.

5. **Validation**  
   - Use a sample API spec with known parameter constraints and write sample tests covering different categories.  
   - Verify that the analyser correctly classifies parameter usage and reports missing categories.  
   - Refine parsing heuristics until the results match manual review.

## Completion criteria

The agent should not stop until:
- Parameter extraction and test analysis are implemented.  
- The tool can categorise parameter values and compute coverage accurately.  
- Reports clearly indicate parameter testing gaps validated against a sample project.
