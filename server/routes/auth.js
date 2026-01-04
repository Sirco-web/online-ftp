import express from 'express';
import argon2 from 'argon2';
import crypto from 'crypto';
import validator from 'validator';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { getCsrfToken } from '../middleware/csrf.js';
import { logger } from '../utils/logger.js';
import { logActivity } from '../services/activity.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Stricter rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window
  message: { error: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Get CSRF token
router.get('/csrf-token', getCsrfToken);

// Login
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    
    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    if (!validator.isEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    // Find user
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
    
    if (!user) {
      // Use constant time to prevent timing attacks
      await argon2.hash('dummy-password');
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Verify password
    const validPassword = await argon2.verify(user.password_hash, password);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Create session
    req.session.userId = user.id;
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    
    // Log activity
    await logActivity({
      actorId: user.id,
      action: 'login',
      ip: req.ip,
    });
    
    logger.info(`User logged in: ${user.email}`);
    
    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      csrfToken: req.session.csrfToken,
    });
  } catch (err) {
    next(err);
  }
});

// Register new user
router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    
    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    if (!validator.isEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    
    // Check if user exists
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    
    // Hash password
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
    
    // Create user
    const userId = crypto.randomUUID();
    
    db.prepare(`
      INSERT INTO users (id, email, password_hash, role)
      VALUES (?, ?, ?, 'user')
    `).run(userId, email.toLowerCase(), passwordHash);
    
    // Create session
    req.session.userId = userId;
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    
    // Log activity
    await logActivity({
      actorId: userId,
      action: 'register',
      ip: req.ip,
    });
    
    logger.info(`New user registered: ${email}`);
    
    res.status(201).json({
      user: {
        id: userId,
        email: email.toLowerCase(),
        role: 'user',
      },
      csrfToken: req.session.csrfToken,
    });
  } catch (err) {
    next(err);
  }
});

// Logout
router.post('/logout', requireAuth, async (req, res) => {
  const userId = req.user.id;
  
  await logActivity({
    actorId: userId,
    action: 'logout',
    ip: req.ip,
  });
  
  req.session.destroy((err) => {
    if (err) {
      logger.error('Session destroy error:', err);
    }
    res.clearCookie('cloud-drive.sid');
    res.json({ success: true });
  });
});

// Get current user
router.get('/me', requireAuth, (req, res) => {
  res.json({
    user: req.user,
    csrfToken: req.session.csrfToken,
  });
});

// Change password
router.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }
    
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }
    
    // Get user with password
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    
    // Verify current password
    const validPassword = await argon2.verify(user.password_hash, currentPassword);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    // Hash new password
    const newHash = await argon2.hash(newPassword, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
    
    // Update password
    db.prepare('UPDATE users SET password_hash = ?, updated_at = datetime("now") WHERE id = ?')
      .run(newHash, req.user.id);
    
    await logActivity({
      actorId: req.user.id,
      action: 'password_changed',
      ip: req.ip,
    });
    
    logger.info(`Password changed for user: ${req.user.email}`);
    
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
