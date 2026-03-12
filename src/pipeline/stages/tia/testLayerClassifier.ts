/**
 * Test layer classifier — classifies test files into 7 layers:
 * unit, component, integration, api, e2e, performance, security.
 *
 * Uses multiple signals: directory patterns, naming patterns,
 * framework annotations, and import analysis.
 */

import type { TestLayer } from '../../types';
import type { TestClassification } from './types';
import * as path from 'path';

interface ClassificationRule {
  layer: TestLayer;
  /** Directory patterns that indicate this layer */
  directoryPatterns: RegExp[];
  /** File name patterns */
  fileNamePatterns: RegExp[];
  /** Content patterns (annotations, imports, etc.) */
  contentPatterns: RegExp[];
  /** Priority: higher = checked first */
  priority: number;
}

const CLASSIFICATION_RULES: ClassificationRule[] = [
  {
    layer: 'e2e',
    directoryPatterns: [/\be2e\b/i, /\bcypress\b/i, /\bplaywright\b/i, /\bselenium\b/i, /\bfunctional\b/i, /\bacceptance\b/i],
    fileNamePatterns: [/\.e2e\./i, /\.feature$/i],
    contentPatterns: [
      /cy\.\w+/,                              // Cypress
      /test\.goto|page\.\w+|playwright/i,     // Playwright
      /driver\.|WebDriver|selenium/i,         // Selenium
      /Given|When|Then|Scenario:/,            // Cucumber/Gherkin
      /browser\.\w+/i,                        // Browser automation
    ],
    priority: 90,
  },
  {
    layer: 'performance',
    directoryPatterns: [/\bperformance\b/i, /\bperf\b/i, /\bload\b/i, /\bstress\b/i, /\bbenchmark\b/i],
    fileNamePatterns: [/\.perf\./i, /\.bench\./i, /\.load\./i, /\.k6\./i],
    contentPatterns: [
      /import\s.*k6/,                         // k6
      /from\s+['"]k6/,
      /io\.gatling/i,                          // Gatling
      /locust|HttpUser|TaskSet/i,             // Locust
      /import\s.*artillery/i,                  // Artillery
      /autocannon/i,                           // Autocannon
    ],
    priority: 85,
  },
  {
    layer: 'security',
    directoryPatterns: [/\bsecurity\b/i, /\bsec-test\b/i, /\bpentest\b/i],
    fileNamePatterns: [/\.security\./i, /\.sec\./i],
    contentPatterns: [
      /@Tag\(["']security["']\)/i,            // JUnit @Tag
      /csrf|xss|sql.?injection|auth.?bypass/i,
      /ZAP|OWASP|pentest/i,
    ],
    priority: 80,
  },
  {
    layer: 'api',
    directoryPatterns: [/\bapi\b/i, /\bapi[-_]?test\b/i, /\bcontract\b/i],
    fileNamePatterns: [/\.api\./i, /\.contract\./i],
    contentPatterns: [
      /supertest|request\(app\)/i,             // Supertest
      /MockMvc|mockMvc/,                       // Spring MockMvc
      /TestRestTemplate|restTemplate/,         // Spring RestTemplate
      /httpx\.AsyncClient/i,                   // Python httpx
      /RestAssured|given\(\)\./i,              // REST Assured
      /\.pact\./i,                             // Pact
      /TestApp\s*\(/,                          // Python webtest TestApp
      /\.\s*(?:post_json|put_json|delete_json|patch_json)\s*\(/, // webtest JSON methods
    ],
    priority: 70,
  },
  {
    layer: 'integration',
    directoryPatterns: [/\bintegration\b/i, /\bint[-_]?test\b/i],
    fileNamePatterns: [/\.integration\./i, /\.int\./i, /IT\.java$/],
    contentPatterns: [
      /@SpringBootTest/,                       // Spring Boot integration test
      /TestRestTemplate/,                      // Spring REST testing
      /@Testcontainers/i,                      // Testcontainers
      /@DataJpaTest/i,                         // Spring Data JPA
      /@WebMvcTest/i,                          // Spring MVC test
      /testcontainers/i,                       // Docker containers
      /@pytest\.fixture.*scope\s*=\s*['"]session['"]/, // pytest session-scoped fixture (DB lifecycle)
      /factory\.(?:Factory|DjangoModelFactory|SQLAlchemyModelFactory)/, // Factory Boy (real-model tests)
      /create_engine|sessionmaker|Base\.metadata/, // SQLAlchemy DB setup
    ],
    priority: 60,
  },
  {
    layer: 'component',
    directoryPatterns: [/\bcomponent\b/i],
    fileNamePatterns: [/\.component\./i],
    contentPatterns: [
      /render\(|screen\./,                     // React Testing Library
      /@testing-library/,                      // Testing Library
      /shallow\(|mount\(/,                     // Enzyme
      /ComponentFixture|TestBed/,              // Angular testing
    ],
    priority: 50,
  },
  {
    layer: 'unit',
    directoryPatterns: [/\bunit\b/i],
    fileNamePatterns: [/\.unit\./i],
    contentPatterns: [
      // Unit tests are the default; no specific content patterns needed
    ],
    priority: 10,
  },
];

/**
 * Classify a test file into a layer.
 *
 * @param filePath - The test file path
 * @param content - Optional file content for content-based classification
 */
export function classifyTestLayer(
  filePath: string,
  content?: string,
): TestClassification {
  const signals: string[] = [];
  const normalizedPath = filePath.replace(/\\/g, '/');
  const basename = path.basename(filePath);

  // Sort rules by priority (highest first)
  const sortedRules = [...CLASSIFICATION_RULES].sort((a, b) => b.priority - a.priority);

  // Track the best path-only (directory/filename) candidate in case no
  // content-based match is found.  Content-based evidence always wins over
  // path-based evidence so that a file living in /tests/integration/ but
  // containing only unit-level code is classified by its content, not its
  // directory name.
  let pathOnlyCandidate: TestClassification | null = null;

  for (const rule of sortedRules) {
    let matchCount = 0;
    let hasContentMatch = false;
    const ruleSignals: string[] = [];

    // Check directory patterns
    for (const pattern of rule.directoryPatterns) {
      if (pattern.test(normalizedPath)) {
        ruleSignals.push(`dir:${rule.layer}`);
        matchCount++;
        break;
      }
    }

    // Check file name patterns
    for (const pattern of rule.fileNamePatterns) {
      if (pattern.test(basename)) {
        ruleSignals.push(`name:${rule.layer}`);
        matchCount++;
        break;
      }
    }

    // Check content patterns (if content is available)
    if (content) {
      for (const pattern of rule.contentPatterns) {
        if (pattern.test(content)) {
          ruleSignals.push(`content:${rule.layer}`);
          matchCount++;
          hasContentMatch = true;
          break;
        }
      }
    }

    if (matchCount > 0) {
      if (hasContentMatch) {
        // Content-based match — return immediately (highest-priority content wins)
        signals.push(...ruleSignals);
        const confidence = matchCount >= 2 ? 'high' : 'medium';
        return {
          filePath,
          layer: rule.layer,
          confidence,
          signals,
        };
      } else if (!pathOnlyCandidate) {
        // Path-only match — store as candidate but keep searching for content
        pathOnlyCandidate = {
          filePath,
          layer: rule.layer,
          confidence: matchCount >= 2 ? 'high' : 'medium',
          signals: [...ruleSignals],
        };
      }
    }
  }

  // If a path-only candidate was found but no content-based match, use it
  if (pathOnlyCandidate) {
    return pathOnlyCandidate;
  }

  // Default: unit test
  return {
    filePath,
    layer: 'unit',
    confidence: 'low',
    signals: ['default:unit'],
  };
}
