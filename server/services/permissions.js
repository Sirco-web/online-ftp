import db from '../db/index.js';

/**
 * Check if a user has permission to access a file or folder
 * Returns: 'owner' | 'edit' | 'view' | null
 */
export function checkPermission(userId, itemType, itemId) {
  // Get the item
  const table = itemType === 'file' ? 'files' : 'folders';
  const item = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(itemId);
  
  if (!item) {
    return null;
  }
  
  // Owner has full access
  if (item.owner_id === userId) {
    return 'owner';
  }
  
  // Check direct share
  const directShare = db.prepare(`
    SELECT permission FROM shares 
    WHERE item_type = ? AND item_id = ? 
    AND share_type = 'user' AND target_user_id = ?
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > datetime('now'))
  `).get(itemType, itemId, userId);
  
  if (directShare) {
    return directShare.permission;
  }
  
  // Check if parent folder is shared (inherited permissions)
  if (itemType === 'file' && item.folder_id) {
    return checkFolderPermission(userId, item.folder_id);
  }
  
  if (itemType === 'folder' && item.parent_id) {
    return checkFolderPermission(userId, item.parent_id);
  }
  
  return null;
}

/**
 * Recursively check folder permissions (for inherited shares)
 */
function checkFolderPermission(userId, folderId) {
  if (!folderId) return null;
  
  const folder = db.prepare('SELECT * FROM folders WHERE id = ?').get(folderId);
  
  if (!folder) return null;
  
  // Owner has full access
  if (folder.owner_id === userId) {
    return 'owner';
  }
  
  // Check direct share on this folder
  const directShare = db.prepare(`
    SELECT permission FROM shares 
    WHERE item_type = 'folder' AND item_id = ? 
    AND share_type = 'user' AND target_user_id = ?
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > datetime('now'))
  `).get(folderId, userId);
  
  if (directShare) {
    return directShare.permission;
  }
  
  // Check parent folder
  if (folder.parent_id) {
    return checkFolderPermission(userId, folder.parent_id);
  }
  
  return null;
}

/**
 * Check if user can view an item
 */
export function canView(userId, itemType, itemId) {
  const perm = checkPermission(userId, itemType, itemId);
  return perm !== null;
}

/**
 * Check if user can edit an item
 */
export function canEdit(userId, itemType, itemId) {
  const perm = checkPermission(userId, itemType, itemId);
  return perm === 'owner' || perm === 'edit';
}

/**
 * Check if user is owner
 */
export function isOwner(userId, itemType, itemId) {
  const perm = checkPermission(userId, itemType, itemId);
  return perm === 'owner';
}

/**
 * Get all items shared with a user
 */
export function getSharedWithUser(userId) {
  // Get directly shared files
  const sharedFiles = db.prepare(`
    SELECT f.*, s.permission, u.email as owner_email, 'file' as type
    FROM shares s
    JOIN files f ON s.item_id = f.id AND s.item_type = 'file'
    JOIN users u ON f.owner_id = u.id
    WHERE s.share_type = 'user' AND s.target_user_id = ?
    AND s.revoked_at IS NULL
    AND (s.expires_at IS NULL OR s.expires_at > datetime('now'))
    AND f.trashed_at IS NULL
  `).all(userId);
  
  // Get directly shared folders
  const sharedFolders = db.prepare(`
    SELECT f.*, s.permission, u.email as owner_email, 'folder' as type
    FROM shares s
    JOIN folders f ON s.item_id = f.id AND s.item_type = 'folder'
    JOIN users u ON f.owner_id = u.id
    WHERE s.share_type = 'user' AND s.target_user_id = ?
    AND s.revoked_at IS NULL
    AND (s.expires_at IS NULL OR s.expires_at > datetime('now'))
    AND f.trashed_at IS NULL
  `).all(userId);
  
  return [...sharedFiles, ...sharedFolders];
}

/**
 * Get shares for an item
 */
export function getSharesForItem(itemType, itemId) {
  return db.prepare(`
    SELECT s.*, u.email as target_email
    FROM shares s
    LEFT JOIN users u ON s.target_user_id = u.id
    WHERE s.item_type = ? AND s.item_id = ?
    AND s.revoked_at IS NULL
    ORDER BY s.created_at DESC
  `).all(itemType, itemId);
}

/**
 * Validate link share access
 */
export function validateLinkShare(token, password = null) {
  const share = db.prepare(`
    SELECT s.*, 
           CASE s.item_type 
             WHEN 'file' THEN f.name 
             WHEN 'folder' THEN fo.name 
           END as item_name,
           CASE s.item_type 
             WHEN 'file' THEN f.mime 
             ELSE NULL 
           END as mime,
           CASE s.item_type 
             WHEN 'file' THEN f.size 
             ELSE NULL 
           END as size
    FROM shares s
    LEFT JOIN files f ON s.item_type = 'file' AND s.item_id = f.id
    LEFT JOIN folders fo ON s.item_type = 'folder' AND s.item_id = fo.id
    WHERE s.link_token = ? 
    AND s.share_type = 'link'
    AND s.revoked_at IS NULL
  `).get(token);
  
  if (!share) {
    return { valid: false, error: 'Share not found' };
  }
  
  // Check expiry
  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    return { valid: false, error: 'Share has expired' };
  }
  
  // Check password if required
  if (share.password_hash && !password) {
    return { valid: false, error: 'Password required', needsPassword: true };
  }
  
  return { valid: true, share };
}
