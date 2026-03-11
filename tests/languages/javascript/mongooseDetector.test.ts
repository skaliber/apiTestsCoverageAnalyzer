import {
  detectMongooseModels,
  detectExpressErrorHandlers,
  detectExpressAuthMiddleware,
} from '../../../src/languages/javascript/mongooseDetector';

// ─── Mongoose Detection ─────────────────────────────────────────────────────

describe('detectMongooseModels', () => {
  it('detects a simple Mongoose model', () => {
    const source = `
const mongoose = require('mongoose');
const ArticleSchema = new mongoose.Schema({
  title: { type: String, required: true },
  body: String,
  slug: { type: String, unique: true }
});
const Article = mongoose.model('Article', ArticleSchema);
`;
    const models = detectMongooseModels(source, '/fake/article.js');
    expect(models).toHaveLength(1);
    expect(models[0].modelName).toBe('Article');
    expect(models[0].schemaVariable).toBe('ArticleSchema');
    expect(models[0].fields.length).toBeGreaterThan(0);
  });

  it('detects model with methods', () => {
    const source = `
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true }
});
UserSchema.methods.toAuthJSON = function() { return {}; };
UserSchema.methods.generateJWT = function() { return ''; };
const User = mongoose.model('User', UserSchema);
`;
    const models = detectMongooseModels(source, '/fake/user.js');
    expect(models).toHaveLength(1);
    expect(models[0].methods).toContain('toAuthJSON');
    expect(models[0].methods).toContain('generateJWT');
  });

  it('detects model with pre/post hooks', () => {
    const source = `
const UserSchema = new mongoose.Schema({
  password: String
});
UserSchema.pre('save', function(next) { next(); });
UserSchema.post('remove', function() {});
const User = mongoose.model('User', UserSchema);
`;
    const models = detectMongooseModels(source, '/fake/user.js');
    expect(models).toHaveLength(1);
    expect(models[0].hooks).toEqual([
      { stage: 'pre', event: 'save' },
      { stage: 'post', event: 'remove' },
    ]);
  });

  it('detects model with plugins', () => {
    const source = `
const UserSchema = new mongoose.Schema({ email: String });
UserSchema.plugin(uniqueValidator);
const User = mongoose.model('User', UserSchema);
`;
    const models = detectMongooseModels(source, '/fake/user.js');
    expect(models).toHaveLength(1);
    expect(models[0].plugins).toContain('uniqueValidator');
  });

  it('detects field with enum values', () => {
    const source = `
const ArticleSchema = new mongoose.Schema({
  status: { type: String, enum: ['draft', 'published', 'archived'] }
});
const Article = mongoose.model('Article', ArticleSchema);
`;
    const models = detectMongooseModels(source, '/fake/article.js');
    expect(models).toHaveLength(1);
    const statusField = models[0].fields.find((f) => f.name === 'status');
    expect(statusField).toBeDefined();
    expect(statusField!.enumValues).toEqual(['draft', 'published', 'archived']);
  });

  it('returns empty for non-Mongoose code', () => {
    const source = `const x = 1; function foo() { return 2; }`;
    expect(detectMongooseModels(source, '/fake/util.js')).toEqual([]);
  });
});

// ─── Express Error Handlers ─────────────────────────────────────────────────

describe('detectExpressErrorHandlers', () => {
  it('detects 4-argument error handler', () => {
    const source = `
app.use(function(err, req, res, next) {
  if (err.name === 'ValidationError') {
    res.status(422).json({ errors: err.errors });
  } else {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
`;
    const handlers = detectExpressErrorHandlers(source, '/fake/app.js');
    expect(handlers).toHaveLength(1);
    expect(handlers[0].errorTypes).toContain('ValidationError');
    expect(handlers[0].statusCodes).toContain(422);
    expect(handlers[0].statusCodes).toContain(500);
  });

  it('detects named error handler function', () => {
    const source = `
function errorHandler(err, req, res, next) {
  res.status(err.status || 500).json({ error: err.message });
}
`;
    const handlers = detectExpressErrorHandlers(source, '/fake/middleware.js');
    expect(handlers).toHaveLength(1);
    expect(handlers[0].functionName).toBe('errorHandler');
  });

  it('detects error type checking', () => {
    const source = `
app.use(function(err, req, res, next) {
  if (err.name === 'UnauthorizedError') {
    res.status(401).json({ error: 'Unauthorized' });
  } else if (err.name === 'NotFoundError') {
    res.status(404).json({ error: 'Not found' });
  }
});
`;
    const handlers = detectExpressErrorHandlers(source, '/fake/app.js');
    expect(handlers).toHaveLength(1);
    expect(handlers[0].errorTypes).toContain('UnauthorizedError');
    expect(handlers[0].errorTypes).toContain('NotFoundError');
    expect(handlers[0].statusCodes).toContain(401);
    expect(handlers[0].statusCodes).toContain(404);
  });

  it('returns empty for non-error-handler code', () => {
    const source = `app.get('/api', function(req, res) { res.json({}); });`;
    expect(detectExpressErrorHandlers(source, '/fake/app.js')).toEqual([]);
  });
});

// ─── Express Auth Middleware ────────────────────────────────────────────────

describe('detectExpressAuthMiddleware', () => {
  it('detects router.use(auth.required)', () => {
    const source = `router.use(auth.required);`;
    const middleware = detectExpressAuthMiddleware(source, '/fake/routes.js');
    expect(middleware).toHaveLength(1);
    expect(middleware[0].authType).toBe('required');
  });

  it('detects router.use(auth.optional)', () => {
    const source = `router.use(auth.optional);`;
    const middleware = detectExpressAuthMiddleware(source, '/fake/routes.js');
    expect(middleware).toHaveLength(1);
    expect(middleware[0].authType).toBe('optional');
  });

  it('detects path-scoped auth middleware', () => {
    const source = `app.use('/api/articles', auth.required, articlesRouter);`;
    const middleware = detectExpressAuthMiddleware(source, '/fake/app.js');
    expect(middleware).toHaveLength(1);
    expect(middleware[0].authType).toBe('required');
    expect(middleware[0].pathPrefix).toBe('/api/articles');
  });

  it('detects passport.authenticate', () => {
    const source = `router.use(passport.authenticate('jwt', { session: false }));`;
    const middleware = detectExpressAuthMiddleware(source, '/fake/routes.js');
    expect(middleware).toHaveLength(1);
    expect(middleware[0].authType).toBe('required');
  });

  it('returns empty for non-auth middleware', () => {
    const source = `router.use(bodyParser.json());`;
    expect(detectExpressAuthMiddleware(source, '/fake/app.js')).toEqual([]);
  });
});
