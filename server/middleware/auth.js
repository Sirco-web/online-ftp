import db from '../db/index.js';
import { logger } from '../utils/logger.js';

/**
 * Middleware to require authentication
 */
export function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // Load user from database
  const user = db.prepare('SELECT id, email, role FROM users WHERE id = ?').get(req.session.userId);
  
  if (!user) {
    req.session.destroy();
    return res.status(401).json({ error: 'User not found' });
  }
  
  req.user = user;
  next();
}

/**
 * Middleware to require admin role
 */
export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    logger.warn(`Admin access denied for user ${req.user?.id}`);
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

/**
 * Optional auth - loads user if session exists but doesn't require it
 */
export function optionalAuth(req, res, next) {
  if (req.session?.userId) {
    const user = db.prepare('SELECT id, email, role FROM users WHERE id = ?').get(req.session.userId);
    if (user) {
      req.user = user;
    }
  }
  next();
}
