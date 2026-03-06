# Screenshots

This directory contains screenshots of the UI dashboard used in the documentation.

## Available screenshots

| File | Page |
|------|------|
| `endpoints-overview.png` | Endpoints page – per-endpoint coverage table |
| `parameters-overview.png` | Parameters page – four-category breakdown |
| `business-rules-overview.png` | Business Rules page – rule + scenario drill-down |
| `integration-flows-overview.png` | Integration Flows page – flow step coverage |
| `security-overview.png` | Security page – OWASP category heatmap |
| `performance-overview.png` | Performance page – response-time heatmap |
| `overview-dashboard.png` | Overview page – summary cards |

## Capturing screenshots

1. Start the UI dashboard:

   ```bash
   cd dashboard
   npm install
   npm run dev
   ```

2. Open [http://localhost:5173](http://localhost:5173) in your browser.

3. Click **Load Report** and select a JSON file from `reports/`.

4. Navigate to each page and take a screenshot. Save it to this directory.

5. Reference in documentation using relative paths:

   ```markdown
   ![Overview dashboard](../assets/screenshots/overview-dashboard.png)
   ```
