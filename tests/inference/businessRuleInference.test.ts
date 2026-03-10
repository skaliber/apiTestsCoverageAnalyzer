import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  inferRulesFromFile,
  inferBusinessRules,
  writeInferredBusinessRules,
} from '../../src/inference/businessRuleInference';

// ─── helpers ──────────────────────────────────────────────────────────────────

function writeTmp(name: string, content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qintel-rules-'));
  const fp  = path.join(dir, name);
  fs.writeFileSync(fp, content, 'utf-8');
  return fp;
}

// ─── inferRulesFromFile ───────────────────────────────────────────────────────

describe('inferRulesFromFile — throw patterns', () => {
  it('detects a Java throw new exception', () => {
    const fp = writeTmp('PaymentService.java', `
      public void processPayment(Payment p) {
        if (p.amount > p.balance) {
          throw new InsufficientFundsException("Not enough balance");
        }
      }
    `);
    const rules = inferRulesFromFile(fp);
    expect(rules.some((r) => r.condition.includes('InsufficientFundsException'))).toBe(true);
    expect(rules.every((r) => r.rule_source === 'inferred')).toBe(true);
  });

  it('detects a Python raise', () => {
    const fp = writeTmp('payment_service.py', `
def process_payment(amount, balance):
    if amount > balance:
        raise InsufficientFundsException("Not enough balance")
    `);
    const rules = inferRulesFromFile(fp);
    expect(rules.some((r) => r.condition.includes('InsufficientFundsException'))).toBe(true);
  });

  it('detects a Ruby raise', () => {
    const fp = writeTmp('payment_service.rb', `
def process_payment(amount, balance)
  raise InsufficientFundsError, 'Not enough balance'
end
    `);
    const rules = inferRulesFromFile(fp);
    expect(rules.some((r) => r.condition.includes('InsufficientFundsError'))).toBe(true);
  });
});

describe('inferRulesFromFile — HTTP 4xx patterns', () => {
  it('detects return 400 in TypeScript', () => {
    const fp = writeTmp('userController.ts', `
      if (!request.email) {
        return res.status(400).json({ error: 'email required' });
      }
    `);
    const rules = inferRulesFromFile(fp);
    expect(rules.some((r) => r.type === 'validation')).toBe(true);
  });

  it('detects abort(403) in Python', () => {
    const fp = writeTmp('auth.py', `
def check_admin(user):
    if not user.is_admin:
        abort(403)
    `);
    const rules = inferRulesFromFile(fp);
    expect(rules.some((r) => r.condition.includes('403'))).toBe(true);
  });
});

describe('inferRulesFromFile — authorization patterns', () => {
  it('detects isAdmin check', () => {
    const fp = writeTmp('adminController.ts', `
      if (!user.isAdmin()) {
        throw new UnauthorizedException();
      }
    `);
    const rules = inferRulesFromFile(fp);
    const authRule = rules.find((r) => r.type === 'business_logic' || r.type === 'authorization');
    expect(authRule).toBeDefined();
  });
});

describe('inferRulesFromFile — null checks', () => {
  it('detects null guard on a field', () => {
    const fp = writeTmp('paymentService.ts', `
      if (request.amount === null) {
        return res.status(400).json({ error: 'amount required' });
      }
    `);
    const rules = inferRulesFromFile(fp);
    expect(rules.some((r) => r.condition.includes('null'))).toBe(true);
  });
});

describe('inferRulesFromFile — source location', () => {
  it('includes file path + line number in source_location', () => {
    const fp = writeTmp('service.ts', `
      function doThing() {
        throw new Error("bad");
      }
    `);
    const rules = inferRulesFromFile(fp);
    if (rules.length > 0) {
      expect(rules[0].source_location).toMatch(/:\d+$/);
    }
  });
});

describe('inferRulesFromFile — empty file', () => {
  it('returns empty array for empty file', () => {
    const fp = writeTmp('empty.ts', '');
    expect(inferRulesFromFile(fp)).toEqual([]);
  });
});

describe('inferRulesFromFile — nonexistent file', () => {
  it('returns empty array for nonexistent file', () => {
    expect(inferRulesFromFile('/does/not/exist.ts')).toEqual([]);
  });
});

// ─── inferBusinessRules ────────────────────────────────────────────────────────

describe('inferBusinessRules', () => {
  it('returns inferred:true result', () => {
    const fp = writeTmp('service.ts', `
      if (amount > balance) throw new InsufficientFundsException();
    `);
    const result = inferBusinessRules([fp]);
    expect(result.inferred).toBe(true);
    expect(result.filesAnalyzed).toBe(1);
  });

  it('warns when no service files provided', () => {
    const warnings: string[] = [];
    const result = inferBusinessRules([], warnings);
    expect(result.rules).toHaveLength(0);
    expect(result.filesAnalyzed).toBe(0);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('aggregates rules from multiple files', () => {
    const fp1 = writeTmp('serviceA.ts', `throw new NotFoundException();`);
    const fp2 = writeTmp('serviceB.ts', `throw new ValidationException();`);
    const result = inferBusinessRules([fp1, fp2]);
    expect(result.filesAnalyzed).toBe(2);
  });
});

// ─── writeInferredBusinessRules ───────────────────────────────────────────────

describe('writeInferredBusinessRules', () => {
  it('writes a valid JSON file to the reports directory', () => {
    const reportsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qintel-reports-rules-'));
    const fp = writeTmp('service.ts', `throw new InsufficientFundsException();`);
    const result = inferBusinessRules([fp]);
    const outPath = writeInferredBusinessRules(result, reportsDir);

    expect(fs.existsSync(outPath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(outPath, 'utf-8'));
    expect(parsed.rule_source).toBe('inferred');
    expect(parsed).toHaveProperty('rules');
    expect(Array.isArray(parsed.rules)).toBe(true);

    fs.rmSync(reportsDir, { recursive: true });
  });

  it('creates the reports directory if it does not exist', () => {
    const reportsDir = path.join(os.tmpdir(), `qintel-new-${Date.now()}`);
    const result = inferBusinessRules([]);
    const outPath = writeInferredBusinessRules(result, reportsDir);
    expect(fs.existsSync(outPath)).toBe(true);
    fs.rmSync(reportsDir, { recursive: true });
  });
});
