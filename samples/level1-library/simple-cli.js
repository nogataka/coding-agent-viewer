#!/usr/bin/env node
import { LogSourceFactory } from '@nogataka/coding-agent-viewer-sdk/services/logs';
import { ExecutionService, getProfiles } from '@nogataka/coding-agent-viewer-sdk/services/execution';
import { activeExecutionRegistry } from '@nogataka/coding-agent-viewer-sdk/services/execution/activeExecutionRegistry';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { readFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';

/**
 * シンプルなマルチエージェントCLI
 * ccresume-codexを参考に作成
 */

const capitalize = (value) =>
  value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);

const toExecutorType = (label) => label.toUpperCase().replace(/-/g, '_');

const toDisplayName = (label) =>
  label
    .split('-')
    .map((segment) => capitalize(segment))
    .join(' ');

class AgentCLI {
  constructor() {
    this.factory = new LogSourceFactory();
    this.executor = new ExecutionService();
    this.profileCatalog = getProfiles().map((definition) => ({
      label: definition.label,
      executorType: toExecutorType(definition.label),
      displayName: toDisplayName(definition.label),
      variants: definition.variants?.map((variant) => variant.label) ?? []
    }));
    this.profileByExecutor = new Map();
    this.profileByLabel = new Map();
    this.profileCatalog.forEach((profile) => {
      this.profileByExecutor.set(profile.executorType, profile);
      this.profileByLabel.set(profile.label, profile);
    });
    this.projectCache = new Map();
    this.currentProfile = null;
    this.currentProjectList = [];
    this.currentProject = null;
  }

  // メイン画面
  async start() {
    console.clear();
    this.printHeader();

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: '📂 Browse Projects', value: 'browse' },
          { name: '🚀 Quick Execute', value: 'execute' },
          { name: '📊 View Active Sessions', value: 'active' },
          { name: '❌ Exit', value: 'exit' }
        ]
      }
    ]);

    switch (action) {
      case 'browse':
        await this.browseProjects();
        break;
      case 'execute':
        await this.quickExecute();
        break;
      case 'active':
        await this.viewActiveSessions();
        break;
      case 'exit':
        console.log(chalk.blue('\n👋 Goodbye!\n'));
        process.exit(0);
    }
  }

  // プロジェクトブラウザ
  async browseProjects() {
    const profileChoices = this.profileCatalog.map((profile) => ({
      name: `${this.getProfileIcon(profile.executorType)} ${profile.displayName}`,
      value: profile
    }));

    profileChoices.push({ name: chalk.gray('← Back'), value: null });

    const { selectedProfile } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedProfile',
        message: 'Select agent profile:',
        choices: profileChoices,
        pageSize: 15
      }
    ]);

    if (!selectedProfile) {
      return this.start();
    }

    try {
      const projects = await this.loadProjectsForProfile(selectedProfile);

      if (projects.length === 0) {
        console.log(chalk.yellow(`\n⚠️  No projects found for ${selectedProfile.displayName}`));
        await this.pressAnyKey();
        return this.start();
      }

      this.currentProfile = selectedProfile;
      await this.selectProject(projects, selectedProfile);
    } catch (error) {
      console.error(chalk.red(`\n❌ Error: ${error.message}\n`));
      await this.pressAnyKey();
      return this.start();
    }
  }

  async loadProjectsForProfile(profileMeta, { forceRefresh = false } = {}) {
    if (!forceRefresh && this.projectCache.has(profileMeta.executorType)) {
      return this.projectCache.get(profileMeta.executorType);
    }

    const spinner = ora(`Loading projects for ${profileMeta.displayName}...`).start();
    try {
      const projects = await this.factory.getAllProjects(profileMeta.executorType);
      spinner.stop();
      this.projectCache.set(profileMeta.executorType, projects);
      return projects;
    } catch (error) {
      spinner.stop();
      throw error;
    }
  }

  // プロジェクト選択
  async selectProject(projects, profileMeta) {
    this.currentProjectList = projects;
    const projectChoices = projects.map(p => ({
      name: this.formatProjectName(p),
      value: p,
      short: p.name
    }));

    projectChoices.push({ name: chalk.gray('← Back'), value: 'back' });

    const { selectedProject } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedProject',
        message: `Projects (${profileMeta.displayName}):`,
        choices: projectChoices,
        pageSize: 15
      }
    ]);

    if (selectedProject === 'back') {
      this.currentProfile = null;
      this.currentProjectList = [];
      return this.browseProjects();
    }

    this.currentProject = selectedProject;
    await this.viewProject(selectedProject, projects, profileMeta);
  }

  // プロジェクト詳細
  async viewProject(project, projectList, profileMeta) {
    const spinner = ora('Loading sessions...').start();

    try {
      const sessions = await this.factory.getSessionsForProject(project.id);
      spinner.stop();

      console.log(chalk.blue(`\n📂 ${project.name}`));
      console.log(chalk.gray(`   Profile: ${profileMeta.displayName}`));
      console.log(chalk.gray(`   ID: ${project.id}`));
      console.log(chalk.gray(`   Sessions: ${sessions.length}`));
      console.log();

      if (sessions.length === 0) {
        console.log(chalk.yellow('   No sessions found'));
        await this.pressAnyKey();
        return this.selectProject(projectList, profileMeta);
      }

      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices: [
            { name: '📋 View Sessions', value: 'sessions' },
            { name: '🚀 Start New Session', value: 'new' },
            { name: '← Back', value: 'back' }
          ]
        }
      ]);

      switch (action) {
        case 'sessions':
          await this.selectSession(sessions, projectList, profileMeta);
          break;
        case 'new':
          await this.startNewSession(project, profileMeta);
          break;
        case 'back':
          this.currentProject = null;
          return this.selectProject(projectList, profileMeta);
      }

    } catch (error) {
      spinner.stop();
      console.error(chalk.red(`\n❌ Error: ${error.message}\n`));
      await this.pressAnyKey();
      return this.selectProject(projectList, profileMeta);
    }
  }

  // 新しいセッション開始（既存プロジェクト）
  async startNewSession(project, profileMeta) {
    const { prompt } = await inquirer.prompt([
      {
        type: 'input',
        name: 'prompt',
        message: 'Enter your prompt:',
        validate: (input) => input.trim().length > 0 || 'Prompt cannot be empty'
      }
    ]);

    const spinner = ora('Starting new session...').start();

    try {
      // プロジェクトIDからexecutorTypeとworkspacePathを取得
      const [executorType, actualProjectId] = project.id.split(':');
      const profileLabel = profileMeta?.label ?? this.getProfileLabelFromExecutorType(executorType);
      const decodedProjectKey = this.decodeBase64url(actualProjectId);
      const workspacePath = project.git_repo_path
        ? project.git_repo_path
        : this.toWorkspacePath(decodedProjectKey);

      const result = await this.executor.startNewChat({
        profileLabel,
        executorType,
        projectId: project.id,
        actualProjectId,
        workspacePath,
        prompt
      });

      spinner.succeed('Session started!');
      console.log(chalk.green(`\n   Session ID: ${result.sessionId}`));
      console.log(chalk.gray(`   Process ID: ${result.processId}`));
      console.log();

      const { viewLogs } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'viewLogs',
          message: 'View logs now?',
          default: true
        }
      ]);

      if (viewLogs) {
        // セッション情報を構築
        const session = {
          id: result.sessionId,
          projectId: project.id,
          title: prompt.substring(0, 100),
          status: 'running',
          createdAt: result.startedAt,
          updatedAt: result.startedAt,
          workspacePath
        };
        await this.streamLogs(session);
      } else {
        return this.viewProject(project, this.currentProjectList, profileMeta ?? this.currentProfile);
      }

    } catch (error) {
      spinner.fail('Failed to start session');
      console.error(chalk.red(`   ${error.message}`));
      await this.pressAnyKey();
      return this.viewProject(project, this.currentProjectList, profileMeta ?? this.currentProfile);
    }
  }

  // セッション選択
  async selectSession(sessions, projectList, profileMeta) {
    const sessionChoices = sessions.slice(0, 50).map(s => ({
      name: this.formatSessionName(s),
      value: s,
      short: s.title
    }));

    sessionChoices.push({ name: chalk.gray('← Back'), value: 'back' });

    const { selectedSession } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedSession',
        message: 'Select session:',
        choices: sessionChoices,
        pageSize: 15
      }
    ]);

    if (selectedSession === 'back') {
      return this.viewProject(this.currentProject, projectList ?? this.currentProjectList, profileMeta ?? this.currentProfile);
    }

    await this.viewSession(selectedSession, projectList ?? this.currentProjectList, profileMeta ?? this.currentProfile);
  }

  // セッション詳細表示
  async viewSession(session, projectList = this.currentProjectList, profileMeta = this.currentProfile) {
    console.log(chalk.blue(`\n📝 ${session.title}`));
    console.log(chalk.gray(`   ID: ${session.id}`));
    console.log(chalk.gray(`   Status: ${this.getStatusIcon(session.status)} ${session.status}`));
    console.log(chalk.gray(`   Created: ${new Date(session.createdAt).toLocaleString()}`));
    console.log(chalk.gray(`   Updated: ${new Date(session.updatedAt).toLocaleString()}`));
    console.log();

    const choices = [
      { name: '📜 View Logs', value: 'logs' },
      { name: '💬 Send Follow-up', value: 'followup' }
    ];

    if (session.status === 'running') {
      choices.push({ name: '⏹️  Stop Execution', value: 'stop' });
    }

    choices.push({ name: '← Back', value: 'back' });

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices
      }
    ]);

    switch (action) {
      case 'logs':
        await this.streamLogs(session);
        break;
      case 'followup':
        await this.sendFollowup(session);
        break;
      case 'stop':
        await this.stopSession(session);
        break;
      case 'back':
        // セッション一覧に戻る
        const sessions = await this.factory.getSessionsForProject(this.currentProject.id);
        return this.selectSession(sessions, projectList, profileMeta);
    }
  }

  // ログストリーミング
  async streamLogs(session) {
    console.log(chalk.blue('\n📜 Streaming logs...'));
    console.log(chalk.gray('   (Press Ctrl+C to stop)\n'));
    console.log('─'.repeat(80));
    console.log();

    try {
      const stream = await this.waitForSessionStream(session);

      if (!stream) {
        console.log(chalk.red('❌ Failed to get log stream'));
        await this.pressAnyKey();
        return this.viewSession(session);
      }

      let entryCount = 0;

      stream.on('data', (chunk) => {
        const text = chunk.toString();
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

        if (eventType === 'json_patch' && data) {
          try {
            const patches = JSON.parse(data);
            for (const patch of patches) {
              if (patch.op === 'add' && patch.value?.type === 'NORMALIZED_ENTRY') {
                entryCount++;
                this.displayLogEntry(patch.value.content);
              }
            }
          } catch (e) {
            // パースエラーは無視
          }
        } else if (eventType === 'finished') {
          console.log();
          console.log('─'.repeat(80));
          console.log(chalk.green(`✅ Stream finished (${entryCount} entries)`));
          stream.destroy();
        }
      });

      stream.on('end', async () => {
        await this.pressAnyKey();
        return this.viewSession(session);
      });

      stream.on('error', async (error) => {
        console.error(chalk.red(`\n❌ Stream error: ${error.message}`));
        await this.pressAnyKey();
        return this.viewSession(session);
      });

    } catch (error) {
      console.error(chalk.red(`\n❌ Error: ${error.message}`));
      await this.pressAnyKey();
      return this.viewSession(session);
    }
  }

  async waitForSessionStream(session) {
    const maxAttempts = 20;
    const delayMs = 500;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const stream = await this.factory.getSessionStream(session.id);
      if (stream) {
        return stream;
      }

      try {
        const [executorType] = session.id.split(':');
        const profileMeta = this.profileByExecutor.get(executorType);
        await this.factory.getAllProjects(profileMeta?.executorType);
      } catch (error) {
        console.warn('⚠️  Refresh projects failed:', error.message);
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    return null;
  }

  // フォローアップ送信
  async sendFollowup(session) {
    const { message } = await inquirer.prompt([
      {
        type: 'input',
        name: 'message',
        message: 'Enter follow-up message:',
        validate: (input) => input.trim().length > 0 || 'Message cannot be empty'
      }
    ]);

    const spinner = ora('Sending follow-up...').start();

    try {
      // セッションIDをパース
      const [executorType, actualProjectId, ...rest] = session.id.split(':');
      const profileLabel = this.getProfileLabelFromExecutorType(executorType);
      const decodedProjectKey = this.decodeBase64url(actualProjectId);
      const workspacePath = session.workspacePath
        ? session.workspacePath
        : this.toWorkspacePath(decodedProjectKey);

      const result = await this.executor.sendFollowUp({
        profileLabel,
        executorType,
        projectId: session.projectId,
        actualProjectId,
        workspacePath,
        sessionId: session.id,
        message
      });

      spinner.succeed('Follow-up sent!');
      console.log(chalk.green(`   Session ID: ${result.sessionId}`));
      
      await this.pressAnyKey();
      return this.viewSession(session);

    } catch (error) {
      spinner.fail('Failed to send follow-up');
      console.error(chalk.red(`   ${error.message}`));
      await this.pressAnyKey();
      return this.viewSession(session);
    }
  }

  // セッション停止
  async stopSession(session) {
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Are you sure you want to stop this session?',
        default: false
      }
    ]);

    if (!confirm) {
      return this.viewSession(session);
    }

    const spinner = ora('Stopping session...').start();

    try {
      const stopped = this.executor.stopExecution(session.id);
      
      if (stopped) {
        spinner.succeed('Session stopped');
      } else {
        spinner.warn('Session not found or already stopped');
      }

      await this.pressAnyKey();
      return this.viewSession(session);

    } catch (error) {
      spinner.fail('Failed to stop session');
      console.error(chalk.red(`   ${error.message}`));
      await this.pressAnyKey();
      return this.viewSession(session);
    }
  }

  // クイック実行
  async quickExecute() {
    const profileChoices = this.profileCatalog.map((profile) => ({
      name: `${this.getProfileIcon(profile.executorType)} ${profile.displayName}`,
      value: profile
    }));

    const { profile } = await inquirer.prompt([
      {
        type: 'list',
        name: 'profile',
        message: 'Select agent profile:',
        choices: profileChoices
      }
    ]);

    let selectedVariant = null;
    if (profile.variants.length > 0) {
      const { variant } = await inquirer.prompt([
        {
          type: 'list',
          name: 'variant',
          message: 'Select profile variant:',
          choices: [
            { name: 'Default', value: null },
            ...profile.variants.map((variantLabel) => ({ name: variantLabel, value: variantLabel }))
          ]
        }
      ]);
      selectedVariant = variant;
    }

    const { workspace } = await inquirer.prompt([
      {
        type: 'input',
        name: 'workspace',
        message: 'Workspace path:',
        default: process.cwd(),
        validate: (input) => input.trim().length > 0 || 'Path cannot be empty'
      }
    ]);

    const { prompt } = await inquirer.prompt([
      {
        type: 'input',
        name: 'prompt',
        message: 'Enter your prompt:',
        validate: (input) => input.trim().length > 0 || 'Prompt cannot be empty'
      }
    ]);

    const spinner = ora('Starting execution...').start();

    try {
      const actualProjectId = Buffer.from(workspace).toString('base64url');
      const projectId = `${profile.executorType}:${actualProjectId}`;

      const result = await this.executor.startNewChat({
        profileLabel: profile.label,
        executorType: profile.executorType,
        projectId,
        actualProjectId,
        workspacePath: workspace,
        prompt,
        ...(selectedVariant ? { variantLabel: selectedVariant } : {})
      });

      spinner.succeed('Execution started!');
      console.log(chalk.green(`\n   Session ID: ${result.sessionId}`));
      console.log(chalk.gray(`   Process ID: ${result.processId}`));
      console.log();

      const { viewLogs } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'viewLogs',
          message: 'View logs now?',
          default: true
        }
      ]);

      if (viewLogs) {
        // セッション情報を構築
        const session = {
          id: result.sessionId,
          projectId,
          title: prompt.substring(0, 100),
          status: 'running',
          createdAt: result.startedAt,
          updatedAt: result.startedAt,
          workspacePath: workspace
        };
        await this.streamLogs(session);
      } else {
        await this.start();
      }

    } catch (error) {
      spinner.fail('Execution failed');
      console.error(chalk.red(`   ${error.message}`));
      await this.pressAnyKey();
      return this.start();
    }
  }

  // アクティブセッション表示
  async viewActiveSessions() {
    console.log(chalk.blue('\n📊 Active Sessions\n'));

    // アクティブなセッションを探す
    const spinner = ora('Checking active sessions...').start();
    
    try {
      const activeSessions = [];
      for (const profile of this.profileCatalog) {
        let projects = [];
        try {
          projects = await this.factory.getAllProjects(profile.executorType);
        } catch (error) {
          console.warn(`⚠️  Failed to fetch projects for ${profile.displayName}:`, error.message);
          continue;
        }

        for (const project of projects) {
          const sessions = await this.factory.getSessionsForProject(project.id);
          const active = sessions.filter((s) => s.status === 'running');
          activeSessions.push(...active.map((s) => ({ ...s, project, profile })));
        }
      }

      spinner.stop();

      if (activeSessions.length === 0) {
        console.log(chalk.yellow('   No active sessions\n'));
        await this.pressAnyKey();
        return this.start();
      }

      console.log(chalk.green(`   Found ${activeSessions.length} active session(s)\n`));

      activeSessions.forEach((s, i) => {
        console.log(`${i + 1}. ${chalk.blue(s.title)}`);
        console.log(`   Profile: ${s.profile?.displayName ?? this.getProfileLabelFromExecutorType(s.project.id.split(':')[0])}`);
        console.log(`   Project: ${s.project.name}`);
        console.log(`   Started: ${new Date(s.createdAt).toLocaleString()}`);
        console.log();
      });

      await this.pressAnyKey();
      return this.start();

    } catch (error) {
      spinner.stop();
      console.error(chalk.red(`\n❌ Error: ${error.message}\n`));
      await this.pressAnyKey();
      return this.start();
    }
  }

  // ヘルパーメソッド
  printHeader() {
    console.log(chalk.blue.bold('\n🤖 Coding Agent Viewer CLI\n'));
  }

  getProfileIcon(profile) {
    const icons = {
      'CLAUDE_CODE': '🎨',
      'CURSOR': '🖱️',
      'GEMINI': '💎',
      'CODEX': '📦',
      'OPENCODE': '🔓'
    };
    return icons[profile] || '🤖';
  }

  getStatusIcon(status) {
    const icons = {
      'running': '🟢',
      'completed': '✅',
      'failed': '❌'
    };
    return icons[status] || '⚪';
  }

  toWorkspacePath(candidate) {
    if (typeof candidate !== 'string' || candidate.length === 0) {
      return candidate;
    }

    if (candidate.startsWith('/')) {
      return candidate;
    }

    if (!candidate.startsWith('-')) {
      return candidate;
    }

    const normalized = candidate.replace(/^-/, '').replace(/-$/, '').replace(/-/g, '/');
    return normalized.startsWith('/') ? normalized : `/${normalized}`;
  }

  formatProjectName(project) {
    const updated = new Date(project.updated_at).toLocaleString();
    return `${chalk.bold(project.name)} ${chalk.gray(`(${updated})`)}`;
  }

  formatSessionName(session) {
    const status = this.getStatusIcon(session.status);
    const title = session.title.substring(0, 80) + (session.title.length > 80 ? '...' : '');
    const updated = new Date(session.updatedAt).toLocaleDateString();
    return `${status} ${chalk.bold(title)} ${chalk.gray(`(${updated})`)}`;
  }

  displayLogEntry(entry) {
    const type = entry.entry_type.type;

    if (type === 'user_message') {
      console.log(chalk.cyan('👤 User:'));
      console.log(`   ${entry.content}\n`);
    } else if (type === 'assistant_message') {
      console.log(chalk.green('🤖 Assistant:'));
      console.log(`   ${entry.content}\n`);
    } else if (type === 'tool_use') {
      console.log(chalk.yellow(`🔧 Tool: ${entry.entry_type.tool_name}`));
      console.log(chalk.gray(`   ${entry.content}\n`));
    } else if (type === 'system_message') {
      console.log(chalk.blue('ℹ️  System:'));
      console.log(chalk.gray(`   ${entry.content}\n`));
    } else if (type === 'thinking') {
      console.log(chalk.magenta('💭 Thinking:'));
      console.log(chalk.gray(`   ${entry.content}\n`));
    }
  }

  getProfileLabelFromExecutorType(executorType) {
    return this.profileByExecutor.get(executorType)?.label ?? executorType.toLowerCase();
  }

  decodeBase64url(encoded) {
    try {
      return Buffer.from(encoded, 'base64url').toString('utf-8');
    } catch {
      return encoded;
    }
  }

  async pressAnyKey() {
    await inquirer.prompt([
      {
        type: 'input',
        name: 'continue',
        message: 'Press Enter to continue...'
      }
    ]);
  }
}

// メイン実行
const cli = new AgentCLI();
cli.start().catch(error => {
  console.error(chalk.red(`\n❌ Fatal error: ${error.message}\n`));
  process.exit(1);
});
