import { createContext, useContext, ReactNode, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/lib/api';
import type { Project } from 'shared/types.ts';
import { profileFromProjectId } from '@/lib/profile-utils';

interface ProjectContextValue {
  projectId: string | undefined;
  project: Project | undefined;
  profileLabel: string | undefined;
  isLoading: boolean;
  error: Error | null;
  isError: boolean;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

interface ProjectProviderProps {
  children: ReactNode;
}

export function ProjectProvider({ children }: ProjectProviderProps) {
  const location = useLocation();

  // Extract projectId from current route path
  const projectId = useMemo(() => {
    const match = location.pathname.match(/^\/projects\/([^/]+)/);
    return match ? match[1] : undefined;
  }, [location.pathname]);

  const profileLabel = useMemo(() => profileFromProjectId(projectId), [projectId]);

  const query = useQuery({
    queryKey: ['projects', 'context', profileLabel],
    queryFn: () => projectsApi.getAll(profileLabel),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const project = useMemo(() => {
    if (!projectId || !query.data) {
      return undefined;
    }
    return query.data.find((item) => item.id === projectId);
  }, [projectId, query.data]);

  const error = query.error instanceof Error ? query.error : null;

  const value = useMemo(
    () => ({
      projectId,
      project,
      profileLabel,
      isLoading: query.isLoading,
      error,
      isError: query.isError,
    }),
    [projectId, project, profileLabel, query.isLoading, error, query.isError]
  );

  return (
    <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
  );
}

export function useProject(): ProjectContextValue {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
}
