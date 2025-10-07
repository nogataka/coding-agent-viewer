// Node.js v18+ 推奨
// 使い方:
//   CURSOR_BIN=/path/to/cursor-agent node repro-cursor-headless-hang.js
//   # もしくは PATH が通っていればそのまま:
//   node repro-cursor-headless-hang.js
//
// 期待挙動（バグ再現時）:
// - stdout に出力が来ても、一定時間（既定 6 秒）で child が exit/close せず、
//   親プロセスがターミナルを取り戻せない状態を検知してログに出します。
// - その後、SIGINT → SIGKILL の順に強制終了して後片付けします。

// import { spawn } from 'node:child_process';
// import process from 'node:process';

const { spawn } = require('child_process');
const process = require('process');

const BIN = process.env.CURSOR_BIN || 'cursor-agent'; // 必要に応じて 'cursor' に変更
const PROMPT =
  'Print only the word OK and then stop. Do not run long tasks.';

// Cursor CLI の典型ヘッドレス・出力オプション
// 例: cursor-agent --print --output-format=json "<PROMPT>"
const args = ['--print', '--output-format=json', PROMPT];

// タイムアウト設定（ミリ秒）
const START_TIMEOUT_MS = 10000;        // 起動しても何も起きない場合の全体タイムアウト
const AFTER_OUTPUT_GRACE_MS = 6000;    // 最初の出力を受け取ってから待つ猶予
const FORCE_KILL_GRACE_MS = 2000;      // SIGINT 後に待つ猶予

let exited = false;
let sawOutput = false;
let outputChunks = [];
let afterOutputTimer = null;

console.log(`[repro] Spawning: ${BIN} ${args.join(' ')}`);

const child = spawn(BIN, args, {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: process.env,
  shell: false,
});

const startTimer = setTimeout(() => {
  if (!exited) {
    console.error('[repro] Timeout: no exit within START_TIMEOUT_MS. Likely hang.');
    teardownWithSignals();
  }
}, START_TIMEOUT_MS);

child.stdout.on('data', (buf) => {
  const s = buf.toString();
  outputChunks.push(s);
  if (!sawOutput) {
    sawOutput = true;
    console.log('[repro] First stdout received.');
    // 最初の出力後に「自然終了」を待つ。終了しなければハングと見なす。
    afterOutputTimer = setTimeout(() => {
      if (!exited) {
        console.error('[repro] Still not exited AFTER_OUTPUT_GRACE_MS after first output. Likely hang.');
        console.error('[repro] Sending SIGINT to child...');
        try { process.kill(child.pid, 'SIGINT'); } catch {}
        // まだ生きていれば SIGKILL
        setTimeout(() => {
          if (!exited) {
            console.error('[repro] Still alive after SIGINT. Sending SIGKILL...');
            try { process.kill(child.pid, 'SIGKILL'); } catch {}
          }
        }, FORCE_KILL_GRACE_MS);
      }
    }, AFTER_OUTPUT_GRACE_MS);
  }
  process.stdout.write(`[child stdout] ${s}`);
});

child.stderr.on('data', (buf) => {
  process.stderr.write(`[child stderr] ${buf.toString()}`);
});

child.on('error', (err) => {
  console.error('[repro] Failed to start child:', err);
  cleanupAndExit(1);
});

child.on('exit', (code, signal) => {
  exited = true;
  console.log(`[repro] Child exit. code=${code} signal=${signal}`);
});

child.on('close', (code, signal) => {
  exited = true;
  console.log(`[repro] Child close. code=${code} signal=${signal}`);
  cleanupAndExit(code === 0 ? 0 : 1);
});

process.on('SIGINT', () => {
  console.warn('[repro] Caught SIGINT in parent. Forwarding to child and exiting.');
  try { process.kill(child.pid, 'SIGINT'); } catch {}
  cleanupAndExit(130);
});

function teardownWithSignals() {
  if (exited) return cleanupAndExit(0);
  try { process.kill(child.pid, 'SIGINT'); } catch {}
  setTimeout(() => {
    if (!exited) {
      try { process.kill(child.pid, 'SIGKILL'); } catch {}
    }
  }, FORCE_KILL_GRACE_MS);
}

function cleanupAndExit(code = 0) {
  clearTimeout(startTimer);
  if (afterOutputTimer) clearTimeout(afterOutputTimer);
  // 収集した出力の最後をまとめて表示（検証用）
  if (outputChunks.length) {
    const all = outputChunks.join('');
    console.log('\n[repro] --- Captured stdout (tail) ---');
    console.log(all.slice(-2000)); // 末尾だけ
    console.log('[repro] --------------------------------');
  }
  // 少し待ってから終了（ログフラッシュ）
  setTimeout(() => process.exit(code), 50);
}
