#!/usr/bin/env node
import fetch from 'node-fetch';

const API_BASE_URL = 'http://localhost:3001';

/**
 * APIの動作確認スクリプト
 */
async function testAPI() {
  console.log('🧪 Testing Coding Agent Viewer API');
  console.log('');

  try {
    // 1. ヘルスチェック
    console.log('1️⃣  Health Check...');
    const healthRes = await fetch(`${API_BASE_URL}/health`);
    const health = await healthRes.json();
    console.log('   ✅ Server is healthy');
    console.log('   Status:', health.status);
    console.log('   Uptime:', Math.floor(health.uptime), 'seconds');
    console.log('');

    // 2. プロファイル一覧
    console.log('2️⃣  Getting profiles...');
    const profilesRes = await fetch(`${API_BASE_URL}/api/profiles`);
    const profiles = await profilesRes.json();
    console.log('   ✅ Profiles:', profiles.data.profiles.map(p => p.label).join(', '));
    console.log('');

    // 3. プロジェクト一覧
    console.log('3️⃣  Getting projects...');
    const projectsRes = await fetch(`${API_BASE_URL}/api/projects`);
    const projects = await projectsRes.json();
    
    if (projects.data.length === 0) {
      console.log('   ⚠️  No projects found');
      console.log('   💡 Tip: Run an agent first to create a project');
      console.log('');
      return;
    }
    
    console.log(`   ✅ Found ${projects.data.length} project(s)`);
    const firstProject = projects.data[0];
    console.log('   First project:', firstProject.name);
    console.log('   Project ID:', firstProject.id);
    console.log('');

    // 4. セッション一覧
    console.log('4️⃣  Getting sessions for first project...');
    const sessionsRes = await fetch(
      `${API_BASE_URL}/api/tasks?project_id=${encodeURIComponent(firstProject.id)}`
    );
    const sessions = await sessionsRes.json();
    
    if (sessions.data.length === 0) {
      console.log('   ⚠️  No sessions found');
      console.log('');
    } else {
      console.log(`   ✅ Found ${sessions.data.length} session(s)`);
      const firstSession = sessions.data[0];
      console.log('   First session:', firstSession.title);
      console.log('   Session ID:', firstSession.id);
      console.log('   Status:', firstSession.status);
      console.log('');
    }

    // 5. 新しい実行（オプション - コメントアウト）
    /*
    console.log('5️⃣  Starting new execution...');
    console.log('   (This will actually start an agent - uncomment to test)');
    const executeRes = await fetch(`${API_BASE_URL}/api/task-attempts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: firstProject.id,
        prompt: 'Test prompt from API test script'
      })
    });
    const executeResult = await executeRes.json();
    console.log('   ✅ Execution started');
    console.log('   Session ID:', executeResult.data.sessionId);
    console.log('');
    */

    console.log('✅ All tests passed!');
    console.log('');
    console.log('💡 Next steps:');
    console.log('   1. Try executing an agent:');
    console.log('      curl -X POST http://localhost:3001/api/task-attempts \\');
    console.log('        -H "Content-Type: application/json" \\');
    console.log('        -d \'{"projectId":"<id>","prompt":"your prompt"}\'');
    console.log('');
    console.log('   2. Stream logs:');
    console.log('      curl -N http://localhost:3001/api/execution-processes/<session-id>/normalized-logs');
    console.log('');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('');
    console.error('Make sure the API server is running:');
    console.error('  npm run dev');
    process.exit(1);
  }
}

testAPI();
