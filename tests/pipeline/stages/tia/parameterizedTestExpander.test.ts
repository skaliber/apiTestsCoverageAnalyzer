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
});
