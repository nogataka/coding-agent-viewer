import {
  useCallback,
  useMemo,
  useEffect,
  useReducer,
  useRef,
  useState,
} from 'react';
import { Cog, Loader2, ChevronRight, User } from 'lucide-react';
import { useProcessesLogs } from '@/hooks/useProcessesLogs';
import LogEntryRow from '@/components/logs/LogEntryRow';
import {
  shouldShowInLogs,
  isAutoCollapsibleProcess,
  isProcessCompleted,
  isCodingAgent,
  getLatestCodingAgent,
  PROCESS_STATUSES,
} from '@/constants/processes';
import type {
  ExecutionProcess,
  ExecutionProcessStatus,
  NormalizedEntry,
  TaskStatus,
  TaskWithAttemptStatus,
} from 'shared/types.ts';
import type { ProcessStartPayload, UnifiedLogEntry } from '@/types/logs';

// Helper functions
function addAll<T>(set: Set<T>, items: T[]): Set<T> {
  items.forEach((i: T) => set.add(i));
  return set;
}

// State management types
type LogsState = {
  userCollapsed: Set<string>;
  autoCollapsed: Set<string>;
  prevStatus: Map<string, ExecutionProcessStatus>;
  prevLatestAgent?: string;
};

type LogsAction =
  | { type: 'RESET_ATTEMPT' }
  | { type: 'TOGGLE_USER'; id: string }
  | { type: 'AUTO_COLLAPSE'; ids: string[] }
  | { type: 'AUTO_EXPAND'; ids: string[] }
  | { type: 'UPDATE_STATUS'; id: string; status: ExecutionProcessStatus }
  | { type: 'NEW_RUNNING_AGENT'; id: string };

const initialState: LogsState = {
  userCollapsed: new Set(),
  autoCollapsed: new Set(),
  prevStatus: new Map(),
  prevLatestAgent: undefined,
};

function reducer(state: LogsState, action: LogsAction): LogsState {
  switch (action.type) {
    case 'RESET_ATTEMPT':
      return { ...initialState };

    case 'TOGGLE_USER': {
      const newUserCollapsed = new Set(state.userCollapsed);
      const newAutoCollapsed = new Set(state.autoCollapsed);

      const isCurrentlyCollapsed =
        newUserCollapsed.has(action.id) || newAutoCollapsed.has(action.id);

      if (isCurrentlyCollapsed) {
        // we want to EXPAND
        newUserCollapsed.delete(action.id);
        newAutoCollapsed.delete(action.id);
      } else {
        // we want to COLLAPSE
        newUserCollapsed.add(action.id);
      }

      return {
        ...state,
        userCollapsed: newUserCollapsed,
        autoCollapsed: newAutoCollapsed,
      };
    }

    case 'AUTO_COLLAPSE': {
      const newAutoCollapsed = new Set(state.autoCollapsed);
      addAll(newAutoCollapsed, action.ids);
      return {
        ...state,
        autoCollapsed: newAutoCollapsed,
      };
    }

    case 'AUTO_EXPAND': {
      const newAutoCollapsed = new Set(state.autoCollapsed);
      action.ids.forEach((id) => newAutoCollapsed.delete(id));
      return {
        ...state,
        autoCollapsed: newAutoCollapsed,
      };
    }

    case 'UPDATE_STATUS': {
      const newPrevStatus = new Map(state.prevStatus);
      newPrevStatus.set(action.id, action.status);
      return {
        ...state,
        prevStatus: newPrevStatus,
      };
    }

    case 'NEW_RUNNING_AGENT':
      return {
        ...state,
        prevLatestAgent: action.id,
      };

    default:
      return state;
  }
}

const STATUS_TO_PROCESS_STATUS: Record<TaskStatus, ExecutionProcessStatus> = {
  inprogress: 'running',
  inreview: 'failed',
  cancelled: 'killed',
  todo: 'completed',
  done: 'completed',
};

const mapTaskStatusToProcessStatus = (
  status: TaskStatus
): ExecutionProcessStatus => STATUS_TO_PROCESS_STATUS[status] ?? 'completed';

const buildProcessFromTask = (
  task: TaskWithAttemptStatus
): ExecutionProcess => {
  const startedAt = task.created_at;
  const status = mapTaskStatusToProcessStatus(task.status);
  const completedAt = status === 'running' ? null : task.updated_at;

  return {
    id: task.id,
    task_attempt_id: `${task.id}:attempt`,
    run_reason: 'codingagent',
    executor_action: {
      typ: {
        type: 'CodingAgentInitialRequest',
        profile_variant_label: {
          profile: task.profile,
          variant: null,
        },
        prompt: task.description ?? '',
      },
      next_action: null,
    },
    status,
    exit_code: status === 'failed' || status === 'killed' ? 1n : 0n,
    started_at: startedAt,
    completed_at: completedAt,
    created_at: startedAt,
    updated_at: completedAt ?? startedAt,
  };
};

type Props = {
  task: TaskWithAttemptStatus | null;
  onUserMessage?: (message: string) => void;
};

type LogSection = {
  id: string;
  title: string;
  entries: UnifiedLogEntry[];
};

function LogsTab({ task, onUserMessage }: Props) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [hasReceivedEntries, setHasReceivedEntries] = useState(false);
  const lastReportedUserMessageRef = useRef<string | null>(null);
  const hasInitializedUserMessageRef = useRef(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  const processes = useMemo(
    () => (task ? [buildProcessFromTask(task)] : []),
    [task]
  );

  // Filter out dev server processes before passing to useProcessesLogs
  const filteredProcesses = useMemo(
    () => processes.filter((process) => shouldShowInLogs(process.run_reason)),
    [processes.map((p) => p.id).join(',')]
  );

  const { entries, isConnected } = useProcessesLogs(
    filteredProcesses,
    Boolean(task)
  );

  const isInitialLoad = Boolean(task) && !hasReceivedEntries && isConnected;
  const isLoading = isInitialLoad;

  // Combined collapsed processes (auto + user)
  const allCollapsedProcesses = useMemo(() => {
    const combined = new Set(state.autoCollapsed);
    state.userCollapsed.forEach((id: string) => combined.add(id));
    return combined;
  }, [state.autoCollapsed, state.userCollapsed]);

  // Toggle collapsed state for a process (user action)
  const toggleProcessCollapse = useCallback((processId: string) => {
    dispatch({ type: 'TOGGLE_USER', id: processId });
  }, []);

  // Effect #1: Reset state when attempt changes
  useEffect(() => {
    dispatch({ type: 'RESET_ATTEMPT' });
    setHasReceivedEntries(false);
    lastReportedUserMessageRef.current = null;
  }, [task?.id]);

  // Effect #2: Handle setup/cleanup script auto-collapse and auto-expand
  useEffect(() => {
    const toCollapse: string[] = [];
    const toExpand: string[] = [];

    filteredProcesses.forEach((process) => {
      if (isAutoCollapsibleProcess(process.run_reason)) {
        const prevStatus = state.prevStatus.get(process.id);
        const currentStatus = process.status;

        // Auto-collapse completed setup/cleanup scripts
        const shouldAutoCollapse =
          (prevStatus === PROCESS_STATUSES.RUNNING ||
            prevStatus === undefined) &&
          isProcessCompleted(currentStatus) &&
          !state.userCollapsed.has(process.id) &&
          !state.autoCollapsed.has(process.id);

        if (shouldAutoCollapse) {
          toCollapse.push(process.id);
        }

        // Auto-expand scripts that restart after completion
        const becameRunningAgain =
          prevStatus &&
          isProcessCompleted(prevStatus) &&
          currentStatus === PROCESS_STATUSES.RUNNING &&
          state.autoCollapsed.has(process.id);

        if (becameRunningAgain) {
          toExpand.push(process.id);
        }

        // Update status tracking
        dispatch({
          type: 'UPDATE_STATUS',
          id: process.id,
          status: currentStatus,
        });
      }
    });

    if (toCollapse.length > 0) {
      dispatch({ type: 'AUTO_COLLAPSE', ids: toCollapse });
    }

    if (toExpand.length > 0) {
      dispatch({ type: 'AUTO_EXPAND', ids: toExpand });
    }
  }, [filteredProcesses, state.userCollapsed, state.autoCollapsed]);

  // Effect #3: Handle coding agent succession logic
  useEffect(() => {
    const latestCodingAgentId = getLatestCodingAgent(filteredProcesses);
    if (!latestCodingAgentId) return;

    // Collapse previous agents when a new latest agent appears
    if (latestCodingAgentId !== state.prevLatestAgent) {
      // Collapse all other coding agents that aren't user-collapsed
      const toCollapse = filteredProcesses
        .filter(
          (p) =>
            isCodingAgent(p.run_reason) &&
            p.id !== latestCodingAgentId &&
            !state.userCollapsed.has(p.id) &&
            !state.autoCollapsed.has(p.id)
        )
        .map((p) => p.id);

      if (toCollapse.length > 0) {
        dispatch({ type: 'AUTO_COLLAPSE', ids: toCollapse });
      }

      dispatch({ type: 'NEW_RUNNING_AGENT', id: latestCodingAgentId });
    }
  }, [
    filteredProcesses,
    state.prevLatestAgent,
    state.userCollapsed,
    state.autoCollapsed,
  ]);

  // Filter entries to hide logs from collapsed processes
  const visibleEntries = useMemo(() => {
    return entries.filter((entry) =>
      entry.channel === 'process_start'
        ? true
        : !allCollapsedProcesses.has(entry.processId)
    );
  }, [entries, allCollapsedProcesses]);

  const sections = useMemo<LogSection[]>(() => {
    const result: LogSection[] = [];
    let currentSection: LogSection | null = null;
    const pending: UnifiedLogEntry[] = [];

    const ensureSection = (id: string, title: string): LogSection => {
      const section: LogSection = {
        id,
        title,
        entries: [],
      };
      result.push(section);
      currentSection = section;
      return section;
    };

    visibleEntries.forEach((entry) => {
      if (entry.channel === 'process_start') {
        return;
      }

      const isUserMessage =
        entry.channel === 'normalized' &&
        (entry.payload as NormalizedEntry).entry_type.type === 'user_message';

      if (isUserMessage) {
        const normalized = entry.payload as NormalizedEntry;
        const trimmed = normalized.content.trim();
        const sectionId = `${entry.processId}:${entry.ts}`;
        const title = trimmed || 'User message';
        const section = ensureSection(sectionId, title);
        if (pending.length > 0) {
          section.entries.push(...pending.splice(0, pending.length));
        }
        return;
      }

      if (!currentSection) {
        pending.push(entry);
        return;
      }

      currentSection.entries.push(entry);
    });

    if (pending.length > 0) {
      if (result.length === 0) {
        result.push({
          id: 'initial',
          title: 'Session start',
          entries: [...pending],
        });
      } else {
        const target = currentSection ?? result[result.length - 1];
        if (target) {
          target.entries.push(...pending);
        }
      }
    }

    return result;
  }, [visibleEntries]);

  const visibleSections = useMemo(
    () => sections.filter((section) => section.id !== 'initial'),
    [sections]
  );

  useEffect(() => {
    setOpenSections((prev) => {
      const next: Record<string, boolean> = {};
      visibleSections.forEach((section, index) => {
        const defaultOpen =
          index === visibleSections.length - 1 || visibleSections.length === 1;
        next[section.id] = prev[section.id] ?? defaultOpen;
      });
      return next;
    });
  }, [visibleSections]);

  // Show loading spinner during initial data load
  useEffect(() => {
    const hasLogEntries = entries.some(
      (entry) => entry.channel !== 'process_start'
    );
    if (hasLogEntries) {
      setHasReceivedEntries(true);
    }

    if (onUserMessage) {
      const latestUserEntry = [...entries]
        .reverse()
        .find(
          (entry) =>
            entry.channel === 'normalized' &&
            (entry.payload as NormalizedEntry).entry_type.type ===
              'user_message'
        );

      if (latestUserEntry) {
        const normalized = latestUserEntry.payload as NormalizedEntry;
        const trimmed = normalized.content.trim();
        if (
          trimmed.length > 0 &&
          trimmed !== lastReportedUserMessageRef.current
        ) {
          if (!hasInitializedUserMessageRef.current) {
            hasInitializedUserMessageRef.current = true;
            lastReportedUserMessageRef.current = trimmed;
            return;
          }
          lastReportedUserMessageRef.current = trimmed;
          onUserMessage(trimmed);
        }
        if (!hasInitializedUserMessageRef.current && trimmed.length > 0) {
          hasInitializedUserMessageRef.current = true;
          lastReportedUserMessageRef.current = trimmed;
        }
      }
    }
  }, [entries, onUserMessage]);

  const shouldShowSpinner =
    Boolean(task) &&
    filteredProcesses.length > 0 &&
    !hasReceivedEntries &&
    isConnected;

  const toggleSection = useCallback((sectionId: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  }, []);

  if (isLoading || shouldShowSpinner) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Loading execution logs...
          </p>
        </div>
      </div>
    );
  }

  if (
    sections.length === 0 ||
    sections.every((section) => section.entries.length === 0)
  ) {
    if (isConnected || (task && task.has_in_progress_attempt)) {
      return (
        <div className="w-full h-full flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Waiting for log events...
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <p>No log entries available for this session.</p>
        </div>
      </div>
    );
  }

  if (!filteredProcesses || filteredProcesses.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <Cog className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No execution processes found for this session.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto pr-2">
        <div className="space-y-2">
          {visibleSections.map((section) => {
            const isOpen = openSections[section.id] ?? false;
            return (
              <div
                key={section.id}
                className="rounded-lg border border-border/60 bg-card/40"
              >
                <button
                  type="button"
                  onClick={() => toggleSection(section.id)}
                  className="w-full px-3 py-2 flex items-center justify-end gap-3 text-sm font-medium text-foreground"
                >
                  <span className="truncate text-right">{section.title}</span>
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white bg-white text-blue-500 shadow-sm">
                    <User className="h-3.5 w-3.5" />
                  </span>
                  <ChevronRight
                    className={`h-4 w-4 shrink-0 text-blue-500 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
                  />
                </button>
                {isOpen && (
                  <div className="px-3 pb-3 space-y-3">
                    {section.entries.map((entry, index) => (
                      <LogEntryRow
                        key={entry.id}
                        entry={entry}
                        index={index}
                        isCollapsed={
                          entry.channel === 'process_start'
                            ? allCollapsedProcesses.has(
                                (entry.payload as ProcessStartPayload).processId
                              )
                            : undefined
                        }
                        onToggleCollapse={
                          entry.channel === 'process_start'
                            ? toggleProcessCollapse
                            : undefined
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="pb-4" />
      </div>
    </div>
  );
}

export default LogsTab;
