import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default to local ./data directory for development, /data for production/Docker
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../data');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'drive.db');

// Ensure DB directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(DB_PATH, { 
  verbose: process.env.NODE_ENV === 'development' ? console.log : null 
});

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export async function initDatabase() {
  logger.info('Initializing database...');
  
  // Create tables
  db.exec(`
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'owner')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'banned')),
      storage_quota INTEGER DEFAULT 5368709120,
      storage_used INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    
    -- App settings table
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );
    
    -- Folders table
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      parent_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      starred INTEGER DEFAULT 0,
      trashed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    
    -- Files table
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      folder_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      mime TEXT,
      size INTEGER DEFAULT 0,
      current_version_id TEXT,
      starred INTEGER DEFAULT 0,
      trashed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    
    -- File versions table
    CREATE TABLE IF NOT EXISTS file_versions (
      id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
      blob_id TEXT NOT NULL,
      size INTEGER NOT NULL,
      sha256 TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL
    );
    
    -- Update files foreign key for current_version_id after file_versions exists
    -- (SQLite doesn't support adding FK constraints after table creation, so we handle this in app logic)
    
    -- Shares table
    CREATE TABLE IF NOT EXISTS shares (
      id TEXT PRIMARY KEY,
      item_type TEXT NOT NULL CHECK (item_type IN ('file', 'folder')),
      item_id TEXT NOT NULL,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      share_type TEXT NOT NULL CHECK (share_type IN ('user', 'link')),
      target_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      link_token TEXT UNIQUE,
      permission TEXT NOT NULL DEFAULT 'view' CHECK (permission IN ('view', 'edit')),
      password_hash TEXT,
      expires_at TEXT,
      revoked_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    
    -- Activity log table
    CREATE TABLE IF NOT EXISTS activity_log (
      id TEXT PRIMARY KEY,
      actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      item_type TEXT,
      item_id TEXT,
      item_name TEXT,
      meta_json TEXT,
      ip TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    
    -- Sessions table for persistent sessions (optional, using memory by default)
    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expire TEXT NOT NULL
    );
    
    -- Indexes for performance
    CREATE INDEX IF NOT EXISTS idx_folders_owner ON folders(owner_id);
    CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);
    CREATE INDEX IF NOT EXISTS idx_folders_trashed ON folders(trashed_at);
    
    CREATE INDEX IF NOT EXISTS idx_files_owner ON files(owner_id);
    CREATE INDEX IF NOT EXISTS idx_files_folder ON files(folder_id);
    CREATE INDEX IF NOT EXISTS idx_files_trashed ON files(trashed_at);
    CREATE INDEX IF NOT EXISTS idx_files_name ON files(name);
    
    CREATE INDEX IF NOT EXISTS idx_file_versions_file ON file_versions(file_id);
    
    CREATE INDEX IF NOT EXISTS idx_shares_item ON shares(item_type, item_id);
    CREATE INDEX IF NOT EXISTS idx_shares_token ON shares(link_token);
    CREATE INDEX IF NOT EXISTS idx_shares_target_user ON shares(target_user_id);
    
    CREATE INDEX IF NOT EXISTS idx_activity_actor ON activity_log(actor_id);
    CREATE INDEX IF NOT EXISTS idx_activity_item ON activity_log(item_type, item_id);
    CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at);
  `);
  
  // Add columns if they don't exist (for existing databases)
  try {
    db.exec(`ALTER TABLE users ADD COLUMN storage_quota INTEGER DEFAULT 5368709120`);
  } catch (e) { /* column exists */ }
  
  try {
    db.exec(`ALTER TABLE users ADD COLUMN storage_used INTEGER DEFAULT 0`);
  } catch (e) { /* column exists */ }
  
  try {
    db.exec(`ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`);
  } catch (e) { /* column exists */ }
  
  // Initialize default settings
  const defaultSettings = [
    ['signups_enabled', 'true'],
    ['signin_enabled', 'true'],
    ['default_storage_quota', '5368709120'], // 5GB in bytes
    ['maintenance_mode', 'false'],
    ['require_owner_pin', 'true'],
    ['owner_pin', '2529'], // Default owner PIN
  ];
  
  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)
  `);
  
  for (const [key, value] of defaultSettings) {
    insertSetting.run(key, value);
  }
  
  // Create hardcoded admin if doesn't exist
  const adminEmail = 'timco307@gmail.com';
  const existingAdmin = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
  
  if (!existingAdmin) {
    // We'll create this user when they first register with the correct pin
    logger.info('Hardcoded admin email set: ' + adminEmail);
  } else {
    // Ensure the owner has the 'owner' role
    db.prepare("UPDATE users SET role = 'owner' WHERE email = ?").run(adminEmail);
  }
  
  logger.info('Database tables created/verified');
}

export default db;
