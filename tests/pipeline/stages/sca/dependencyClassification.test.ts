import { classifyDependency } from '../../../../src/pipeline/stages/sca/dependencyClassification';

describe('classifyDependency', () => {
  // ─── Exact matches ──────────────────────────────────────────────────────

  describe('exact matches', () => {
    it('should classify "jest" as testFramework', () => {
      expect(classifyDependency('jest')).toBe('testFramework');
    });

    it('should classify "axios" as httpClient', () => {
      expect(classifyDependency('axios')).toBe('httpClient');
    });

    it('should classify "mockito-core" as mockingLibrary', () => {
      expect(classifyDependency('mockito-core')).toBe('mockingLibrary');
    });

    it('should classify "chai" as assertionLibrary', () => {
      expect(classifyDependency('chai')).toBe('assertionLibrary');
    });

    it('should classify "passport" as securityLibrary', () => {
      expect(classifyDependency('passport')).toBe('securityLibrary');
    });

    it('should classify "k6" as performanceTool', () => {
      expect(classifyDependency('k6')).toBe('performanceTool');
    });

    it('should classify "cypress" as e2eFramework', () => {
      expect(classifyDependency('cypress')).toBe('e2eFramework');
    });

    it('should classify "express" as framework', () => {
      expect(classifyDependency('express')).toBe('framework');
    });
  });

  // ─── Prefix matches ────────────────────────────────────────────────────

  describe('prefix matches', () => {
    it('should classify "spring-security-oauth2-client" as securityLibrary', () => {
      expect(classifyDependency('spring-security-oauth2-client')).toBe('securityLibrary');
    });

    it('should classify "@nestjs/platform-express" as framework', () => {
      expect(classifyDependency('@nestjs/platform-express')).toBe('framework');
    });

    it('should classify "pytest-xdist" as testFramework', () => {
      expect(classifyDependency('pytest-xdist')).toBe('testFramework');
    });

    it('should classify "kotest-runner-junit5-jvm" as testFramework', () => {
      expect(classifyDependency('kotest-runner-junit5-jvm')).toBe('testFramework');
    });
  });

  // ─── Unknown dependencies ──────────────────────────────────────────────

  describe('unknown dependencies', () => {
    it('should classify "some-random-lib" as unknown', () => {
      expect(classifyDependency('some-random-lib')).toBe('unknown');
    });

    it('should classify empty string as unknown', () => {
      expect(classifyDependency('')).toBe('unknown');
    });
  });

  // ─── Case insensitivity ─────────────────────────────────────────────────

  describe('case insensitivity', () => {
    it('should handle uppercase input via lowercased lookup', () => {
      expect(classifyDependency('Jest')).toBe('testFramework');
      expect(classifyDependency('AXIOS')).toBe('httpClient');
    });
  });
});
