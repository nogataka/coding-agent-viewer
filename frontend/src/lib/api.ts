import { ApiResponse, Project, TaskWithAttemptStatus } from 'shared/types.ts';

export class ApiError<E = unknown> extends Error {
  public status?: number;
  public error_data?: E;

  constructor(
    message: string,
    public statusCode?: number,
    public response?: Response,
    error_data?: E
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = statusCode;
    this.error_data = error_data;
  }
}

export const makeRequest = async (url: string, options: RequestInit = {}) => {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  return fetch(url, {
    ...options,
    headers,
  });
};

export const handleApiResponse = async <T, E = T>(
  response: Response
): Promise<T> => {
  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status}`;

    try {
      const errorData = await response.json();
      if (errorData.message) {
        errorMessage = errorData.message;
      }
    } catch {
      errorMessage = response.statusText || errorMessage;
    }

    throw new ApiError<E>(errorMessage, response.status, response);
  }

  const result: ApiResponse<T, E> = await response.json();

  if (!result.success) {
    throw new ApiError<E>(
      result.message || 'API request failed',
      response.status,
      response,
      result.error_data ?? undefined
    );
  }

  return result.data as T;
};

export const projectsApi = {
  getAll: async (profile?: string): Promise<Project[]> => {
    const query = profile ? `?profile=${encodeURIComponent(profile)}` : '';
    const response = await makeRequest(`/api/projects${query}`);
    return handleApiResponse<Project[]>(response);
  },
};

export const tasksApi = {
  getAll: async (projectId: string): Promise<TaskWithAttemptStatus[]> => {
    const response = await makeRequest(
      `/api/tasks?project_id=${encodeURIComponent(projectId)}`
    );
    return handleApiResponse<TaskWithAttemptStatus[]>(response);
  },
  getById: async (taskId: string): Promise<TaskWithAttemptStatus> => {
    const response = await makeRequest(
      `/api/tasks/${encodeURIComponent(taskId)}`
    );
    return handleApiResponse<TaskWithAttemptStatus>(response);
  },
};

export type ProfileListing = {
  label: string;
  variants?: Array<{ label: string }>;
  [key: string]: unknown;
};

export const profilesApi = {
  list: async (): Promise<ProfileListing[]> => {
    const response = await makeRequest('/api/profiles');
    const data = await handleApiResponse<{ profiles: ProfileListing[] }>(
      response
    );
    return data.profiles;
  },
};

export type TaskAttemptStartResponse = {
  sessionId: string;
  processId: number | null;
  startedAt: string;
  projectId: string;
  kind: 'new' | 'follow-up';
};

export const taskAttemptsApi = {
  create: async (payload: {
    projectId: string;
    prompt: string;
    variantLabel?: string | null;
  }): Promise<TaskAttemptStartResponse> => {
    const response = await makeRequest('/api/task-attempts', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return handleApiResponse<TaskAttemptStartResponse>(response);
  },
  followUp: async (payload: {
    sessionId: string;
    message: string;
    variantLabel?: string | null;
  }): Promise<TaskAttemptStartResponse> => {
    const encodedSessionId = encodeURIComponent(payload.sessionId);
    const response = await makeRequest(
      `/api/task-attempts/${encodedSessionId}/follow-up`,
      {
        method: 'POST',
        body: JSON.stringify({
          message: payload.message,
          variantLabel: payload.variantLabel ?? undefined,
        }),
      }
    );
    return handleApiResponse<TaskAttemptStartResponse>(response);
  },
  stop: async (sessionId: string): Promise<void> => {
    const response = await makeRequest(
      `/api/task-attempts/${encodeURIComponent(sessionId)}/stop`,
      {
        method: 'POST',
      }
    );
    await handleApiResponse<unknown>(response);
  },
};
