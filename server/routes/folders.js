import express from 'express';
import crypto from 'crypto';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { logActivity } from '../services/activity.js';
import { canEdit } from '../services/permissions.js';
import { sanitizeFilename } from '../utils/storage.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

/**
 * Create a new folder
 * POST /api/folders
 */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { name, parentId } = req.body;
    const userId = req.user.id;
    
    if (!name) {
      return res.status(400).json({ error: 'Folder name is required' });
    }
    
    // Sanitize folder name
    const sanitizedName = sanitizeFilename(name);
    
    // If creating in a subfolder, check permission
    if (parentId) {
      if (!canEdit(userId, 'folder', parentId)) {
        return res.status(403).json({ error: 'Access denied to parent folder' });
      }
    }
    
    // Check for duplicate name in same parent
    const existing = db.prepare(`
      SELECT id FROM folders 
      WHERE owner_id = ? AND parent_id ${parentId ? '= ?' : 'IS NULL'} 
      AND name = ? AND trashed_at IS NULL
    `).get(...(parentId ? [userId, parentId, sanitizedName] : [userId, sanitizedName]));
    
    if (existing) {
      return res.status(409).json({ error: 'A folder with this name already exists' });
    }
    
    // Create folder
    const folderId = crypto.randomUUID();
    
    db.prepare(`
      INSERT INTO folders (id, owner_id, parent_id, name)
      VALUES (?, ?, ?, ?)
    `).run(folderId, userId, parentId || null, sanitizedName);
    
    await logActivity({
      actorId: userId,
      action: 'create_folder',
      itemType: 'folder',
      itemId: folderId,
      itemName: sanitizedName,
      ip: req.ip,
    });
    
    logger.info(`Folder created: ${sanitizedName} by ${req.user.email}`);
    
    const folder = db.prepare('SELECT * FROM folders WHERE id = ?').get(folderId);
    
    res.status(201).json({ folder: { ...folder, type: 'folder' } });
  } catch (err) {
    next(err);
  }
});

/**
 * Get folder contents (alternative endpoint)
 * GET /api/folders/:id
 */
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    // Special case: 'root' means user's root folder
    if (id === 'root') {
      const folders = db.prepare(`
        SELECT f.*, 'folder' as type
        FROM folders f
        WHERE f.owner_id = ? AND f.parent_id IS NULL AND f.trashed_at IS NULL
        ORDER BY f.name
      `).all(userId);
      
      const files = db.prepare(`
        SELECT f.*, 'file' as type
        FROM files f
        WHERE f.owner_id = ? AND f.folder_id IS NULL AND f.trashed_at IS NULL
        ORDER BY f.name
      `).all(userId);
      
      return res.json({
        folder: null,
        items: [...folders, ...files],
        breadcrumbs: [],
      });
    }
    
    // Get the folder
    const folder = db.prepare('SELECT * FROM folders WHERE id = ?').get(id);
    
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    
    // Check permission
    const perm = canEdit(userId, 'folder', id) ? 'edit' : 
                 db.prepare(`SELECT 1 FROM shares WHERE item_type = 'folder' AND item_id = ? AND target_user_id = ?`).get(id, userId) ? 'view' :
                 folder.owner_id === userId ? 'owner' : null;
    
    if (!perm && folder.owner_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Get contents
    const subfolders = db.prepare(`
      SELECT f.*, 'folder' as type
      FROM folders f
      WHERE f.parent_id = ? AND f.trashed_at IS NULL
      ORDER BY f.name
    `).all(id);
    
    const files = db.prepare(`
      SELECT f.*, 'file' as type
      FROM files f
      WHERE f.folder_id = ? AND f.trashed_at IS NULL
      ORDER BY f.name
    `).all(id);
    
    // Get breadcrumbs
    const breadcrumbs = getBreadcrumbs(id);
    
    res.json({
      folder: { ...folder, type: 'folder' },
      items: [...subfolders, ...files],
      breadcrumbs,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Delete a folder (move to trash)
 * DELETE /api/folders/:id
 */
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    const folder = db.prepare('SELECT * FROM folders WHERE id = ?').get(id);
    
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    
    // Only owner or editor can delete
    if (!canEdit(userId, 'folder', id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Move to trash (soft delete)
    db.prepare(`UPDATE folders SET trashed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
      .run(id);
    
    // Also trash all contents recursively
    trashFolderContents(id);
    
    await logActivity({
      actorId: userId,
      action: 'trash',
      itemType: 'folder',
      itemId: id,
      itemName: folder.name,
      ip: req.ip,
    });
    
    res.json({ success: true });
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
 * Helper: Recursively trash folder contents
 */
function trashFolderContents(folderId) {
  // Trash files in this folder
  db.prepare(`UPDATE files SET trashed_at = datetime('now') WHERE folder_id = ?`).run(folderId);
  
  // Get subfolders
  const subfolders = db.prepare('SELECT id FROM folders WHERE parent_id = ?').all(folderId);
  
  for (const subfolder of subfolders) {
    db.prepare(`UPDATE folders SET trashed_at = datetime('now') WHERE id = ?`).run(subfolder.id);
    trashFolderContents(subfolder.id);
  }
}

export default router;
