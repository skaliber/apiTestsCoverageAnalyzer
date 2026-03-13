import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  inferRoutesFromFile,
  inferRoutes,
  writeInferredRoutes,
} from '../../src/inference/routeInference';

// ─── helpers ──────────────────────────────────────────────────────────────────

function writeTmp(name: string, content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qintel-routes-'));
  const fp  = path.join(dir, name);
  fs.writeFileSync(fp, content, 'utf-8');
  return fp;
}

// ─── inferRoutesFromFile ──────────────────────────────────────────────────────

describe('inferRoutesFromFile — Express inline patterns', () => {
  it('detects router.get on a single line', () => {
    const fp = writeTmp('routes.ts', `
      const router = Router();
      router.get('/users', auth.optional, async (req, res) => {
        const result = await getUsers(req.query);
        res.json(result);
      });
    `);
    const routes = inferRoutesFromFile(fp);
    expect(routes).toHaveLength(1);
    expect(routes[0].method).toBe('get');
    expect(routes[0].path).toBe('/users');
    expect(routes[0].discoveredVia).toBe('code');
  });

  it('detects router.post on a single line', () => {
    const fp = writeTmp('auth.controller.ts', `
      router.post('/users/login', async (req, res) => {
        const token = await login(req.body);
        res.json(token);
      });
    `);
    const routes = inferRoutesFromFile(fp);
    expect(routes).toHaveLength(1);
    expect(routes[0].method).toBe('post');
    expect(routes[0].path).toBe('/users/login');
  });

  it('detects multi-line router.get with path on next line', () => {
    const fp = writeTmp('article.controller.ts', `
      router.get(
        '/articles/feed',
        auth.required,
        async (req, res) => {
          const result = await getFeed(req.query);
          res.json(result);
        }
      );
    `);
    const routes = inferRoutesFromFile(fp);
    expect(routes).toHaveLength(1);
    expect(routes[0].method).toBe('get');
    expect(routes[0].path).toBe('/articles/feed');
    expect(routes[0].discoveredVia).toBe('code');
  });

  it('detects handler function from route handler body', () => {
    const fp = writeTmp('profile.controller.ts', `
      router.delete(
        '/profiles/:username/follow',
        auth.required,
        async (req, res, next) => {
          try {
            const result = await unfollowUser(req.params.username, req.auth.user.id);
            res.json(result);
          } catch (err) { next(err); }
        }
      );
    `);
    const routes = inferRoutesFromFile(fp);
    expect(routes).toHaveLength(1);
    expect(routes[0].method).toBe('delete');
    expect(routes[0].handlerFunction).toBe('unfollowUser');
  });

  it('detects app.post pattern', () => {
    const fp = writeTmp('main.ts', `
      app.post('/webhook', async (req, res) => {
        await handleWebhook(req.body);
        res.sendStatus(200);
      });
    `);
    const routes = inferRoutesFromFile(fp);
    expect(routes.some((r) => r.method === 'post' && r.path === '/webhook')).toBe(true);
  });

  it('deduplicates routes by method:path (prefers code over jsdoc)', () => {
    const fp = writeTmp('articles.controller.ts', `
      /**
       * @route {GET} /articles
       */
      router.get('/articles', auth.optional, async (req, res) => {
        const result = await getArticles(req.query);
        res.json(result);
      });
    `);
    const routes = inferRoutesFromFile(fp);
    // Should appear only once despite both JSDoc and code pattern
    const getArticlesRoutes = routes.filter((r) => r.method === 'get' && r.path === '/articles');
    expect(getArticlesRoutes).toHaveLength(1);
    expect(getArticlesRoutes[0].discoveredVia).toBe('code');
  });

  it('detects JSDoc @route annotation when no code pattern exists', () => {
    const fp = writeTmp('legacy.ts', `
      /**
       * @route {DELETE} /legacy/resource/:id
       */
      module.exports.handler = async (req, res) => {
        res.sendStatus(204);
      };
    `);
    const routes = inferRoutesFromFile(fp);
    const jsdocRoutes = routes.filter(
      (r) => r.method === 'delete' && r.path === '/legacy/resource/:id',
    );
    expect(jsdocRoutes).toHaveLength(1);
    expect(jsdocRoutes[0].discoveredVia).toBe('jsdoc');
  });

  it('detects multiple routes in one file without duplicates', () => {
    const fp = writeTmp('multi.controller.ts', `
      router.get('/api/v1/items', async (req, res) => { res.json([]); });
      router.post('/api/v1/items', async (req, res) => { res.status(201).json({}); });
      router.put('/api/v1/items/:id', async (req, res) => { res.json({}); });
      router.delete('/api/v1/items/:id', async (req, res) => { res.sendStatus(204); });
    `);
    const routes = inferRoutesFromFile(fp);
    expect(routes).toHaveLength(4);
    const methods = routes.map((r) => r.method).sort();
    expect(methods).toEqual(['delete', 'get', 'post', 'put']);
  });

  it('returns empty array for non-route file', () => {
    const fp = writeTmp('utils.ts', `
      export function formatDate(d: Date): string {
        return d.toISOString();
      }
    `);
    expect(inferRoutesFromFile(fp)).toHaveLength(0);
  });

  it('returns empty array for non-existent file', () => {
    expect(inferRoutesFromFile('/non/existent/file.ts')).toHaveLength(0);
  });
});

// ─── inferRoutes (multi-file) ─────────────────────────────────────────────────

describe('inferRoutes — multi-file', () => {
  it('aggregates routes from multiple files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qintel-routes-'));
    const f1 = path.join(dir, 'users.controller.ts');
    const f2 = path.join(dir, 'articles.controller.ts');
    fs.writeFileSync(f1, `router.get('/users', async (req, res) => { res.json([]); });`);
    fs.writeFileSync(f2, `router.get('/articles', async (req, res) => { res.json([]); });`);

    const result = inferRoutes([f1, f2]);
    expect(result.routes).toHaveLength(2);
    expect(result.filesAnalyzed).toBe(2);
    expect(result.warnings).toHaveLength(0);
  });

  it('emits a warning when no routes found', () => {
    const fp = writeTmp('noop.ts', `export const x = 1;`);
    const result = inferRoutes([fp]);
    expect(result.routes).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

// ─── writeInferredRoutes ──────────────────────────────────────────────────────

describe('writeInferredRoutes', () => {
  it('writes a JSON file with the routes', () => {
    const fp = writeTmp('ctrl.ts', `
      router.get('/health', async (req, res) => { res.json({ ok: true }); });
    `);
    const result = inferRoutes([fp]);
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qintel-out-'));
    const outPath = writeInferredRoutes(result, outDir);

    expect(fs.existsSync(outPath)).toBe(true);
    const json = JSON.parse(fs.readFileSync(outPath, 'utf-8'));
    expect(json.route_source).toBe('inferred');
    expect(json.routes).toHaveLength(1);
    expect(json.routes[0].method).toBe('get');
    expect(json.routes[0].path).toBe('/health');
  });
});
