/**
 * Mongoose schema/model detector (Feature 27, Sub-PR 6)
 *
 * Detects:
 * 1. mongoose.Schema({...}) — field definitions, validation rules
 * 2. mongoose.model('Name', schema) — model creation
 * 3. .methods.* — instance method definitions
 * 4. .pre()/.post() hooks — lifecycle hooks
 * 5. .plugin(validator) — plugin registrations
 */

export interface MongooseField {
  name: string;
  type: string;
  required?: boolean;
  unique?: boolean;
  enumValues?: string[];
}

export interface MongooseModel {
  modelName: string;
  schemaVariable?: string;
  fields: MongooseField[];
  methods: string[];
  hooks: Array<{ stage: 'pre' | 'post'; event: string }>;
  plugins: string[];
  sourceFile: string;
  line?: number;
}

/**
 * Detect Mongoose model/schema definitions from JS/TS source text.
 */
export function detectMongooseModels(sourceText: string, filePath: string): MongooseModel[] {
  const models: MongooseModel[] = [];
  const lines = sourceText.split('\n');

  // Track schema variables and their fields
  const schemaVars = new Map<string, { fields: MongooseField[]; line: number }>();

  // Track methods, hooks, plugins per schema var
  const schemaMethods = new Map<string, string[]>();
  const schemaHooks = new Map<string, Array<{ stage: 'pre' | 'post'; event: string }>>();
  const schemaPlugins = new Map<string, string[]>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // new mongoose.Schema({...}) or new Schema({...})
    const schemaMatch = line.match(/(?:const|let|var)\s+(\w+)\s*=\s*new\s+(?:mongoose\.)?Schema\s*\(/);
    if (schemaMatch) {
      const varName = schemaMatch[1];
      const fields = extractSchemaFields(sourceText, i);
      schemaVars.set(varName, { fields, line: i + 1 });
      continue;
    }

    // mongoose.model('Name', schema)
    const modelMatch = line.match(/mongoose\.model\s*\(\s*['"](\w+)['"]\s*,\s*(\w+)/);
    if (modelMatch) {
      const modelName = modelMatch[1];
      const schemaVar = modelMatch[2];
      const schemaInfo = schemaVars.get(schemaVar);

      models.push({
        modelName,
        schemaVariable: schemaVar,
        fields: schemaInfo?.fields ?? [],
        methods: schemaMethods.get(schemaVar) ?? [],
        hooks: schemaHooks.get(schemaVar) ?? [],
        plugins: schemaPlugins.get(schemaVar) ?? [],
        sourceFile: filePath,
        line: i + 1,
      });
      continue;
    }

    // schema.methods.methodName = function
    const methodMatch = line.match(/(\w+)\.methods\.(\w+)\s*=/);
    if (methodMatch) {
      const varName = methodMatch[1];
      if (!schemaMethods.has(varName)) schemaMethods.set(varName, []);
      schemaMethods.get(varName)!.push(methodMatch[2]);
      continue;
    }

    // schema.pre('save', ...) or schema.post('save', ...)
    const hookMatch = line.match(/(\w+)\.(pre|post)\s*\(\s*['"](\w+)['"]/);
    if (hookMatch) {
      const varName = hookMatch[1];
      if (!schemaHooks.has(varName)) schemaHooks.set(varName, []);
      schemaHooks.get(varName)!.push({
        stage: hookMatch[2] as 'pre' | 'post',
        event: hookMatch[3],
      });
      continue;
    }

    // schema.plugin(uniqueValidator)
    const pluginMatch = line.match(/(\w+)\.plugin\s*\(\s*(\w+)/);
    if (pluginMatch) {
      const varName = pluginMatch[1];
      if (!schemaPlugins.has(varName)) schemaPlugins.set(varName, []);
      schemaPlugins.get(varName)!.push(pluginMatch[2]);
    }
  }

  return models;
}

/**
 * Extract field definitions from a schema constructor.
 * Simple regex extraction — handles the most common patterns.
 */
function extractSchemaFields(source: string, startLine: number): MongooseField[] {
  const fields: MongooseField[] = [];
  const lines = source.split('\n');

  // Find the opening brace of the schema definition
  let braceDepth = 0;
  let inSchema = false;
  let schemaBody = '';

  for (let i = startLine; i < Math.min(startLine + 50, lines.length); i++) {
    const line = lines[i];
    for (const ch of line) {
      if (ch === '(' || ch === '{') braceDepth++;
      if (ch === ')' || ch === '}') braceDepth--;
      if (braceDepth >= 2 && !inSchema) {
        inSchema = true;
      }
      if (inSchema) schemaBody += ch;
      if (inSchema && braceDepth < 2) {
        inSchema = false;
        break;
      }
    }
    if (schemaBody && !inSchema) break;
    if (inSchema) schemaBody += '\n';
  }

  // Parse field definitions from the schema body
  // Pattern: fieldName: { type: Type, required: true, unique: true, enum: [...] }
  const fieldPattern = /(\w+)\s*:\s*\{([^}]+)\}/g;
  let match;
  while ((match = fieldPattern.exec(schemaBody)) !== null) {
    const name = match[1];
    const body = match[2];

    const typeMatch = body.match(/type\s*:\s*(\w+)/);
    const required = /required\s*:\s*true/.test(body);
    const unique = /unique\s*:\s*true/.test(body);
    const enumMatch = body.match(/enum\s*:\s*\[([^\]]+)\]/);

    const field: MongooseField = {
      name,
      type: typeMatch?.[1] ?? 'Mixed',
    };
    if (required) field.required = true;
    if (unique) field.unique = true;
    if (enumMatch) {
      field.enumValues = enumMatch[1].split(',').map((s) => s.trim().replace(/['"]/g, '')).filter(Boolean);
    }

    fields.push(field);
  }

  // Also handle shorthand: fieldName: Type (e.g., fieldName: String)
  const shorthandPattern = /(\w+)\s*:\s*(String|Number|Boolean|Date|ObjectId|Buffer|Mixed|Map)\b/g;
  while ((match = shorthandPattern.exec(schemaBody)) !== null) {
    const name = match[1];
    // Skip if already captured as an object definition
    if (!fields.some((f) => f.name === name)) {
      fields.push({ name, type: match[2] });
    }
  }

  return fields;
}

/**
 * Detect Express error handlers (4-argument middleware).
 */
export interface ExpressErrorHandler {
  functionName?: string;
  errorTypes: string[];
  statusCodes: number[];
  sourceFile: string;
  line?: number;
}

/**
 * Detect Express 4-argument error handler middleware.
 * Pattern: function(err, req, res, next) or (err, req, res, next) =>
 */
export function detectExpressErrorHandlers(sourceText: string, filePath: string): ExpressErrorHandler[] {
  const handlers: ExpressErrorHandler[] = [];
  const lines = sourceText.split('\n');

  // Pattern: matches 4-argument functions (err, req, res, next)
  const errorHandlerPattern = /(?:function\s+(\w+))?\s*\(\s*(?:err|error)\s*,\s*req\s*,\s*res\s*,\s*next\s*\)/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(errorHandlerPattern);
    if (!match) continue;

    const functionName = match[1];
    const errorTypes: string[] = [];
    const statusCodes: number[] = [];

    // Scan ahead for error type checks and status codes
    for (let j = i; j < Math.min(i + 30, lines.length); j++) {
      const scanLine = lines[j];

      // err.name === 'ValidationError'
      const errorTypeMatch = scanLine.match(/err(?:or)?\.name\s*===?\s*['"](\w+)['"]/);
      if (errorTypeMatch) errorTypes.push(errorTypeMatch[1]);

      // res.status(404)
      const statusMatch = scanLine.match(/res\.status\s*\(\s*(\d{3})\s*\)/);
      if (statusMatch) statusCodes.push(parseInt(statusMatch[1], 10));
    }

    handlers.push({
      functionName,
      errorTypes,
      statusCodes,
      sourceFile: filePath,
      line: i + 1,
    });
  }

  return handlers;
}

/**
 * Detect Express middleware auth patterns.
 * Pattern: router.use(auth.required) or router.use('/path', auth.optional, subRouter)
 */
export interface ExpressAuthMiddleware {
  /** 'required' or 'optional' */
  authType: 'required' | 'optional';
  /** The path prefix this middleware applies to */
  pathPrefix?: string;
  /** Source pattern text */
  sourcePattern: string;
  sourceFile: string;
  line?: number;
}

export function detectExpressAuthMiddleware(sourceText: string, filePath: string): ExpressAuthMiddleware[] {
  const middleware: ExpressAuthMiddleware[] = [];
  const lines = sourceText.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // router.use(auth.required) or app.use(auth.required)
    const simpleAuth = line.match(/(?:router|app)\.use\s*\(\s*auth\.(required|optional)/);
    if (simpleAuth) {
      middleware.push({
        authType: simpleAuth[1] as 'required' | 'optional',
        sourcePattern: simpleAuth[0],
        sourceFile: filePath,
        line: i + 1,
      });
      continue;
    }

    // router.use('/path', auth.required, router)
    const pathAuth = line.match(/(?:router|app)\.use\s*\(\s*['"]([^'"]+)['"]\s*,\s*auth\.(required|optional)/);
    if (pathAuth) {
      middleware.push({
        authType: pathAuth[2] as 'required' | 'optional',
        pathPrefix: pathAuth[1],
        sourcePattern: pathAuth[0],
        sourceFile: filePath,
        line: i + 1,
      });
      continue;
    }

    // passport.authenticate('jwt', { session: false })
    const passportAuth = line.match(/passport\.authenticate\s*\(\s*['"](\w+)['"]/);
    if (passportAuth) {
      middleware.push({
        authType: 'required',
        sourcePattern: passportAuth[0],
        sourceFile: filePath,
        line: i + 1,
      });
    }
  }

  return middleware;
}
