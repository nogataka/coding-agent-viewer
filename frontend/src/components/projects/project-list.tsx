import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  useKanbanKeyboardNavigation,
  useKeyboardShortcuts,
} from '@/lib/keyboard-shortcuts';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Project } from 'shared/types.ts';
import { AlertCircle, Loader2 } from 'lucide-react';
import ProjectCard from '@/components/projects/ProjectCard.tsx';
import { projectsApi } from '@/lib/api';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { profileDisplayName } from '@/lib/profile-utils';

export function ProjectList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [focusedProjectId, setFocusedProjectId] = useState<string | null>(null);
  const [focusedColumn, setFocusedColumn] = useState<string | null>(null);

  const profileParam = searchParams.get('profile') ?? undefined;

  const profileDisplay = profileDisplayName(profileParam);

  const breadcrumbItems = useMemo(() => {
    return [
      { label: 'Profiles', to: '/profiles' },
      {
        label: profileDisplay ? `Projects: ${profileDisplay}` : 'Projects',
      },
    ];
  }, [profileDisplay]);

  const fetchProjects = async () => {
    setLoading(true);
    setError('');

    try {
      const data = await projectsApi.getAll(profileParam ?? undefined);
      setProjects(data);
    } catch (err) {
      console.error('Failed to fetch projects:', err);
      setError('Failed to fetch projects');
    } finally {
      setLoading(false);
    }
  };

  const visibleProjects = projects;

  const getGridColumns = () => {
    const screenWidth = window.innerWidth;
    if (screenWidth >= 1280) return 3;
    if (screenWidth >= 768) return 2;
    return 1;
  };

  const groupProjectsByColumns = (items: Project[], columns: number) => {
    const grouped: Record<string, Project[]> = {};
    for (let i = 0; i < columns; i += 1) {
      grouped[`column-${i}`] = [];
    }

    items.forEach((project, index) => {
      const columnIndex = index % columns;
      grouped[`column-${columnIndex}`].push(project);
    });

    return grouped;
  };

  const columns = getGridColumns();
  const groupedProjects = groupProjectsByColumns(visibleProjects, columns);
  const allColumnKeys = Object.keys(groupedProjects);

  // プロジェクトを取得（profileパラメータが変わったら再取得）
  useEffect(() => {
    fetchProjects();
  }, [profileParam]);

  useEffect(() => {
    if (visibleProjects.length > 0) {
      setFocusedProjectId((current) => {
        if (current && visibleProjects.some((project) => project.id === current)) {
          return current;
        }
        return visibleProjects[0].id;
      });
      setFocusedColumn('column-0');
    } else {
      setFocusedProjectId(null);
      setFocusedColumn(null);
    }
  }, [visibleProjects]);

  const handleViewProjectDetails = (project: Project) => {
    navigate(`/projects/${project.id}/tasks`);
  };

  useKanbanKeyboardNavigation({
    focusedTaskId: focusedProjectId,
    setFocusedTaskId: setFocusedProjectId,
    focusedStatus: focusedColumn,
    setFocusedStatus: setFocusedColumn,
    groupedTasks: groupedProjects,
    filteredTasks: visibleProjects,
    allTaskStatuses: allColumnKeys,
    onViewTaskDetails: handleViewProjectDetails,
    preserveIndexOnColumnSwitch: true,
  });

  useKeyboardShortcuts({
    ignoreEscape: true,
    navigate,
    currentPath: '/projects',
  });

  useEffect(() => {
    const handleResize = () => {
      if (focusedProjectId && visibleProjects.length > 0) {
        const newColumns = getGridColumns();
        const focusedProject = visibleProjects.find((project) => project.id === focusedProjectId);
        if (focusedProject) {
          const projectIndex = visibleProjects.indexOf(focusedProject);
          const newColumnIndex = projectIndex % newColumns;
          setFocusedColumn(`column-${newColumnIndex}`);
        }
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [focusedProjectId, visibleProjects]);

  useEffect(() => {
    fetchProjects();
  }, [profileParam]);

  const hasProjects = projects.length > 0;

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="bg-card border-b px-6 py-6 md:px-8">
        <Breadcrumbs items={breadcrumbItems} className="mb-4" />
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold text-foreground">
              {profileDisplay ? `Projects: ${profileDisplay}` : 'Projects'}
            </h1>
            <p className="text-sm text-muted-foreground">
              Manage your connected repositories and bootstrap scripts.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <Button variant="secondary" onClick={() => navigate('/profiles')}>
              Choose Profile
            </Button>
          </div>
        </div>
        <div className="mt-6 text-sm text-muted-foreground">
          Browse all available workspaces for this profile.
        </div>
      </div>

      {error && (
        <div className="px-6 pt-6 md:px-8">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      )}

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading projects...
        </div>
      ) : !hasProjects ? (
        <div className="px-6 py-10 md:px-8">
          <Card className="border-dashed border-muted-foreground/40 bg-card">
            <CardContent className="py-12 text-center">
              <h3 className="mt-4 text-lg font-semibold">No projects yet</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Connect a workspace profile to explore sessions.
              </p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-6 py-8 md:px-8">
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {visibleProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                isFocused={focusedProjectId === project.id}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
