import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

import { initDatabase } from './db/index.js';
import { logger } from './utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { csrfProtection } from './middleware/csrf.js';

import authRoutes from './routes/auth.js';
import itemsRoutes from './routes/items.js';
import filesRoutes from './routes/files.js';
import foldersRoutes from './routes/folders.js';
import shareRoutes from './routes/share.js';
import trashRoutes from './routes/trash.js';
import adminRoutes from './routes/admin.js';
import tusRoutes from './routes/tus.js';
import publicShareRoutes from './routes/publicShare.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Default to local ./data directory for development, /data for production/Docker
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../data');
const STORAGE_DIR = process.env.STORAGE_DIR || path.join(DATA_DIR, 'storage');
const BLOBS_DIR = path.join(STORAGE_DIR, 'blobs');
const TUS_DIR = path.join(STORAGE_DIR, 'tus-uploads');

// Ensure storage directories exist
[DATA_DIR, STORAGE_DIR, BLOBS_DIR, TUS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logger.info(`Created directory: ${dir}`);
  }
});

// Security: Helmet with relaxed CSP for development/Codespaces
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP - configure properly in production
}));

// CORS configuration - allow same origin and configured domains
const corsOrigins = process.env.CORS_ORIGINS 
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
  : true; // Allow all origins if not specified (same-origin requests work by default)

app.use(cors({
  origin: corsOrigins,
  credentials: true,
}));

// Trust proxy - Sirco/Cloudflare runs behind a reverse proxy
app.set('trust proxy', process.env.TRUSTED_PROXIES || 1);

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({ error: 'Too many requests, please try again later.' });
  },
});

app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// Session configuration
// Generate a random session secret if not provided (persists for this process only)
const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.SESSION_SECRET) {
  logger.warn('SESSION_SECRET not set - using random secret. Sessions will not persist across restarts.');
}

app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  name: 'cloud-drive.sid',
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
}));

// CSRF protection (skip for tus uploads which have their own auth)
app.use((req, res, next) => {
  // Skip CSRF for tus endpoints and public share downloads
  if (req.path.startsWith('/files') || req.path.startsWith('/s/')) {
    return next();
  }
  // Apply CSRF to API routes
  if (req.path.startsWith('/api/')) {
    return csrfProtection(req, res, next);
  }
  next();
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Robots.txt - block crawlers by default to prevent sleep issues on Sirco
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send('User-agent: *\nDisallow: /');
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/items', itemsRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/folders', foldersRoutes);
app.use('/api/share', shareRoutes);
app.use('/api/trash', trashRoutes);
app.use('/api/admin', adminRoutes);

// TUS upload endpoint
app.use('/files', tusRoutes);

// Public share routes
app.use('/s', publicShareRoutes);

// Serve static files in production
const clientDistPath = path.join(__dirname, '../client/dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  
  // SPA fallback
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// Error handling
app.use(errorHandler);

// Initialize database and start server
async function start() {
  try {
    await initDatabase();
    logger.info('Database initialized');
    
    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Storage directory: ${STORAGE_DIR}`);
    });
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();

export default app;
