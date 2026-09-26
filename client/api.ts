export type Status = 'backlog' | 'in_progress' | 'review' | 'done';

export type Task = {
  id: string;
  title: string;
  description: string;
  status: Status;
  position: number;
  start_date: string;
  end_date: string;
  created_at: string;
  updated_at: string;
  blocked: boolean;
  ready: boolean;
  blockers: string[];
};

export type Dependency = { taskId: string; dependsOnId: string };
export type Board = { tasks: Task[]; dependencies: Dependency[] };
export type User = { id: string; email: string };
export type TaskInput = Pick<Task, 'title' | 'description' | 'status' | 'start_date' | 'end_date'>;
export type TaskPatch = Partial<TaskInput>;
export type DateChange = { taskId: string; startDate: string; endDate: string };
export type DependencyResponse = { dependency: Dependency; moved: DateChange[] };
export type TaskMutationResponse = { task: Task; moved?: DateChange[] };
export type SuggestedDependency = Dependency;
export type RejectedSuggestion = { suggestion: unknown; reason: string };
export type SuggestionResult = { accepted: SuggestedDependency[]; rejected: RejectedSuggestion[]; provider: 'gemini' | 'mock'; cached: boolean };

export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly code?: string, readonly details?: Record<string, unknown>) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { ...init, headers, credentials: 'include' });
  const text = await response.text();
  const payload: unknown = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    const error = payload as { error?: { message?: string; code?: string; details?: Record<string, unknown> } } | undefined;
    throw new ApiError(response.status, error?.error?.message ?? 'Something went wrong', error?.error?.code, error?.error?.details);
  }
  return payload as T;
}

export const api = {
  me: () => request<{ user: User }>('/api/auth/me'),
  login: (email: string, password: string) => request<{ user: User }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),
  board: () => request<Board>('/api/board'),
  createTask: (input: TaskInput) => request<TaskMutationResponse>('/api/tasks', {
    method: 'POST',
    body: JSON.stringify(input),
  }),
  updateTask: (id: string, input: TaskPatch) => request<TaskMutationResponse>(`/api/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  }),
  deleteTask: (id: string) => request<void>(`/api/tasks/${id}`, { method: 'DELETE' }),
  moveTask: (id: string, status: Status, position: number) => request<TaskMutationResponse>(`/api/tasks/${id}/move`, {
    method: 'POST',
    body: JSON.stringify({ status, position }),
  }),
  addDependency: (taskId: string, dependsOnId: string) => request<DependencyResponse>('/api/dependencies', {
    method: 'POST',
    body: JSON.stringify({ taskId, dependsOnId }),
  }),
  removeDependency: (taskId: string, dependsOnId: string) => request<void>('/api/dependencies', {
    method: 'DELETE',
    body: JSON.stringify({ taskId, dependsOnId }),
  }),
  suggestDependencies: () => request<SuggestionResult>('/api/ai/suggest-dependencies', { method: 'POST' }),
  aiStatus: () => request<{ provider: 'gemini' | 'mock' }>('/api/ai/status'),
};
