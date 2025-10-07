# syntax=docker/dockerfile:1

########################################
# Builder stage: install deps & build  #
########################################
FROM node:20-bullseye AS builder

WORKDIR /app

# Install system deps for native modules (e.g., better-sqlite3)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 build-essential && \
    rm -rf /var/lib/apt/lists/*

# Copy manifest files first to leverage Docker layer caching
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package-lock.json frontend/
COPY backend/package.json backend/package-lock.json backend/
COPY npx-cli/package.json npx-cli/package-lock.json npx-cli/

# Install dependencies for each workspace
RUN npm ci
RUN cd frontend && npm ci
RUN cd backend && npm ci

# Copy full repository contents
COPY . .

# Build backend (tsc) and frontend (Vite) bundles
RUN npm run build

# Remove dev dependencies to slim runtime artifacts
RUN npm prune --omit=dev && \
    cd frontend && npm prune --omit=dev && \
    cd ../backend && npm prune --omit=dev

########################################
# Runtime stage                        #
########################################
FROM node:20-bullseye-slim AS runner

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    BACKEND_PORT=3001 \
    PORT=3001

WORKDIR /app/backend

# Copy runtime artifacts from builder
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/node_modules ./node_modules
COPY --from=builder /app/backend/package.json ./package.json
COPY --from=builder /app/frontend/dist /app/frontend/dist
COPY --from=builder /app/shared /app/shared
COPY --from=builder /app/assets /app/assets

# Ensure data directory exists (log caches, streamed artifacts, etc.)
RUN mkdir -p /app/backend/data

EXPOSE 3001

CMD ["node", "dist/index.js"]
