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
});
