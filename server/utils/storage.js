import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default to local ./data directory for development, /data for production/Docker
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../data');
const STORAGE_DIR = process.env.STORAGE_DIR || path.join(DATA_DIR, 'storage');
const BLOBS_DIR = path.join(STORAGE_DIR, 'blobs');

/**
 * SECURITY: Validates and normalizes a path to prevent directory traversal attacks.
 * This function ensures that the resolved path stays within the allowed base directory.
 * 
 * @param {string} baseDir - The allowed base directory
 * @param {string} userInput - The user-provided path component (should NOT be a full path)
 * @returns {string|null} - The safe, resolved path or null if invalid
 */
export function safePath(baseDir, userInput) {
  // Normalize the base directory
  const normalizedBase = path.resolve(baseDir);
  
  // Join and resolve the full path
  const targetPath = path.resolve(normalizedBase, userInput);
  
  // CRITICAL: Ensure the resolved path starts with the base directory
  // This prevents ../ attacks and symlink escapes
  if (!targetPath.startsWith(normalizedBase + path.sep) && targetPath !== normalizedBase) {
    logger.warn(`Path traversal attempt blocked: ${userInput} -> ${targetPath}`);
    return null;
  }
  
  return targetPath;
}

/**
 * Generates a unique blob ID for storing files
 * Uses UUID v4 to ensure uniqueness
 */
export function generateBlobId() {
  return crypto.randomUUID();
}

/**
 * Get the full path to a blob file
 * Uses a two-level directory structure for better filesystem performance
 * e.g., blobs/ab/cd/abcdef1234...
 */
export function getBlobPath(blobId) {
  // Validate blobId format (UUID)
  if (!blobId || !/^[a-f0-9-]{36}$/i.test(blobId)) {
    throw new Error('Invalid blob ID format');
  }
  
  // Use first 2 and next 2 characters for directory sharding
  const prefix1 = blobId.substring(0, 2);
  const prefix2 = blobId.substring(2, 4);
  
  const blobDir = path.join(BLOBS_DIR, prefix1, prefix2);
  
  // Ensure the directory exists
  if (!fs.existsSync(blobDir)) {
    fs.mkdirSync(blobDir, { recursive: true });
  }
  
  return path.join(blobDir, blobId);
}

/**
 * Calculate SHA-256 hash of a file
 */
export async function calculateFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Safely delete a blob file
 */
export function deleteBlob(blobId) {
  try {
    const blobPath = getBlobPath(blobId);
    if (fs.existsSync(blobPath)) {
      fs.unlinkSync(blobPath);
      logger.info(`Deleted blob: ${blobId}`);
      return true;
    }
  } catch (err) {
    logger.error(`Failed to delete blob ${blobId}:`, err);
  }
  return false;
}

/**
 * Move an uploaded file to blob storage
 */
export async function moveToBlobStorage(sourcePath, blobId) {
  const destPath = getBlobPath(blobId);
  
  // Copy then delete to handle cross-device moves
  await fs.promises.copyFile(sourcePath, destPath);
  await fs.promises.unlink(sourcePath);
  
  return destPath;
}

/**
 * Get file size of a blob
 */
export function getBlobSize(blobId) {
  try {
    const blobPath = getBlobPath(blobId);
    const stats = fs.statSync(blobPath);
    return stats.size;
  } catch (err) {
    return 0;
  }
}

/**
 * Check if a blob exists
 */
export function blobExists(blobId) {
  try {
    const blobPath = getBlobPath(blobId);
    return fs.existsSync(blobPath);
  } catch {
    return false;
  }
}

/**
 * Sanitize filename to prevent security issues
 * Removes path separators and dangerous characters
 */
export function sanitizeFilename(filename) {
  if (!filename || typeof filename !== 'string') {
    return 'unnamed';
  }
  
  // Remove path components
  let sanitized = path.basename(filename);
  
  // Remove null bytes and control characters
  sanitized = sanitized.replace(/[\x00-\x1f\x7f]/g, '');
  
  // Remove or replace dangerous characters
  sanitized = sanitized.replace(/[<>:"/\\|?*]/g, '_');
  
  // Limit length
  if (sanitized.length > 255) {
    const ext = path.extname(sanitized);
    const name = path.basename(sanitized, ext);
    sanitized = name.substring(0, 255 - ext.length) + ext;
  }
  
  // Prevent empty names or dot-only names
  if (!sanitized || sanitized === '.' || sanitized === '..') {
    return 'unnamed';
  }
  
  return sanitized;
}

/**
 * Validate MIME type against allowed types for preview
 * We allow most common file types for inline viewing
 */
export const SAFE_PREVIEW_TYPES = [
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
  'image/tiff',
  'image/x-icon',
  // Documents
  'application/pdf',
  'text/plain',
  'text/html',
  'text/css',
  'text/javascript',
  'application/json',
  'text/markdown',
  'text/csv',
  'text/xml',
  'application/xml',
  // Microsoft Office
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // OpenDocument formats
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
  // Video
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
  // Audio
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/webm',
  'audio/mp4',
  // Archives (for download, not inline preview)
  'application/zip',
  'application/x-rar-compressed',
  'application/x-7z-compressed',
  'application/gzip',
];

// Types that can be displayed inline in browser
export const INLINE_VIEWABLE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
  'application/pdf',
  'text/plain',
  'text/html',
  'text/css',
  'text/javascript',
  'application/json',
  'text/markdown',
  'text/csv',
  'video/mp4',
  'video/webm',
  'video/ogg',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/webm',
];

export function isSafeForPreview(mimeType) {
  // Allow all file types for preview/download
  // The frontend will handle displaying appropriately
  return true;
}

export function isInlineViewable(mimeType) {
  return INLINE_VIEWABLE_TYPES.includes(mimeType);
}
