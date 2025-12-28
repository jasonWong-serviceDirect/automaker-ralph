# Automaker UI
# Multi-stage build for minimal production image

# Build stage
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files for all workspaces
COPY package*.json ./
COPY apps/ui/package*.json ./apps/ui/
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
COPY apps/ui ./apps/ui

# Build packages in dependency order, then build UI
# VITE_SERVER_URL tells the UI where to find the API server
# Using localhost:3008 since both containers expose ports to the host
# Use ARG to allow overriding at build time: --build-arg VITE_SERVER_URL=http://api.example.com
ARG VITE_SERVER_URL=http://localhost:3008
ENV VITE_SKIP_ELECTRON=true
ENV VITE_SERVER_URL=${VITE_SERVER_URL}
RUN npm run build:packages && npm run build --workspace=apps/ui

# Production stage - serve with nginx
FROM nginx:alpine

# Copy built files
COPY --from=builder /app/apps/ui/dist /usr/share/nginx/html

# Copy nginx config for SPA routing
COPY apps/ui/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
