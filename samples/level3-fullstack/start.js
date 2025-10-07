#!/usr/bin/env node
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import open from 'open';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 環境変数を読み込み
dotenv.config();

const BACKEND_PORT = process.env.BACKEND_PORT || 3001;
const FRONTEND_PORT = process.env.FRONTEND_PORT || 3000;
const FRONTEND_URL = `http://localhost:${FRONTEND_PORT}`;

console.log('');
console.log('🚀 Starting Coding Agent Viewer (Full Stack)');
console.log('');
console.log('   Backend API:  http://localhost:' + BACKEND_PORT);
console.log('   Frontend:     ' + FRONTEND_URL);
console.log('');
console.log('   Loading...');
console.log('');

let backendReady = false;
let frontendReady = false;
let browserOpened = false;

// バックエンドを起動
const backendDir = resolve(__dirname, '../../backend');
const backend = spawn('npm', ['run', 'dev'], {
  cwd: backendDir,
  env: {
    ...process.env,
    PORT: BACKEND_PORT
  },
  stdio: 'pipe',
  shell: true
});

backend.stdout.on('data', (data) => {
  const text = data.toString();
  process.stdout.write(`[Backend] ${text}`);
  
  if (!backendReady && text.includes('Server running on')) {
    backendReady = true;
    console.log('');
    console.log('✅ Backend API is ready!');
    console.log('');
    checkAndOpenBrowser();
  }
});

backend.stderr.on('data', (data) => {
  process.stderr.write(`[Backend Error] ${data.toString()}`);
});

// フロントエンドを起動
const frontendDir = resolve(__dirname, '../../frontend');
const frontend = spawn('npm', ['run', 'dev'], {
  cwd: frontendDir,
  env: {
    ...process.env,
    PORT: FRONTEND_PORT,
    VITE_API_URL: `http://localhost:${BACKEND_PORT}`
  },
  stdio: 'pipe',
  shell: true
});

frontend.stdout.on('data', (data) => {
  const text = data.toString();
  process.stdout.write(`[Frontend] ${text}`);
  
  if (!frontendReady && (text.includes('Local:') || text.includes('ready in'))) {
    frontendReady = true;
    console.log('');
    console.log('✅ Frontend is ready!');
    console.log('');
    checkAndOpenBrowser();
  }
});

frontend.stderr.on('data', (data) => {
  process.stderr.write(`[Frontend Error] ${data.toString()}`);
});

// 両方が準備できたらブラウザを開く
function checkAndOpenBrowser() {
  if (backendReady && frontendReady && !browserOpened) {
    browserOpened = true;
    console.log('');
    console.log('🎉 Full stack is ready!');
    console.log('');
    console.log('   Opening browser...');
    console.log('');
    console.log('💡 Press Ctrl+C to stop both servers');
    console.log('');
    
    // ブラウザを開く
    open(FRONTEND_URL).catch((error) => {
      console.error('Failed to open browser:', error.message);
      console.log('');
      console.log('Please open manually:', FRONTEND_URL);
      console.log('');
    });
  }
}

// グレースフルシャットダウン
function shutdown() {
  console.log('');
  console.log('🛑 Shutting down...');
  
  backend.kill('SIGTERM');
  frontend.kill('SIGTERM');
  
  setTimeout(() => {
    backend.kill('SIGKILL');
    frontend.kill('SIGKILL');
    process.exit(0);
  }, 5000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// プロセス終了時のハンドラ
backend.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.error('Backend exited with code', code);
  }
});

frontend.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.error('Frontend exited with code', code);
  }
});
