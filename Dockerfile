# Build stage for frontend
FROM node:20-alpine AS frontend-build

WORKDIR /app/client

# Copy frontend package files
COPY client/package*.json ./
RUN npm ci

# Copy frontend source and build
COPY client/ ./
RUN npm run build


# Build stage for backend
FROM node:20-alpine AS backend-build

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --omit=dev

# Production image
FROM node:20-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user for security
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

WORKDIR /app

# Copy node_modules from backend build
COPY --from=backend-build /app/node_modules ./node_modules

# Copy backend source
COPY server/ ./server/
COPY package*.json ./

# Copy built frontend from frontend build stage
COPY --from=frontend-build /app/client/dist ./client/dist

# Create data directories
RUN mkdir -p /data/storage /data/uploads && \
    chown -R appuser:appgroup /data && \
    chown -R appuser:appgroup /app

# Set environment variables
ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV PORT=3000

# Switch to non-root user
USER appuser

# Expose the port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server/index.js"]
