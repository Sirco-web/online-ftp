import express from 'express';
import argon2 from 'argon2';
import crypto from 'crypto';
import validator from 'validator';
import db from '../db/index.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getActivityLogs, getActivityCount } from '../services/activity.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

// Hardcoded owner email - only this user can be owner
const HARDCODED_OWNER_EMAIL = 'timco307@gmail.com';

// Helper to check if user is owner
function isOwner(user) {
  return user && user.email === HARDCODED_OWNER_EMAIL;
}

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
      SELECT id, email, role, status, storage_quota, storage_used, created_at, updated_at
      FROM users
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(parseInt(limit), offset);
    
    // Add isOwner flag to each user
    const usersWithOwner = users.map(u => ({
      ...u,
      isOwner: u.email === HARDCODED_OWNER_EMAIL,
    }));
    
    const total = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    
    res.json({ 
      users: usersWithOwner, 
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
      currentUserIsOwner: isOwner(req.user),
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
    const { email, password, role, status } = req.body;
    
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Protect the owner - only owner can change their own role
    if (user.email === HARDCODED_OWNER_EMAIL && req.user.email !== HARDCODED_OWNER_EMAIL) {
      return res.status(403).json({ error: 'Cannot modify the owner account' });
    }
    
    // Only owner can assign 'owner' role
    if (role === 'owner' && !isOwner(req.user)) {
      return res.status(403).json({ error: 'Only the owner can transfer ownership' });
    }
    
    // Don't allow changing the last admin/owner to a regular user
    if ((user.role === 'admin' || user.role === 'owner') && role === 'user') {
      const privilegedCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role IN ('admin', 'owner')").get().count;
      if (privilegedCount <= 1) {
        return res.status(400).json({ error: 'Cannot demote the last administrator' });
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
    
    if (role && ['user', 'admin', 'owner'].includes(role)) {
      updates.push('role = ?');
      params.push(role);
      
      // If making someone admin/owner, give them unlimited storage
      if (role === 'admin' || role === 'owner') {
        updates.push('storage_quota = -1');
      }
    }
    
    if (status && ['active', 'suspended', 'banned'].includes(status)) {
      updates.push('status = ?');
      params.push(status);
    }
    
    if (updates.length > 0) {
      updates.push('updated_at = datetime("now")');
      params.push(id);
      
      db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }
    
    const updatedUser = db.prepare('SELECT id, email, role, status, storage_quota, storage_used, created_at, updated_at FROM users WHERE id = ?').get(id);
    
    res.json({ user: { ...updatedUser, isOwner: updatedUser.email === HARDCODED_OWNER_EMAIL } });
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
    
    // Cannot delete the owner
    if (user.email === HARDCODED_OWNER_EMAIL) {
      return res.status(403).json({ error: 'Cannot delete the owner account' });
    }
    
    // Don't allow deleting the last admin/owner
    if (user.role === 'admin' || user.role === 'owner') {
      const privilegedCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role IN ('admin', 'owner')").get().count;
      if (privilegedCount <= 1) {
        return res.status(400).json({ error: 'Cannot delete the last administrator' });
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

/**
 * Get app settings
 * GET /api/admin/settings
 */
router.get('/settings', async (req, res, next) => {
  try {
    const settings = db.prepare('SELECT key, value FROM app_settings').all();
    const settingsObj = {};
    settings.forEach(s => {
      settingsObj[s.key] = s.value;
    });
    
    res.json({ settings: settingsObj });
  } catch (err) {
    next(err);
  }
});

/**
 * Update app settings
 * PUT /api/admin/settings
 */
router.put('/settings', async (req, res, next) => {
  try {
    const { settings } = req.body;
    
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'Invalid settings format' });
    }
    
    // Validate and update each setting
    const allowedSettings = [
      'signups_enabled',
      'signin_enabled',
      'require_owner_pin',
      'default_storage_quota',
      'maintenance_mode',
    ];
    
    // Owner can also change the PIN
    if (isOwner(req.user)) {
      allowedSettings.push('owner_pin');
    }
    
    for (const [key, value] of Object.entries(settings)) {
      if (!allowedSettings.includes(key)) {
        continue;
      }
      
      // Validate PIN format (4 digits)
      if (key === 'owner_pin' && !/^\d{4,8}$/.test(value)) {
        return res.status(400).json({ error: 'Owner PIN must be 4-8 digits' });
      }
      
      db.prepare(`
        INSERT INTO app_settings (key, value, updated_at)
        VALUES (?, ?, datetime("now"))
        ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime("now")
      `).run(key, String(value), String(value));
    }
    
    logger.info(`Admin updated settings: ${Object.keys(settings).join(', ')}`);
    
    // Return updated settings
    const updatedSettings = db.prepare('SELECT key, value FROM app_settings').all();
    const settingsObj = {};
    updatedSettings.forEach(s => {
      settingsObj[s.key] = s.value;
    });
    
    res.json({ settings: settingsObj });
  } catch (err) {
    next(err);
  }
});

/**
 * Update user storage quota
 * PUT /api/admin/users/:id/quota
 */
router.put('/users/:id/quota', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { quota } = req.body;
    
    if (typeof quota !== 'number' || quota < 0) {
      return res.status(400).json({ error: 'Invalid quota value' });
    }
    
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    db.prepare('UPDATE users SET storage_quota = ?, updated_at = datetime("now") WHERE id = ?')
      .run(quota, id);
    
    logger.info(`Admin updated quota for user ${user.email}: ${quota} bytes`);
    
    const updatedUser = db.prepare('SELECT id, email, role, storage_quota, storage_used, created_at, updated_at FROM users WHERE id = ?').get(id);
    
    res.json({ user: updatedUser });
  } catch (err) {
    next(err);
  }
});

/**
 * Update user status (suspend/ban/activate)
 * PUT /api/admin/users/:id/status
 */
router.put('/users/:id/status', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!['active', 'suspended', 'banned'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be active, suspended, or banned.' });
    }
    
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Cannot suspend/ban the owner
    if (user.email === HARDCODED_OWNER_EMAIL) {
      return res.status(403).json({ error: 'Cannot change the status of the owner account' });
    }
    
    // Cannot suspend/ban yourself
    if (user.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot change your own status' });
    }
    
    // Only owner can suspend/ban other admins
    if (user.role === 'admin' && !isOwner(req.user)) {
      return res.status(403).json({ error: 'Only the owner can suspend or ban other administrators' });
    }
    
    db.prepare('UPDATE users SET status = ?, updated_at = datetime("now") WHERE id = ?')
      .run(status, id);
    
    logger.info(`Admin ${req.user.email} changed status of user ${user.email} to ${status}`);
    
    const updatedUser = db.prepare('SELECT id, email, role, status, storage_quota, storage_used, created_at, updated_at FROM users WHERE id = ?').get(id);
    
    res.json({ user: { ...updatedUser, isOwner: updatedUser.email === HARDCODED_OWNER_EMAIL } });
  } catch (err) {
    next(err);
  }
});

/**
 * Transfer ownership (owner only)
 * POST /api/admin/users/:id/make-owner
 */
router.post('/users/:id/make-owner', async (req, res, next) => {
  try {
    // Only the current owner can do this
    if (!isOwner(req.user)) {
      return res.status(403).json({ error: 'Only the owner can transfer ownership' });
    }
    
    const { id } = req.params;
    const { confirmations } = req.body;
    
    // Require 5 confirmations
    if (!confirmations || confirmations < 5) {
      return res.status(400).json({ error: 'Must confirm ownership transfer 5 times' });
    }
    
    const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (targetUser.email === HARDCODED_OWNER_EMAIL) {
      return res.status(400).json({ error: 'This user is already the owner' });
    }
    
    // This is a major action - update the target user to owner role
    db.prepare("UPDATE users SET role = 'owner', storage_quota = -1, updated_at = datetime('now') WHERE id = ?")
      .run(id);
    
    logger.warn(`OWNERSHIP TRANSFERRED: ${req.user.email} transferred ownership to ${targetUser.email}`);
    
    res.json({ 
      success: true, 
      message: `Ownership transferred to ${targetUser.email}. Note: The hardcoded owner email still has special privileges.` 
    });
  } catch (err) {
    next(err);
  }
});

export default router;
