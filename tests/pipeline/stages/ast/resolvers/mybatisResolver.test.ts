import { MyBatisResolver } from '../../../../../src/pipeline/stages/ast/resolvers/mybatisResolver';
import type { DetectedApiFramework } from '../../../../../src/discovery/frameworkDetector';

describe('MyBatisResolver', () => {
  const resolver = new MyBatisResolver();

  it('applies to spring-boot framework', () => {
    const frameworks: DetectedApiFramework[] = [
      { name: 'spring-boot', evidence: 'SpringBootApplication', detectedInFile: '/fake/App.java' },
    ];
    expect(resolver.appliesTo(frameworks)).toBe(true);
  });

  it('does not apply to flask framework', () => {
    const frameworks: DetectedApiFramework[] = [
      { name: 'flask', evidence: 'Flask import', detectedInFile: '/fake/app.py' },
    ];
    expect(resolver.appliesTo(frameworks)).toBe(false);
  });

  it('returns empty results when no mapper interfaces found', () => {
    const symbolTable = {
      models: new Map(),
      exportedSymbols: new Map(),
      classes: new Map(),
      importGraph: new Map(),
      routerMounts: new Map(),
      injectionChains: new Map(),
      interfaceImplementations: new Map(),
      middlewareInheritance: new Map(),
    };
    const ctx = {
      symbolTable,
      projectRoot: '/fake',
      apiFrameworks: [{ name: 'spring-boot' as const, evidence: '', detectedInFile: '' }],
      allSourceFiles: [],
    };
    const result = resolver.resolve(ctx);
    expect(result.entriesAdded).toBe(0);
  });
});
