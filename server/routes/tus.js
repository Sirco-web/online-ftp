import express from 'express';
import { Server as TusServer } from '@tus/server';
import { FileStore } from '@tus/file-store';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../db/index.js';
import { logger } from '../utils/logger.js';
import { logActivity } from '../services/activity.js';
import { 
  generateBlobId, 
  getBlobPath, 
  calculateFileHash, 
  sanitizeFilename,
  moveToBlobStorage 
} from '../utils/storage.js';
import { canEdit } from '../services/permissions.js';
import mime from 'mime-types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Default to local ./data directory for development, /data for production/Docker
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../data');
const STORAGE_DIR = process.env.STORAGE_DIR || path.join(DATA_DIR, 'storage');
const TUS_DIR = path.join(STORAGE_DIR, 'tus-uploads');
const MAX_UPLOAD_SIZE = parseInt(process.env.MAX_UPLOAD_MB || '1024') * 1024 * 1024;

// Ensure TUS directory exists
if (!fs.existsSync(TUS_DIR)) {
  fs.mkdirSync(TUS_DIR, { recursive: true });
}

// Create TUS server
const tusServer = new TusServer({
  path: '/files',
  datastore: new FileStore({ directory: TUS_DIR }),
  maxSize: MAX_UPLOAD_SIZE,
  respectForwardedHeaders: true, // Use X-Forwarded-Host for correct URLs behind proxy
  
  // Custom naming function - use UUID to prevent conflicts
  namingFunction: (req) => {
    return crypto.randomUUID();
  },
  
  // Validate upload before starting
  onUploadCreate: async (req, res, upload) => {
    // Check authentication
    const session = req.session;
    logger.info(`TUS onUploadCreate - session exists: ${!!session}, userId: ${session?.userId}`);
    
    if (!session?.userId) {
      logger.warn('TUS upload rejected - no session userId');
      throw { status_code: 401, body: 'Authentication required' };
    }
    
    // Extract metadata
    const metadata = upload.metadata || {};
    const filename = metadata.filename || 'unnamed';
    const folderId = metadata.folderId;
    
    // Validate filename
    const sanitized = sanitizeFilename(filename);
    if (!sanitized) {
      throw { status_code: 400, body: 'Invalid filename' };
    }
    
    // If uploading to a folder, check permission
    if (folderId && folderId !== 'null' && folderId !== 'undefined') {
      const user = db.prepare('SELECT id FROM users WHERE id = ?').get(session.userId);
      if (!user) {
        throw { status_code: 401, body: 'User not found' };
      }
      
      if (!canEdit(session.userId, 'folder', folderId)) {
        throw { status_code: 403, body: 'Access denied to folder' };
      }
    }
    
    logger.info(`Upload started: ${sanitized} by user ${session.userId}`);
    
    return res;
  },
  
  // Process completed upload
  onUploadFinish: async (req, res, upload) => {
    try {
      const session = req.session;
      if (!session?.userId) {
        throw { status_code: 401, body: 'Authentication required' };
      }
      
      const userId = session.userId;
      const metadata = upload.metadata || {};
      
      const filename = sanitizeFilename(metadata.filename || 'unnamed');
      const filetype = metadata.filetype || mime.lookup(filename) || 'application/octet-stream';
      const folderId = metadata.folderId && metadata.folderId !== 'null' && metadata.folderId !== 'undefined' 
        ? metadata.folderId 
        : null;
      const replaceFileId = metadata.replaceFileId && metadata.replaceFileId !== 'null' && metadata.replaceFileId !== 'undefined'
        ? metadata.replaceFileId
        : null;
      
      // Get the uploaded file path
      const tusFilePath = path.join(TUS_DIR, upload.id);
      
      // Check if file exists before processing
      if (!fs.existsSync(tusFilePath)) {
        logger.error(`TUS file not found: ${tusFilePath}`);
        throw { status_code: 500, body: 'Upload file not found' };
      }
      
      // Calculate hash and get size
      const sha256 = await calculateFileHash(tusFilePath);
      const stats = fs.statSync(tusFilePath);
      const size = stats.size;
      
      // Generate blob ID and move to permanent storage
      const blobId = generateBlobId();
      await moveToBlobStorage(tusFilePath, blobId);
      
      // Delete the .json metadata file
      const metaFilePath = `${tusFilePath}.json`;
      if (fs.existsSync(metaFilePath)) {
        fs.unlinkSync(metaFilePath);
      }
      
      let fileId, versionId;
      let activityAction = 'upload';
      let activityName = filename;
      
      if (replaceFileId) {
        // Replace existing file - create new version
        const existingFile = db.prepare('SELECT * FROM files WHERE id = ?').get(replaceFileId);
        
        if (!existingFile) {
          throw { status_code: 404, body: 'File to replace not found' };
        }
        
        if (!canEdit(userId, 'file', replaceFileId)) {
          throw { status_code: 403, body: 'Access denied to file' };
        }
        
        fileId = replaceFileId;
        versionId = crypto.randomUUID();
        activityAction = 'upload_version';
        activityName = existingFile.name;
        
        // Create new version
        db.prepare(`
          INSERT INTO file_versions (id, file_id, blob_id, size, sha256, created_by)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(versionId, fileId, blobId, size, sha256, userId);
        
        // Update file to point to new version
        db.prepare(`
          UPDATE files 
          SET current_version_id = ?, size = ?, mime = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(versionId, size, filetype, fileId);
        
      } else {
        // Check if file with same name exists in folder
        const existingFile = db.prepare(`
          SELECT id FROM files 
          WHERE owner_id = ? AND folder_id ${folderId ? '= ?' : 'IS NULL'} 
          AND name = ? AND trashed_at IS NULL
        `).get(...(folderId ? [userId, folderId, filename] : [userId, filename]));
        
        if (existingFile) {
          // File exists - create new version
          fileId = existingFile.id;
          versionId = crypto.randomUUID();
          activityAction = 'upload_version';
          
          db.prepare(`
            INSERT INTO file_versions (id, file_id, blob_id, size, sha256, created_by)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(versionId, fileId, blobId, size, sha256, userId);
          
          db.prepare(`
            UPDATE files 
            SET current_version_id = ?, size = ?, mime = ?, updated_at = datetime('now')
            WHERE id = ?
          `).run(versionId, size, filetype, fileId);
          
        } else {
          // New file
          fileId = crypto.randomUUID();
          versionId = crypto.randomUUID();
          
          // Create file record
          db.prepare(`
            INSERT INTO files (id, owner_id, folder_id, name, mime, size, current_version_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(fileId, userId, folderId, filename, filetype, size, versionId);
          
          // Create version record
          db.prepare(`
            INSERT INTO file_versions (id, file_id, blob_id, size, sha256, created_by)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(versionId, fileId, blobId, size, sha256, userId);
        }
      }
      
      // Log activity (async, don't block)
      logActivity({
        actorId: userId,
        action: activityAction,
        itemType: 'file',
        itemId: fileId,
        itemName: activityName,
        meta: { versionId, size },
        ip: req.ip,
      }).catch(err => logger.error('Activity log error:', err));
      
      logger.info(`Upload completed: ${filename} (${fileId}) by user ${userId}`);
      
      // Add custom header with file info
      res.setHeader('X-File-Id', fileId);
      res.setHeader('X-Version-Id', versionId);
      
      return res;
      
    } catch (err) {
      logger.error('Upload finish error:', err);
      throw err;
    }
  },
});

// Handle TUS requests
router.all('*', async (req, res) => {
  try {
    logger.info(`TUS request: ${req.method} ${req.path} - session userId: ${req.session?.userId}`);
    // Add session to request for TUS hooks
    await tusServer.handle(req, res);
  } catch (err) {
    logger.error('TUS error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Upload failed' });
    }
  }
});

export default router;
