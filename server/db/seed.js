import db from './index.js';
import argon2 from 'argon2';
import crypto from 'crypto';
import { logger } from '../utils/logger.js';

async function seed() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'changeme123';
  
  // Check if admin already exists
  const existingAdmin = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
  
  if (existingAdmin) {
    logger.info('Admin user already exists, skipping seed');
    return;
  }
  
  // Create admin user
  const adminId = crypto.randomUUID();
  const passwordHash = await argon2.hash(adminPassword, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
  
  db.prepare(`
    INSERT INTO users (id, email, password_hash, role)
    VALUES (?, ?, ?, 'admin')
  `).run(adminId, adminEmail, passwordHash);
  
  logger.info(`Created admin user: ${adminEmail}`);
  logger.warn('IMPORTANT: Change the admin password immediately after first login!');
}

seed().catch(err => {
  logger.error('Seed failed:', err);
  process.exit(1);
});
