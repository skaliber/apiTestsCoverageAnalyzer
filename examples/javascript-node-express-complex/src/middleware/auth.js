/**
 * auth.js
 * Authentication and authorization middleware.
 * Validates Bearer tokens and role-based access.
 */

// Simulated token store — in production use JWT verification against a real secret
const VALID_TOKENS = {
  'token-admin-001': { userId: 'USR-001', role: 'admin', customerId: null },
  'token-ops-001':   { userId: 'USR-002', role: 'operator', customerId: null },
  'token-cust-001':  { userId: 'USR-003', role: 'customer', customerId: 'CUST-001' },
  'token-cust-002':  { userId: 'USR-004', role: 'customer', customerId: 'CUST-002' },
  'token-readonly':  { userId: 'USR-005', role: 'readonly', customerId: null },
};

/**
 * Middleware: require a valid Bearer token.
 * Attaches req.user on success.
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing or malformed Authorization header',
    });
  }

  const token = authHeader.slice(7);
  const user = VALID_TOKENS[token];

  if (!user) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or expired token',
    });
  }

  req.user = user;
  next();
}

/**
 * Middleware factory: restrict to specific roles.
 * @param {...string} roles - Allowed role names
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Not authenticated' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Requires one of roles: ${roles.join(', ')}`,
      });
    }
    next();
  };
}

/**
 * Middleware: admin-only access.
 */
const requireAdmin = requireRole('admin');

/**
 * Middleware: admin or operator access.
 */
const requireOperator = requireRole('admin', 'operator');

/**
 * Middleware: optionally attach user if token present, but don't reject.
 * Used on public-ish endpoints that behave differently for authenticated users.
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    req.user = VALID_TOKENS[token] || null;
  } else {
    req.user = null;
  }
  next();
}

module.exports = { requireAuth, requireRole, requireAdmin, requireOperator, optionalAuth, VALID_TOKENS };
