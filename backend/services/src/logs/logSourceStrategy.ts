import { Readable } from 'stream';

/**
 * プロジェクト情報
 */
export interface ProjectInfo {
  id: string;
  name: string;
  git_repo_path: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * セッション情報
 */
export interface SessionInfo {
  id: string; // セッションID（ファイル名から生成）
  projectId: string; // プロジェクトID
  filePath: string; // 実際のファイルパス
  title: string; // タイトル（ファイル名ベース）
  firstUserMessage?: string; // 最初のユーザーメッセージ（オプション）
  workspacePath?: string | null; // 実際の作業ディレクトリ
  status: 'running' | 'completed' | 'failed';
  createdAt: Date; // ファイル作成日時
  updatedAt: Date; // ファイル更新日時
  fileSize: number; // ファイルサイズ
}

/**
 * ログソース戦略の抽象インターフェース
 */
export interface ILogSourceStrategy {
  /**
   * 戦略名
   */
  getName(): string;

  /**
   * プロジェクト一覧を取得
   */
  getProjectList(): Promise<ProjectInfo[]>;

  /**
   * 指定プロジェクトのセッション一覧を取得
   */
  getSessionList(projectId: string): Promise<SessionInfo[]>;

  /**
   * セッションIDからセッション詳細をストリーミングで取得
   */
  getSessionById(sessionId: string): Promise<Readable | null>;
}
