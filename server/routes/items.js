import express from 'express';
import crypto from 'crypto';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { logActivity } from '../services/activity.js';
import { checkPermission, canEdit, canView } from '../services/permissions.js';
import { sanitizeFilename } from '../utils/storage.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

/**
 * Get items in a folder (or root)
 * GET /api/items?parentId=...&sort=name&order=asc
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { parentId, sort = 'name', order = 'asc' } = req.query;
    const userId = req.user.id;
    
    // Validate sort and order to prevent SQL injection
    const allowedSorts = ['name', 'size', 'created_at', 'updated_at'];
    const allowedOrders = ['asc', 'desc'];
    
    const safeSort = allowedSorts.includes(sort) ? sort : 'name';
    const safeOrder = allowedOrders.includes(order.toLowerCase()) ? order : 'asc';
    
    let folders, files;
    
    if (parentId) {
      // Check permission to view parent folder
      const perm = checkPermission(userId, 'folder', parentId);
      if (!perm) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      folders = db.prepare(`
        SELECT f.*, 'folder' as type, u.email as owner_email
        FROM folders f
        JOIN users u ON f.owner_id = u.id
        WHERE f.parent_id = ? AND f.trashed_at IS NULL
        ORDER BY f.${safeSort} ${safeOrder}
      `).all(parentId);
      
      files = db.prepare(`
        SELECT f.*, 'file' as type, u.email as owner_email
        FROM files f
        JOIN users u ON f.owner_id = u.id
        WHERE f.folder_id = ? AND f.trashed_at IS NULL
        ORDER BY f.${safeSort} ${safeOrder}
      `).all(parentId);
    } else {
      // Root folder - only owned items
      folders = db.prepare(`
        SELECT f.*, 'folder' as type, u.email as owner_email
        FROM folders f
        JOIN users u ON f.owner_id = u.id
        WHERE f.owner_id = ? AND f.parent_id IS NULL AND f.trashed_at IS NULL
        ORDER BY f.${safeSort} ${safeOrder}
      `).all(userId);
      
      files = db.prepare(`
        SELECT f.*, 'file' as type, u.email as owner_email
        FROM files f
        JOIN users u ON f.owner_id = u.id
        WHERE f.owner_id = ? AND f.folder_id IS NULL AND f.trashed_at IS NULL
        ORDER BY f.${safeSort} ${safeOrder}
      `).all(userId);
    }
    
    // Get breadcrumbs if in a subfolder
    let breadcrumbs = [];
    if (parentId) {
      breadcrumbs = getBreadcrumbs(parentId);
    }
    
    res.json({
      items: [...folders, ...files],
      breadcrumbs,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Get recent files
 * GET /api/items/recent
 */
router.get('/recent', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    
    // Get recently modified files owned by user or shared with user
    const files = db.prepare(`
      SELECT DISTINCT f.*, 'file' as type, u.email as owner_email
      FROM files f
      JOIN users u ON f.owner_id = u.id
      LEFT JOIN shares s ON s.item_id = f.id AND s.item_type = 'file'
      WHERE (f.owner_id = ? OR (s.target_user_id = ? AND s.revoked_at IS NULL))
      AND f.trashed_at IS NULL
      ORDER BY f.updated_at DESC
      LIMIT ?
    `).all(userId, userId, limit);
    
    res.json({ items: files });
  } catch (err) {
    next(err);
  }
});

/**
 * Get starred items
 * GET /api/items/starred
 */
router.get('/starred', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    const folders = db.prepare(`
      SELECT f.*, 'folder' as type, u.email as owner_email
      FROM folders f
      JOIN users u ON f.owner_id = u.id
      WHERE f.owner_id = ? AND f.starred = 1 AND f.trashed_at IS NULL
      ORDER BY f.name
    `).all(userId);
    
    const files = db.prepare(`
      SELECT f.*, 'file' as type, u.email as owner_email
      FROM files f
      JOIN users u ON f.owner_id = u.id
      WHERE f.owner_id = ? AND f.starred = 1 AND f.trashed_at IS NULL
      ORDER BY f.name
    `).all(userId);
    
    res.json({ items: [...folders, ...files] });
  } catch (err) {
    next(err);
  }
});

/**
 * Search items
 * GET /api/items/search?q=...
 */
router.get('/search', requireAuth, async (req, res, next) => {
  try {
    const { q } = req.query;
    const userId = req.user.id;
    
    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }
    
    const searchTerm = `%${q}%`;
    
    const folders = db.prepare(`
      SELECT f.*, 'folder' as type, u.email as owner_email
      FROM folders f
      JOIN users u ON f.owner_id = u.id
      WHERE f.owner_id = ? AND f.name LIKE ? AND f.trashed_at IS NULL
      ORDER BY f.name
      LIMIT 50
    `).all(userId, searchTerm);
    
    const files = db.prepare(`
      SELECT f.*, 'file' as type, u.email as owner_email
      FROM files f
      JOIN users u ON f.owner_id = u.id
      WHERE f.owner_id = ? AND f.name LIKE ? AND f.trashed_at IS NULL
      ORDER BY f.name
      LIMIT 50
    `).all(userId, searchTerm);
    
    res.json({ items: [...folders, ...files] });
  } catch (err) {
    next(err);
  }
});

/**
 * Rename an item
 * POST /api/items/rename
 */
router.post('/rename', requireAuth, async (req, res, next) => {
  try {
    const { itemId, itemType, newName } = req.body;
    const userId = req.user.id;
    
    if (!itemId || !itemType || !newName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    if (!['file', 'folder'].includes(itemType)) {
      return res.status(400).json({ error: 'Invalid item type' });
    }
    
    // Check edit permission
    if (!canEdit(userId, itemType, itemId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const sanitizedName = sanitizeFilename(newName);
    const table = itemType === 'file' ? 'files' : 'folders';
    
    // Get original item
    const item = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(itemId);
    
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    // Update name
    db.prepare(`UPDATE ${table} SET name = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(sanitizedName, itemId);
    
    await logActivity({
      actorId: userId,
      action: 'rename',
      itemType,
      itemId,
      itemName: sanitizedName,
      meta: { oldName: item.name, newName: sanitizedName },
      ip: req.ip,
    });
    
    res.json({ success: true, name: sanitizedName });
  } catch (err) {
    next(err);
  }
});

/**
 * Move an item
 * POST /api/items/move
 */
router.post('/move', requireAuth, async (req, res, next) => {
  try {
    const { itemId, itemType, targetFolderId } = req.body;
    const userId = req.user.id;
    
    if (!itemId || !itemType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    if (!['file', 'folder'].includes(itemType)) {
      return res.status(400).json({ error: 'Invalid item type' });
    }
    
    // Check edit permission on the item
    if (!canEdit(userId, itemType, itemId)) {
      return res.status(403).json({ error: 'Access denied to item' });
    }
    
    // If moving to a folder, check permission on target folder
    if (targetFolderId) {
      if (!canEdit(userId, 'folder', targetFolderId)) {
        return res.status(403).json({ error: 'Access denied to target folder' });
      }
      
      // Prevent moving a folder into itself or its descendants
      if (itemType === 'folder') {
        if (isDescendantOf(targetFolderId, itemId)) {
          return res.status(400).json({ error: 'Cannot move folder into itself or its descendants' });
        }
      }
    }
    
    const table = itemType === 'file' ? 'files' : 'folders';
    const parentColumn = itemType === 'file' ? 'folder_id' : 'parent_id';
    
    // Get original item
    const item = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(itemId);
    
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    // Update parent
    db.prepare(`UPDATE ${table} SET ${parentColumn} = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(targetFolderId || null, itemId);
    
    await logActivity({
      actorId: userId,
      action: 'move',
      itemType,
      itemId,
      itemName: item.name,
      meta: { fromFolder: item[parentColumn], toFolder: targetFolderId },
      ip: req.ip,
    });
    
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/**
 * Toggle star on an item
 * POST /api/items/star
 */
router.post('/star', requireAuth, async (req, res, next) => {
  try {
    const { itemId, itemType, starred } = req.body;
    const userId = req.user.id;
    
    if (!itemId || !itemType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Check view permission
    if (!canView(userId, itemType, itemId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const table = itemType === 'file' ? 'files' : 'folders';
    
    db.prepare(`UPDATE ${table} SET starred = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(starred ? 1 : 0, itemId);
    
    res.json({ success: true, starred: !!starred });
  } catch (err) {
    next(err);
  }
});

/**
 * Get item details
 * GET /api/items/:type/:id
 */
router.get('/:type/:id', requireAuth, async (req, res, next) => {
  try {
    const { type, id } = req.params;
    const userId = req.user.id;
    
    if (!['file', 'folder'].includes(type)) {
      return res.status(400).json({ error: 'Invalid item type' });
    }
    
    // Check view permission
    if (!canView(userId, type, id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const table = type === 'file' ? 'files' : 'folders';
    
    const item = db.prepare(`
      SELECT i.*, u.email as owner_email
      FROM ${table} i
      JOIN users u ON i.owner_id = u.id
      WHERE i.id = ?
    `).get(id);
    
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    // Get shares for this item
    const shares = db.prepare(`
      SELECT s.*, u.email as target_email
      FROM shares s
      LEFT JOIN users u ON s.target_user_id = u.id
      WHERE s.item_type = ? AND s.item_id = ? AND s.revoked_at IS NULL
    `).all(type, id);
    
    // Get versions if it's a file
    let versions = [];
    if (type === 'file') {
      versions = db.prepare(`
        SELECT v.*, u.email as created_by_email
        FROM file_versions v
        LEFT JOIN users u ON v.created_by = u.id
        WHERE v.file_id = ?
        ORDER BY v.created_at DESC
      `).all(id);
    }
    
    res.json({ 
      item: { ...item, type }, 
      shares,
      versions,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Helper: Get breadcrumbs for a folder
 */
function getBreadcrumbs(folderId) {
  const breadcrumbs = [];
  let currentId = folderId;
  
  while (currentId) {
    const folder = db.prepare('SELECT id, name, parent_id FROM folders WHERE id = ?').get(currentId);
    if (!folder) break;
    
    breadcrumbs.unshift({ id: folder.id, name: folder.name });
    currentId = folder.parent_id;
  }
  
  return breadcrumbs;
}

/**
 * Helper: Check if a folder is a descendant of another
 */
function isDescendantOf(potentialDescendant, ancestorId) {
  let currentId = potentialDescendant;
  
  while (currentId) {
    if (currentId === ancestorId) return true;
    
    const folder = db.prepare('SELECT parent_id FROM folders WHERE id = ?').get(currentId);
    if (!folder) break;
    
    currentId = folder.parent_id;
  }
  
  return false;
}

export default router;
