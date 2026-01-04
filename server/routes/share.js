import express from 'express';
import crypto from 'crypto';
import argon2 from 'argon2';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { logActivity } from '../services/activity.js';
import { isOwner, getSharesForItem } from '../services/permissions.js';
import { logger } from '../utils/logger.js';
import validator from 'validator';

const router = express.Router();

/**
 * Share with a specific user
 * POST /api/share/user
 */
router.post('/user', requireAuth, async (req, res, next) => {
  try {
    const { itemType, itemId, email, permission = 'view' } = req.body;
    const userId = req.user.id;
    
    // Validate input
    if (!itemType || !itemId || !email) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    if (!['file', 'folder'].includes(itemType)) {
      return res.status(400).json({ error: 'Invalid item type' });
    }
    
    if (!['view', 'edit'].includes(permission)) {
      return res.status(400).json({ error: 'Invalid permission' });
    }
    
    if (!validator.isEmail(email)) {
      return res.status(400).json({ error: 'Invalid email' });
    }
    
    // Check ownership
    if (!isOwner(userId, itemType, itemId)) {
      return res.status(403).json({ error: 'Only owners can share items' });
    }
    
    // Find target user
    const targetUser = db.prepare('SELECT id, email FROM users WHERE email = ?').get(email.toLowerCase());
    
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (targetUser.id === userId) {
      return res.status(400).json({ error: 'Cannot share with yourself' });
    }
    
    // Check if share already exists
    const existingShare = db.prepare(`
      SELECT id FROM shares 
      WHERE item_type = ? AND item_id = ? AND share_type = 'user' AND target_user_id = ?
      AND revoked_at IS NULL
    `).get(itemType, itemId, targetUser.id);
    
    if (existingShare) {
      // Update existing share
      db.prepare(`
        UPDATE shares SET permission = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(permission, existingShare.id);
      
      return res.json({ success: true, shareId: existingShare.id, updated: true });
    }
    
    // Create new share
    const shareId = crypto.randomUUID();
    
    db.prepare(`
      INSERT INTO shares (id, item_type, item_id, owner_id, share_type, target_user_id, permission)
      VALUES (?, ?, ?, ?, 'user', ?, ?)
    `).run(shareId, itemType, itemId, userId, targetUser.id, permission);
    
    // Get item name for logging
    const table = itemType === 'file' ? 'files' : 'folders';
    const item = db.prepare(`SELECT name FROM ${table} WHERE id = ?`).get(itemId);
    
    await logActivity({
      actorId: userId,
      action: 'share_user',
      itemType,
      itemId,
      itemName: item?.name,
      meta: { targetEmail: email, permission },
      ip: req.ip,
    });
    
    logger.info(`Shared ${itemType} ${itemId} with ${email}`);
    
    res.status(201).json({ success: true, shareId });
  } catch (err) {
    next(err);
  }
});

/**
 * Remove user share
 * DELETE /api/share/user/:shareId
 */
router.delete('/user/:shareId', requireAuth, async (req, res, next) => {
  try {
    const { shareId } = req.params;
    const userId = req.user.id;
    
    const share = db.prepare('SELECT * FROM shares WHERE id = ?').get(shareId);
    
    if (!share) {
      return res.status(404).json({ error: 'Share not found' });
    }
    
    if (share.owner_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    db.prepare(`UPDATE shares SET revoked_at = datetime('now') WHERE id = ?`).run(shareId);
    
    await logActivity({
      actorId: userId,
      action: 'unshare_user',
      itemType: share.item_type,
      itemId: share.item_id,
      meta: { shareId },
      ip: req.ip,
    });
    
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/**
 * Create a link share
 * POST /api/share/link/create
 */
router.post('/link/create', requireAuth, async (req, res, next) => {
  try {
    const { itemType, itemId, permission = 'view', password, expiresAt } = req.body;
    const userId = req.user.id;
    
    // Validate input
    if (!itemType || !itemId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    if (!['file', 'folder'].includes(itemType)) {
      return res.status(400).json({ error: 'Invalid item type' });
    }
    
    // Check ownership
    if (!isOwner(userId, itemType, itemId)) {
      return res.status(403).json({ error: 'Only owners can share items' });
    }
    
    // Check if link share already exists
    const existingShare = db.prepare(`
      SELECT id, link_token FROM shares 
      WHERE item_type = ? AND item_id = ? AND share_type = 'link'
      AND revoked_at IS NULL
    `).get(itemType, itemId);
    
    if (existingShare) {
      // Update existing share
      let passwordHash = null;
      if (password) {
        passwordHash = await argon2.hash(password);
      }
      
      db.prepare(`
        UPDATE shares 
        SET permission = ?, password_hash = ?, expires_at = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(permission, passwordHash, expiresAt || null, existingShare.id);
      
      const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
      
      return res.json({ 
        success: true, 
        shareId: existingShare.id,
        token: existingShare.link_token,
        link: `${baseUrl}/s/${existingShare.link_token}`,
        updated: true 
      });
    }
    
    // Generate unique token
    const token = crypto.randomBytes(24).toString('base64url');
    
    // Hash password if provided
    let passwordHash = null;
    if (password) {
      passwordHash = await argon2.hash(password);
    }
    
    // Create share
    const shareId = crypto.randomUUID();
    
    db.prepare(`
      INSERT INTO shares (id, item_type, item_id, owner_id, share_type, link_token, permission, password_hash, expires_at)
      VALUES (?, ?, ?, ?, 'link', ?, ?, ?, ?)
    `).run(shareId, itemType, itemId, userId, token, permission, passwordHash, expiresAt || null);
    
    // Get item name for logging
    const table = itemType === 'file' ? 'files' : 'folders';
    const item = db.prepare(`SELECT name FROM ${table} WHERE id = ?`).get(itemId);
    
    await logActivity({
      actorId: userId,
      action: 'share_link_create',
      itemType,
      itemId,
      itemName: item?.name,
      meta: { hasPassword: !!password, expiresAt },
      ip: req.ip,
    });
    
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    
    res.status(201).json({ 
      success: true, 
      shareId,
      token,
      link: `${baseUrl}/s/${token}`,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Revoke a link share
 * POST /api/share/link/revoke
 */
router.post('/link/revoke', requireAuth, async (req, res, next) => {
  try {
    const { shareId, token } = req.body;
    const userId = req.user.id;
    
    let share;
    if (shareId) {
      share = db.prepare('SELECT * FROM shares WHERE id = ?').get(shareId);
    } else if (token) {
      share = db.prepare('SELECT * FROM shares WHERE link_token = ?').get(token);
    } else {
      return res.status(400).json({ error: 'Share ID or token required' });
    }
    
    if (!share) {
      return res.status(404).json({ error: 'Share not found' });
    }
    
    if (share.owner_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    db.prepare(`UPDATE shares SET revoked_at = datetime('now') WHERE id = ?`).run(share.id);
    
    await logActivity({
      actorId: userId,
      action: 'share_link_revoke',
      itemType: share.item_type,
      itemId: share.item_id,
      ip: req.ip,
    });
    
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/**
 * Get shares for an item
 * GET /api/share/:itemType/:itemId
 */
router.get('/:itemType/:itemId', requireAuth, async (req, res, next) => {
  try {
    const { itemType, itemId } = req.params;
    const userId = req.user.id;
    
    if (!['file', 'folder'].includes(itemType)) {
      return res.status(400).json({ error: 'Invalid item type' });
    }
    
    // Check ownership
    if (!isOwner(userId, itemType, itemId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const shares = getSharesForItem(itemType, itemId);
    
    // Add link URL to link shares
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const sharesWithLinks = shares.map(share => ({
      ...share,
      link: share.share_type === 'link' ? `${baseUrl}/s/${share.link_token}` : null,
    }));
    
    res.json({ shares: sharesWithLinks });
  } catch (err) {
    next(err);
  }
});

export default router;
