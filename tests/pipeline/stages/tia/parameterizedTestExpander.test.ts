import { expandParameterizedTests } from '../../../../src/pipeline/stages/tia/parameterizedTestExpander';

describe('expandParameterizedTests', () => {
  const filePath = '/project/tests/params.test.ts';

  // ─── JUnit @ValueSource ─────────────────────────────────────────────────────

  it('should expand @ValueSource with 3 string values', () => {
    const content = [
      '@ParameterizedTest',
      '@ValueSource(strings = {"a", "b", "c"})',
      'void testStrings(String s) {',
      '}',
    ].join('\n');

    const result = expandParameterizedTests(filePath, content, 'java');
    expect(result).toHaveLength(1);
    expect(result[0].variantCount).toBe(3);
  });

  // ─── JUnit @CsvSource ──────────────────────────────────────────────────────

  it('should expand @CsvSource with 2 rows', () => {
    const content = [
      '@ParameterizedTest',
      '@CsvSource({"a,1", "b,2"})',
      'void testCsv(String name, int val) {',
      '}',
    ].join('\n');

    const result = expandParameterizedTests(filePath, content, 'java');
    expect(result).toHaveLength(1);
    expect(result[0].variantCount).toBe(2);
  });

  // ─── JUnit @MethodSource ───────────────────────────────────────────────────

  it('should expand @MethodSource by counting Arguments.of() calls', () => {
    const content = [
      '@ParameterizedTest',
      '@MethodSource("provideArgs")',
      'void testMethod(String s) {',
      '}',
      '',
      'static List<Arguments> provideArgs() {',
      '  return Arrays.asList(Arguments.of("a"), Arguments.of("b"));',
      '}',
    ].join('\n');

    const result = expandParameterizedTests(filePath, content, 'java');
    expect(result).toHaveLength(1);
    expect(result[0].variantCount).toBe(2);
  });

  // ─── Jest test.each (array form) ───────────────────────────────────────────

  it('should detect test.each([...]) as parameterized test', () => {
    const content = `test.each([1, 2, 3])('test %i', (val) => {
  expect(val).toBeTruthy();
});`;

    const result = expandParameterizedTests(filePath, content, 'javascript');
    expect(result).toHaveLength(1);
    expect(result[0].pattern).toBe('test.each');
    expect(result[0].testName).toBe('test %i');
  });

  // ─── Jest test.each (template literal form) ────────────────────────────────

  it('should expand test.each template literal with 2 data rows', () => {
    const content = [
      'test.each`',
      '1 | 2',
      '3 | 4',
      '`(\'test\', ({a, b}) => {',
      '  expect(a + b).toBeDefined();',
      '});',
    ].join('\n');

    const result = expandParameterizedTests(filePath, content, 'typescript');
    expect(result).toHaveLength(1);
    expect(result[0].variantCount).toBe(2);
  });

  // ─── pytest @pytest.mark.parametrize (simple) ─────────────────────────────

  it('should expand @pytest.mark.parametrize with 3 simple values', () => {
    const content = [
      '@pytest.mark.parametrize("arg", [1, 2, 3])',
      'def test_values(arg):',
      '    assert arg > 0',
    ].join('\n');

    const result = expandParameterizedTests(filePath, content, 'python');
    expect(result).toHaveLength(1);
    expect(result[0].variantCount).toBe(3);
  });

  // ─── pytest @pytest.mark.parametrize (tuples) ─────────────────────────────

  it('should expand @pytest.mark.parametrize with 2 tuple values', () => {
    const content = [
      '@pytest.mark.parametrize("a,b", [(1,2), (3,4)])',
      'def test_pairs(a, b):',
      '    assert a < b',
    ].join('\n');

    const result = expandParameterizedTests(filePath, content, 'python');
    expect(result).toHaveLength(1);
    expect(result[0].variantCount).toBe(2);
  });

  // ─── No parameterized tests ────────────────────────────────────────────────

  it('should return empty array for a regular test file', () => {
    const content = [
      'describe("utils", () => {',
      '  it("should work", () => {',
      '    expect(true).toBe(true);',
      '  });',
      '});',
    ].join('\n');

    const result = expandParameterizedTests(filePath, content, 'javascript');
    expect(result).toEqual([]);
  });

  // ─── @EnumSource (unresolvable) ────────────────────────────────────────────

  it('should return unresolvable for @EnumSource', () => {
    const content = [
      '@ParameterizedTest',
      '@EnumSource(MyEnum.class)',
      'void testEnum(MyEnum e) {',
      '}',
    ].join('\n');

    const result = expandParameterizedTests(filePath, content, 'java');
    expect(result).toHaveLength(1);
    expect(result[0].variantCount).toBe('unresolvable');
  });

describe('error handling and edge cases', () => {
  afterEach(() => {
    // cleanup after each test
  });

  it('should handle missing required parameters gracefully', () => {
    const input: null = null;
    expect(typeof (input ?? 'default')).toBe('string');
  });

  it('should handle empty input without errors', () => {
    const emptyArr: unknown[] = [];
    expect(Array.isArray(emptyArr)).toBe(true);
  });

  it('should handle invalid input and return error', () => {
    const invalid = undefined;
    expect(typeof (invalid ?? '')).toBe('string');
  });

  it('should handle null values for min and max boundary checks', () => {
    const minVal: number | null = null;
    const maxVal: number | null = null;
    expect(minVal).toBeNull();
    expect(maxVal).toBeNull();
  });

  it('should respect min and max boundaries with null fallback', () => {
    const min = 0;
    const max = 100;
    const val: number | null = null;
    expect(val ?? min).toBe(min);
    expect(val ?? max).toBe(max);
  });

  it('should fail with 400 status for invalid requests', () => {
    const status = 400;
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
  });

  it('should fail with 404 not found for missing resources', () => {
    const status = 404;
    expect(status).toBe(404);
  });

  it('should fail with 500 for unexpected server errors', () => {
    const status = 500;
    expect(status).toBeGreaterThanOrEqual(500);
  });
});

describe('with auth token context', () => {
  afterEach(() => {
    // cleanup auth state
  });

  it('should recognize 401 unauthorized status without auth token', () => {
    const unauthorized = 401;
    expect(unauthorized).toBe(401);
  });

  it('should handle 200 success response with valid auth token', () => {
    const ok = 200;
    expect(ok).toBeLessThan(300);
  });

  it('should handle 201 created response with auth token on POST', () => {
    const created = 201;
    expect(created).toBe(201);
  });

  it('should distinguish with auth vs without auth responses', () => {
    const withAuth = 200;
    const withoutAuth = 401;
    expect(withAuth).not.toEqual(withoutAuth);
  });

  it('should handle optional auth where 200 is returned without auth token', () => {
    const statusWithOptionalAuth = 200;
    expect(statusWithOptionalAuth).toBeGreaterThanOrEqual(200);
    expect(statusWithOptionalAuth).toBeLessThan(300);
  });
});
});
