import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { inferRoutesFromFile, InferredRoute } from '../../../src/inference/routeInference';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeTempFile(ext: string, content: string): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flask-routes-'));
  const filePath = path.join(tmpDir, `test_routes${ext}`);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

// ─── Flask route patterns ────────────────────────────────────────────────────

describe('Flask route inference', () => {
  it('detects @app.route with default GET', () => {
    const fp = makeTempFile('.py', `
from flask import Flask
app = Flask(__name__)

@app.route('/articles')
def get_articles():
    return jsonify(articles)
`);
    const routes = inferRoutesFromFile(fp);
    expect(routes).toEqual([
      expect.objectContaining({ method: 'get', path: '/articles' }),
    ]);
  });

  it('detects @app.route with explicit methods', () => {
    const fp = makeTempFile('.py', `
@app.route('/articles', methods=['GET', 'POST'])
def articles():
    pass
`);
    const routes = inferRoutesFromFile(fp);
    expect(routes).toHaveLength(2);
    expect(routes.map((r) => r.method).sort()).toEqual(['get', 'post']);
    expect(routes.every((r) => r.path === '/articles')).toBe(true);
  });

  it('detects @blueprint.route with url_prefix', () => {
    const fp = makeTempFile('.py', `
from flask import Blueprint
blueprint = Blueprint('articles', __name__, url_prefix='/api/articles')

@blueprint.route('/<slug>', methods=['GET'])
def get_article(slug):
    return jsonify(article)
`);
    const routes = inferRoutesFromFile(fp);
    expect(routes).toEqual([
      expect.objectContaining({ method: 'get', path: '/api/articles/{slug}' }),
    ]);
  });

  it('normalizes Flask <param> to {param}', () => {
    const fp = makeTempFile('.py', `
@app.route('/users/<int:user_id>/posts/<post_id>')
def get_user_post(user_id, post_id):
    pass
`);
    const routes = inferRoutesFromFile(fp);
    expect(routes[0].path).toBe('/users/{user_id}/posts/{post_id}');
  });
});

// ─── FastAPI route patterns ──────────────────────────────────────────────────

describe('FastAPI route inference', () => {
  it('detects @app.get()', () => {
    const fp = makeTempFile('.py', `
from fastapi import FastAPI
app = FastAPI()

@app.get('/articles')
def list_articles():
    return []
`);
    const routes = inferRoutesFromFile(fp);
    expect(routes).toEqual([
      expect.objectContaining({ method: 'get', path: '/articles' }),
    ]);
  });

  it('detects @router.post() with APIRouter prefix', () => {
    const fp = makeTempFile('.py', `
from fastapi import APIRouter
router = APIRouter(prefix="/api/articles")

@router.post('/')
def create_article():
    pass
`);
    const routes = inferRoutesFromFile(fp);
    expect(routes).toEqual([
      expect.objectContaining({ method: 'post', path: '/api/articles/' }),
    ]);
  });

  it('detects multiple FastAPI routes', () => {
    const fp = makeTempFile('.py', `
@app.get('/articles')
def list(): pass

@app.post('/articles')
def create(): pass

@app.delete('/articles/{slug}')
def delete(slug: str): pass
`);
    const routes = inferRoutesFromFile(fp);
    expect(routes).toHaveLength(3);
    expect(routes.map((r) => r.method)).toEqual(['get', 'post', 'delete']);
  });
});
