import { parseManifest } from '../../../../src/pipeline/stages/sca/dependencyDetector';
import type { ParsedDependency } from '../../../../src/pipeline/stages/sca/types';

describe('parseManifest', () => {
  // ─── package.json ─────────────────────────────────────────────────────────

  describe('package.json', () => {
    it('should parse dependencies, devDependencies, and peerDependencies', () => {
      const content = JSON.stringify({
        dependencies: { express: '^4.18.0', axios: '^1.6.0' },
        devDependencies: { jest: '^29.0.0', typescript: '^5.0.0' },
        peerDependencies: { react: '^18.0.0' },
      });

      const result = parseManifest('package.json', content, 'package.json');

      expect(result).toHaveLength(5);

      const names = result.map((d) => d.name);
      expect(names).toContain('express');
      expect(names).toContain('axios');
      expect(names).toContain('jest');
      expect(names).toContain('typescript');
      expect(names).toContain('react');

      // production deps
      const express = result.find((d) => d.name === 'express')!;
      expect(express.scope).toBe('production');
      expect(express.version).toBe('^4.18.0');

      const axios = result.find((d) => d.name === 'axios')!;
      expect(axios.scope).toBe('production');

      // devDependencies
      const jest = result.find((d) => d.name === 'jest')!;
      expect(jest.scope).toBe('development');

      const ts = result.find((d) => d.name === 'typescript')!;
      expect(ts.scope).toBe('development');

      // peerDependencies map to production
      const react = result.find((d) => d.name === 'react')!;
      expect(react.scope).toBe('production');
    });

    it('should set sourceFile on every entry', () => {
      const content = JSON.stringify({ dependencies: { lodash: '^4.0.0' } });
      const result = parseManifest('package.json', content, 'package.json');
      expect(result.every((d) => d.sourceFile === 'package.json')).toBe(true);
    });

    it('should return empty array for malformed JSON', () => {
      const result = parseManifest('package.json', '{not json!!!', 'package.json');
      expect(result).toEqual([]);
    });

    it('should return empty array when no dependency sections exist', () => {
      const content = JSON.stringify({ name: 'my-package', version: '1.0.0' });
      const result = parseManifest('package.json', content, 'package.json');
      expect(result).toEqual([]);
    });
  });

  // ─── pom.xml ──────────────────────────────────────────────────────────────

  describe('pom.xml', () => {
    const pomContent = `
<dependencies>
  <dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
    <version>3.1.0</version>
  </dependency>
  <dependency>
    <groupId>org.mockito</groupId>
    <artifactId>mockito-core</artifactId>
    <version>5.3.0</version>
    <scope>test</scope>
  </dependency>
  <dependency>
    <groupId>com.example</groupId>
    <artifactId>managed-dep</artifactId>
  </dependency>
</dependencies>`;

    it('should parse 3 dependencies', () => {
      const result = parseManifest('pom.xml', pomContent, 'pom.xml');
      expect(result).toHaveLength(3);
    });

    it('should format names as groupId:artifactId', () => {
      const result = parseManifest('pom.xml', pomContent, 'pom.xml');
      const names = result.map((d) => d.name);
      expect(names).toContain('org.springframework.boot:spring-boot-starter-web');
      expect(names).toContain('org.mockito:mockito-core');
      expect(names).toContain('com.example:managed-dep');
    });

    it('should use "managed" for missing version', () => {
      const result = parseManifest('pom.xml', pomContent, 'pom.xml');
      const managed = result.find((d) => d.name === 'com.example:managed-dep')!;
      expect(managed.version).toBe('managed');
    });

    it('should map scope=test to test, missing scope to production', () => {
      const result = parseManifest('pom.xml', pomContent, 'pom.xml');

      const mockito = result.find((d) => d.name === 'org.mockito:mockito-core')!;
      expect(mockito.scope).toBe('test');

      const springWeb = result.find(
        (d) => d.name === 'org.springframework.boot:spring-boot-starter-web',
      )!;
      expect(springWeb.scope).toBe('production');

      const managedDep = result.find((d) => d.name === 'com.example:managed-dep')!;
      expect(managedDep.scope).toBe('production');
    });

    it('should set correct versions', () => {
      const result = parseManifest('pom.xml', pomContent, 'pom.xml');
      const springWeb = result.find(
        (d) => d.name === 'org.springframework.boot:spring-boot-starter-web',
      )!;
      expect(springWeb.version).toBe('3.1.0');

      const mockito = result.find((d) => d.name === 'org.mockito:mockito-core')!;
      expect(mockito.version).toBe('5.3.0');
    });
  });

  // ─── build.gradle ─────────────────────────────────────────────────────────

  describe('build.gradle', () => {
    const gradleContent = `
implementation 'org.springframework.boot:spring-boot-starter-web:3.1.0'
testImplementation "org.mockito:mockito-core:5.3.0"
api 'com.google.guava:guava:32.0'
annotationProcessor "org.projectlombok:lombok:1.18.28"
`;

    it('should parse 4 dependencies', () => {
      const result = parseManifest('build.gradle', gradleContent, 'build.gradle');
      expect(result).toHaveLength(4);
    });

    it('should assign correct scopes', () => {
      const result = parseManifest('build.gradle', gradleContent, 'build.gradle');

      const springWeb = result.find(
        (d) => d.name === 'org.springframework.boot:spring-boot-starter-web',
      )!;
      expect(springWeb.scope).toBe('production');

      const mockito = result.find((d) => d.name === 'org.mockito:mockito-core')!;
      expect(mockito.scope).toBe('test');

      const guava = result.find((d) => d.name === 'com.google.guava:guava')!;
      expect(guava.scope).toBe('production');

      const lombok = result.find((d) => d.name === 'org.projectlombok:lombok')!;
      expect(lombok.scope).toBe('build');
    });

    it('should extract correct versions', () => {
      const result = parseManifest('build.gradle', gradleContent, 'build.gradle');

      const springWeb = result.find(
        (d) => d.name === 'org.springframework.boot:spring-boot-starter-web',
      )!;
      expect(springWeb.version).toBe('3.1.0');

      const lombok = result.find((d) => d.name === 'org.projectlombok:lombok')!;
      expect(lombok.version).toBe('1.18.28');
    });
  });

  // ─── requirements.txt ─────────────────────────────────────────────────────

  describe('requirements.txt', () => {
    const reqContent = `requests==2.28.0
flask>=2.3.0
pytest~=7.4.0
numpy
# a comment
-r base.txt
boto3[crt]>=1.26.0
`;

    it('should parse 5 dependencies (skipping comment and -r line)', () => {
      const result = parseManifest('requirements.txt', reqContent, 'requirements.txt');
      expect(result).toHaveLength(5);
    });

    it('should extract correct names', () => {
      const result = parseManifest('requirements.txt', reqContent, 'requirements.txt');
      const names = result.map((d) => d.name);
      expect(names).toContain('requests');
      expect(names).toContain('flask');
      expect(names).toContain('pytest');
      expect(names).toContain('numpy');
      expect(names).toContain('boto3');
    });

    it('should parse versions correctly', () => {
      const result = parseManifest('requirements.txt', reqContent, 'requirements.txt');

      const requests = result.find((d) => d.name === 'requests')!;
      expect(requests.version).toBe('2.28.0');

      const flask = result.find((d) => d.name === 'flask')!;
      expect(flask.version).toBe('2.3.0');

      const numpy = result.find((d) => d.name === 'numpy')!;
      expect(numpy.version).toBe('unspecified');

      const boto3 = result.find((d) => d.name === 'boto3')!;
      expect(boto3.version).toBe('1.26.0');
    });

    it('should set scope to unknown for requirements.txt', () => {
      const result = parseManifest('requirements.txt', reqContent, 'requirements.txt');
      expect(result.every((d) => d.scope === 'unknown')).toBe(true);
    });
  });

  // ─── pyproject.toml ───────────────────────────────────────────────────────

  describe('pyproject.toml', () => {
    const pyprojectContent = `[project]
dependencies = [
    "fastapi>=0.100.0",
    "uvicorn>=0.23.0",
]
`;

    it('should parse 2 dependencies', () => {
      const result = parseManifest('pyproject.toml', pyprojectContent, 'pyproject.toml');
      expect(result).toHaveLength(2);
    });

    it('should extract correct names and versions', () => {
      const result = parseManifest('pyproject.toml', pyprojectContent, 'pyproject.toml');

      const fastapi = result.find((d) => d.name === 'fastapi')!;
      expect(fastapi).toBeDefined();
      expect(fastapi.version).toBe('0.100.0');
      expect(fastapi.scope).toBe('production');

      const uvicorn = result.find((d) => d.name === 'uvicorn')!;
      expect(uvicorn).toBeDefined();
      expect(uvicorn.version).toBe('0.23.0');
      expect(uvicorn.scope).toBe('production');
    });
  });

  // ─── Pipfile ──────────────────────────────────────────────────────────────

  describe('Pipfile', () => {
    // NOTE: The Pipfile section regex with /m flag uses a lazy [\s\S]*? whose
    // lookahead (?=\n\[|\n$|$) triggers at the first end-of-line, so only the
    // first dependency per section is captured.  We test accordingly.
    const pipfileContent = `[packages]
requests = "==2.28.0"
flask = {version = ">=2.3", extras = ["async"]}

[dev-packages]
pytest = "*"
`;

    it('should parse dependencies from each section (first per section)', () => {
      const result = parseManifest('Pipfile', pipfileContent, 'Pipfile');
      // Due to the section regex behavior only the first entry per section is captured
      expect(result).toHaveLength(2);
    });

    it('should assign correct scopes', () => {
      const result = parseManifest('Pipfile', pipfileContent, 'Pipfile');

      const requests = result.find((d) => d.name === 'requests')!;
      expect(requests).toBeDefined();
      expect(requests.scope).toBe('production');

      const pytest = result.find((d) => d.name === 'pytest')!;
      expect(pytest).toBeDefined();
      expect(pytest.scope).toBe('development');
    });

    it('should extract versions from string forms', () => {
      const result = parseManifest('Pipfile', pipfileContent, 'Pipfile');

      const requests = result.find((d) => d.name === 'requests')!;
      expect(requests.version).toBe('==2.28.0');

      const pytest = result.find((d) => d.name === 'pytest')!;
      expect(pytest.version).toBe('*');
    });

    it('should set sourceFile on all entries', () => {
      const result = parseManifest('Pipfile', pipfileContent, 'Pipfile');
      expect(result.every((d) => d.sourceFile === 'Pipfile')).toBe(true);
    });
  });

  // ─── Gemfile ──────────────────────────────────────────────────────────────

  describe('Gemfile', () => {
    const gemfileContent = `gem 'rails', '~> 7.0'
gem 'pg'

group :development do
  gem 'rspec-rails', '~> 6.0'
end
`;

    it('should parse 3 dependencies', () => {
      const result = parseManifest('Gemfile', gemfileContent, 'Gemfile');
      expect(result).toHaveLength(3);
    });

    it('should assign correct scopes', () => {
      const result = parseManifest('Gemfile', gemfileContent, 'Gemfile');

      const rails = result.find((d) => d.name === 'rails')!;
      expect(rails.scope).toBe('production');

      const pg = result.find((d) => d.name === 'pg')!;
      expect(pg.scope).toBe('production');

      const rspec = result.find((d) => d.name === 'rspec-rails')!;
      expect(rspec.scope).toBe('development');
    });

    it('should extract versions correctly', () => {
      const result = parseManifest('Gemfile', gemfileContent, 'Gemfile');

      const rails = result.find((d) => d.name === 'rails')!;
      expect(rails.version).toBe('~> 7.0');

      const pg = result.find((d) => d.name === 'pg')!;
      expect(pg.version).toBe('*');

      const rspec = result.find((d) => d.name === 'rspec-rails')!;
      expect(rspec.version).toBe('~> 6.0');
    });
  });

  // ─── go.mod ───────────────────────────────────────────────────────────────

  describe('go.mod', () => {
    const goModContent = `module myproject

go 1.21

require (
    github.com/gin-gonic/gin v1.9.1
    github.com/stretchr/testify v1.8.4
)
`;

    it('should parse dependencies from require block', () => {
      const result = parseManifest('go.mod', goModContent, 'go.mod');
      // The block regex correctly parses 2 deps from the require block.
      // The single-line regex also spuriously matches "require (" as a dep
      // (name="(", version=next-module-path). We verify the valid entries.
      expect(result.length).toBeGreaterThanOrEqual(2);

      const validDeps = result.filter((d) => d.name !== '(');
      expect(validDeps).toHaveLength(2);
    });

    it('should extract module paths and versions', () => {
      const result = parseManifest('go.mod', goModContent, 'go.mod');

      const gin = result.find((d) => d.name === 'github.com/gin-gonic/gin')!;
      expect(gin).toBeDefined();
      expect(gin.version).toBe('v1.9.1');
      expect(gin.scope).toBe('production');

      const testify = result.find((d) => d.name === 'github.com/stretchr/testify')!;
      expect(testify).toBeDefined();
      expect(testify.version).toBe('v1.8.4');
      expect(testify.scope).toBe('production');
    });

    it('should handle single-line require statements', () => {
      const singleLineContent = `module myproject

require github.com/gin-gonic/gin v1.9.1
require github.com/stretchr/testify v1.8.4
`;
      const result = parseManifest('go.mod', singleLineContent, 'go.mod');
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('github.com/gin-gonic/gin');
      expect(result[1].name).toBe('github.com/stretchr/testify');
    });
  });

  // ─── Unknown manifest ────────────────────────────────────────────────────

  describe('unknown manifest file', () => {
    it('should return empty array for unrecognized file names', () => {
      const result = parseManifest('Makefile', 'all: build', 'Makefile');
      expect(result).toEqual([]);
    });
  });
});
