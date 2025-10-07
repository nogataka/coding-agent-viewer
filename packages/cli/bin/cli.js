#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const runtimeRoot = path.join(__dirname, '..', 'dist', 'runtime');
const backendDir = path.join(runtimeRoot, 'backend');
const backendEntry = path.join(backendDir, 'dist', 'index.js');
const frontendDir = path.join(runtimeRoot, 'frontend', 'dist');

if (!fs.existsSync(backendEntry)) {
  console.error('❌ Backend build not found. Run "npm run build:cli" before publishing.');
  process.exit(1);
}

if (!fs.existsSync(frontendDir)) {
  console.error('❌ Frontend build not found. Run "npm run build:cli" before publishing.');
  process.exit(1);
}

const env = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV || 'production',
  BACKEND_PORT: process.env.BACKEND_PORT || '5555',
  CODING_AGENT_RUNTIME_DIR: backendDir,
  CODING_AGENT_FRONTEND_DIR: frontendDir,
  CODING_AGENT_ASSETS_DIR: path.join(backendDir, 'assets'),
  CODING_AGENT_USER_CWD: process.cwd(),
};

console.log('🚀 Launching coding-agent-viewer (Node runtime)...');
console.log(`   Backend: http://localhost:${env.BACKEND_PORT}/api/health`);
console.log('   Frontend assets served via backend');

const server = spawn(process.execPath, [backendEntry], {
  cwd: backendDir,
  stdio: 'inherit',
  env,
});

server.on('exit', (code, signal) => {
  if (signal) {
    console.log(`⚠️  Server exited due to signal ${signal}`);
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

const handleShutdown = (signal) => {
  console.log(`\n🛑 Received ${signal}, shutting down...`);
  server.kill(signal);
};

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
