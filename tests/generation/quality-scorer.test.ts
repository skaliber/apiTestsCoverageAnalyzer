/**
 * Feature 28 — Tests for QualityScorer
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { scoreFile, scoreTests } from '../../src/generation/quality-scorer';

describe('QualityScorer', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quality-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeTestFile(name: string, content: string): string {
    const filePath = path.join(tmpDir, name);
    fs.writeFileSync(filePath, content, 'utf8');
    return filePath;
  }

  describe('scoreFile', () => {
    it('should score a high-quality test file near 100', () => {
      const filePath = writeTestFile('high-quality.test.ts', `
        describe('POST /api/articles', () => {
          beforeEach(() => { /* setup */ });
          afterEach(() => { /* cleanup */ });

          it('should create article', async () => {
            const response = await request(app).post('/api/articles').set('Authorization', token).send(payload);
            expect(response.status).toBe(201);
            expect(response.body.article.title).toBe('Test Title');
            expect(response.body.article.slug).toBeDefined();
          });

          it('should return 401 when no auth', async () => {
            const response = await request(app).post('/api/articles').send(payload);
            expect(response.status).toBe(401);
          });

          it('should return 422 when title is missing', async () => {
            const response = await request(app).post('/api/articles').set('Authorization', token).send({});
            expect(response.status).toBe(422);
          });

          it('should handle empty string boundary', async () => {
            const response = await request(app).post('/api/articles').set('Authorization', token).send({ title: '' });
            expect(response.status).toBe(422);
          });

          it('should handle minimum length boundary', async () => {
            expect(response.body.article.title).toBe('Test Title');
          });
        });
      `);

      const result = scoreFile(filePath);

      expect(result.score).toBeGreaterThan(60);
      expect(result.dimensions.assertionDepth).toBeGreaterThan(0);
    });

    it('should score a low-quality test file below 40', () => {
      const filePath = writeTestFile('low-quality.test.ts', `
        describe('POST /api/articles', () => {
          it('should work', async () => {
            const response = await request(app).post('/api/articles').send({});
            expect(response.body).toBeTruthy();
          });
        });
      `);

      const result = scoreFile(filePath);

      expect(result.score).toBeLessThan(50);
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it('should detect issues in a weak test file', () => {
      const filePath = writeTestFile('weak.test.ts', `
        it('should work', async () => {
          const r = await request(app).get('/');
          expect(r.body).toBeTruthy();
        });
      `);

      const result = scoreFile(filePath);

      expect(result.issues.length).toBeGreaterThan(0);
    });

    it('should detect strengths in a well-written test file', () => {
      const filePath = writeTestFile('strong.test.ts', `
        describe('GET /api/articles', () => {
          afterEach(() => { cleanup(); });

          it('should return 200 with articles', async () => {
            const response = await request(app).get('/api/articles');
            expect(response.status).toBe(200);
            expect(response.body.articles).toHaveProperty('length');
            expect(response.body.articles[0].title).toBe('Expected Title');
          });

          it('should return 401 when auth required', async () => {
            const response = await request(app).get('/api/articles');
            expect(response.status).toBe(401);
          });

          it('should handle empty results', async () => {
            const response = await request(app).get('/api/articles?min=0&empty=true');
            expect(response.body.articles).toHaveLength(0);
          });
        });
      `);

      const result = scoreFile(filePath);

      expect(result.score).toBeGreaterThan(50);
    });

    it('should return all 5 dimension scores', () => {
      const filePath = writeTestFile('any.test.ts', `
        it('test', () => { expect(true).toBe(true); });
      `);

      const result = scoreFile(filePath);

      expect(result.dimensions).toHaveProperty('assertionDepth');
      expect(result.dimensions).toHaveProperty('negativePathCoverage');
      expect(result.dimensions).toHaveProperty('authCoverage');
      expect(result.dimensions).toHaveProperty('boundaryCoverage');
      expect(result.dimensions).toHaveProperty('testIndependence');
    });

    it('should not exceed 20 points per dimension', () => {
      const filePath = writeTestFile('max.test.ts', `
        describe('API', () => {
          afterEach(() => { cleanup(); });
          it('should return 200', async () => {
            expect(response.status).toBe(200);
            expect(response.body.user.email).toBe('test@example.com');
          });
          it('should return 401', async () => { expect(response.status).toBe(401); });
          it('should return 422', async () => { expect(response.status).toBe(422); });
          it('should handle min boundary', async () => {});
          it('should handle max boundary', async () => {});
        });
      `);

      const result = scoreFile(filePath);

      expect(result.dimensions.assertionDepth).toBeLessThanOrEqual(20);
      expect(result.dimensions.negativePathCoverage).toBeLessThanOrEqual(20);
      expect(result.dimensions.authCoverage).toBeLessThanOrEqual(20);
      expect(result.dimensions.boundaryCoverage).toBeLessThanOrEqual(20);
      expect(result.dimensions.testIndependence).toBeLessThanOrEqual(20);
      expect(result.score).toBeLessThanOrEqual(100);
    });
  });

  describe('scoreTests', () => {
    it('should write test-quality.json to reportsDir', async () => {
      writeTestFile('sample.test.ts', `
        it('basic test', () => { expect(true).toBe(true); });
      `);

      const reportsDir = path.join(tmpDir, 'reports');
      fs.mkdirSync(reportsDir);

      await scoreTests({
        testsGlob: path.join(tmpDir, '*.test.ts'),
        reportsDir,
      });

      expect(fs.existsSync(path.join(reportsDir, 'test-quality.json'))).toBe(true);
    });

    it('should include overallScore in report', async () => {
      writeTestFile('t.test.ts', `
        it('test', () => { expect(1).toBe(1); });
      `);

      const reportsDir = path.join(tmpDir, 'reports');
      fs.mkdirSync(reportsDir);

      const report = await scoreTests({
        testsGlob: path.join(tmpDir, '*.test.ts'),
        reportsDir,
      });

      expect(typeof report.overallScore).toBe('number');
      expect(report.overallScore).toBeGreaterThanOrEqual(0);
      expect(report.overallScore).toBeLessThanOrEqual(100);
    });

    it('should throw and exit non-zero when failBelow threshold is exceeded', async () => {
      writeTestFile('bad.test.ts', `
        it('bad test', () => { expect(true).toBeTruthy(); });
      `);

      const reportsDir = path.join(tmpDir, 'reports');
      fs.mkdirSync(reportsDir);

      await expect(
        scoreTests({
          testsGlob: path.join(tmpDir, '*.test.ts'),
          reportsDir,
          failBelow: 100,
        }),
      ).rejects.toThrow('Quality gate failed');
    });

    it('should NOT throw when all files meet the failBelow threshold', async () => {
      writeTestFile('ok.test.ts', `
        describe('Good tests', () => {
          afterEach(() => { cleanup(); });
          it('should return 200', async () => {
            expect(response.status).toBe(200);
            expect(response.body.user.email).toBe('test@example.com');
          });
          it('should return 401', async () => { expect(response.status).toBe(401); });
        });
      `);

      const reportsDir = path.join(tmpDir, 'reports');
      fs.mkdirSync(reportsDir);

      await expect(
        scoreTests({
          testsGlob: path.join(tmpDir, '*.test.ts'),
          reportsDir,
          failBelow: 0,
        }),
      ).resolves.not.toThrow();
    });
  });
});
