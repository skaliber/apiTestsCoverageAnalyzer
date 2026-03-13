/**
 * Parameterized test expander — detects parameterized test patterns and
 * calculates variant counts.
 *
 * Supports:
 * - JUnit: @ParameterizedTest + @ValueSource, @CsvSource, @MethodSource, @EnumSource
 * - Jest: test.each(table), describe.each(table), it.each
 * - pytest: @pytest.mark.parametrize()
 * - Kotest: data-driven tests
 */

import type { ExpandedParameterizedTest } from './types';

/**
 * Detect and expand parameterized tests in a file.
 *
 * @param filePath - The test file path
 * @param content - The file content
 * @param language - The detected language
 */
export function expandParameterizedTests(
  filePath: string,
  content: string,
  language: string,
): ExpandedParameterizedTest[] {
  switch (language) {
    case 'java':
    case 'kotlin':
      return expandJavaKotlinParameterized(filePath, content);
    case 'javascript':
    case 'typescript':
      return expandJestParameterized(filePath, content);
    case 'python':
      return expandPytestParameterized(filePath, content);
    default:
      return [];
  }
}

// ─── JUnit Parameterized ────────────────────────────────────────────────────

function expandJavaKotlinParameterized(
  filePath: string,
  content: string,
): ExpandedParameterizedTest[] {
  const results: ExpandedParameterizedTest[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // @ParameterizedTest must precede the data source annotation
    if (!line.includes('@ParameterizedTest')) continue;

    // Look ahead for data source annotations
    let testName = 'unknown';
    let variantCount: number | 'unresolvable' = 'unresolvable';
    let pattern = '@ParameterizedTest';

    for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
      const nextLine = lines[j].trim();

      // Extract test method name
      const methodMatch = /(?:void|fun)\s+(\w+)\s*\(/.exec(nextLine);
      if (methodMatch) {
        testName = methodMatch[1];
        break;
      }

      // @ValueSource(strings = {"a", "b", "c"})
      const valueSourceMatch = /@ValueSource\(\s*\w+\s*=\s*\{([^}]+)\}/.exec(nextLine);
      if (valueSourceMatch) {
        variantCount = valueSourceMatch[1].split(',').length;
        pattern = '@ValueSource';
        continue;
      }

      // @CsvSource({"a,1", "b,2", "c,3"})
      const csvSourceMatch = /@CsvSource\(\s*(?:value\s*=\s*)?\{([^}]+)\}/.exec(nextLine);
      if (csvSourceMatch) {
        variantCount = csvSourceMatch[1].split(/",\s*"/).length;
        pattern = '@CsvSource';
        continue;
      }

      // @MethodSource("methodName")
      const methodSourceMatch = /@MethodSource\(\s*"(\w+)"/.exec(nextLine);
      if (methodSourceMatch) {
        pattern = `@MethodSource(${methodSourceMatch[1]})`;
        // Try to find the method and count Stream.of() arguments
        const sourceMethodRegex = new RegExp(
          `(?:static\\s+)?(?:Stream|List|Collection|Set).*?\\s+${methodSourceMatch[1]}\\s*\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\}`,
          'm',
        );
        const sourceMethodMatch = sourceMethodRegex.exec(content);
        if (sourceMethodMatch) {
          const body = sourceMethodMatch[1];
          const argsMatch = body.match(/(?:Arguments\.of|of)\s*\(/g);
          if (argsMatch) {
            variantCount = argsMatch.length;
          }
        }
        continue;
      }

      // @EnumSource(MyEnum.class)
      if (nextLine.includes('@EnumSource')) {
        pattern = '@EnumSource';
        variantCount = 'unresolvable'; // Would need to find enum declaration
        continue;
      }
    }

    results.push({
      testFilePath: filePath,
      testName,
      variantCount,
      pattern,
      line: i + 1,
    });
  }

  return results;
}

// ─── Jest Parameterized ─────────────────────────────────────────────────────

function expandJestParameterized(
  filePath: string,
  content: string,
): ExpandedParameterizedTest[] {
  const results: ExpandedParameterizedTest[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // test.each([...])('name', ...)
    // it.each([...])('name', ...)
    // describe.each([...])('name', ...)
    const eachMatch = /(?:test|it|describe)\.each\s*\(\s*\[/.exec(line);
    if (eachMatch) {
      // Try to extract the array and count items
      const arrayContent = extractBalancedBrackets(content, content.indexOf(eachMatch[0], i > 0 ? content.indexOf(lines[i]) : 0));
      const variantCount = arrayContent ? countArrayElements(arrayContent) : 'unresolvable';

      // Extract test name from the next argument
      const nameMatch = /\)\s*\(\s*['"`]([^'"`]+)['"`]/.exec(
        content.substring(content.indexOf(eachMatch[0])),
      );
      const testName = nameMatch?.[1] ?? 'parameterized test';

      results.push({
        testFilePath: filePath,
        testName,
        variantCount,
        pattern: 'test.each',
        line: i + 1,
      });
    }

    // test.each`template`('name', ...)  — tagged template form
    const templateMatch = /(?:test|it|describe)\.each\s*`/.exec(line);
    if (templateMatch && !eachMatch) {
      // Count rows in tagged template (lines between backticks, minus header)
      let rowCount = 0;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].includes('`')) break;
        if (lines[j].trim()) rowCount++;
      }
      const variantCount = rowCount > 0 ? rowCount : 'unresolvable';

      results.push({
        testFilePath: filePath,
        testName: 'parameterized test',
        variantCount,
        pattern: 'test.each (template)',
        line: i + 1,
      });
    }
  }

  return results;
}

// ─── Pytest Parameterized ───────────────────────────────────────────────────

function expandPytestParameterized(
  filePath: string,
  content: string,
): ExpandedParameterizedTest[] {
  const results: ExpandedParameterizedTest[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // @pytest.mark.parametrize("name", [...])
    const paramMatch = /@pytest\.mark\.parametrize\s*\(/.exec(line);
    if (paramMatch) {
      // Try to extract array content and count elements
      let variantCount: number | 'unresolvable' = 'unresolvable';

      // Look for the bracket content
      const fullContent = lines.slice(i, Math.min(i + 20, lines.length)).join('\n');
      const bracketContent = extractBalancedBrackets(fullContent, fullContent.indexOf('['));
      if (bracketContent) {
        variantCount = countPytestParams(bracketContent);
      }

      // Extract test name from following def line
      let testName = 'unknown';
      for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
        const defMatch = /def\s+(\w+)\s*\(/.exec(lines[j]);
        if (defMatch) {
          testName = defMatch[1];
          break;
        }
      }

      results.push({
        testFilePath: filePath,
        testName,
        variantCount,
        pattern: '@pytest.mark.parametrize',
        line: i + 1,
      });
    }
  }

  return results;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractBalancedBrackets(content: string, startIndex: number): string | undefined {
  if (startIndex < 0 || startIndex >= content.length || content[startIndex] !== '[') {
    return undefined;
  }

  let depth = 0;
  let i = startIndex;

  while (i < content.length) {
    if (content[i] === '[') depth++;
    else if (content[i] === ']') {
      depth--;
      if (depth === 0) {
        return content.substring(startIndex + 1, i);
      }
    }
    i++;
  }

  return undefined;
}

function countArrayElements(arrayContent: string): number {
  // Count top-level elements (not nested)
  let depth = 0;
  let count = 1;

  for (const char of arrayContent) {
    if (char === '[' || char === '(' || char === '{') depth++;
    else if (char === ']' || char === ')' || char === '}') depth--;
    else if (char === ',' && depth === 0) count++;
  }

  // If only whitespace, return 0
  if (arrayContent.trim().length === 0) return 0;

  return count;
}

function countPytestParams(bracketContent: string): number {
  // Each top-level tuple/value is a test case
  const trimmed = bracketContent.trim();
  if (!trimmed) return 0;

  // Count top-level commas for simple values
  // For tuples, count each (...) group
  const tupleMatches = trimmed.match(/\([^)]*\)/g);
  if (tupleMatches) return tupleMatches.length;

  // Otherwise count comma-separated values
  return countArrayElements(trimmed);
}
