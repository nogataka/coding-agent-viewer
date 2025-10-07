#!/usr/bin/env node
import { LogSourceFactory } from '../../../backend/services/src/logs/logSourceFactory.js';

/**
 * セッションのログをストリーミング表示
 */
async function streamLogs(sessionId, options = {}) {
  const {
    format = 'pretty',
    raw = false
  } = options;

  console.log('📜 Streaming logs for session:', sessionId);
  console.log('   (Press Ctrl+C to stop)');
  console.log();
  console.log('─'.repeat(80));
  console.log();

  const factory = new LogSourceFactory();

  try {
    // ログストリームを取得
    const stream = await factory.getSessionStream(sessionId);

    if (!stream) {
      console.error('❌ Session not found or logs unavailable');
      process.exit(1);
    }

    let eventCount = 0;

    stream.on('data', (chunk) => {
      const text = chunk.toString();

      if (raw) {
        // 生のSSEイベントを表示
        process.stdout.write(text);
        return;
      }

      // SSEイベントをパース
      const lines = text.split('\n');
      let eventType = null;
      let data = null;

      for (const line of lines) {
        if (line.startsWith('event:')) {
          eventType = line.substring(6).trim();
        } else if (line.startsWith('data:')) {
          data = line.substring(5).trim();
        }
      }

      if (eventType && data) {
        eventCount++;

        if (eventType === 'json_patch') {
          try {
            const patches = JSON.parse(data);
            
            for (const patch of patches) {
              if (patch.op === 'add' && patch.value?.type === 'NORMALIZED_ENTRY') {
                const entry = patch.value.content;
                displayEntry(entry, format);
              }
            }
          } catch (error) {
            console.error('⚠️  Failed to parse JSON patch:', error.message);
          }
        } else if (eventType === 'finished') {
          console.log();
          console.log('─'.repeat(80));
          console.log('✅ Log stream finished');
          console.log(`   Total events: ${eventCount}`);
        } else if (eventType === 'error') {
          console.error('❌ Error:', data);
        }
      }
    });

    stream.on('end', () => {
      console.log();
      console.log('Stream ended');
    });

    stream.on('error', (error) => {
      console.error('❌ Stream error:', error.message);
      process.exit(1);
    });

  } catch (error) {
    console.error('❌ Failed to stream logs:', error.message);
    throw error;
  }
}

/**
 * エントリを整形して表示
 */
function displayEntry(entry, format) {
  const timestamp = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : '';
  
  if (format === 'pretty') {
    // 見やすい形式で表示
    if (entry.entry_type.type === 'user_message') {
      console.log(`👤 [User] ${timestamp}`);
      console.log(`   ${entry.content}`);
      console.log();
    } else if (entry.entry_type.type === 'assistant_message') {
      console.log(`🤖 [Assistant] ${timestamp}`);
      console.log(`   ${entry.content}`);
      console.log();
    } else if (entry.entry_type.type === 'tool_use') {
      console.log(`🔧 [Tool: ${entry.entry_type.tool_name}] ${timestamp}`);
      console.log(`   ${entry.content}`);
      console.log();
    } else if (entry.entry_type.type === 'system_message') {
      console.log(`ℹ️  [System] ${timestamp}`);
      console.log(`   ${entry.content}`);
      console.log();
    } else if (entry.entry_type.type === 'thinking') {
      console.log(`💭 [Thinking] ${timestamp}`);
      console.log(`   ${entry.content}`);
      console.log();
    }
  } else {
    // シンプルな形式
    console.log(`[${entry.entry_type.type}] ${entry.content}`);
  }
}

// CLIとして実行された場合
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: node stream-logs.js <session-id> [--format <pretty|simple>] [--raw]');
    console.error();
    console.error('Example:');
    console.error('  node stream-logs.js CLAUDE_CODE:L1VzZXJz...:550e8400-e29b-41d4-a716');
    process.exit(1);
  }

  const sessionId = args[0];
  let format = 'pretty';
  let raw = false;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--format' || args[i] === '-f') {
      format = args[++i];
    } else if (args[i] === '--raw') {
      raw = true;
    }
  }

  streamLogs(sessionId, { format, raw })
    .catch(error => {
      process.exit(1);
    });
}

export { streamLogs };
