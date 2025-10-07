import { useCallback, useEffect, useMemo, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Loader2, CheckCircle, XCircle, Plus } from 'lucide-react';
import { Loader } from '@/components/ui/loader';
import { tasksApi, type TaskAttemptStartResponse } from '@/lib/api';
import type { TaskWithAttemptStatus } from 'shared/types.ts';
import { cn } from '@/lib/utils';
import { useProject } from '@/contexts/project-context';
import { NewChatDialog } from '@/components/tasks/NewChatDialog';
import { useToast } from '@/hooks/useToast';
import {
  profileDisplayName,
  profileFromProjectId,
  workspaceNameFromProjectId,
} from '@/lib/profile-utils';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';

type Task = TaskWithAttemptStatus;

export function ProjectTasks() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { project, profileLabel: contextProfile } = useProject();
  const [isDialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

  const profileLabel = useMemo(() => {
    if (contextProfile) {
      return contextProfile;
    }
    return profileFromProjectId(projectId) ?? 'claude-code';
  }, [contextProfile, projectId]);

  const workspaceLabel = useMemo(() => {
    if (project?.git_repo_path) {
      const parts = project.git_repo_path.split(/[\\/]+/).filter(Boolean);
      return parts.pop() ?? project.git_repo_path;
    }
    if (project?.name) {
      return project.name;
    }
    return workspaceNameFromProjectId(projectId) ?? 'Project';
  }, [project, projectId]);

  const breadcrumbItems = useMemo(() => {
    const projectsLink = profileLabel
      ? `/projects?profile=${encodeURIComponent(profileLabel)}`
      : '/projects';
    const profileDisplay = profileDisplayName(profileLabel);

    return [
      { label: 'Profiles', to: '/profiles' },
      {
        label: profileDisplay ? `Projects: ${profileDisplay}` : 'Projects',
        to: projectsLink,
      },
      { label: workspaceLabel || 'Project' },
    ];
  }, [profileLabel, workspaceLabel]);

  const profileDisplay = useMemo(
    () => profileDisplayName(profileLabel),
    [profileLabel]
  );

  // Define task creation handler
  // Full screen
  const fetchTasks = useCallback(
    async (skipLoading = false) => {
      try {
        if (!skipLoading) {
          setLoading(true);
        }
        const result = await tasksApi.getAll(projectId!);
        // Only update if data has actually changed
        setTasks((prevTasks) => {
          const newTasks = result;
          if (JSON.stringify(prevTasks) === JSON.stringify(newTasks)) {
            return prevTasks; // Return same reference to prevent re-render
          }

          return newTasks;
        });
      } catch (err) {
        setError('Failed to load tasks');
      } finally {
        if (!skipLoading) {
          setLoading(false);
        }
      }
    },
    [projectId]
  );

  const handleViewTaskDetails = useCallback(
    (task: Task) => {
      navigate(`/projects/${projectId}/tasks/${task.id}`);
    },
    [projectId, navigate]
  );

  // Initialize data when projectId changes
  useEffect(() => {
    if (projectId) {
      fetchTasks();

      // Set up polling to refresh tasks every 2 seconds
      const interval = setInterval(() => {
        fetchTasks(true); // Skip loading spinner for polling
      }, 2000);

      // Cleanup interval on unmount
      return () => clearInterval(interval);
    }
  }, [projectId, fetchTasks]);

  const totalTasks = tasks.length;

  const filteredTasks = tasks;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <Loader message="Loading tasks..." size={32} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background text-destructive">
        {error}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-background min-h-0">
      <div className="border-b bg-card px-6 py-6 md:px-8">
        <div className="flex flex-col gap-6">
          <Breadcrumbs items={breadcrumbItems} />
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4 min-w-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  navigate(
                    profileLabel
                      ? `/projects?profile=${encodeURIComponent(profileLabel)}`
                      : '/projects'
                  )
                }
                className="h-8 px-2 text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="mr-1 h-4 w-4" />
                Projects
              </Button>
              <div className="space-y-1 min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Tasks{profileDisplay ? ` · ${profileDisplay}` : ''}
                </p>
                <h1 className="text-2xl font-semibold text-foreground truncate">
                  {workspaceLabel}
                </h1>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>Total Sessions:</span>
                  <span className="font-medium text-foreground">
                    {totalTasks}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 justify-start lg:justify-end">
              {projectId && (
                <Button onClick={() => setDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  New Chat
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative xl:flex xl:items-stretch">
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6 md:px-8">
          {filteredTasks.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <Card className="w-full max-w-lg border-dashed border-muted-foreground/40 bg-card">
                <CardContent className="py-12 text-center space-y-4">
                  <p className="text-muted-foreground">
                    No tasks available yet.
                  </p>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className={cn('grid gap-4', 'md:grid-cols-2 xl:grid-cols-3')}>
              {filteredTasks.map((task) => (
                <TaskCardItem
                  key={task.id}
                  task={task}
                  onViewDetails={handleViewTaskDetails}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      {projectId && (
        <NewChatDialog
          open={isDialogOpen}
          onOpenChange={setDialogOpen}
          projectId={projectId}
          profileLabel={profileLabel}
          onSuccess={(attempt: TaskAttemptStartResponse) => {
            toast({
              title: 'Opening session…',
              description: 'Navigating to live task details.',
            });
            navigate(`/projects/${projectId}/tasks/${attempt.sessionId}`, {
              state: { pendingTask: true },
            });
          }}
        />
      )}
    </div>
  );
}

interface TaskCardItemProps {
  task: Task;
  onViewDetails: (task: Task) => void;
}

function TaskCardItem({ task, onViewDetails }: TaskCardItemProps) {
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onViewDetails(task);
    }
  };

  const containerClasses = cn(
    'relative rounded-xl border bg-card p-5 shadow-sm transition hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 cursor-pointer'
  );

  return (
    <div
      role="button"
      tabIndex={0}
      className={containerClasses}
      onClick={() => onViewDetails(task)}
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-3 overflow-hidden">
          <h2 className="text-base font-semibold leading-snug text-foreground line-clamp-2 break-words">
            {task.title}
          </h2>
        </div>
      </div>

      {task.description && (
        <p className="mt-3 text-sm text-muted-foreground line-clamp-3 break-words">
          {task.description}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground break-all">
        <span className="font-medium text-foreground">#{task.id}</span>
        {task.profile && <span>{task.profile}</span>}
        {task.has_in_progress_attempt && (
          <span className="flex items-center gap-1 text-blue-600">
            <Loader2 className="h-3 w-3 animate-spin" />
            Running
          </span>
        )}
        {task.has_merged_attempt && (
          <span className="flex items-center gap-1 text-green-600">
            <CheckCircle className="h-3 w-3" />
            Merged
          </span>
        )}
        {task.last_attempt_failed && !task.has_merged_attempt && (
          <span className="flex items-center gap-1 text-destructive">
            <XCircle className="h-3 w-3" />
            Failed
          </span>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <span>{formatDateDisplay(task.created_at)}</span>
        <span>{formatTimeAgo(task.updated_at)}</span>
      </div>
    </div>
  );
}

function formatDateDisplay(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTimeAgo(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60)
    return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24)
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString();
}
