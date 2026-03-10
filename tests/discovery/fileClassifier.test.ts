import {
  classifyFile,
  classifyFiles,
  filterCoverageEvidence,
  isTestFile,
  COVERAGE_EVIDENCE_CATEGORIES,
} from '../../src/discovery/fileClassifier';

// ─── classifyFile ──────────────────────────────────────────────────────────────

describe('classifyFile — specification', () => {
  const SPEC_CASES = [
    'openapi.yaml',
    'openapi.yml',
    'openapi.json',
    'swagger.yaml',
    'swagger.yml',
    'swagger.json',
    'src/api/openapi.yaml',
    'docs/swagger-v2.yaml',
  ];

  for (const fp of SPEC_CASES) {
    it(`classifies ${fp} as specification`, () => {
      expect(classifyFile(fp).category).toBe('specification');
    });
  }

  it('specification files are not coverage evidence', () => {
    expect(classifyFile('openapi.yaml').isCoverageEvidence).toBe(false);
  });
});

describe('classifyFile — metadata', () => {
  const META_CASES = [
    'business-rules.yaml',
    'business-rules.yml',
    'business-rules.json',
    'integration-flows.yaml',
    'integration-flows.yml',
    'integration-flows.json',
  ];

  for (const fp of META_CASES) {
    it(`classifies ${fp} as metadata`, () => {
      expect(classifyFile(fp).category).toBe('metadata');
    });
  }

  it('metadata files are not coverage evidence', () => {
    expect(classifyFile('business-rules.yaml').isCoverageEvidence).toBe(false);
  });
});

describe('classifyFile — configuration', () => {
  const CONFIG_CASES = [
    'qintel-analyzer.yaml',
    'config.yaml',
    'coverage.config.json',
    'package.json',
    'pom.xml',
    'tsconfig.json',
    'jest.config.ts',
  ];

  for (const fp of CONFIG_CASES) {
    it(`classifies ${fp} as configuration`, () => {
      expect(classifyFile(fp).category).toBe('configuration');
    });
  }

  it('configuration files are not coverage evidence', () => {
    expect(classifyFile('config.yaml').isCoverageEvidence).toBe(false);
  });
});

describe('classifyFile — bdd_scenarios', () => {
  it('classifies .feature files as bdd_scenarios', () => {
    expect(classifyFile('features/payment.feature').category).toBe('bdd_scenarios');
  });

  it('feature files ARE coverage evidence', () => {
    expect(classifyFile('features/payment.feature').isCoverageEvidence).toBe(true);
  });
});

describe('classifyFile — contracts', () => {
  it('classifies *.pact.json as contracts', () => {
    expect(classifyFile('consumer-provider.pact.json').category).toBe('contracts');
  });

  it('classifies files under contracts/ dir as contracts', () => {
    expect(classifyFile('contracts/api/consumer.json').category).toBe('contracts');
  });

  it('contract files are not coverage evidence', () => {
    expect(classifyFile('consumer-provider.pact.json').isCoverageEvidence).toBe(false);
  });
});

describe('classifyFile — security_reports', () => {
  it('classifies files under zap/ dir as security_reports', () => {
    expect(classifyFile('zap/zap-report.json').category).toBe('security_reports');
  });

  it('classifies files under trivy/ dir as security_reports', () => {
    expect(classifyFile('trivy/scan-result.json').category).toBe('security_reports');
  });

  it('security report files are not coverage evidence', () => {
    expect(classifyFile('zap/report.json').isCoverageEvidence).toBe(false);
  });
});

describe('classifyFile — performance', () => {
  it('classifies files under jmeter/ dir as performance', () => {
    expect(classifyFile('jmeter/results.jtl').category).toBe('performance');
  });

  it('classifies files under k6/ dir as performance', () => {
    expect(classifyFile('k6/summary.json').category).toBe('performance');
  });

  it('performance files are not coverage evidence', () => {
    expect(classifyFile('jmeter/results.jtl').isCoverageEvidence).toBe(false);
  });
});

describe('classifyFile — test_code', () => {
  const TEST_CASES = [
    'src/users.test.ts',
    'src/users.spec.ts',
    'src/UsersTest.java',
    'tests/UserTests.java',
    'tests/UserSpec.kt',
    'tests/test_users.py',
    'tests/users_test.py',
    'spec/users_spec.rb',
    'src/__tests__/users.test.js',
  ];

  for (const fp of TEST_CASES) {
    it(`classifies ${fp} as test_code`, () => {
      expect(classifyFile(fp).category).toBe('test_code');
    });
  }

  it('test files ARE coverage evidence', () => {
    expect(classifyFile('src/users.test.ts').isCoverageEvidence).toBe(true);
  });
});

describe('classifyFile — service_code', () => {
  const SERVICE_CASES = [
    'src/services/userService.ts',
    'src/controllers/PaymentController.java',
    'app/models/user.rb',
    'services/payment.py',
    'src/handlers/orders.js',
  ];

  for (const fp of SERVICE_CASES) {
    it(`classifies ${fp} as service_code`, () => {
      expect(classifyFile(fp).category).toBe('service_code');
    });
  }

  it('service code is not coverage evidence', () => {
    expect(classifyFile('src/services/userService.ts').isCoverageEvidence).toBe(false);
  });
});

// ─── classifyFiles ──────────────────────────────────────────────────────────────

describe('classifyFiles', () => {
  it('classifies an array of paths', () => {
    const results = classifyFiles(['openapi.yaml', 'src/users.test.ts', 'features/login.feature']);
    expect(results).toHaveLength(3);
    expect(results[0].category).toBe('specification');
    expect(results[1].category).toBe('test_code');
    expect(results[2].category).toBe('bdd_scenarios');
  });
});

// ─── filterCoverageEvidence ─────────────────────────────────────────────────────

describe('filterCoverageEvidence', () => {
  it('returns only test_code and bdd_scenarios', () => {
    const files = classifyFiles([
      'openapi.yaml',
      'business-rules.yaml',
      'src/users.test.ts',
      'features/login.feature',
      'src/userService.ts',
    ]);
    const evidence = filterCoverageEvidence(files);
    expect(evidence).toHaveLength(2);
    expect(evidence.every((f) => f.isCoverageEvidence)).toBe(true);
    expect(evidence.map((f) => f.category).sort()).toEqual(['bdd_scenarios', 'test_code']);
  });

  it('returns empty array when no coverage evidence files exist', () => {
    const files = classifyFiles(['openapi.yaml', 'business-rules.yaml', 'config.yaml']);
    expect(filterCoverageEvidence(files)).toHaveLength(0);
  });
});

// ─── COVERAGE_EVIDENCE_CATEGORIES ────────────────────────────────────────────

describe('COVERAGE_EVIDENCE_CATEGORIES', () => {
  it('contains test_code', () => {
    expect(COVERAGE_EVIDENCE_CATEGORIES.has('test_code')).toBe(true);
  });

  it('contains bdd_scenarios', () => {
    expect(COVERAGE_EVIDENCE_CATEGORIES.has('bdd_scenarios')).toBe(true);
  });

  it('does NOT contain specification', () => {
    expect(COVERAGE_EVIDENCE_CATEGORIES.has('specification')).toBe(false);
  });

  it('does NOT contain metadata', () => {
    expect(COVERAGE_EVIDENCE_CATEGORIES.has('metadata')).toBe(false);
  });

  it('does NOT contain configuration', () => {
    expect(COVERAGE_EVIDENCE_CATEGORIES.has('configuration')).toBe(false);
  });

  it('does NOT contain security_reports', () => {
    expect(COVERAGE_EVIDENCE_CATEGORIES.has('security_reports')).toBe(false);
  });
});

// ─── isTestFile ─────────────────────────────────────────────────────────────────

describe('isTestFile', () => {
  it('returns true for *.test.ts', () => expect(isTestFile('users.test.ts')).toBe(true));
  it('returns true for *.spec.ts', () => expect(isTestFile('users.spec.ts')).toBe(true));
  it('returns true for *Test.java', () => expect(isTestFile('UserTest.java')).toBe(true));
  it('returns true for *Tests.java', () => expect(isTestFile('UserTests.java')).toBe(true));
  it('returns true for *Spec.kt', () => expect(isTestFile('UserSpec.kt')).toBe(true));
  it('returns true for test_*.py', () => expect(isTestFile('test_user.py')).toBe(true));
  it('returns true for *_test.py', () => expect(isTestFile('user_test.py')).toBe(true));
  it('returns true for *_spec.rb', () => expect(isTestFile('user_spec.rb')).toBe(true));
  it('returns false for service source', () => expect(isTestFile('userService.ts')).toBe(false));
  it('returns false for openapi.yaml', () => expect(isTestFile('openapi.yaml')).toBe(false));
});
