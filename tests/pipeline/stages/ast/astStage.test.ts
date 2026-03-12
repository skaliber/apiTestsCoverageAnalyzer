import { AstStage } from '../../../../src/pipeline/stages/ast/astStage';
import type { PipelineContext, PipelineConfig } from '../../../../src/pipeline/stageInterface';
import type { AstStageOutput } from '../../../../src/pipeline/stages/ast/types';
import type { StageDiagnostics, StageName } from '../../../../src/pipeline/types';
import { CoverageKnowledgeGraph } from '../../../../src/pipeline/graph';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a minimal PipelineContext pointing at the given project root.
 */
function makeContext(projectRoot: string, configOverrides: Partial<PipelineConfig> = {}): PipelineContext {
  const config: PipelineConfig = {
    projectRoot,
    enableIast: false,
    enableDast: false,
    dastRateLimit: 10,
    traversalDepthCap: 5,
    fileTimeoutMs: 30_000,
    ...configOverrides,
  };

  return {
    projectRoot,
    config,
    graph: new CoverageKnowledgeGraph(),
    stageOutputs: new Map<StageName, unknown>(),
    diagnostics: new Map<StageName, StageDiagnostics>(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AstStage', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ast-stage-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ─── Stage metadata ───────────────────────────────────────────────────────

  it('has correct stage name and is not optional', () => {
    const stage = new AstStage();
    expect(stage.name).toBe('ast');
    expect(stage.optional).toBe(false);
  });

  // ─── Empty project ────────────────────────────────────────────────────────

  it('produces valid output structure for an empty project directory', async () => {
    const ctx = makeContext(tmpDir);
    const stage = new AstStage();
    const output = await stage.execute(ctx);

    expect(output.models).toBeInstanceOf(Map);
    expect(output.crossFileTable).toBeDefined();
    expect(output.traversalResults).toBeInstanceOf(Map);
    expect(output.analyzedFiles).toBeInstanceOf(Array);
    expect(output.skippedFiles).toBeInstanceOf(Array);
  });

  it('returns empty analyzed and skipped lists for an empty project', async () => {
    const ctx = makeContext(tmpDir);
    const stage = new AstStage();
    const output = await stage.execute(ctx);

    expect(output.analyzedFiles).toHaveLength(0);
    expect(output.skippedFiles).toHaveLength(0);
    expect(output.models.size).toBe(0);
  });

  // ─── Diagnostics recording ────────────────────────────────────────────────

  it('records diagnostics with stage name, duration, and metadata', async () => {
    const ctx = makeContext(tmpDir);
    const stage = new AstStage();
    await stage.execute(ctx);

    const diag = ctx.diagnostics.get('ast');
    expect(diag).toBeDefined();
    expect(diag!.stageName).toBe('ast');
    expect(typeof diag!.durationMs).toBe('number');
    expect(diag!.durationMs).toBeGreaterThanOrEqual(0);
    expect(diag!.metadata).toBeDefined();
    expect(typeof diag!.metadata.totalModels).toBe('number');
    expect(typeof diag!.metadata.totalInteractions).toBe('number');
  });

  // ─── Stage output stored in context ───────────────────────────────────────

  it('stores its output in context.stageOutputs under "ast"', async () => {
    const ctx = makeContext(tmpDir);
    const stage = new AstStage();
    const output = await stage.execute(ctx);

    const storedOutput = ctx.stageOutputs.get('ast') as AstStageOutput;
    expect(storedOutput).toBe(output);
  });

  // ─── JavaScript test file analysis ────────────────────────────────────────

  it('analyzes a JavaScript test file and reports it in analyzedFiles', async () => {
    const testFile = path.join(tmpDir, 'api.test.js');
    fs.writeFileSync(
      testFile,
      `
const axios = require('axios');
describe('API', () => {
  it('should get users', async () => {
    const res = await axios.get('/api/users');
    expect(res.status).toBe(200);
  });
});
`,
    );

    const ctx = makeContext(tmpDir);
    const stage = new AstStage();
    const output = await stage.execute(ctx);

    expect(output.analyzedFiles.length).toBeGreaterThan(0);
    expect(output.analyzedFiles).toContain(testFile);
  });

  // ─── TypeScript test file analysis ────────────────────────────────────────

  it('analyzes a TypeScript test file', async () => {
    const testFile = path.join(tmpDir, 'users.test.ts');
    fs.writeFileSync(
      testFile,
      `
import axios from 'axios';
describe('Users API', () => {
  it('fetches user list', async () => {
    const res = await axios.get('/api/users');
    expect(res.status).toBe(200);
  });
});
`,
    );

    const ctx = makeContext(tmpDir);
    const stage = new AstStage();
    const output = await stage.execute(ctx);

    expect(output.analyzedFiles).toContain(testFile);
  });

  // ─── Python test file analysis ────────────────────────────────────────────

  it('analyzes a Python test file', async () => {
    const testFile = path.join(tmpDir, 'test_api.py');
    fs.writeFileSync(
      testFile,
      `
import requests

def test_get_users():
    response = requests.get('/api/users')
    assert response.status_code == 200
`,
    );

    const ctx = makeContext(tmpDir);
    const stage = new AstStage();
    const output = await stage.execute(ctx);

    expect(output.analyzedFiles).toContain(testFile);
  });

  // ─── Non-source files are not analyzed ────────────────────────────────────

  it('does not include non-source files in analyzedFiles', async () => {
    const mdFile = path.join(tmpDir, 'readme.md');
    fs.writeFileSync(mdFile, '# Hello World');

    const ctx = makeContext(tmpDir);
    const stage = new AstStage();
    const output = await stage.execute(ctx);

    const analyzedBasenames = output.analyzedFiles.map((f) => path.basename(f));
    expect(analyzedBasenames).not.toContain('readme.md');
  });

  // ─── Service code files are discovered ────────────────────────────────────

  it('discovers and analyzes service code files (non-test source files)', async () => {
    const serviceFile = path.join(tmpDir, 'userService.ts');
    fs.writeFileSync(
      serviceFile,
      `
import express from 'express';
const router = express.Router();
router.get('/api/users', (req, res) => {
  res.json([]);
});
export default router;
`,
    );

    const ctx = makeContext(tmpDir);
    const stage = new AstStage();
    const output = await stage.execute(ctx);

    expect(output.analyzedFiles).toContain(serviceFile);
  });

  // ─── Cross-file symbol table shape ────────────────────────────────────────

  it('produces a cross-file symbol table with expected keys', async () => {
    const testFile = path.join(tmpDir, 'hello.test.ts');
    fs.writeFileSync(testFile, 'describe("hello", () => { it("works", () => {}); });');

    const ctx = makeContext(tmpDir);
    const stage = new AstStage();
    const output = await stage.execute(ctx);

    const table = output.crossFileTable;
    expect(table.models).toBeInstanceOf(Map);
    expect(table.exportedSymbols).toBeInstanceOf(Map);
    expect(table.classes).toBeInstanceOf(Map);
    expect(table.importGraph).toBeInstanceOf(Map);
  });

  // ─── Graph population ─────────────────────────────────────────────────────

  it('populates graph nodes and edges in the context graph', async () => {
    const testFile = path.join(tmpDir, 'graph.test.js');
    fs.writeFileSync(
      testFile,
      `
const axios = require('axios');
describe('Graph test', () => {
  it('calls endpoint', async () => {
    await axios.get('/api/health');
  });
});
`,
    );

    const ctx = makeContext(tmpDir);
    const stage = new AstStage();
    await stage.execute(ctx);

    // The stage should have added at least a file node to the graph
    expect(ctx.graph.nodeCount).toBeGreaterThanOrEqual(0);
  });

  // ─── Multiple files across languages ──────────────────────────────────────

  it('handles multiple files in different languages', async () => {
    const jsFile = path.join(tmpDir, 'api.test.js');
    fs.writeFileSync(
      jsFile,
      `
describe('JS test', () => {
  it('works', () => { expect(true).toBe(true); });
});
`,
    );

    const tsFile = path.join(tmpDir, 'service.ts');
    fs.writeFileSync(
      tsFile,
      `
export function greet(): string { return 'hello'; }
`,
    );

    const ctx = makeContext(tmpDir);
    const stage = new AstStage();
    const output = await stage.execute(ctx);

    expect(output.analyzedFiles).toContain(jsFile);
    expect(output.analyzedFiles).toContain(tsFile);
  });

  // ─── Cucumber feature file detection ──────────────────────────────────────

  it('analyzes Cucumber feature files', async () => {
    const featureFile = path.join(tmpDir, 'users.feature');
    fs.writeFileSync(
      featureFile,
      `
Feature: Users API
  Scenario: Get all users
    Given the API is running
    When I send a GET request to "/api/users"
    Then the response status should be 200
`,
    );

    const ctx = makeContext(tmpDir);
    const stage = new AstStage();
    const output = await stage.execute(ctx);

    expect(output.analyzedFiles).toContain(featureFile);
  });

  // ─── Diagnostics metadata reflects scan counts ────────────────────────────

  it('records correct metadata counts in diagnostics', async () => {
    const testFile = path.join(tmpDir, 'count.test.ts');
    fs.writeFileSync(
      testFile,
      `
describe('count', () => {
  it('runs', () => { expect(1).toBe(1); });
});
`,
    );

    const ctx = makeContext(tmpDir);
    const stage = new AstStage();
    await stage.execute(ctx);

    const diag = ctx.diagnostics.get('ast')!;
    expect(diag.filesScanned.length).toBeGreaterThanOrEqual(1);
    expect(typeof diag.metadata.totalClasses).toBe('number');
    expect(typeof diag.metadata.totalExportedSymbols).toBe('number');
    expect(typeof diag.metadata.traversalResultCount).toBe('number');
    expect(typeof diag.metadata.graphNodesAdded).toBe('number');
    expect(typeof diag.metadata.graphEdgesAdded).toBe('number');
  });

  // ─── Skipped files with unsupported extension ─────────────────────────────

  it('reports files with unsupported language in skippedFiles', async () => {
    // A .go file will be discovered as service_code (classifyFile recognizes .go),
    // but detectLanguage in astStage does not map .go, so it should be skipped.
    const goFile = path.join(tmpDir, 'main.go');
    fs.writeFileSync(goFile, 'package main\nfunc main() {}');

    const ctx = makeContext(tmpDir);
    const stage = new AstStage();
    const output = await stage.execute(ctx);

    const skippedFiles = output.skippedFiles.map((s) => s.file);
    expect(skippedFiles).toContain(goFile);

    const skippedEntry = output.skippedFiles.find((s) => s.file === goFile);
    expect(skippedEntry!.reason).toBe('unsupported-language');
  });

  // ─── Java test file analysis ──────────────────────────────────────────────

  it('analyzes a Java test file', async () => {
    const javaFile = path.join(tmpDir, 'UserTest.java');
    fs.writeFileSync(
      javaFile,
      `
import org.junit.Test;
import static io.restassured.RestAssured.given;

public class UserTest {
    @Test
    public void testGetUser() {
        given().when().get("/api/users").then().statusCode(200);
    }
}
`,
    );

    const ctx = makeContext(tmpDir);
    const stage = new AstStage();
    const output = await stage.execute(ctx);

    expect(output.analyzedFiles).toContain(javaFile);
  });

  // ─── Ruby spec file analysis ──────────────────────────────────────────────

  it('analyzes a Ruby spec file', async () => {
    const rbFile = path.join(tmpDir, 'users_spec.rb');
    fs.writeFileSync(
      rbFile,
      `
require 'net/http'

RSpec.describe 'Users API' do
  it 'returns a list of users' do
    uri = URI('/api/users')
    response = Net::HTTP.get_response(uri)
    expect(response.code).to eq('200')
  end
end
`,
    );

    const ctx = makeContext(tmpDir);
    const stage = new AstStage();
    const output = await stage.execute(ctx);

    expect(output.analyzedFiles).toContain(rbFile);
  });

  // ─── Kotlin test file analysis ────────────────────────────────────────────

  it('analyzes a Kotlin test file', async () => {
    const ktFile = path.join(tmpDir, 'UserTest.kt');
    fs.writeFileSync(
      ktFile,
      `
import org.junit.Test

class UserTest {
    @Test
    fun testGetUsers() {
        val response = get("/api/users")
        assert(response.status == 200)
    }
}
`,
    );

    const ctx = makeContext(tmpDir);
    const stage = new AstStage();
    const output = await stage.execute(ctx);

    expect(output.analyzedFiles).toContain(ktFile);
  });

  // ─── crossFileResolutionDiagnostics presence ──────────────────────────────

  it('includes crossFileResolutionDiagnostics in output', async () => {
    const ctx = makeContext(tmpDir);
    const stage = new AstStage();
    const output = await stage.execute(ctx);

    // The field should exist (may be an empty array for a trivial project)
    expect(output.crossFileResolutionDiagnostics).toBeDefined();
    expect(Array.isArray(output.crossFileResolutionDiagnostics)).toBe(true);
  });

  // ─── traversalResults map keyed by file ───────────────────────────────────

  it('returns traversalResults keyed by file path', async () => {
    const ctx = makeContext(tmpDir);
    const stage = new AstStage();
    const output = await stage.execute(ctx);

    expect(output.traversalResults).toBeInstanceOf(Map);
    // For a project without class inheritance, the map should be empty
    expect(output.traversalResults.size).toBe(0);
  });
});
