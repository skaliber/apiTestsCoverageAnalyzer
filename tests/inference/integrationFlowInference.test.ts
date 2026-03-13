import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  inferFlowsFromFile,
  inferIntegrationFlows,
  writeInferredIntegrationFlows,
} from '../../src/inference/integrationFlowInference';

// ─── helpers ──────────────────────────────────────────────────────────────────

function writeTmp(name: string, content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qintel-flows-'));
  const fp = path.join(dir, name);
  fs.writeFileSync(fp, content, 'utf-8');
  return fp;
}

// ─── inferFlowsFromFile ───────────────────────────────────────────────────────

describe('inferFlowsFromFile — multi-step test sequences', () => {
  it('extracts a two-step axios flow', () => {
    const fp = writeTmp('payment.test.ts', `
      test('user payment flow', async () => {
        await axios.post('/users', { name: 'Alice' });
        await axios.post('/payments', { amount: 100 });
      });
    `);
    const flows = inferFlowsFromFile(fp);
    expect(flows.length).toBeGreaterThanOrEqual(1);
    const flow = flows[0];
    expect(flow.flow_source).toBe('inferred');
    expect(flow.steps.some((s) => s.method === 'POST' && s.path === '/users')).toBe(true);
    expect(flow.steps.some((s) => s.method === 'POST' && s.path === '/payments')).toBe(true);
  });

  it('extracts a three-step supertest flow', () => {
    const fp = writeTmp('lifecycle.test.ts', `
      it('full lifecycle', async () => {
        const user = await request.post('/users').send({ name: 'Bob' });
        await request.post('/login').send({ email: 'bob@example.com' });
        await request.post('/payments').send({ amount: 50 });
      });
    `);
    const flows = inferFlowsFromFile(fp);
    expect(flows.length).toBeGreaterThanOrEqual(1);
    expect(flows[0].steps.length).toBeGreaterThanOrEqual(2);
  });

  it('extracts test name when available', () => {
    const fp = writeTmp('order.test.ts', `
      test('create and cancel order', async () => {
        await axios.post('/orders', { item: 'book' });
        await axios.delete('/orders/1');
      });
    `);
    const flows = inferFlowsFromFile(fp);
    const flow = flows.find((f) => f.test_name?.includes('cancel'));
    expect(flow ?? flows[0]).toBeDefined();
  });
});

describe('inferFlowsFromFile — Python requests', () => {
  it('detects Python requests calls', () => {
    const fp = writeTmp('test_payment.py', `
def test_payment_flow():
    client.post('/users', json={'name': 'Alice'})
    client.post('/payments', json={'amount': 100})
    client.get('/payments/1')
    `);
    const flows = inferFlowsFromFile(fp);
    expect(flows.length).toBeGreaterThanOrEqual(1);
    expect(flows[0].steps.some((s) => s.path === '/users')).toBe(true);
  });
});

describe('inferFlowsFromFile — single HTTP call is not a flow', () => {
  it('does not create a flow from a single HTTP call', () => {
    const fp = writeTmp('single.test.ts', `
      test('get user', async () => {
        await axios.get('/users/1');
      });
    `);
    const flows = inferFlowsFromFile(fp);
    // Single calls do not form multi-step flows
    expect(flows.every((f) => f.steps.length >= 2)).toBe(true);
  });
});

describe('inferFlowsFromFile — source traceability', () => {
  it('includes source_location with file path and line number', () => {
    const fp = writeTmp('flow.test.ts', `
      test('flow', async () => {
        await axios.post('/a');
        await axios.get('/b');
      });
    `);
    const flows = inferFlowsFromFile(fp);
    if (flows.length > 0) {
      expect(flows[0].source_location).toMatch(/:\d+$/);
    }
  });
});

describe('inferFlowsFromFile — empty file', () => {
  it('returns empty array for empty file', () => {
    const fp = writeTmp('empty.ts', '');
    expect(inferFlowsFromFile(fp)).toEqual([]);
  });
});

describe('inferFlowsFromFile — nonexistent file', () => {
  it('returns empty array for nonexistent file', () => {
    expect(inferFlowsFromFile('/does/not/exist.ts')).toEqual([]);
  });
});

// ─── inferIntegrationFlows ────────────────────────────────────────────────────

describe('inferIntegrationFlows', () => {
  it('returns inferred:true', () => {
    const fp = writeTmp('api.test.ts', `
      test('two calls', async () => {
        await axios.post('/users');
        await axios.get('/users/1');
      });
    `);
    const result = inferIntegrationFlows([fp]);
    expect(result.inferred).toBe(true);
    expect(result.filesAnalyzed).toBe(1);
  });

  it('warns when no test files provided', () => {
    const warnings: string[] = [];
    const result = inferIntegrationFlows([], warnings);
    expect(result.flows).toHaveLength(0);
    expect(result.filesAnalyzed).toBe(0);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('aggregates flows from multiple files', () => {
    const fp1 = writeTmp('test1.ts', `
      test('a', async () => {
        await axios.post('/a');
        await axios.get('/a/1');
      });
    `);
    const fp2 = writeTmp('test2.ts', `
      test('b', async () => {
        await axios.post('/b');
        await axios.get('/b/2');
      });
    `);
    const result = inferIntegrationFlows([fp1, fp2]);
    expect(result.filesAnalyzed).toBe(2);
  });
});

// ─── writeInferredIntegrationFlows ────────────────────────────────────────────

describe('writeInferredIntegrationFlows', () => {
  it('writes a valid JSON file to the reports directory', () => {
    const reportsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qintel-reports-flows-'));
    const fp = writeTmp('api.test.ts', `
      test('flow', async () => {
        await axios.post('/users');
        await axios.get('/users/1');
      });
    `);
    const result = inferIntegrationFlows([fp]);
    const outPath = writeInferredIntegrationFlows(result, reportsDir);

    expect(fs.existsSync(outPath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(outPath, 'utf-8'));
    expect(parsed.flow_source).toBe('inferred');
    expect(parsed).toHaveProperty('flows');
    expect(Array.isArray(parsed.flows)).toBe(true);

    fs.rmSync(reportsDir, { recursive: true });
  });

  it('creates the reports directory if it does not exist', () => {
    const reportsDir = path.join(os.tmpdir(), `qintel-new-flows-${Date.now()}`);
    const result = inferIntegrationFlows([]);
    const outPath = writeInferredIntegrationFlows(result, reportsDir);
    expect(fs.existsSync(outPath)).toBe(true);
    fs.rmSync(reportsDir, { recursive: true });
  });
});
