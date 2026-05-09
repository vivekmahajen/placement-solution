'use strict';

/**
 * Middleware factory that restricts access to users with the specified role(s).
 * Must be used after the `authenticate` middleware.
 *
 * @param {...string} roles - One or more allowed roles
 * @returns {import('express').RequestHandler}
 *
 * @example
 *   router.get('/admin', authenticate, requireRole('admin'), handler);
 *   router.post('/care-homes', authenticate, requireRole('care_home', 'admin'), handler);
 */
function requireRole(...roles) {
  return function roleCheck(req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Required role(s): ${roles.join(', ')}. Your role: ${req.user.role}.`,
      });
    }
    next();
  };
}

module.exports = { requireRole };
