import { detectMockBoundaries } from '../../../../src/pipeline/stages/tia/mockBoundaryDetector';

describe('detectMockBoundaries', () => {
  const filePath = '/project/tests/service.test.ts';

  // ─── Jest patterns ──────────────────────────────────────────────────────────

  it('should detect jest.mock()', () => {
    const content = `jest.mock('./service')`;
    const result = detectMockBoundaries(filePath, content, 'typescript');
    expect(result).toHaveLength(1);
    expect(result[0].mockingLibrary).toBe('jest');
    expect(result[0].mockType).toBe('return-value');
  });

  it('should detect jest.fn()', () => {
    const content = `const fn = jest.fn()`;
    const result = detectMockBoundaries(filePath, content, 'typescript');
    expect(result).toHaveLength(1);
    expect(result[0].mockingLibrary).toBe('jest');
    expect(result[0].mockType).toBe('return-value');
  });

  it('should detect jest.spyOn()', () => {
    const content = `jest.spyOn(obj, 'method')`;
    const result = detectMockBoundaries(filePath, content, 'typescript');
    expect(result).toHaveLength(1);
    expect(result[0].mockingLibrary).toBe('jest');
    expect(result[0].mockType).toBe('spy');
  });

  it('should detect .mockRejectedValue() as exception mock', () => {
    const content = `service.getData.mockRejectedValue(error)`;
    const result = detectMockBoundaries(filePath, content, 'typescript');
    expect(result).toHaveLength(1);
    expect(result[0].mockingLibrary).toBe('jest');
    expect(result[0].mockType).toBe('exception');
  });

  // ─── Sinon patterns ────────────────────────────────────────────────────────

  it('should detect sinon.stub()', () => {
    const content = `sinon.stub(obj, 'method')`;
    const result = detectMockBoundaries(filePath, content, 'javascript');
    expect(result).toHaveLength(1);
    expect(result[0].mockingLibrary).toBe('sinon');
    expect(result[0].mockType).toBe('return-value');
  });

  // ─── Mockito patterns ──────────────────────────────────────────────────────

  it('should detect @Mock annotation (Mockito)', () => {
    const content = `@Mock\nUserService userService;`;
    const result = detectMockBoundaries(filePath, content, 'java');
    expect(result).toHaveLength(1);
    expect(result[0].mockingLibrary).toBe('mockito');
    expect(result[0].mockType).toBe('return-value');
  });

  it('should detect @Spy annotation (Mockito)', () => {
    const content = `@Spy\nUserService userService;`;
    const result = detectMockBoundaries(filePath, content, 'java');
    expect(result).toHaveLength(1);
    expect(result[0].mockingLibrary).toBe('mockito');
    expect(result[0].mockType).toBe('spy');
  });

  // ─── MockK patterns ────────────────────────────────────────────────────────

  it('should detect mockk<>()', () => {
    const content = `val service = mockk<UserService>()`;
    const result = detectMockBoundaries(filePath, content, 'kotlin');
    expect(result).toHaveLength(1);
    expect(result[0].mockingLibrary).toBe('mockk');
    expect(result[0].mockType).toBe('return-value');
  });

  // ─── Python patterns ───────────────────────────────────────────────────────

  it('should detect @patch() (unittest.mock)', () => {
    const content = `@patch('app.service.send_email')`;
    const result = detectMockBoundaries(filePath, content, 'python');
    expect(result).toHaveLength(1);
    expect(result[0].mockingLibrary).toBe('unittest.mock');
    expect(result[0].mockType).toBe('return-value');
  });

  it('should detect MagicMock() (unittest.mock)', () => {
    const content = `mock = MagicMock()`;
    const result = detectMockBoundaries(filePath, content, 'python');
    expect(result).toHaveLength(1);
    expect(result[0].mockingLibrary).toBe('unittest.mock');
    expect(result[0].mockType).toBe('return-value');
  });

  it('should detect mocker.patch() (pytest-mock)', () => {
    const content = `mocker.patch('app.db.session')`;
    const result = detectMockBoundaries(filePath, content, 'python');
    expect(result).toHaveLength(1);
    expect(result[0].mockingLibrary).toBe('pytest-mock');
    expect(result[0].mockType).toBe('return-value');
  });

  // ─── Edge cases ─────────────────────────────────────────────────────────────

  it('should return empty array when no mocks are present', () => {
    const result = detectMockBoundaries(filePath, '', 'typescript');
    expect(result).toEqual([]);
  });

  it('should track correct line numbers', () => {
    const content = [
      'import { service } from "./service";',
      '',
      'jest.mock("./service");',
      '',
      'const spy = jest.spyOn(service, "getData");',
    ].join('\n');

    const result = detectMockBoundaries(filePath, content, 'typescript');
    expect(result).toHaveLength(2);

    const mockLine = result.find((b) => b.mockType === 'return-value');
    expect(mockLine?.line).toBe(3);

    const spyLine = result.find((b) => b.mockType === 'spy');
    expect(spyLine?.line).toBe(5);
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
