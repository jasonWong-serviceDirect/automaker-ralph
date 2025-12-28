# Automaker Backend Server
# Multi-stage build for minimal production image

# Build stage
FROM node:20-alpine AS builder

# Install build dependencies for native modules (node-pty)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files for all workspaces
COPY package*.json ./
COPY apps/server/package*.json ./apps/server/
COPY libs/types/package*.json ./libs/types/
COPY libs/utils/package*.json ./libs/utils/
COPY libs/prompts/package*.json ./libs/prompts/
COPY libs/platform/package*.json ./libs/platform/
COPY libs/model-resolver/package*.json ./libs/model-resolver/
COPY libs/dependency-resolver/package*.json ./libs/dependency-resolver/
COPY libs/git-utils/package*.json ./libs/git-utils/
COPY scripts ./scripts

# Install dependencies (--ignore-scripts to skip husky and build:packages in prepare script)
RUN npm ci --ignore-scripts

# Copy all source files
COPY libs ./libs
COPY apps/server ./apps/server

# Build packages in dependency order, then build server
RUN npm run build:packages && npm run build --workspace=apps/server

# Production stage
FROM node:20-alpine

# Install git, curl, and GitHub CLI (pinned version for reproducible builds)
RUN apk add --no-cache git curl && \
    GH_VERSION="2.63.2" && \
    curl -L "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_amd64.tar.gz" -o gh.tar.gz && \
    tar -xzf gh.tar.gz && \
    mv "gh_${GH_VERSION}_linux_amd64/bin/gh" /usr/local/bin/gh && \
    rm -rf gh.tar.gz "gh_${GH_VERSION}_linux_amd64"

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S automaker && \
    adduser -S automaker -u 1001

# Copy built files and production dependencies
COPY --from=builder /app/apps/server/dist ./dist
COPY --from=builder /app/apps/server/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

# Create data directory
RUN mkdir -p /data && chown automaker:automaker /data

# Switch to non-root user
USER automaker

# Environment variables
ENV NODE_ENV=production
ENV PORT=3008
ENV DATA_DIR=/data

# Expose port
EXPOSE 3008

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3008/api/health || exit 1

# Start server
CMD ["node", "dist/index.js"]
