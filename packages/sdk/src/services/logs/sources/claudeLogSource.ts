import { BaseExecutorLogSource } from './baseExecutorLogSource.js';
import { ProjectInfo, SessionInfo } from '../logSourceStrategy.js';
import { Readable } from 'stream';
import type { NormalizedEntry, ActionType, FileChange } from '../executors/types.js';
import { ToolResultValueType, CommandExitStatusType } from '../executors/types.js';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';

/**
 * Claude Code用ログソース
 * セッションファイル: ~/.claude/projects/{worktree-path}/{sessionId}.jsonl
 */
export class ClaudeLogSource extends BaseExecutorLogSource {
  // Claude Projectsのベースディレクトリ
  private readonly CLAUDE_PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
  private reportedModel = false;
  private toolEntryMap: Map<string, { index: number; entry: NormalizedEntry }> = new Map();
  private workspacePathCache: Map<string, string | null> = new Map();

  getName(): string {
    return 'CLAUDE_CODE';
  }

  protected async resolveSessionFilePath(
    executionId: string,
    sessionId: string,
    workingDir: string
  ): Promise<string | null> {
    if (!sessionId || !workingDir) return null;

    // worktreeパスをClaudeのディレクトリ名に変換
    // 例: /Users/user/dev/project → -Users-user-dev-project-
    const worktreePath = this.transformWorktreePath(workingDir);

    // ~/.claude/projects/{worktree-path}/{sessionId}.jsonl
    const filePath = path.join(this.CLAUDE_PROJECTS_DIR, worktreePath, `${sessionId}.jsonl`);

    return filePath;
  }

  protected parseSessionLine(line: string): any {
    // Claude/CursorのJSONL形式をパース
    const data = JSON.parse(line);

    // Claude固有の形式から正規化エントリに変換
    // 例: { role: 'user', content: '...' } など
    return data;
  }

  /**
   * worktreeパスをClaudeのディレクトリ名に変換
   * 例: /Users/user/project → -Users-user-project-
   */
  private transformWorktreePath(workingDir: string): string {
    return workingDir.replace(/\//g, '-');
  }

  /**
   * Claudeのディレクトリ名を読みやすいパスに変換
   * 例: -Users-user-project- → /Users/user/project
   */
  private transformToReadable(dirName: string): string {
    // 先頭と末尾の - を削除し、- を / に置換
    const replaced = dirName.replace(/^-/, '').replace(/-$/, '').replace(/-/g, '/');
    return replaced.startsWith('/') ? replaced : `/${replaced}`;
  }

  /**
   * パスをbase64エンコードしてプロジェクトIDを生成
   */
  private pathToId(dirPath: string): string {
    return Buffer.from(dirPath).toString('base64url');
  }

  /**
   * プロジェクトIDからパスをデコード
   */
  private idToPath(id: string): string {
    try {
      return Buffer.from(id, 'base64url').toString('utf-8');
    } catch {
      return id; // デコードに失敗した場合はそのまま返す
    }
  }

  /**
   * プロジェクト一覧を取得
   */
  async getProjectList(): Promise<ProjectInfo[]> {
    try {
      // ~/.claude/projects/ ディレクトリを読み取り
      const entries = await fs.readdir(this.CLAUDE_PROJECTS_DIR, { withFileTypes: true });

      const projects: ProjectInfo[] = [];

      for (const entry of entries) {
        // ディレクトリのみを対象
        if (!entry.isDirectory()) continue;

        // .DS_Storeなどのシステムファイルを除外
        if (entry.name.startsWith('.')) continue;

        // -で始まるディレクトリのみ（Claudeのworktreeディレクトリ）
        if (!entry.name.startsWith('-')) continue;

        const dirPath = path.join(this.CLAUDE_PROJECTS_DIR, entry.name);
        const stats = await fs.stat(dirPath);
        const workspacePath = await this.resolveWorkspacePathHint(entry.name);
        const readablePath = workspacePath ?? this.transformToReadable(entry.name);
        const projectIdSource = workspacePath ?? entry.name;

        projects.push({
          id: this.pathToId(projectIdSource),
          name: readablePath,
          git_repo_path: readablePath,
          created_at: stats.birthtime,
          updated_at: stats.mtime
        });
      }

      return projects.sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime());
    } catch (error) {
      console.error(`[ClaudeLogSource] Error reading projects:`, error);
      return [];
    }
  }

  /**
   * 指定プロジェクトのセッション一覧を取得
   */
  async getSessionList(projectId: string): Promise<SessionInfo[]> {
    try {
      // プロジェクトIDからディレクトリ名を取得
      const dirName = this.idToPath(projectId);

      const slugCandidates = new Set<string>();

      if (dirName.startsWith('-')) {
        slugCandidates.add(dirName);
      }

      if (dirName) {
        slugCandidates.add(this.transformWorktreePath(dirName));
        try {
          const real = await fs.realpath(dirName);
          slugCandidates.add(this.transformWorktreePath(real));
        } catch {
          // ignore realpath errors
        }
      }

      let projectDir: string | null = null;
      let projectSlug: string | null = null;
      for (const slug of slugCandidates) {
        const candidate = path.join(this.CLAUDE_PROJECTS_DIR, slug);
        try {
          await fs.access(candidate);
          projectDir = candidate;
          projectSlug = slug;
          break;
        } catch {
          continue;
        }
      }

      if (!projectDir) {
        console.warn(`[ClaudeLogSource] Project directory not found for ${dirName}`);
        return [];
      }

      // .jsonlファイルを取得
      const entries = await fs.readdir(projectDir, { withFileTypes: true });
      const sessions: SessionInfo[] = [];

      const resolvedWorkspace = await this.resolveWorkspacePathHint(projectSlug ?? dirName);

      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;

        const filePath = path.join(projectDir, entry.name);
        const stats = await fs.stat(filePath);
        const sessionId = path.basename(entry.name, '.jsonl');

        // ファイルのステータスを判定（簡易版）
        // 実際には最終行を読んでfinishedイベントがあるか確認する必要がある
        const status: 'running' | 'completed' | 'failed' = 'completed';

        // 最初のユーザーメッセージを取得（オプショナル・パフォーマンス考慮）
        let firstUserMessage: string | undefined;
        let workspacePathFromLog: string | undefined;
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const lines = content.split('\n').filter((l) => l.trim());
          for (const line of lines) {
            try {
              const parsed = JSON.parse(line);

              if (!workspacePathFromLog) {
                const candidate =
                  (typeof parsed.cwd === 'string' &&
                    parsed.cwd.trim().length > 0 &&
                    parsed.cwd.trim()) ||
                  (typeof parsed.message?.cwd === 'string' &&
                    parsed.message.cwd.trim().length > 0 &&
                    parsed.message.cwd.trim()) ||
                  null;

                if (candidate) {
                  workspacePathFromLog = candidate;
                }
              }

              const role =
                (typeof parsed.role === 'string' && parsed.role) ||
                (typeof parsed.type === 'string' && parsed.type) ||
                (typeof parsed.message?.role === 'string' && parsed.message.role) ||
                (typeof parsed.message?.type === 'string' && parsed.message.type) ||
                '';

              if (role.toLowerCase() !== 'user') {
                continue;
              }

              let rawMessage = '';
              const messageContent = parsed.message?.content ?? parsed.content;

              if (typeof messageContent === 'string') {
                rawMessage = messageContent;
              } else if (Array.isArray(messageContent)) {
                rawMessage = messageContent
                  .map((part: any) => {
                    if (!part) return '';
                    if (typeof part === 'string') {
                      return part;
                    }
                    if (typeof part.text === 'string') {
                      return part.text;
                    }
                    if (typeof part.content === 'string') {
                      return part.content;
                    }
                    return '';
                  })
                  .filter(Boolean)
                  .join(' ');
              } else if (messageContent && typeof messageContent === 'object') {
                if (typeof messageContent.text === 'string') {
                  rawMessage = messageContent.text;
                } else if (typeof messageContent.content === 'string') {
                  rawMessage = messageContent.content;
                }
              }

              rawMessage = String(rawMessage ?? '')
                .replace(/<user_instructions>[\s\S]*?<\/user_instructions>/gi, '')
                .replace(/<environment_context>[\s\S]*?<\/environment_context>/gi, '');

              const normalized = rawMessage.replace(/\s+/g, ' ').replace(/`/g, '').trim();
              if (normalized) {
                firstUserMessage = normalized.substring(0, 200);
                break;
              }
            } catch {
              continue;
            }
          }
        } catch {
          // 最初のメッセージ取得失敗は無視
        }

        const normalizedFirstUserMessage = firstUserMessage;
        const displayTitle =
          normalizedFirstUserMessage && normalizedFirstUserMessage.length > 0
            ? normalizedFirstUserMessage
            : `Session ${sessionId.substring(0, 8)}`;

        const fallbackWorkspaceRaw = resolvedWorkspace ?? this.transformToReadable(projectSlug ?? dirName);
        const fallbackWorkspace =
          fallbackWorkspaceRaw && fallbackWorkspaceRaw.length > 0
            ? fallbackWorkspaceRaw.startsWith('/')
              ? fallbackWorkspaceRaw
              : `/${fallbackWorkspaceRaw}`
            : null;
        const workspacePath =
          workspacePathFromLog && workspacePathFromLog.length > 0
            ? workspacePathFromLog
            : fallbackWorkspace;

        sessions.push({
          id: sessionId,
          projectId: projectId,
          filePath: filePath,
          title: displayTitle,
          firstUserMessage: normalizedFirstUserMessage,
          status,
          createdAt: stats.birthtime,
          updatedAt: stats.mtime,
          fileSize: stats.size,
          workspacePath: workspacePath ?? null
        });
      }

      // 更新日時の降順でソート
      return sessions.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    } catch (error) {
      console.error(`[ClaudeLogSource] Error reading sessions for project ${projectId}:`, error);
      return [];
    }
  }

  private async resolveWorkspacePathHint(identifier: string): Promise<string | null> {
    if (this.workspacePathCache.has(identifier)) {
      return this.workspacePathCache.get(identifier) ?? null;
    }

    const slug = identifier.startsWith('-') ? identifier : this.transformWorktreePath(identifier);

    if (this.workspacePathCache.has(slug)) {
      const cached = this.workspacePathCache.get(slug) ?? null;
      this.workspacePathCache.set(identifier, cached);
      return cached;
    }

    let resolved: string | null = null;

    if (slug.startsWith('-')) {
      const projectDir = path.join(this.CLAUDE_PROJECTS_DIR, slug);
      try {
        const entries = await fs.readdir(projectDir, { withFileTypes: true });
        const jsonlFiles = entries
          .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
          .sort((a, b) => a.name.localeCompare(b.name))
          .slice(0, 5);

        for (const file of jsonlFiles) {
          const candidate = await this.extractWorkspacePathFromFile(path.join(projectDir, file.name));
          if (candidate) {
            resolved = candidate;
            break;
          }
        }
      } catch {
        // ignore access errors
      }
    }

    if (!resolved) {
      if (identifier.startsWith('/')) {
        resolved = identifier;
      } else if (slug.startsWith('-')) {
        resolved = this.transformToReadable(slug);
      } else {
        resolved = identifier;
      }
    }

    this.workspacePathCache.set(identifier, resolved);
    this.workspacePathCache.set(slug, resolved);
    if (resolved) {
      this.workspacePathCache.set(resolved, resolved);
    }

    return resolved;
  }

  private async extractWorkspacePathFromFile(filePath: string): Promise<string | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      const limit = Math.min(lines.length, 200);
      for (let index = 0; index < limit; index += 1) {
        const line = lines[index];
        if (!line || !line.trim()) {
          continue;
        }

        try {
          const parsed = JSON.parse(line);
          const candidate = this.extractWorkspaceCandidate(parsed);
          if (candidate) {
            return candidate;
          }
        } catch {
          continue;
        }
      }
    } catch {
      // ignore read errors
    }

    return null;
  }

  private extractWorkspaceCandidate(payload: any): string | null {
    const candidates = [
      payload?.cwd,
      payload?.message?.cwd
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string') {
        const trimmed = candidate.trim();
        if (trimmed.length > 0) {
          return trimmed;
        }
      }
    }

    return null;
  }

  /**
   * セッションIDからセッション詳細をストリーミングで取得
   * SessionInfoのfilePathフィールドを利用せずに、sessionIdから直接ファイルパスを構築
   */
  async getSessionById(sessionId: string): Promise<Readable | null> {
    try {
      // sessionIdが既にファイルパスに変換可能な情報を含んでいない場合、
      // プロジェクト一覧を取得し、そこからセッションを検索する必要がある
      // しかし、これはパフォーマンス上の問題がある

      // 代替案: getSessionListで取得したSessionInfoをキャッシュし、
      // そこからfilePathを取得する

      // とりあえず、全プロジェクトのセッションを検索
      const projects = await this.getProjectList();

      for (const project of projects) {
        const sessions = await this.getSessionList(project.id);
        const session = sessions.find((s) => s.id === sessionId);

        if (session) {
          // ファイルが存在するか確認
          try {
            await fs.access(session.filePath);
          } catch {
            continue; // ファイルが存在しない場合は次へ
          }

          // ファイルからストリーミング
          const fileStream = new Readable({
            async read() {
              try {
                const content = await fs.readFile(session.filePath, 'utf-8');
                const lines = content.split('\n').filter((l) => l.trim());

                for (const line of lines) {
                  this.push(line + '\n');
                }

                this.push(null); // ストリーム終了
              } catch (error) {
                this.destroy(error as Error);
              }
            }
          });

          return fileStream;
        }
      }

      console.warn(`[ClaudeLogSource] Session not found: ${sessionId}`);
      return null;
    } catch (error) {
      console.error(`[ClaudeLogSource] Error getting session by ID:`, error);
      return null;
    }
  }

  protected async streamCompletedSession(filePath: string): Promise<Readable> {
    this.resetState();
    return super.streamCompletedSession(filePath);
  }

  protected async streamLiveSession(filePath: string): Promise<Readable> {
    this.resetState();
    return super.streamLiveSession(filePath);
  }

  protected processLineAndEmit(
    line: string,
    stream: Readable,
    entryIndexRef: { value: number }
  ): void {
    try {
      const operations = this.transformClaudeLine(line, entryIndexRef);

      for (const op of operations) {
        stream.push(`event: json_patch\ndata: ${JSON.stringify([op.patch])}\n\n`);
        if (op.incrementIndex) {
          entryIndexRef.value += 1;
        }
      }
    } catch (error) {
      super.processLineAndEmit(line, stream, entryIndexRef);
    }
  }

  private resetState(): void {
    this.reportedModel = false;
    this.toolEntryMap.clear();
  }

  private transformClaudeLine(
    line: string,
    entryIndexRef: { value: number }
  ): Array<{ patch: any; incrementIndex: boolean }> {
    const json = JSON.parse(line);
    const operations: Array<{ patch: any; incrementIndex: boolean }> = [];

    if (json.type === 'user' && json.message?.role === 'user') {
      const content = this.extractText(json.message?.content);
      if (content) {
        const entry: NormalizedEntry = {
          timestamp: null,
          entry_type: { type: 'user_message' },
          content,
          metadata: json
        };
        operations.push({
          patch: this.createAddPatch(entry, entryIndexRef.value),
          incrementIndex: true
        });
      }

      // tool_result blocks are embedded in user messages
      const resultOps = this.processToolResults(json.message?.content);
      operations.push(...resultOps);
      return operations;
    }

    if (json.type === 'assistant' && json.message) {
      const model = json.message.model;
      if (model && !this.reportedModel) {
        const systemEntry: NormalizedEntry = {
          timestamp: null,
          entry_type: { type: 'system_message' },
          content: `System initialized with model: ${model}`,
          metadata: { model }
        };
        operations.push({
          patch: this.createAddPatch(systemEntry, entryIndexRef.value),
          incrementIndex: true
        });
        entryIndexRef.value += 1;
        this.reportedModel = true;
      }

      const cwd = json.cwd ?? '';
      const messageParts = Array.isArray(json.message.content)
        ? json.message.content
        : [{ type: 'text', text: json.message.content }];

      for (const part of messageParts) {
        if (part.type === 'text' || part.type === 'analysis' || part.type === 'thinking') {
          const text = typeof part.text === 'string' ? part.text : this.stringifyPayload(part);
          if (!text) continue;
          const entry: NormalizedEntry = {
            timestamp: null,
            entry_type:
              part.type === 'thinking' ? { type: 'thinking' } : { type: 'assistant_message' },
            content: text,
            metadata: part
          };
          operations.push({
            patch: this.createAddPatch(entry, entryIndexRef.value),
            incrementIndex: true
          });
        } else if (part.type === 'tool_use') {
          const toolOp = this.createToolEntryFromClaude(part, cwd, null);
          if (!toolOp) continue;

          const { entry, toolId } = toolOp;
          const patch = this.createAddPatch(entry, entryIndexRef.value);
          operations.push({ patch, incrementIndex: true });

          if (toolId) {
            this.toolEntryMap.set(toolId, { index: entryIndexRef.value, entry: { ...entry } });
          }
        }
      }

      return operations;
    }

    if (json.type === 'tool') {
      // Some Claude logs emit explicit tool event blocks
      const toolId = json.tool_use_id ?? json.id;
      if (toolId && this.toolEntryMap.has(toolId)) {
        const updated = this.updateToolResult(toolId, json.result ?? json.output ?? json);
        if (updated) {
          operations.push({ patch: updated, incrementIndex: false });
        }
      }
      return operations;
    }

    return operations;
  }

  private processToolResults(content: unknown): Array<{ patch: any; incrementIndex: boolean }> {
    if (!Array.isArray(content)) return [];

    const operations: Array<{ patch: any; incrementIndex: boolean }> = [];

    for (const part of content) {
      if (part?.type !== 'tool_result' || !part?.tool_use_id) continue;

      const patch = this.updateToolResult(part.tool_use_id, part.content ?? part);
      if (patch) {
        operations.push({ patch, incrementIndex: false });
      }
    }

    return operations;
  }

  private updateToolResult(toolId: string, content: unknown): any | null {
    const cached = this.toolEntryMap.get(toolId);
    if (!cached) return null;

    const updatedEntry: NormalizedEntry = {
      ...cached.entry,
      metadata: null
    };

    if (updatedEntry.entry_type.type === 'tool_use') {
      const actionType = updatedEntry.entry_type.action_type;
      if (actionType.action === 'command_run') {
        actionType.result = {
          exit_status: {
            type: CommandExitStatusType.SUCCESS,
            success: true
          },
          output: typeof content === 'string' ? content : this.stringifyPayload(content)
        };
      } else if (actionType.action === 'tool') {
        actionType.result = {
          type: ToolResultValueType.MARKDOWN,
          value: typeof content === 'string' ? content : this.stringifyPayload(content)
        };
      }
    }

    this.toolEntryMap.set(toolId, { index: cached.index, entry: updatedEntry });

    return {
      op: 'replace' as const,
      path: `/entries/${cached.index}`,
      value: {
        type: 'NORMALIZED_ENTRY',
        content: updatedEntry
      }
    };
  }

  private createToolEntryFromClaude(
    part: any,
    cwd: string,
    timestamp: string | null
  ): {
    entry: NormalizedEntry;
    toolId: string | null;
  } | null {
    const toolName: string = String(part.name ?? part.tool ?? 'tool');
    const toolId: string | null = part.id ?? part.tool_use_id ?? null;
    const input = part.input ?? {};

    const actionAndContent = this.mapToolToAction(toolName, input, cwd);
    if (!actionAndContent) {
      return null;
    }

    const { actionType, content } = actionAndContent;

    const entry: NormalizedEntry = {
      timestamp,
      entry_type: {
        type: 'tool_use',
        tool_name: toolName,
        action_type: actionType
      },
      content,
      metadata: part
    };

    return { entry, toolId };
  }

  private mapToolToAction(
    toolName: string,
    input: any,
    cwd: string
  ): { actionType: ActionType; content: string } | null {
    const lower = toolName.toLowerCase();

    const makePath = (candidate: unknown): string => {
      if (typeof candidate !== 'string') return 'workspace';
      if (!cwd) return candidate;
      return candidate.startsWith(cwd)
        ? candidate.substring(cwd.length).replace(/^\//, '') || '.'
        : candidate;
    };

    switch (lower) {
      case 'read':
      case 'fileread': {
        const rel = makePath(input.path ?? input.filePath);
        return { actionType: { action: 'file_read', path: rel }, content: `\`${rel}\`` };
      }
      case 'write':
      case 'filewrite':
      case 'createfile': {
        const rel = makePath(input.path ?? input.filePath);
        const changes: FileChange[] = [
          {
            action: 'write',
            content: typeof input.content === 'string' ? input.content : ''
          }
        ];
        return {
          actionType: { action: 'file_edit', path: rel, changes },
          content: `\`${rel}\``
        };
      }
      case 'edit':
      case 'fileedit': {
        const rel = makePath(input.path ?? input.filePath);
        const diff = typeof input.patch === 'string' ? input.patch : this.stringifyPayload(input);
        const changes: FileChange[] = [
          {
            action: 'edit',
            unified_diff: diff,
            has_line_numbers: false
          }
        ];
        return {
          actionType: { action: 'file_edit', path: rel, changes },
          content: `\`${rel}\``
        };
      }
      case 'delete': {
        const rel = makePath(input.path ?? input.filePath);
        const changes: FileChange[] = [{ action: 'delete' }];
        return {
          actionType: { action: 'file_edit', path: rel, changes },
          content: `Delete \`${rel}\``
        };
      }
      case 'todowrite':
      case 'todo': {
        const todos = Array.isArray(input.todos)
          ? input.todos.map((item: any) => ({
              content: item.content ?? '',
              status: item.status ?? item.state ?? 'pending',
              priority: item.priority ?? null
            }))
          : [];
        return {
          actionType: { action: 'todo_management', todos, operation: input.operation ?? 'write' },
          content: 'TODO list updated'
        };
      }
      case 'glob': {
        const query = input.pattern ?? input.glob ?? '*';
        return {
          actionType: { action: 'search', query: String(query) },
          content: `Find files: \`${query}\``
        };
      }
      case 'grep': {
        const query = input.pattern ?? input.query ?? '';
        return {
          actionType: { action: 'search', query: String(query) },
          content: `\`${query}\``
        };
      }
      case 'bash':
      case 'shell':
      case 'command': {
        const command = Array.isArray(input.command)
          ? input.command.join(' ')
          : input.command || input.cmd || 'bash';
        return {
          actionType: { action: 'command_run', command, result: undefined },
          content: `\`${command}\``
        };
      }
      default:
        return {
          actionType: { action: 'other', description: `Tool: ${toolName}` },
          content: toolName
        };
    }
  }

  private extractText(content: unknown): string {
    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      const fragments = content
        .map((item) => (typeof item?.text === 'string' ? item.text : null))
        .filter((text): text is string => Boolean(text));
      return fragments.join('\n\n');
    }

    if (content && typeof content === 'object' && 'text' in content) {
      return String((content as { text: unknown }).text ?? '');
    }

    return this.stringifyPayload(content);
  }

  private createAddPatch(entry: NormalizedEntry, index: number) {
    return {
      op: 'add' as const,
      path: `/entries/${index}`,
      value: {
        type: 'NORMALIZED_ENTRY',
        content: entry
      }
    };
  }
}
