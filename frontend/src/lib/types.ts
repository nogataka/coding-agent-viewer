import { ExecutionProcess } from 'shared/types.ts';

export type AttemptData = {
  processes: ExecutionProcess[];
  runningProcessDetails: Record<string, ExecutionProcess>;
};

export interface ConversationEntryDisplayType {
  entry: any;
  processId: string;
  processPrompt?: string;
  processStatus: string;
  processIsRunning: boolean;
  process: any;
  isFirstInProcess: boolean;
  processIndex: number;
  entryIndex: number;
}
