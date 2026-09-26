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

export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly code?: string) {
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
    const error = payload as { error?: { message?: string; code?: string } } | undefined;
    throw new ApiError(response.status, error?.error?.message ?? 'Something went wrong', error?.error?.code);
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
  createTask: (input: TaskInput) => request<{ task: Task }>('/api/tasks', {
    method: 'POST',
    body: JSON.stringify(input),
  }),
  updateTask: (id: string, input: TaskPatch) => request<{ task: Task }>(`/api/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  }),
  deleteTask: (id: string) => request<void>(`/api/tasks/${id}`, { method: 'DELETE' }),
  moveTask: (id: string, status: Status, position: number) => request<{ task: Task }>(`/api/tasks/${id}/move`, {
    method: 'POST',
    body: JSON.stringify({ status, position }),
  }),
};
