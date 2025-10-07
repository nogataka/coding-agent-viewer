#!/usr/bin/env node
import fetch from 'node-fetch';

const API_BASE_URL = 'http://localhost:3001';

/**
 * SSE (Server-Sent Events) クライアントの例
 */
async function streamLogs(sessionId) {
  console.log('📜 Streaming logs for session:', sessionId);
  console.log('   (Press Ctrl+C to stop)');
  console.log('');
  console.log('─'.repeat(80));
  console.log('');

  const url = `${API_BASE_URL}/api/execution-processes/${sessionId}/normalized-logs`;
  
  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    // SSEストリームを読み取り
    const reader = response.body;
    let buffer = '';
    let eventCount = 0;

    reader.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      
      // 最後の不完全な行はバッファに残す
      buffer = lines.pop() || '';

      let currentEvent = null;
      let currentData = null;

      for (const line of lines) {
        if (line.startsWith('event:')) {
          currentEvent = line.substring(6).trim();
        } else if (line.startsWith('data:')) {
          currentData = line.substring(5).trim();
        } else if (line === '' && currentEvent && currentData) {
          // イベント完了
          handleEvent(currentEvent, currentData);
          eventCount++;
          currentEvent = null;
          currentData = null;
        }
      }
    });

    reader.on('end', () => {
      console.log('');
      console.log('─'.repeat(80));
      console.log('✅ Stream ended');
      console.log(`   Total events: ${eventCount}`);
    });

    reader.on('error', (error) => {
      console.error('❌ Stream error:', error.message);
      process.exit(1);
    });

  } catch (error) {
    console.error('❌ Failed to connect:', error.message);
    process.exit(1);
  }
}

function handleEvent(eventType, data) {
  if (eventType === 'json_patch') {
    try {
      const patches = JSON.parse(data);
      
      for (const patch of patches) {
        if (patch.op === 'add' && patch.value?.type === 'NORMALIZED_ENTRY') {
          const entry = patch.value.content;
          displayEntry(entry);
        }
      }
    } catch (error) {
      console.error('⚠️  Failed to parse JSON patch:', error.message);
    }
  } else if (eventType === 'finished') {
    console.log('');
    console.log('─'.repeat(80));
    console.log('✅ Log stream finished');
  } else if (eventType === 'error') {
    console.error('❌ Error:', data);
  }
}

function displayEntry(entry) {
  const timestamp = entry.timestamp 
    ? new Date(entry.timestamp).toLocaleTimeString() 
    : '';
  
  if (entry.entry_type.type === 'user_message') {
    console.log(`👤 [User] ${timestamp}`);
    console.log(`   ${entry.content}`);
    console.log('');
  } else if (entry.entry_type.type === 'assistant_message') {
    console.log(`🤖 [Assistant] ${timestamp}`);
    console.log(`   ${entry.content}`);
    console.log('');
  } else if (entry.entry_type.type === 'tool_use') {
    console.log(`🔧 [Tool: ${entry.entry_type.tool_name}] ${timestamp}`);
    console.log(`   ${entry.content}`);
    console.log('');
  } else if (entry.entry_type.type === 'system_message') {
    console.log(`ℹ️  [System] ${timestamp}`);
    console.log(`   ${entry.content}`);
    console.log('');
  } else if (entry.entry_type.type === 'thinking') {
    console.log(`💭 [Thinking] ${timestamp}`);
    console.log(`   ${entry.content}`);
    console.log('');
  }
}

// CLIとして実行
if (import.meta.url === `file://${process.argv[1]}`) {
  const sessionId = process.argv[2];
  
  if (!sessionId) {
    console.error('Usage: node sse-client.js <session-id>');
    console.error('');
    console.error('Example:');
    console.error('  node sse-client.js CLAUDE_CODE:L1VzZXJz...:550e8400-e29b-41d4-a716');
    process.exit(1);
  }

  streamLogs(sessionId);
}

export { streamLogs };
