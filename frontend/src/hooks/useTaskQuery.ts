import { useQuery } from '@tanstack/react-query';
import { ApiError, tasksApi } from '@/lib/api';
import type { TaskWithAttemptStatus } from 'shared/types.ts';

export type UseTaskQueryOptions = {
  treat404AsRetry?: boolean;
};

const buildRetry =
  (treat404AsRetry: boolean | undefined) =>
  (failureCount: number, error: unknown) => {
    if (error instanceof ApiError && error.statusCode === 404) {
      return treat404AsRetry ? failureCount < 30 : failureCount < 2;
    }
    return failureCount < 3;
  };

const retryDelay = (failureCount: number) =>
  Math.min(2000 * failureCount, 8000);

export const useTaskQuery = (
  taskId: string | undefined,
  options?: UseTaskQueryOptions
) => {
  return useQuery<TaskWithAttemptStatus, ApiError>({
    queryKey: ['task', taskId],
    queryFn: async () => {
      if (!taskId) {
        throw new Error('taskId is required');
      }
      return tasksApi.getById(taskId);
    },
    enabled: Boolean(taskId),
    retry: buildRetry(options?.treat404AsRetry),
    retryDelay,
    staleTime: 5 * 1000,
    refetchOnWindowFocus: false,
    refetchInterval: (query) =>
      query.state.data?.has_in_progress_attempt ? 2000 : false,
    refetchIntervalInBackground: true,
  });
};
