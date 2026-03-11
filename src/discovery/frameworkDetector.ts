/**
 * API Framework Detection Engine (Feature 27)
 *
 * Detects API frameworks (not test frameworks) from source file contents.
 * This is separate from test framework detection in projectDiscovery.ts.
 *
 * Detection is content-based, not path-based — a file in any directory
 * can trigger framework detection (RULE-SA01).
 */

import * as fs from 'fs';

// ─── Public types ─────────────────────────────────────────────────────────────

export type ApiFrameworkName =
  // Python
  | 'flask'
  | 'fastapi'
  | 'django'
  // Java / Kotlin
  | 'spring-boot'
  | 'spring-graphql'
  | 'dgs-framework'
  // Node.js / TypeScript
  | 'express'
  | 'nestjs'
  | 'hapijs'
  | 'koa'
  | 'fastify'
  // Frontend
  | 'angular'
  | 'vue'
  | 'react'
  // PHP
  | 'slim'
  | 'laravel';

export interface DetectedApiFramework {
  /** Framework identifier */
  name: ApiFrameworkName;
  /** How the framework was detected */
  evidence: string;
  /** File where the framework was detected */
  detectedInFile: string;
  /** Version hint if extractable (e.g., from package.json, pom.xml) */
  versionHint?: string;
}

// ─── Detection rules ──────────────────────────────────────────────────────────

interface FrameworkRule {
  name: ApiFrameworkName;
  /** Pattern to match against file content */
  pattern: RegExp;
  /** Human-readable evidence description */
  evidenceLabel: string;
}

/**
 * Framework detection rules.
 * Each rule matches a regex against the first 8 KB of a source file.
 * Multiple rules can match the same file; deduplication happens at the caller.
 */
const FRAMEWORK_RULES: FrameworkRule[] = [
  // ── Python ────────────────────────────────────────────────────────────────
  {
    name: 'flask',
    pattern: /from\s+flask\s+import|import\s+flask|Blueprint\s*\(|flask\.Blueprint/,
    evidenceLabel: 'Flask import or Blueprint usage',
  },
  {
    name: 'fastapi',
    pattern: /from\s+fastapi\s+import|import\s+fastapi|FastAPI\s*\(|APIRouter\s*\(/,
    evidenceLabel: 'FastAPI import or APIRouter usage',
  },
  {
    name: 'django',
    pattern: /from\s+django\.\w+\s+import|django\.urls|urlpatterns\s*=/,
    evidenceLabel: 'Django import or URL configuration',
  },

  // ── Java / Kotlin ─────────────────────────────────────────────────────────
  {
    name: 'spring-boot',
    pattern: /@RestController|@RequestMapping|@GetMapping|@PostMapping|@PutMapping|@DeleteMapping|@PatchMapping|@SpringBootApplication/,
    evidenceLabel: 'Spring Boot REST annotations',
  },
  {
    name: 'spring-graphql',
    pattern: /@QueryMapping|@MutationMapping|@SchemaMapping/,
    evidenceLabel: 'Spring GraphQL annotations',
  },
  {
    name: 'dgs-framework',
    pattern: /@DgsComponent|@DgsQuery|@DgsMutation|@DgsData/,
    evidenceLabel: 'Netflix DGS framework annotations',
  },

  // ── Node.js / TypeScript ──────────────────────────────────────────────────
  {
    name: 'express',
    pattern: /require\s*\(\s*['"]express['"]\s*\)|from\s+['"]express['"]\s*import|express\s*\(\s*\)|Router\s*\(\s*\)/,
    evidenceLabel: 'Express import or Router usage',
  },
  {
    name: 'nestjs',
    pattern: /@Controller\s*\(|@Module\s*\(|@Injectable\s*\(\s*\)|from\s+['"]@nestjs\//,
    evidenceLabel: 'NestJS module/controller decorators',
  },
  {
    name: 'hapijs',
    pattern: /server\.route\s*\(\s*\{|@hapi\/hapi|require\s*\(\s*['"]@hapi\/hapi['"]\s*\)|Hapi\.Server/,
    evidenceLabel: 'HapiJS server.route or import',
  },
  {
    name: 'koa',
    pattern: /require\s*\(\s*['"]koa['"]\s*\)|from\s+['"]koa['"]/,
    evidenceLabel: 'Koa import',
  },
  {
    name: 'fastify',
    pattern: /require\s*\(\s*['"]fastify['"]\s*\)|from\s+['"]fastify['"]/,
    evidenceLabel: 'Fastify import',
  },

  // ── Frontend ──────────────────────────────────────────────────────────────
  {
    name: 'angular',
    pattern: /@Injectable\s*\(\s*\{[^}]*providedIn|HttpClient|@Component\s*\(\s*\{|from\s+['"]@angular\//,
    evidenceLabel: 'Angular Injectable/Component/HttpClient',
  },
  {
    name: 'vue',
    pattern: /Vuex\.Store|createStore\s*\(|mapActions|mapGetters|\$store\.dispatch|from\s+['"]vuex['"]/,
    evidenceLabel: 'Vuex store or actions',
  },
  {
    name: 'react',
    pattern: /from\s+['"]react['"]|React\.createElement|useEffect\s*\(|useState\s*\(/,
    evidenceLabel: 'React import or hooks',
  },

  // ── PHP ───────────────────────────────────────────────────────────────────
  {
    name: 'slim',
    pattern: /\$app\s*->\s*(get|post|put|patch|delete)\s*\(|Slim\\App|use\s+Slim\\/,
    evidenceLabel: 'Slim framework route or import',
  },
  {
    name: 'laravel',
    pattern: /Route::(?:get|post|put|patch|delete)\s*\(|Illuminate\\|artisan/,
    evidenceLabel: 'Laravel Route facade or Illuminate import',
  },
];

// ─── Detection engine ─────────────────────────────────────────────────────────

/** File extensions to scan for API framework detection */
const SCANNABLE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs',
  '.java', '.kt', '.kts',
  '.py',
  '.rb',
  '.php',
  '.go',
  '.cs',
]);

/**
 * Detect API frameworks from a set of source file paths.
 *
 * Samples up to `maxFiles` files, reading the first 8 KB of each.
 * Returns deduplicated list of detected frameworks.
 */
export function detectApiFrameworks(
  filePaths: string[],
  maxFiles = 100,
): DetectedApiFramework[] {
  const detected = new Map<ApiFrameworkName, DetectedApiFramework>();

  // Filter to scannable extensions, then sample
  const scannable = filePaths.filter((fp) => {
    const ext = fp.slice(fp.lastIndexOf('.'));
    return SCANNABLE_EXTENSIONS.has(ext);
  });
  const sample = scannable.slice(0, maxFiles);

  for (const filePath of sample) {
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8').slice(0, 8192);
    } catch {
      continue;
    }

    for (const rule of FRAMEWORK_RULES) {
      // Skip if already detected — keep first detection as evidence
      if (detected.has(rule.name)) continue;

      if (rule.pattern.test(content)) {
        detected.set(rule.name, {
          name: rule.name,
          evidence: rule.evidenceLabel,
          detectedInFile: filePath,
        });
      }
    }

    // Early exit when all rules have matched
    if (detected.size === FRAMEWORK_RULES.length) break;
  }

  return [...detected.values()];
}
