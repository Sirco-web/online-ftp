import express from 'express';
import crypto from 'crypto';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { logActivity } from '../services/activity.js';
import { canEdit, isOwner } from '../services/permissions.js';
import { deleteBlob } from '../utils/storage.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

/**
 * Get trashed items
 * GET /api/trash
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    const folders = db.prepare(`
      SELECT f.*, 'folder' as type
      FROM folders f
      WHERE f.owner_id = ? AND f.trashed_at IS NOT NULL
      ORDER BY f.trashed_at DESC
    `).all(userId);
    
    const files = db.prepare(`
      SELECT f.*, 'file' as type
      FROM files f
      WHERE f.owner_id = ? AND f.trashed_at IS NOT NULL
      ORDER BY f.trashed_at DESC
    `).all(userId);
    
    res.json({ items: [...folders, ...files] });
  } catch (err) {
    next(err);
  }
});

/**
 * Restore item from trash
 * POST /api/trash/:type/:id/restore
 */
router.post('/:type/:id/restore', requireAuth, async (req, res, next) => {
  try {
    const { type, id } = req.params;
    const userId = req.user.id;
    
    if (!['file', 'folder'].includes(type)) {
      return res.status(400).json({ error: 'Invalid item type' });
    }
    
    const table = type === 'file' ? 'files' : 'folders';
    const item = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    // Only owner can restore
    if (item.owner_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    if (!item.trashed_at) {
      return res.status(400).json({ error: 'Item is not in trash' });
    }
    
    // Check if parent folder still exists and is not trashed
    const parentColumn = type === 'file' ? 'folder_id' : 'parent_id';
    const parentId = item[parentColumn];
    
    if (parentId) {
      const parent = db.prepare('SELECT * FROM folders WHERE id = ?').get(parentId);
      if (!parent || parent.trashed_at) {
        // Move to root if parent is gone or trashed
        db.prepare(`UPDATE ${table} SET ${parentColumn} = NULL, trashed_at = NULL, updated_at = datetime('now') WHERE id = ?`)
          .run(id);
      } else {
        db.prepare(`UPDATE ${table} SET trashed_at = NULL, updated_at = datetime('now') WHERE id = ?`)
          .run(id);
      }
    } else {
      db.prepare(`UPDATE ${table} SET trashed_at = NULL, updated_at = datetime('now') WHERE id = ?`)
        .run(id);
    }
    
    // If it's a folder, restore contents too
    if (type === 'folder') {
      restoreFolderContents(id);
    }
    
    await logActivity({
      actorId: userId,
      action: 'restore',
      itemType: type,
      itemId: id,
      itemName: item.name,
      ip: req.ip,
    });
    
    logger.info(`Restored ${type} ${id} by ${userId}`);
    
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/**
 * Permanently delete item
 * DELETE /api/trash/:type/:id/purge
 */
router.delete('/:type/:id/purge', requireAuth, async (req, res, next) => {
  try {
    const { type, id } = req.params;
    const userId = req.user.id;
    
    if (!['file', 'folder'].includes(type)) {
      return res.status(400).json({ error: 'Invalid item type' });
    }
    
    const table = type === 'file' ? 'files' : 'folders';
    const item = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    // Only owner can permanently delete
    if (item.owner_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    if (type === 'file') {
      // Delete all versions and their blobs
      const versions = db.prepare('SELECT blob_id FROM file_versions WHERE file_id = ?').all(id);
      
      for (const version of versions) {
        // Check if blob is used by other versions
        const otherUses = db.prepare('SELECT id FROM file_versions WHERE blob_id = ? AND file_id != ?').get(version.blob_id, id);
        if (!otherUses) {
          deleteBlob(version.blob_id);
        }
      }
      
      // Delete versions
      db.prepare('DELETE FROM file_versions WHERE file_id = ?').run(id);
      
      // Delete shares
      db.prepare('DELETE FROM shares WHERE item_type = ? AND item_id = ?').run('file', id);
      
      // Delete file record
      db.prepare('DELETE FROM files WHERE id = ?').run(id);
      
    } else {
      // Permanently delete folder and all contents
      await purgeFolderRecursive(id);
    }
    
    await logActivity({
      actorId: userId,
      action: 'purge',
      itemType: type,
      itemId: id,
      itemName: item.name,
      ip: req.ip,
    });
    
    logger.info(`Purged ${type} ${id} by ${userId}`);
    
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/**
 * Empty trash (delete all trashed items)
 * DELETE /api/trash/empty
 */
router.delete('/empty', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    // Get all trashed items
    const trashedFiles = db.prepare('SELECT id FROM files WHERE owner_id = ? AND trashed_at IS NOT NULL').all(userId);
    const trashedFolders = db.prepare('SELECT id FROM folders WHERE owner_id = ? AND trashed_at IS NOT NULL').all(userId);
    
    // Purge files
    for (const file of trashedFiles) {
      const versions = db.prepare('SELECT blob_id FROM file_versions WHERE file_id = ?').all(file.id);
      
      for (const version of versions) {
        const otherUses = db.prepare('SELECT id FROM file_versions WHERE blob_id = ? AND file_id != ?').get(version.blob_id, file.id);
        if (!otherUses) {
          deleteBlob(version.blob_id);
        }
      }
      
      db.prepare('DELETE FROM file_versions WHERE file_id = ?').run(file.id);
      db.prepare('DELETE FROM shares WHERE item_type = ? AND item_id = ?').run('file', file.id);
      db.prepare('DELETE FROM files WHERE id = ?').run(file.id);
    }
    
    // Purge folders (this handles nested folders)
    for (const folder of trashedFolders) {
      await purgeFolderRecursive(folder.id);
    }
    
    await logActivity({
      actorId: userId,
      action: 'empty_trash',
      meta: { filesCount: trashedFiles.length, foldersCount: trashedFolders.length },
      ip: req.ip,
    });
    
    logger.info(`Emptied trash for user ${userId}`);
    
    res.json({ 
      success: true, 
      deleted: { 
        files: trashedFiles.length, 
        folders: trashedFolders.length 
      } 
    });
  } catch (err) {
    next(err);
  }
});

// Helper functions

function restoreFolderContents(folderId) {
  // Restore files in this folder
  db.prepare('UPDATE files SET trashed_at = NULL WHERE folder_id = ?').run(folderId);
  
  // Get and restore subfolders
  const subfolders = db.prepare('SELECT id FROM folders WHERE parent_id = ?').all(folderId);
  
  for (const subfolder of subfolders) {
    db.prepare('UPDATE folders SET trashed_at = NULL WHERE id = ?').run(subfolder.id);
    restoreFolderContents(subfolder.id);
  }
}

async function purgeFolderRecursive(folderId) {
  // First, recursively handle subfolders
  const subfolders = db.prepare('SELECT id FROM folders WHERE parent_id = ?').all(folderId);
  
  for (const subfolder of subfolders) {
    await purgeFolderRecursive(subfolder.id);
  }
  
  // Delete files in this folder
  const files = db.prepare('SELECT id FROM files WHERE folder_id = ?').all(folderId);
  
  for (const file of files) {
    const versions = db.prepare('SELECT blob_id FROM file_versions WHERE file_id = ?').all(file.id);
    
    for (const version of versions) {
      const otherUses = db.prepare('SELECT id FROM file_versions WHERE blob_id = ? AND file_id != ?').get(version.blob_id, file.id);
      if (!otherUses) {
        deleteBlob(version.blob_id);
      }
    }
    
    db.prepare('DELETE FROM file_versions WHERE file_id = ?').run(file.id);
    db.prepare('DELETE FROM shares WHERE item_type = ? AND item_id = ?').run('file', file.id);
    db.prepare('DELETE FROM files WHERE id = ?').run(file.id);
  }
  
  // Delete folder shares
  db.prepare('DELETE FROM shares WHERE item_type = ? AND item_id = ?').run('folder', folderId);
  
  // Delete folder
  db.prepare('DELETE FROM folders WHERE id = ?').run(folderId);
}

export default router;
