import express from 'express';
import argon2 from 'argon2';
import crypto from 'crypto';
import validator from 'validator';
import db from '../db/index.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getActivityLogs, getActivityCount } from '../services/activity.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

// All routes require admin
router.use(requireAuth, requireAdmin);

/**
 * Get all users
 * GET /api/admin/users
 */
router.get('/users', async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    const users = db.prepare(`
      SELECT id, email, role, created_at, updated_at
      FROM users
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(parseInt(limit), offset);
    
    const total = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    
    res.json({ 
      users, 
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Create a new user
 * POST /api/admin/users
 */
router.post('/users', async (req, res, next) => {
  try {
    const { email, password, role = 'user' } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    if (!validator.isEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    
    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
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
    
    const userId = crypto.randomUUID();
    
    db.prepare(`
      INSERT INTO users (id, email, password_hash, role)
      VALUES (?, ?, ?, ?)
    `).run(userId, email.toLowerCase(), passwordHash, role);
    
    logger.info(`Admin created user: ${email}`);
    
    res.status(201).json({
      user: {
        id: userId,
        email: email.toLowerCase(),
        role,
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Update a user
 * PUT /api/admin/users/:id
 */
router.put('/users/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { email, password, role } = req.body;
    
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Don't allow changing the last admin to a regular user
    if (user.role === 'admin' && role === 'user') {
      const adminCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get('admin').count;
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Cannot demote the last admin' });
      }
    }
    
    const updates = [];
    const params = [];
    
    if (email && email !== user.email) {
      if (!validator.isEmail(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }
      
      const existing = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email.toLowerCase(), id);
      if (existing) {
        return res.status(409).json({ error: 'Email already in use' });
      }
      
      updates.push('email = ?');
      params.push(email.toLowerCase());
    }
    
    if (password) {
      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }
      
      const passwordHash = await argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
      });
      
      updates.push('password_hash = ?');
      params.push(passwordHash);
    }
    
    if (role && ['user', 'admin'].includes(role)) {
      updates.push('role = ?');
      params.push(role);
    }
    
    if (updates.length > 0) {
      updates.push('updated_at = datetime("now")');
      params.push(id);
      
      db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }
    
    const updatedUser = db.prepare('SELECT id, email, role, created_at, updated_at FROM users WHERE id = ?').get(id);
    
    res.json({ user: updatedUser });
  } catch (err) {
    next(err);
  }
});

/**
 * Delete a user
 * DELETE /api/admin/users/:id
 */
router.delete('/users/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    if (id === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete yourself' });
    }
    
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Don't allow deleting the last admin
    if (user.role === 'admin') {
      const adminCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get('admin').count;
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Cannot delete the last admin' });
      }
    }
    
    // Delete user (cascade will handle files, folders, shares)
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    
    logger.info(`Admin deleted user: ${user.email}`);
    
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/**
 * Get activity logs
 * GET /api/admin/activity
 */
router.get('/activity', async (req, res, next) => {
  try {
    const { 
      userId, 
      action, 
      startDate, 
      endDate, 
      page = 1, 
      limit = 50 
    } = req.query;
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    const logs = getActivityLogs({
      actorId: userId,
      action,
      startDate,
      endDate,
      limit: parseInt(limit),
      offset,
    });
    
    const total = getActivityCount({
      actorId: userId,
      action,
      startDate,
      endDate,
    });
    
    res.json({ 
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Get system stats
 * GET /api/admin/stats
 */
router.get('/stats', async (req, res, next) => {
  try {
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const fileCount = db.prepare('SELECT COUNT(*) as count FROM files WHERE trashed_at IS NULL').get().count;
    const folderCount = db.prepare('SELECT COUNT(*) as count FROM folders WHERE trashed_at IS NULL').get().count;
    const trashedCount = db.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM files WHERE trashed_at IS NOT NULL) +
        (SELECT COUNT(*) FROM folders WHERE trashed_at IS NOT NULL) as count
    `).get().count;
    
    const totalSize = db.prepare('SELECT COALESCE(SUM(size), 0) as total FROM files WHERE trashed_at IS NULL').get().total;
    
    const recentActivity = getActivityLogs({ limit: 10 });
    
    res.json({
      users: userCount,
      files: fileCount,
      folders: folderCount,
      trashedItems: trashedCount,
      totalStorageBytes: totalSize,
      recentActivity,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
