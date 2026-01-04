import crypto from 'crypto';
import db from '../db/index.js';
import { logger } from '../utils/logger.js';

/**
 * Log an activity to the activity_log table
 */
export async function logActivity({
  actorId,
  action,
  itemType = null,
  itemId = null,
  itemName = null,
  meta = null,
  ip = null,
}) {
  try {
    const id = crypto.randomUUID();
    const metaJson = meta ? JSON.stringify(meta) : null;
    
    db.prepare(`
      INSERT INTO activity_log (id, actor_id, action, item_type, item_id, item_name, meta_json, ip)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, actorId, action, itemType, itemId, itemName, metaJson, ip);
    
  } catch (err) {
    // Don't fail the main operation if logging fails
    logger.error('Failed to log activity:', err);
  }
}

/**
 * Get activity logs with filters
 */
export function getActivityLogs({
  actorId = null,
  itemType = null,
  itemId = null,
  action = null,
  startDate = null,
  endDate = null,
  limit = 50,
  offset = 0,
}) {
  let query = 'SELECT a.*, u.email as actor_email FROM activity_log a LEFT JOIN users u ON a.actor_id = u.id WHERE 1=1';
  const params = [];
  
  if (actorId) {
    query += ' AND a.actor_id = ?';
    params.push(actorId);
  }
  
  if (itemType) {
    query += ' AND a.item_type = ?';
    params.push(itemType);
  }
  
  if (itemId) {
    query += ' AND a.item_id = ?';
    params.push(itemId);
  }
  
  if (action) {
    query += ' AND a.action = ?';
    params.push(action);
  }
  
  if (startDate) {
    query += ' AND a.created_at >= ?';
    params.push(startDate);
  }
  
  if (endDate) {
    query += ' AND a.created_at <= ?';
    params.push(endDate);
  }
  
  query += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  
  return db.prepare(query).all(...params);
}

/**
 * Get activity count for pagination
 */
export function getActivityCount({
  actorId = null,
  itemType = null,
  itemId = null,
  action = null,
  startDate = null,
  endDate = null,
}) {
  let query = 'SELECT COUNT(*) as count FROM activity_log WHERE 1=1';
  const params = [];
  
  if (actorId) {
    query += ' AND actor_id = ?';
    params.push(actorId);
  }
  
  if (itemType) {
    query += ' AND item_type = ?';
    params.push(itemType);
  }
  
  if (itemId) {
    query += ' AND item_id = ?';
    params.push(itemId);
  }
  
  if (action) {
    query += ' AND action = ?';
    params.push(action);
  }
  
  if (startDate) {
    query += ' AND created_at >= ?';
    params.push(startDate);
  }
  
  if (endDate) {
    query += ' AND created_at <= ?';
    params.push(endDate);
  }
  
  const result = db.prepare(query).get(...params);
  return result.count;
}
