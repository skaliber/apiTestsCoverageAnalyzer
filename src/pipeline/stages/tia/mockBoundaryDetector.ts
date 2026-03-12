/**
 * Mock boundary detector — detects mock patterns across all languages
 * and creates mock boundary records.
 *
 * Detects patterns from spec §17:
 * - Java: @Mock, @Spy, @MockBean, @SpyBean, Mockito.mock(), mockk<>(), every{}
 * - JS/TS: jest.mock(), jest.fn(), jest.spyOn(), sinon.stub(), sinon.mock(), nock()
 * - Python: @patch(), @patch.object(), Mock(), MagicMock(), AsyncMock(), mocker.patch()
 */

import type { MockType } from '../../types';
import type { DetectedMockBoundary } from './types';

interface MockPattern {
  regex: RegExp;
  library: string;
  mockType: MockType;
}

const JAVA_KOTLIN_PATTERNS: MockPattern[] = [
  { regex: /@Mock\b/, library: 'mockito', mockType: 'return-value' },
  { regex: /@Spy\b/, library: 'mockito', mockType: 'spy' },
  { regex: /@MockBean\b/, library: 'spring-test', mockType: 'return-value' },
  { regex: /@SpyBean\b/, library: 'spring-test', mockType: 'spy' },
  { regex: /Mockito\.mock\(/, library: 'mockito', mockType: 'return-value' },
  { regex: /Mockito\.spy\(/, library: 'mockito', mockType: 'spy' },
  { regex: /when\(.*\)\.thenReturn\(/, library: 'mockito', mockType: 'return-value' },
  { regex: /when\(.*\)\.thenThrow\(/, library: 'mockito', mockType: 'exception' },
  { regex: /doReturn\(.*\)\.when\(/, library: 'mockito', mockType: 'return-value' },
  { regex: /doThrow\(.*\)\.when\(/, library: 'mockito', mockType: 'exception' },
  { regex: /mockk</, library: 'mockk', mockType: 'return-value' },
  { regex: /spyk\(/, library: 'mockk', mockType: 'spy' },
  { regex: /every\s*\{/, library: 'mockk', mockType: 'return-value' },
  { regex: /coEvery\s*\{/, library: 'mockk', mockType: 'return-value' },
  { regex: /verify\s*\{/, library: 'mockk', mockType: 'spy' },
];

const JS_TS_PATTERNS: MockPattern[] = [
  { regex: /jest\.mock\(/, library: 'jest', mockType: 'return-value' },
  { regex: /jest\.fn\(/, library: 'jest', mockType: 'return-value' },
  { regex: /jest\.spyOn\(/, library: 'jest', mockType: 'spy' },
  { regex: /\.mockReturnValue\(/, library: 'jest', mockType: 'return-value' },
  { regex: /\.mockResolvedValue\(/, library: 'jest', mockType: 'return-value' },
  { regex: /\.mockRejectedValue\(/, library: 'jest', mockType: 'exception' },
  { regex: /\.mockImplementation\(/, library: 'jest', mockType: 'return-value' },
  { regex: /sinon\.stub\(/, library: 'sinon', mockType: 'return-value' },
  { regex: /sinon\.mock\(/, library: 'sinon', mockType: 'return-value' },
  { regex: /sinon\.spy\(/, library: 'sinon', mockType: 'spy' },
  { regex: /\.returns\(/, library: 'sinon', mockType: 'return-value' },
  { regex: /\.throws\(/, library: 'sinon', mockType: 'exception' },
  { regex: /nock\(/, library: 'nock', mockType: 'return-value' },
  { regex: /\.useFakeTimers\(/, library: 'jest', mockType: 'timer' },
  { regex: /sinon\.useFakeTimers\(/, library: 'sinon', mockType: 'timer' },
];

const PYTHON_PATTERNS: MockPattern[] = [
  { regex: /@patch\(/, library: 'unittest.mock', mockType: 'return-value' },
  { regex: /@patch\.object\(/, library: 'unittest.mock', mockType: 'return-value' },
  { regex: /Mock\(\)/, library: 'unittest.mock', mockType: 'return-value' },
  { regex: /MagicMock\(\)/, library: 'unittest.mock', mockType: 'return-value' },
  { regex: /AsyncMock\(\)/, library: 'unittest.mock', mockType: 'return-value' },
  { regex: /mocker\.patch\(/, library: 'pytest-mock', mockType: 'return-value' },
  { regex: /mocker\.spy\(/, library: 'pytest-mock', mockType: 'spy' },
  { regex: /\.return_value\s*=/, library: 'unittest.mock', mockType: 'return-value' },
  { regex: /\.side_effect\s*=/, library: 'unittest.mock', mockType: 'exception' },
  { regex: /responses\.add\(/, library: 'responses', mockType: 'return-value' },
  { regex: /requests_mock\./, library: 'requests-mock', mockType: 'return-value' },
  { regex: /freezegun|freeze_time/, library: 'freezegun', mockType: 'timer' },
];

const RUBY_PATTERNS: MockPattern[] = [
  { regex: /allow\(.*\)\.to\s+receive\(/, library: 'rspec-mocks', mockType: 'return-value' },
  { regex: /expect\(.*\)\.to\s+receive\(/, library: 'rspec-mocks', mockType: 'spy' },
  { regex: /double\(/, library: 'rspec-mocks', mockType: 'return-value' },
  { regex: /instance_double\(/, library: 'rspec-mocks', mockType: 'return-value' },
  { regex: /stub_request\(/, library: 'webmock', mockType: 'return-value' },
];

/**
 * Detect mock boundaries in a test file.
 *
 * @param filePath - The test file path
 * @param content - The file content
 * @param language - The detected language
 */
export function detectMockBoundaries(
  filePath: string,
  content: string,
  language: string,
): DetectedMockBoundary[] {
  const boundaries: DetectedMockBoundary[] = [];
  const lines = content.split('\n');

  let patterns: MockPattern[];
  switch (language) {
    case 'java':
    case 'kotlin':
      patterns = JAVA_KOTLIN_PATTERNS;
      break;
    case 'javascript':
    case 'typescript':
      patterns = JS_TS_PATTERNS;
      break;
    case 'python':
      patterns = PYTHON_PATTERNS;
      break;
    case 'ruby':
      patterns = RUBY_PATTERNS;
      break;
    default:
      // Try all patterns
      patterns = [...JS_TS_PATTERNS, ...JAVA_KOTLIN_PATTERNS, ...PYTHON_PATTERNS, ...RUBY_PATTERNS];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of patterns) {
      if (pattern.regex.test(line)) {
        // Extract mocked target (heuristic: argument in parentheses)
        const targetMatch = /[\(][\s]*['"`]?([a-zA-Z0-9_./@]+)['"`]?/.exec(line);
        let mockedTarget = targetMatch?.[1] ?? 'unknown';

        // Secondary extraction for Java/Kotlin annotation-style mocks (e.g. @Mock private UserService userService;)
        if (mockedTarget === 'unknown') {
          const annotationTypeMatch = line.match(
            /(?:private|protected|public)?\s*(\w+)\s+\w+\s*;/,
          );
          if (annotationTypeMatch) {
            mockedTarget = annotationTypeMatch[1];
          }
        }

        boundaries.push({
          testFilePath: filePath,
          mockingLibrary: pattern.library,
          mockType: pattern.mockType,
          mockedTarget,
          line: i + 1,
        });
        break; // One detection per line
      }
    }
  }

  return boundaries;
}
