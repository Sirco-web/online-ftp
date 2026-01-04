import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import mime from 'mime-types';
import db from '../db/index.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { logActivity } from '../services/activity.js';
import { canView, canEdit, checkPermission } from '../services/permissions.js';
import { 
  getBlobPath, 
  sanitizeFilename, 
  isSafeForPreview,
  deleteBlob 
} from '../utils/storage.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

/**
 * Download a file
 * GET /api/files/:id/download
 */
router.get('/:id/download', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    // Get file
    const file = db.prepare('SELECT * FROM files WHERE id = ?').get(id);
    
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Check permission
    if (!canView(userId, 'file', id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Get current version
    const version = db.prepare('SELECT * FROM file_versions WHERE id = ?').get(file.current_version_id);
    
    if (!version) {
      return res.status(404).json({ error: 'File version not found' });
    }
    
    // Get blob path
    const blobPath = getBlobPath(version.blob_id);
    
    if (!fs.existsSync(blobPath)) {
      logger.error(`Blob not found on disk: ${version.blob_id}`);
      return res.status(404).json({ error: 'File content not found' });
    }
    
    // Log download activity
    await logActivity({
      actorId: userId,
      action: 'download',
      itemType: 'file',
      itemId: id,
      itemName: file.name,
      ip: req.ip,
    });
    
    // Set headers and stream file
    res.setHeader('Content-Type', file.mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name)}"`);
    res.setHeader('Content-Length', version.size);
    
    const stream = fs.createReadStream(blobPath);
    stream.pipe(res);
    
    stream.on('error', (err) => {
      logger.error('Stream error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error streaming file' });
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Preview a file (inline display)
 * GET /api/files/:id/preview
 */
router.get('/:id/preview', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    // Get file
    const file = db.prepare('SELECT * FROM files WHERE id = ?').get(id);
    
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Check permission
    if (!canView(userId, 'file', id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Check if file type is safe for preview
    if (!isSafeForPreview(file.mime)) {
      return res.status(400).json({ error: 'File type not supported for preview' });
    }
    
    // Get current version
    const version = db.prepare('SELECT * FROM file_versions WHERE id = ?').get(file.current_version_id);
    
    if (!version) {
      return res.status(404).json({ error: 'File version not found' });
    }
    
    const blobPath = getBlobPath(version.blob_id);
    
    if (!fs.existsSync(blobPath)) {
      return res.status(404).json({ error: 'File content not found' });
    }
    
    // Set headers for inline display
    res.setHeader('Content-Type', file.mime);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.name)}"`);
    res.setHeader('Content-Length', version.size);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    
    const stream = fs.createReadStream(blobPath);
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
});

/**
 * Download a specific version of a file
 * GET /api/files/:id/versions/:versionId/download
 */
router.get('/:id/versions/:versionId/download', requireAuth, async (req, res, next) => {
  try {
    const { id, versionId } = req.params;
    const userId = req.user.id;
    
    // Get file
    const file = db.prepare('SELECT * FROM files WHERE id = ?').get(id);
    
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Check permission
    if (!canView(userId, 'file', id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Get version
    const version = db.prepare('SELECT * FROM file_versions WHERE id = ? AND file_id = ?').get(versionId, id);
    
    if (!version) {
      return res.status(404).json({ error: 'Version not found' });
    }
    
    const blobPath = getBlobPath(version.blob_id);
    
    if (!fs.existsSync(blobPath)) {
      return res.status(404).json({ error: 'File content not found' });
    }
    
    res.setHeader('Content-Type', file.mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name)}"`);
    res.setHeader('Content-Length', version.size);
    
    const stream = fs.createReadStream(blobPath);
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
});

/**
 * Restore a previous version
 * POST /api/files/:id/versions/:versionId/restore
 */
router.post('/:id/versions/:versionId/restore', requireAuth, async (req, res, next) => {
  try {
    const { id, versionId } = req.params;
    const userId = req.user.id;
    
    // Get file
    const file = db.prepare('SELECT * FROM files WHERE id = ?').get(id);
    
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Check edit permission
    if (!canEdit(userId, 'file', id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Get version
    const version = db.prepare('SELECT * FROM file_versions WHERE id = ? AND file_id = ?').get(versionId, id);
    
    if (!version) {
      return res.status(404).json({ error: 'Version not found' });
    }
    
    // Create a new version based on the old one
    const newVersionId = crypto.randomUUID();
    
    db.prepare(`
      INSERT INTO file_versions (id, file_id, blob_id, size, sha256, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(newVersionId, id, version.blob_id, version.size, version.sha256, userId);
    
    // Update file to point to new version
    db.prepare(`
      UPDATE files SET current_version_id = ?, size = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(newVersionId, version.size, id);
    
    await logActivity({
      actorId: userId,
      action: 'restore_version',
      itemType: 'file',
      itemId: id,
      itemName: file.name,
      meta: { restoredVersionId: versionId },
      ip: req.ip,
    });
    
    res.json({ success: true, versionId: newVersionId });
  } catch (err) {
    next(err);
  }
});

/**
 * Get file versions
 * GET /api/files/:id/versions
 */
router.get('/:id/versions', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    // Get file
    const file = db.prepare('SELECT * FROM files WHERE id = ?').get(id);
    
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Check permission
    if (!canView(userId, 'file', id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const versions = db.prepare(`
      SELECT v.*, u.email as created_by_email
      FROM file_versions v
      LEFT JOIN users u ON v.created_by = u.id
      WHERE v.file_id = ?
      ORDER BY v.created_at DESC
    `).all(id);
    
    res.json({ versions, currentVersionId: file.current_version_id });
  } catch (err) {
    next(err);
  }
});

/**
 * Delete a file (move to trash)
 * DELETE /api/files/:id
 */
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    const file = db.prepare('SELECT * FROM files WHERE id = ?').get(id);
    
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Only owner or editor can delete
    if (!canEdit(userId, 'file', id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Move to trash (soft delete)
    db.prepare(`UPDATE files SET trashed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
      .run(id);
    
    await logActivity({
      actorId: userId,
      action: 'trash',
      itemType: 'file',
      itemId: id,
      itemName: file.name,
      ip: req.ip,
    });
    
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
