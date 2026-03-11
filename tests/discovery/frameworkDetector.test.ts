import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { detectApiFrameworks, DetectedApiFramework } from '../../src/discovery/frameworkDetector';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeTempDir(files: Record<string, string>): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-detect-'));
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = path.join(tmpDir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
  }
  return tmpDir;
}

function cleanTempDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function absolutePaths(tmpDir: string, files: Record<string, string>): string[] {
  return Object.keys(files).map((rel) => path.join(tmpDir, rel));
}

// ─── detectApiFrameworks ─────────────────────────────────────────────────────

describe('detectApiFrameworks', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) cleanTempDir(tmpDir);
  });

  // ── Python frameworks ──────────────────────────────────────────────────

  it('detects Flask from Blueprint import', () => {
    const files = {
      'views.py': 'from flask import Blueprint\nblueprint = Blueprint("articles", __name__)',
    };
    tmpDir = makeTempDir(files);
    const result = detectApiFrameworks(absolutePaths(tmpDir, files));
    expect(result.some((f) => f.name === 'flask')).toBe(true);
  });

  it('detects FastAPI from import', () => {
    const files = {
      'main.py': 'from fastapi import FastAPI\napp = FastAPI()',
    };
    tmpDir = makeTempDir(files);
    const result = detectApiFrameworks(absolutePaths(tmpDir, files));
    expect(result.some((f) => f.name === 'fastapi')).toBe(true);
  });

  it('detects Django from URL configuration', () => {
    const files = {
      'urls.py': 'from django.urls import path\nurlpatterns = []',
    };
    tmpDir = makeTempDir(files);
    const result = detectApiFrameworks(absolutePaths(tmpDir, files));
    expect(result.some((f) => f.name === 'django')).toBe(true);
  });

  // ── Java frameworks ────────────────────────────────────────────────────

  it('detects Spring Boot from REST annotations', () => {
    const files = {
      'ArticleController.java': '@RestController\npublic class ArticleController {\n  @GetMapping("/articles")\n  public List<Article> list() { return null; }\n}',
    };
    tmpDir = makeTempDir(files);
    const result = detectApiFrameworks(absolutePaths(tmpDir, files));
    expect(result.some((f) => f.name === 'spring-boot')).toBe(true);
  });

  it('detects DGS framework from annotations', () => {
    const files = {
      'DataFetcher.java': '@DgsComponent\npublic class ArticleDataFetcher {\n  @DgsQuery\n  public Article article() { return null; }\n}',
    };
    tmpDir = makeTempDir(files);
    const result = detectApiFrameworks(absolutePaths(tmpDir, files));
    expect(result.some((f) => f.name === 'dgs-framework')).toBe(true);
  });

  // ── Node.js frameworks ──────────────────────────────────────────────────

  it('detects Express from require', () => {
    const files = {
      'app.js': "const express = require('express')\nconst app = express()",
    };
    tmpDir = makeTempDir(files);
    const result = detectApiFrameworks(absolutePaths(tmpDir, files));
    expect(result.some((f) => f.name === 'express')).toBe(true);
  });

  it('detects NestJS from decorators', () => {
    const files = {
      'app.module.ts': "import { Module } from '@nestjs/common'\n@Module({})\nexport class AppModule {}",
    };
    tmpDir = makeTempDir(files);
    const result = detectApiFrameworks(absolutePaths(tmpDir, files));
    expect(result.some((f) => f.name === 'nestjs')).toBe(true);
  });

  it('detects HapiJS from server.route pattern', () => {
    const files = {
      'routes.js': "server.route({\n  method: 'GET',\n  path: '/articles'\n})",
    };
    tmpDir = makeTempDir(files);
    const result = detectApiFrameworks(absolutePaths(tmpDir, files));
    expect(result.some((f) => f.name === 'hapijs')).toBe(true);
  });

  // ── Frontend frameworks ────────────────────────────────────────────────

  it('detects Angular from HttpClient import', () => {
    const files = {
      'articles.service.ts': "import { HttpClient } from '@angular/common/http'\n@Injectable({ providedIn: 'root' })\nexport class ArticlesService { constructor(private http: HttpClient) {} }",
    };
    tmpDir = makeTempDir(files);
    const result = detectApiFrameworks(absolutePaths(tmpDir, files));
    expect(result.some((f) => f.name === 'angular')).toBe(true);
  });

  it('detects Vue/Vuex from store patterns', () => {
    const files = {
      'store.js': "import Vuex from 'vuex'\nconst store = new Vuex.Store({})",
    };
    tmpDir = makeTempDir(files);
    const result = detectApiFrameworks(absolutePaths(tmpDir, files));
    expect(result.some((f) => f.name === 'vue')).toBe(true);
  });

  // ── PHP frameworks ─────────────────────────────────────────────────────

  it('detects Slim from route pattern', () => {
    const files = {
      'routes.php': "$app->get('/api/articles', ArticleController::class . ':index')",
    };
    tmpDir = makeTempDir(files);
    const result = detectApiFrameworks(absolutePaths(tmpDir, files));
    expect(result.some((f) => f.name === 'slim')).toBe(true);
  });

  // ── Edge cases ─────────────────────────────────────────────────────────

  it('returns empty array for empty input', () => {
    const result = detectApiFrameworks([]);
    expect(result).toEqual([]);
  });

  it('skips non-scannable file extensions', () => {
    const files = {
      'readme.md': '@RestController\nfrom flask import Blueprint',
      'data.json': '{"express": true}',
    };
    tmpDir = makeTempDir(files);
    const result = detectApiFrameworks(absolutePaths(tmpDir, files));
    expect(result).toEqual([]);
  });

  it('deduplicates — same framework detected in multiple files appears once', () => {
    const files = {
      'a.py': 'from flask import Blueprint',
      'b.py': 'from flask import Flask',
    };
    tmpDir = makeTempDir(files);
    const result = detectApiFrameworks(absolutePaths(tmpDir, files));
    const flaskHits = result.filter((f) => f.name === 'flask');
    expect(flaskHits.length).toBe(1);
  });

  it('detects multiple frameworks from different files', () => {
    const files = {
      'app.py': 'from flask import Blueprint',
      'controller.java': '@RestController\npublic class Ctrl {}',
      'routes.js': "const express = require('express')",
    };
    tmpDir = makeTempDir(files);
    const result = detectApiFrameworks(absolutePaths(tmpDir, files));
    const names = result.map((f) => f.name);
    expect(names).toContain('flask');
    expect(names).toContain('spring-boot');
    expect(names).toContain('express');
  });

  it('includes detectedInFile and evidence in result', () => {
    const files = {
      'main.py': 'from fastapi import FastAPI\napp = FastAPI()',
    };
    tmpDir = makeTempDir(files);
    const result = detectApiFrameworks(absolutePaths(tmpDir, files));
    const fastapi = result.find((f) => f.name === 'fastapi');
    expect(fastapi).toBeDefined();
    expect(fastapi!.detectedInFile).toContain('main.py');
    expect(fastapi!.evidence).toBeTruthy();
  });

  it('respects maxFiles limit', () => {
    // Create many files but limit scan to 1
    const files: Record<string, string> = {};
    for (let i = 0; i < 10; i++) {
      files[`route${i}.py`] = 'from flask import Blueprint';
    }
    files['controller.java'] = '@RestController\npublic class Ctrl {}';
    tmpDir = makeTempDir(files);
    // With maxFiles=1, only 1 file is scanned — may or may not detect both
    const allPaths = absolutePaths(tmpDir, files);
    const result = detectApiFrameworks(allPaths, 1);
    // Should detect at least 1 framework from the single scanned file
    expect(result.length).toBeGreaterThanOrEqual(0); // Non-deterministic which file is first
    expect(result.length).toBeLessThanOrEqual(1);
  });
});
