import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Loader } from '@/components/ui/loader';
import LogsTab from '@/components/tasks/TaskDetails/LogsTab';
import { TaskTitleDescription } from '@/components/tasks/TaskDetails/TaskTitleDescription';
import { ApiError, taskAttemptsApi } from '@/lib/api';
import { useProject } from '@/contexts/project-context';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/useToast';
import {
  profileDisplayName,
  workspaceNameFromProjectId,
} from '@/lib/profile-utils';
import { useTaskQuery } from '@/hooks/useTaskQuery';
import { useQueryClient } from '@tanstack/react-query';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';

export function TaskDetailsPage() {
  const { projectId, taskId } = useParams<{
    projectId: string;
    taskId: string;
  }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { project, profileLabel } = useProject();
  const queryClient = useQueryClient();

  const [followUp, setFollowUp] = useState('');
  const [followUpPending, setFollowUpPending] = useState(false);
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const [attemptSeed, setAttemptSeed] = useState(0);
  const { toast } = useToast();
  const initialPending = useMemo(
    () =>
      Boolean(
        (location.state as { pendingTask?: boolean } | null)?.pendingTask
      ),
    [location.state]
  );
  const {
    data: task,
    status,
    error,
  } = useTaskQuery(taskId, {
    treat404AsRetry: initialPending,
  });
  const wasInProgressRef = useRef(false);
  const completionNoticeTimerRef = useRef<number | null>(null);
  const followUpTimeoutRef = useRef<number | null>(null);
  const [showCompletionNotice, setShowCompletionNotice] = useState(false);
  const [displayTitle, setDisplayTitle] = useState<string | null>(null);
  const [displayDescription, setDisplayDescription] = useState<string | null>(
    null
  );

  const workspaceLabel = useMemo(() => {
    if (project?.git_repo_path) {
      const parts = project.git_repo_path.split(/[\\/]+/).filter(Boolean);
      return parts.pop() ?? project.git_repo_path;
    }
    if (project?.name) {
      return project.name;
    }
    return (
      workspaceNameFromProjectId(task?.project_id ?? projectId) ?? 'Task Detail'
    );
  }, [project, projectId, task?.project_id]);

  const breadcrumbItems = useMemo(() => {
    const projectsLink = profileLabel
      ? `/projects?profile=${encodeURIComponent(profileLabel)}`
      : '/projects';
    const tasksLink = projectId ? `/projects/${projectId}/tasks` : undefined;
    const displayProfile = profileDisplayName(profileLabel);

    return [
      { label: 'Profiles', to: '/profiles' },
      {
        label: displayProfile ? `Projects: ${displayProfile}` : 'Projects',
        to: projectsLink,
      },
      { label: workspaceLabel || 'Project', to: tasksLink },
      { label: displayTitle ?? 'Task Details' },
    ];
  }, [profileLabel, projectId, workspaceLabel, displayTitle]);

  const profileDisplay = useMemo(
    () => profileDisplayName(profileLabel),
    [profileLabel]
  );

  const isStartupPending = initialPending && status === 'pending';

  useEffect(() => {
    if (!task) {
      setDisplayTitle(null);
      setDisplayDescription(null);
      return;
    }

    setDisplayTitle(task.title);
    setDisplayDescription(task.description ?? null);
  }, [task?.id, task?.title, task?.description]);

  useEffect(
    () => () => {
      if (completionNoticeTimerRef.current) {
        window.clearTimeout(completionNoticeTimerRef.current);
        completionNoticeTimerRef.current = null;
      }
      if (followUpTimeoutRef.current) {
        window.clearTimeout(followUpTimeoutRef.current);
        followUpTimeoutRef.current = null;
      }
    },
    []
  );

  useEffect(() => {
    if (!task) {
      return;
    }

    if (task.has_in_progress_attempt) {
      wasInProgressRef.current = true;
      setShowCompletionNotice(false);
      if (completionNoticeTimerRef.current) {
        window.clearTimeout(completionNoticeTimerRef.current);
        completionNoticeTimerRef.current = null;
      }
      return;
    }

    if (wasInProgressRef.current) {
      setShowCompletionNotice(true);
      wasInProgressRef.current = false;
      if (completionNoticeTimerRef.current) {
        window.clearTimeout(completionNoticeTimerRef.current);
      }
      completionNoticeTimerRef.current = window.setTimeout(() => {
        setShowCompletionNotice(false);
        completionNoticeTimerRef.current = null;
      }, 5000);
    }
  }, [task]);

  const handleBack = useCallback(() => {
    if (!projectId) {
      navigate('/projects');
      return;
    }
    navigate(`/projects/${projectId}/tasks`);
  }, [navigate, projectId]);

  const handleFollowUpSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!task) return;
      if (!followUp.trim()) {
        setFollowUpError('Message is required');
        return;
      }
      setFollowUpError(null);
      setFollowUpPending(true);
      try {
        await taskAttemptsApi.followUp({
          sessionId: task.id,
          message: followUp,
        });
        setAttemptSeed((value) => value + 1);
        queryClient.setQueryData(['task', task.id], (existing) => {
          if (!existing) {
            return existing;
          }
          return {
            ...existing,
            status: 'inprogress',
            has_in_progress_attempt: true,
            updated_at: new Date().toISOString(),
          };
        });
        void queryClient.invalidateQueries({ queryKey: ['task', task.id] });
        toast({
          title: 'Follow-up sent',
          description: 'The assistant will process your follow-up shortly.',
        });
        setFollowUp('');
        setFollowUpError(null);
        if (followUpTimeoutRef.current) {
          window.clearTimeout(followUpTimeoutRef.current);
        }
        followUpTimeoutRef.current = window.setTimeout(() => {
          setFollowUpPending(false);
          followUpTimeoutRef.current = null;
        }, 30000);
      } catch (err) {
        console.error('Failed to send follow-up', err);
        toast({
          title: 'Failed to send follow-up',
          description: err instanceof Error ? err.message : 'Unexpected error',
          variant: 'destructive',
        });
        setFollowUpPending(false);
      } finally {
        // Wait for logs before clearing spinner; handled via timeout/onUserMessage.
      }
    },
    [task, followUp, toast, queryClient]
  );

  const handleUserMessage = useCallback((message: string) => {
    const trimmed = message.trim();
    if (trimmed.length === 0) {
      return;
    }

    setDisplayDescription(trimmed);

    setDisplayTitle(trimmed.slice(0, 200));

    setFollowUpPending((current) => {
      if (!current) {
        return current;
      }
      if (followUpTimeoutRef.current) {
        window.clearTimeout(followUpTimeoutRef.current);
        followUpTimeoutRef.current = null;
      }
      return false;
    });
  }, []);

  const effectiveTitle = displayTitle ?? task?.title ?? '';
  const effectiveDescription = displayDescription ?? task?.description ?? null;

  if (status === 'pending' && !task) {
    if (initialPending) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-background">
          <Loader message="Preparing session..." size={32} />
          <p className="text-sm text-muted-foreground">
            Waiting for the assistant to start streaming logs. This page will
            refresh automatically.
          </p>
        </div>
      );
    }

    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <Loader message="Loading task..." size={32} />
      </div>
    );
  }

  if (status === 'error' || !task) {
    const message =
      error instanceof ApiError && error.statusCode === 404
        ? 'Task not found'
        : error instanceof Error
          ? error.message
          : 'Task not found';
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-background">
        <p className="text-destructive">{message}</p>
        <Button onClick={handleBack}>Back to tasks</Button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-background min-h-0">
      <div className="border-b bg-card px-6 py-6 md:px-8">
        <div className="flex flex-col gap-4">
          <Breadcrumbs items={breadcrumbItems} />
          <div className="flex items-start gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="h-8 px-2 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              Tasks
            </Button>
            <div className="space-y-2 min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {workspaceLabel}
                {profileDisplay ? ` · ${profileDisplay}` : ''}
              </p>
              <TaskTitleDescription
                title={effectiveTitle}
                description={effectiveDescription}
              />
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">#{task.id}</span>
                {task.profile && <span>Profile · {task.profile}</span>}
                {task.created_at && (
                  <span>Created · {formatDateLabel(task.created_at)}</span>
                )}
                {task.updated_at && (
                  <span>Updated · {formatDateLabel(task.updated_at)}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 min-h-0 overflow-hidden">
          <div className="h-full overflow-hidden px-6 py-6 md:px-8">
            <div className="space-y-4 h-full overflow-hidden">
              {isStartupPending && (
                <Alert>
                  <AlertTitle>Preparing session…</AlertTitle>
                  <AlertDescription>
                    We&apos;re waiting for the assistant to create the initial
                    session files. This page will refresh automatically.
                  </AlertDescription>
                </Alert>
              )}
              {!isStartupPending && task.has_in_progress_attempt && (
                <Alert>
                  <AlertTitle>Execution in progress</AlertTitle>
                  <AlertDescription>
                    The assistant is currently working on this session. Live
                    logs will appear below as soon as they are available.
                  </AlertDescription>
                </Alert>
              )}
              {!isStartupPending && showCompletionNotice && (
                <Alert>
                  <AlertTitle>Execution finished</AlertTitle>
                  <AlertDescription>
                    The assistant has completed this run. Review the logs below
                    for the final output.
                  </AlertDescription>
                </Alert>
              )}
              <div className="h-full overflow-hidden">
                <LogsTab
                  key={`${task.id}:${attemptSeed}`}
                  task={task}
                  onUserMessage={handleUserMessage}
                />
              </div>
            </div>
          </div>
        </div>
        <div className="border-t px-6 py-6 md:px-8">
          <form
            className="grid gap-3"
            onSubmit={handleFollowUpSubmit}
            noValidate
          >
            <div className="grid gap-2">
              <label
                htmlFor="follow-up"
                className="text-sm font-medium text-foreground"
              >
                Follow-up message
              </label>
              <Textarea
                id="follow-up"
                value={followUp}
                onChange={(event) => setFollowUp(event.target.value)}
                placeholder="Provide additional instructions"
                rows={4}
                disabled={followUpPending}
              />
              {followUpError && (
                <p className="text-sm text-destructive">{followUpError}</p>
              )}
            </div>
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={followUpPending || !followUp.trim()}
              >
                {followUpPending ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending...
                  </span>
                ) : (
                  'Send follow-up'
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function formatDateLabel(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
