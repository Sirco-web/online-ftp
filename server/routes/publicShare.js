import express from 'express';
import fs from 'fs';
import argon2 from 'argon2';
import db from '../db/index.js';
import { optionalAuth } from '../middleware/auth.js';
import { validateLinkShare } from '../services/permissions.js';
import { logActivity } from '../services/activity.js';
import { getBlobPath, isSafeForPreview } from '../utils/storage.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

/**
 * Share landing page info
 * GET /s/:token
 */
router.get('/:token', optionalAuth, async (req, res, next) => {
  try {
    const { token } = req.params;
    
    const result = validateLinkShare(token);
    
    if (!result.valid) {
      if (result.needsPassword) {
        return res.json({ 
          needsPassword: true,
          itemType: null,
          itemName: null,
        });
      }
      return res.status(404).json({ error: result.error });
    }
    
    const share = result.share;
    
    // If password protected, check if password provided
    if (share.password_hash) {
      return res.json({
        needsPassword: true,
        itemType: share.item_type,
        itemName: share.item_name,
      });
    }
    
    // Return share info
    res.json({
      needsPassword: false,
      itemType: share.item_type,
      itemId: share.item_id,
      itemName: share.item_name,
      permission: share.permission,
      mime: share.mime,
      size: share.size,
      expiresAt: share.expires_at,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Verify password for protected share
 * POST /s/:token/verify
 */
router.post('/:token/verify', async (req, res, next) => {
  try {
    const { token } = req.params;
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({ error: 'Password required' });
    }
    
    const share = db.prepare(`
      SELECT * FROM shares 
      WHERE link_token = ? AND share_type = 'link' AND revoked_at IS NULL
    `).get(token);
    
    if (!share) {
      return res.status(404).json({ error: 'Share not found' });
    }
    
    // Check expiry
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Share has expired' });
    }
    
    if (!share.password_hash) {
      return res.json({ valid: true });
    }
    
    const valid = await argon2.verify(share.password_hash, password);
    
    if (!valid) {
      return res.status(401).json({ error: 'Invalid password' });
    }
    
    // Store verification in session
    if (req.session) {
      req.session.verifiedShares = req.session.verifiedShares || {};
      req.session.verifiedShares[token] = Date.now();
    }
    
    // Get item info
    let itemInfo = null;
    if (share.item_type === 'file') {
      itemInfo = db.prepare('SELECT id, name, mime, size FROM files WHERE id = ?').get(share.item_id);
    } else {
      itemInfo = db.prepare('SELECT id, name FROM folders WHERE id = ?').get(share.item_id);
    }
    
    res.json({ 
      valid: true,
      itemType: share.item_type,
      itemId: share.item_id,
      itemName: itemInfo?.name,
      permission: share.permission,
      mime: itemInfo?.mime,
      size: itemInfo?.size,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Download shared file
 * GET /s/:token/download
 */
router.get('/:token/download', optionalAuth, async (req, res, next) => {
  try {
    const { token } = req.params;
    const { password } = req.query;
    
    const share = db.prepare(`
      SELECT s.*, f.name, f.mime, f.current_version_id
      FROM shares s
      JOIN files f ON s.item_id = f.id
      WHERE s.link_token = ? AND s.share_type = 'link' AND s.item_type = 'file'
      AND s.revoked_at IS NULL
    `).get(token);
    
    if (!share) {
      return res.status(404).json({ error: 'Share not found' });
    }
    
    // Check expiry
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Share has expired' });
    }
    
    // Check password
    if (share.password_hash) {
      // Check session first
      const verified = req.session?.verifiedShares?.[token];
      const isRecentlyVerified = verified && (Date.now() - verified) < 3600000; // 1 hour
      
      if (!isRecentlyVerified) {
        if (!password) {
          return res.status(401).json({ error: 'Password required', needsPassword: true });
        }
        
        const valid = await argon2.verify(share.password_hash, password);
        if (!valid) {
          return res.status(401).json({ error: 'Invalid password' });
        }
      }
    }
    
    // Get version
    const version = db.prepare('SELECT * FROM file_versions WHERE id = ?').get(share.current_version_id);
    
    if (!version) {
      return res.status(404).json({ error: 'File version not found' });
    }
    
    const blobPath = getBlobPath(version.blob_id);
    
    if (!fs.existsSync(blobPath)) {
      return res.status(404).json({ error: 'File content not found' });
    }
    
    // Log download
    await logActivity({
      actorId: req.user?.id || null,
      action: 'download_shared',
      itemType: 'file',
      itemId: share.item_id,
      itemName: share.name,
      meta: { shareToken: token },
      ip: req.ip,
    });
    
    // Stream file
    res.setHeader('Content-Type', share.mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(share.name)}"`);
    res.setHeader('Content-Length', version.size);
    
    const stream = fs.createReadStream(blobPath);
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
});

/**
 * Preview shared file
 * GET /s/:token/preview
 */
router.get('/:token/preview', optionalAuth, async (req, res, next) => {
  try {
    const { token } = req.params;
    const { password } = req.query;
    
    const share = db.prepare(`
      SELECT s.*, f.name, f.mime, f.current_version_id
      FROM shares s
      JOIN files f ON s.item_id = f.id
      WHERE s.link_token = ? AND s.share_type = 'link' AND s.item_type = 'file'
      AND s.revoked_at IS NULL
    `).get(token);
    
    if (!share) {
      return res.status(404).json({ error: 'Share not found' });
    }
    
    // Check expiry
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Share has expired' });
    }
    
    // Check password
    if (share.password_hash) {
      const verified = req.session?.verifiedShares?.[token];
      const isRecentlyVerified = verified && (Date.now() - verified) < 3600000;
      
      if (!isRecentlyVerified) {
        if (!password) {
          return res.status(401).json({ error: 'Password required', needsPassword: true });
        }
        
        const valid = await argon2.verify(share.password_hash, password);
        if (!valid) {
          return res.status(401).json({ error: 'Invalid password' });
        }
      }
    }
    
    // Check if safe for preview
    if (!isSafeForPreview(share.mime)) {
      return res.status(400).json({ error: 'File type not supported for preview' });
    }
    
    const version = db.prepare('SELECT * FROM file_versions WHERE id = ?').get(share.current_version_id);
    
    if (!version) {
      return res.status(404).json({ error: 'File version not found' });
    }
    
    const blobPath = getBlobPath(version.blob_id);
    
    if (!fs.existsSync(blobPath)) {
      return res.status(404).json({ error: 'File content not found' });
    }
    
    res.setHeader('Content-Type', share.mime);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(share.name)}"`);
    res.setHeader('Content-Length', version.size);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    
    const stream = fs.createReadStream(blobPath);
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
});

/**
 * List shared folder contents
 * GET /s/:token/folder
 */
router.get('/:token/folder', optionalAuth, async (req, res, next) => {
  try {
    const { token } = req.params;
    const { folderId } = req.query; // For navigating subfolders
    
    const share = db.prepare(`
      SELECT s.*, fo.name as folder_name, fo.id as folder_id
      FROM shares s
      JOIN folders fo ON s.item_id = fo.id
      WHERE s.link_token = ? AND s.share_type = 'link' AND s.item_type = 'folder'
      AND s.revoked_at IS NULL
    `).get(token);
    
    if (!share) {
      return res.status(404).json({ error: 'Share not found' });
    }
    
    // Check expiry
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Share has expired' });
    }
    
    // Check password
    if (share.password_hash) {
      const verified = req.session?.verifiedShares?.[token];
      if (!verified || (Date.now() - verified) >= 3600000) {
        return res.status(401).json({ error: 'Password required', needsPassword: true });
      }
    }
    
    // Determine which folder to list
    const targetFolderId = folderId || share.folder_id;
    
    // Security: Ensure targetFolderId is the shared folder or a descendant
    if (targetFolderId !== share.folder_id) {
      const isDescendant = checkIsDescendant(targetFolderId, share.folder_id);
      if (!isDescendant) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    
    // Get folder contents
    const subfolders = db.prepare(`
      SELECT id, name, created_at, 'folder' as type
      FROM folders
      WHERE parent_id = ? AND trashed_at IS NULL
      ORDER BY name
    `).all(targetFolderId);
    
    const files = db.prepare(`
      SELECT id, name, mime, size, created_at, updated_at, 'file' as type
      FROM files
      WHERE folder_id = ? AND trashed_at IS NULL
      ORDER BY name
    `).all(targetFolderId);
    
    // Get breadcrumbs within shared folder
    const breadcrumbs = getBreadcrumbsWithinShare(targetFolderId, share.folder_id);
    
    res.json({
      items: [...subfolders, ...files],
      breadcrumbs,
      rootFolderName: share.folder_name,
      permission: share.permission,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Download file from shared folder
 * GET /s/:token/folder/file/:fileId/download
 */
router.get('/:token/folder/file/:fileId/download', optionalAuth, async (req, res, next) => {
  try {
    const { token, fileId } = req.params;
    
    const share = db.prepare(`
      SELECT s.*
      FROM shares s
      WHERE s.link_token = ? AND s.share_type = 'link' AND s.item_type = 'folder'
      AND s.revoked_at IS NULL
    `).get(token);
    
    if (!share) {
      return res.status(404).json({ error: 'Share not found' });
    }
    
    // Check expiry
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Share has expired' });
    }
    
    // Check password
    if (share.password_hash) {
      const verified = req.session?.verifiedShares?.[token];
      if (!verified || (Date.now() - verified) >= 3600000) {
        return res.status(401).json({ error: 'Password required', needsPassword: true });
      }
    }
    
    // Get file
    const file = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId);
    
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Security: Ensure file is within shared folder
    const isWithinShare = checkFileInFolder(fileId, share.item_id);
    if (!isWithinShare) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const version = db.prepare('SELECT * FROM file_versions WHERE id = ?').get(file.current_version_id);
    
    if (!version) {
      return res.status(404).json({ error: 'File version not found' });
    }
    
    const blobPath = getBlobPath(version.blob_id);
    
    if (!fs.existsSync(blobPath)) {
      return res.status(404).json({ error: 'File content not found' });
    }
    
    await logActivity({
      actorId: req.user?.id || null,
      action: 'download_shared',
      itemType: 'file',
      itemId: fileId,
      itemName: file.name,
      meta: { shareToken: token },
      ip: req.ip,
    });
    
    res.setHeader('Content-Type', file.mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name)}"`);
    res.setHeader('Content-Length', version.size);
    
    const stream = fs.createReadStream(blobPath);
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
});

// Helper functions

function checkIsDescendant(folderId, ancestorId) {
  let currentId = folderId;
  
  while (currentId) {
    if (currentId === ancestorId) return true;
    
    const folder = db.prepare('SELECT parent_id FROM folders WHERE id = ?').get(currentId);
    if (!folder) break;
    
    currentId = folder.parent_id;
  }
  
  return false;
}

function checkFileInFolder(fileId, folderId) {
  const file = db.prepare('SELECT folder_id FROM files WHERE id = ?').get(fileId);
  
  if (!file) return false;
  if (!file.folder_id) return false;
  if (file.folder_id === folderId) return true;
  
  return checkIsDescendant(file.folder_id, folderId);
}

function getBreadcrumbsWithinShare(folderId, shareRootId) {
  const breadcrumbs = [];
  let currentId = folderId;
  
  while (currentId && currentId !== shareRootId) {
    const folder = db.prepare('SELECT id, name, parent_id FROM folders WHERE id = ?').get(currentId);
    if (!folder) break;
    
    breadcrumbs.unshift({ id: folder.id, name: folder.name });
    currentId = folder.parent_id;
  }
  
  return breadcrumbs;
}

export default router;
