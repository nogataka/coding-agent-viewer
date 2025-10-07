#!/bin/bash

set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")" && pwd)
RUNTIME_DIR="$ROOT_DIR/npx-cli/dist/runtime"
BACKEND_RUNTIME="$RUNTIME_DIR/backend"
FRONTEND_RUNTIME="$RUNTIME_DIR/frontend"

echo "🧹 Cleaning previous builds..."
rm -rf "$ROOT_DIR/npx-cli/dist"
mkdir -p "$BACKEND_RUNTIME" "$FRONTEND_RUNTIME"

echo "🔨 Building backend (TypeScript)..."
(
  cd "$ROOT_DIR/backend"
  npm run build
)

echo "🔨 Building frontend (Vite)..."
(
  cd "$ROOT_DIR/frontend"
  npm run build
)

echo "📦 Copying runtime artifacts..."
# Backend dist
mkdir -p "$BACKEND_RUNTIME/dist"
cp -R "$ROOT_DIR/backend/dist/"* "$BACKEND_RUNTIME/dist"

# Shared assets (config templates, sounds, etc.)
if [ -d "$ROOT_DIR/assets" ]; then
  mkdir -p "$BACKEND_RUNTIME/assets"
  cp -R "$ROOT_DIR/assets/"* "$BACKEND_RUNTIME/assets" 2>/dev/null || true
fi

# My Coding Agent CLI bundle
# Frontend production bundle
mkdir -p "$FRONTEND_RUNTIME/dist"
cp -R "$ROOT_DIR/frontend/dist/"* "$FRONTEND_RUNTIME/dist"

echo "✅ Runtime prepared under npx-cli/dist/runtime"
