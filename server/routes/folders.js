import express from 'express';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import archiver from 'archiver';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { logActivity } from '../services/activity.js';
import { canEdit, canView } from '../services/permissions.js';
import { sanitizeFilename, getBlobPath } from '../utils/storage.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

/**
 * Get folder tree (for move modal)
 * GET /api/folders/tree
 */
router.get('/tree', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    // Get all folders owned by user
    const allFolders = db.prepare(`
      SELECT id, name, parent_id 
      FROM folders 
      WHERE owner_id = ? AND trashed_at IS NULL
      ORDER BY name
    `).all(userId);
    
    // Build tree structure
    const folderMap = new Map();
    const roots = [];
    
    // Create folder objects with children arrays
    allFolders.forEach(folder => {
      folderMap.set(folder.id, { ...folder, children: [] });
    });
    
    // Build parent-child relationships
    allFolders.forEach(folder => {
      const folderObj = folderMap.get(folder.id);
      if (folder.parent_id && folderMap.has(folder.parent_id)) {
        folderMap.get(folder.parent_id).children.push(folderObj);
      } else if (!folder.parent_id) {
        roots.push(folderObj);
      }
    });
    
    res.json({ folders: roots });
  } catch (err) {
    next(err);
  }
});

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

/**
 * Download folder as ZIP
 * GET /api/folders/:id/download-zip
 */
router.get('/:id/download-zip', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    let folderName = 'My Drive';
    let folderId = null;
    
    // Handle root folder case
    if (id !== 'root') {
      const folder = db.prepare('SELECT * FROM folders WHERE id = ?').get(id);
      
      if (!folder) {
        return res.status(404).json({ error: 'Folder not found' });
      }
      
      // Check permission
      if (!canView(userId, 'folder', id) && folder.owner_id !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      folderName = folder.name;
      folderId = id;
    }
    
    // Set headers for ZIP download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(folderName)}.zip"`);
    
    // Create archiver
    const archive = archiver('zip', {
      zlib: { level: 5 } // Compression level
    });
    
    // Handle errors
    archive.on('error', (err) => {
      logger.error('Archive error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to create ZIP archive' });
      }
    });
    
    // Pipe archive to response
    archive.pipe(res);
    
    // Add files recursively
    await addFolderToArchive(archive, folderId, '', userId);
    
    // Finalize archive
    await archive.finalize();
    
  } catch (err) {
    next(err);
  }
});

/**
 * Helper: Recursively add folder contents to archive
 */
async function addFolderToArchive(archive, folderId, basePath, userId) {
  // Get files in this folder
  const files = db.prepare(`
    SELECT f.*, v.blob_id 
    FROM files f
    LEFT JOIN file_versions v ON f.current_version_id = v.id
    WHERE f.${folderId ? 'folder_id = ?' : 'folder_id IS NULL AND f.owner_id = ?'}
    AND f.trashed_at IS NULL
  `).all(folderId || userId);
  
  for (const file of files) {
    if (file.blob_id) {
      const blobPath = getBlobPath(file.blob_id);
      if (fs.existsSync(blobPath)) {
        const archivePath = basePath ? `${basePath}/${file.name}` : file.name;
        archive.file(blobPath, { name: archivePath });
      }
    }
  }
  
  // Get subfolders and process recursively
  const subfolders = db.prepare(`
    SELECT * FROM folders 
    WHERE ${folderId ? 'parent_id = ?' : 'parent_id IS NULL AND owner_id = ?'}
    AND trashed_at IS NULL
  `).all(folderId || userId);
  
  for (const subfolder of subfolders) {
    const subPath = basePath ? `${basePath}/${subfolder.name}` : subfolder.name;
    // Add empty folder entry
    archive.append('', { name: subPath + '/' });
    // Recursively add contents
    await addFolderToArchive(archive, subfolder.id, subPath, userId);
  }
}

export default router;
