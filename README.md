# Online Drive

A production-ready, self-hosted Google Drive-like web application with local file storage.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-20%2B-green.svg)
![Docker](https://img.shields.io/badge/docker-ready-blue.svg)

## Features

- 🔐 **User Authentication** - Secure registration/login with Argon2 password hashing
- 👥 **Multi-user Support** - Each user has their own private storage space
- 📁 **File & Folder Management** - Create, rename, move, copy, delete
- ⬆️ **Resumable Uploads** - TUS protocol for reliable large file uploads
- 📤 **Sharing** - Share with users or generate public links with optional password protection
- 🕐 **Version History** - Automatic file versioning with restore capability
- 🗑️ **Trash & Recovery** - Soft delete with restore or permanent purge
- 📝 **Activity Logging** - Track all user actions
- 🛡️ **Security** - Path traversal prevention, CSRF protection, rate limiting
- 🎨 **Modern UI** - Clean, responsive Google Drive-style interface
- 🐳 **Docker Ready** - Easy deployment with Docker Compose

## Quick Start

### Using Docker (Recommended)

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/online-drive.git
   cd online-drive
   ```

2. **Create environment file**
   ```bash
   cp .env.example .env
   # Edit .env and set a strong SESSION_SECRET
   ```

3. **Start with Docker Compose**
   ```bash
   docker compose up -d
   ```

4. **Access the application**
   - Open http://localhost:3000 in your browser
   - Register the first account (it will be an admin)

### Deploy to Sirco

Deploy this app to [Sirco](https://sirco.io) in minutes:

1. **Connect your GitHub** to Sirco and select this repository

2. **Configure the service:**
   | Setting | Value |
   |---------|-------|
   | Runtime | Node.js (auto-detected) |
   | Install Command | `npm install` |
   | Build Command | `npm run build` |
   | Start Command | `npm start` |
   | Port | `3000` |

3. **Set environment variables** in Sirco's Environment tab:
   ```
   SESSION_SECRET=<generate-a-random-32-char-string>
   ```
   Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

4. **Deploy!** Your app will be available at `your-slug-app.is-a.lol`

5. **Recommended settings:**
   - Set **Robots.txt** to "Block All" to prevent uptime monitors from keeping the service awake
   - For always-on service, request Admin/Owner tier from Sirco admins

> ⚠️ **Note:** On Sirco's Normal tier, services sleep after 5 minutes of inactivity. Data stored in `./data` persists within the container but may not survive redeployments.

### Manual Installation

1. **Prerequisites**
   - Node.js 20+ 
   - npm 9+

2. **Clone and install dependencies**
   ```bash
   git clone https://github.com/yourusername/online-drive.git
   cd online-drive
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env and set SESSION_SECRET
   ```

4. **Build the frontend**
   ```bash
   npm run build
   ```

5. **Start the server**
   ```bash
   npm start
   ```

## First Run

When you first access the application:

1. Click **"Create account"** on the login page
2. Enter your email and password
3. The **first registered user automatically becomes an admin**
4. Admin users can:
   - Manage other users in the Admin panel
   - View activity logs
   - See system statistics

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `DATA_DIR` | `./data` | Directory for database and file storage |
| `SESSION_SECRET` | (auto-generated) | Secret for session encryption (set for persistence) |
| `MAX_UPLOAD_MB` | `1024` | Maximum upload size in MB (default 1GB) |
| `NODE_ENV` | `development` | Set to `production` for production mode |

### Storage Layout

```
$DATA_DIR/
├── drive.db              # SQLite database
├── storage/              # File blobs (content-addressed)
│   ├── ab/
│   │   └── cdef1234...   # Sharded by first 2 chars of hash
│   └── ...
└── uploads/              # Temporary TUS upload directory
```

## Architecture

### Backend

- **Express.js** - Web framework
- **SQLite** with WAL mode - Database (via better-sqlite3)
- **TUS Protocol** - Resumable file uploads
- **Argon2id** - Password hashing
- **Express Session** - Session management

### Frontend

- **React 18** - UI framework
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **React Router v6** - Routing
- **Uppy** - File upload UI with TUS support
- **Lucide Icons** - Icon library

### Security Features

- ✅ Path traversal prevention (all paths validated)
- ✅ CSRF protection with token validation
- ✅ Rate limiting on authentication endpoints
- ✅ Secure session cookies (HttpOnly, SameSite)
- ✅ Helmet.js security headers
- ✅ Input validation and sanitization
- ✅ File type validation
- ✅ Non-root Docker user

## API Endpoints

### Authentication
- `POST /api/auth/register` - Create new account
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user

### Files & Folders
- `GET /api/items` - List items in folder
- `POST /api/folders` - Create folder
- `PUT /api/items/:id/rename` - Rename item
- `PUT /api/items/:id/move` - Move item
- `DELETE /api/items/:id` - Move to trash
- `GET /api/files/:id/download` - Download file
- `GET /api/files/:id/versions` - List versions
- `POST /api/files/:id/versions/:versionId/restore` - Restore version

### Sharing
- `POST /api/share/user` - Share with user
- `POST /api/share/link` - Create share link
- `DELETE /api/share/:shareId` - Revoke share
- `GET /api/public/:token` - Access public share

### Trash
- `GET /api/trash` - List trashed items
- `POST /api/trash/:id/restore` - Restore item
- `DELETE /api/trash/:id` - Permanently delete
- `DELETE /api/trash` - Empty trash

### Admin (requires admin role)
- `GET /api/admin/users` - List users
- `POST /api/admin/users` - Create user
- `PUT /api/admin/users/:id` - Update user
- `DELETE /api/admin/users/:id` - Delete user
- `GET /api/admin/stats` - System statistics
- `GET /api/admin/activity` - Activity logs

## Backup & Restore

### Backup
```bash
# Stop the application first to ensure consistency
docker compose stop

# Backup the data volume
docker run --rm \
  -v online-drive-data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/drive-backup-$(date +%Y%m%d).tar.gz /data

# Restart the application
docker compose start
```

### Restore
```bash
# Stop the application
docker compose stop

# Restore from backup
docker run --rm \
  -v online-drive-data:/data \
  -v $(pwd):/backup \
  alpine sh -c "rm -rf /data/* && tar xzf /backup/drive-backup-YYYYMMDD.tar.gz -C /"

# Start the application
docker compose start
```

## Development

### Start development servers

```bash
# Terminal 1: Backend with auto-reload
npm run dev

# Terminal 2: Frontend dev server  
cd client && npm run dev
```

### Project Structure

```
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── contexts/       # React contexts (Auth)
│   │   ├── lib/            # Utilities (API client)
│   │   └── pages/          # Page components
│   └── ...
├── server/                 # Express backend
│   ├── db/                 # Database setup
│   ├── middleware/         # Express middleware
│   ├── routes/             # API routes
│   ├── services/           # Business logic
│   ├── utils/              # Utilities
│   └── index.js            # Main entry point
├── Dockerfile              # Multi-stage Docker build
├── docker-compose.yml      # Docker Compose config
└── package.json
```

## Troubleshooting

### "Session not working" / CSRF errors
- Ensure `SESSION_SECRET` is set and consistent across restarts
- Check that cookies are enabled in your browser
- If behind a proxy, set `trust proxy` in Express

### Upload failures
- Check `MAX_UPLOAD_SIZE` environment variable
- Ensure `$DATA_DIR/uploads` directory is writable
- Check available disk space

### Database locked errors
- SQLite WAL mode should prevent this, but if it occurs:
- Ensure only one instance of the app is running
- Check for stale lock files in `$DATA_DIR`

### Permission issues in Docker
- The container runs as non-root user (uid 1001)
- Ensure the data volume has correct permissions

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [TUS Protocol](https://tus.io/) - Resumable file upload protocol
- [Uppy](https://uppy.io/) - File upload widget
- [Tailwind CSS](https://tailwindcss.com/) - CSS framework
- [Lucide](https://lucide.dev/) - Icon library