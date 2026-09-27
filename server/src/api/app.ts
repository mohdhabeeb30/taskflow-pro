import express, { type NextFunction, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import {
  computeStatus,
  DependencyError,
  propagateSchedule,
  validateDependency,
  type Dependency as EngineDependency,
  type Task as EngineTask,
} from '../engine/index.js';
import { databaseToEngineStatus, type DatabaseStatus } from './status-mapping.js';
import { aiProviderStatusError, AiService, type AiService as AiServiceType } from '../ai/index.js';

const databaseStatuses = ['backlog', 'in_progress', 'review', 'done'] as const;
const statusRank: Record<DatabaseStatus, number> = { backlog: 0, in_progress: 1, review: 2, done: 3 };

const taskFields = z.object({
  title: z.string().trim().min(1),
  description: z.string().default(''),
  status: z.enum(databaseStatuses).default('backlog'),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
const taskInput = taskFields.superRefine((value, context) => {
  if (value.end_date < value.start_date) context.addIssue({ code: 'custom', message: 'end_date must not be before start_date', path: ['end_date'] });
});
const taskPatch = taskFields.partial().refine((value) => Object.keys(value).length > 0, 'At least one field is required');
const moveInput = z.object({ status: z.enum(databaseStatuses), position: z.number().int().nonnegative() });
const dependencyInput = z.object({ taskId: z.string().min(1), dependsOnId: z.string().min(1) });
const aiSuggestionInput = z.object({ taskId: z.string().min(1) });
const loginInput = z.object({ email: z.string().trim().email(), password: z.string().min(1) });
const sessionCookie = 'taskflow_session';
const sessionDurationMs = 8 * 60 * 60 * 1000;
const loginWindowMs = 60 * 1000;
const loginLimit = 5;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const invalidLoginMessage = 'Invalid email or password';

class ApiError extends Error {
  constructor(readonly code: string, message: string, readonly details?: Record<string, unknown>, readonly status = 400) {
    super(message);
  }
}

function taskFromRow(row: Record<string, unknown>): EngineTask & { position: number } {
  return {
    id: String(row.id), title: String(row.title), description: String(row.description),
    status: databaseToEngineStatus(row.status as DatabaseStatus), startDate: String(row.start_date), endDate: String(row.end_date),
    position: Number(row.position),
  };
}

function loadEngineState(db: Database.Database): { tasks: Map<string, EngineTask>; rows: Map<string, EngineTask & { position: number }>; dependencies: EngineDependency[] } {
  const rows = new Map<string, EngineTask & { position: number }>();
  for (const row of db.prepare('SELECT * FROM tasks').all() as Array<Record<string, unknown>>) {
    const task = taskFromRow(row);
    rows.set(task.id, task);
  }
  const dependencies = (db.prepare('SELECT task_id AS taskId, depends_on_id AS dependsOnId FROM dependencies').all() as EngineDependency[]);
  return { tasks: new Map([...rows].map(([id, task]) => [id, task])), rows, dependencies };
}

function writeAudit(db: Database.Database, action: string, payload: unknown): void {
  db.prepare('INSERT INTO audit_log (ts, action, payload) VALUES (?, ?, json(?))')
    .run(new Date().toISOString(), action, JSON.stringify(payload));
}

function updateDates(db: Database.Database, changes: readonly { taskId: string; startDate: string; endDate: string }[]): void {
  const update = db.prepare('UPDATE tasks SET start_date = ?, end_date = ?, updated_at = ? WHERE id = ?');
  const now = new Date().toISOString();
  for (const change of changes) update.run(change.startDate, change.endDate, now, change.taskId);
}

function reindexColumn(db: Database.Database, status: DatabaseStatus): void {
  const ids = db.prepare('SELECT id FROM tasks WHERE status = ? ORDER BY position, id').all(status) as Array<{ id: string }>;
  const update = db.prepare('UPDATE tasks SET position = ?, updated_at = ? WHERE id = ?');
  const now = new Date().toISOString();
  ids.forEach((row, index) => update.run(index, now, row.id));
}

function movePosition(db: Database.Database, taskId: string, oldStatus: DatabaseStatus, newStatus: DatabaseStatus, requestedPosition: number): void {
  const now = new Date().toISOString();
  db.prepare('UPDATE tasks SET status = ?, position = -1, updated_at = ? WHERE id = ?').run(newStatus, now, taskId);
  if (oldStatus !== newStatus) reindexColumn(db, oldStatus);
  const siblings = db.prepare('SELECT id FROM tasks WHERE status = ? AND id != ? ORDER BY position, id').all(newStatus, taskId) as Array<{ id: string }>;
  const position = Math.min(requestedPosition, siblings.length);
  const update = db.prepare('UPDATE tasks SET position = ?, updated_at = ? WHERE id = ?');
  siblings.forEach((sibling, index) => update.run(index >= position ? index + 1 : index, now, sibling.id));
  update.run(position, now, taskId);
}

function board(db: Database.Database): { tasks: unknown[]; dependencies: EngineDependency[] } {
  const state = loadEngineState(db);
  const statuses = computeStatus(state.tasks, state.dependencies);
  const rows = db.prepare(`SELECT * FROM tasks
    ORDER BY CASE status WHEN 'backlog' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'review' THEN 2 WHEN 'done' THEN 3 END, position, id`).all() as Array<Record<string, unknown>>;
  return {
    tasks: rows.map((row) => {
      const task = taskFromRow(row);
      const status = statuses.get(task.id) ?? { blocked: false, blockers: [] };
      return {
        id: task.id, title: task.title, description: task.description, status: row.status,
        position: task.position, start_date: task.startDate, end_date: task.endDate,
        created_at: row.created_at, updated_at: row.updated_at,
        blocked: status.blocked, ready: !status.blocked, blockers: status.blockers,
      };
    }),
    dependencies: state.dependencies,
  };
}

function hashSession(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function cookieValue(request: Request): string | undefined {
  const cookies = request.header('cookie')?.split(';').map((part) => part.trim());
  const cookie = cookies?.find((part) => part.startsWith(`${sessionCookie}=`));
  return cookie?.slice(sessionCookie.length + 1);
}

function requireAuth(db: Database.Database, request: Request): string {
  const token = cookieValue(request);
  if (!token) throw new ApiError('UNAUTHORIZED', 'Login required', undefined, 401);
  const session = db.prepare(`SELECT user_id AS userId, expires_at AS expiresAt
    FROM sessions WHERE token_hash = ?`).get(hashSession(token)) as { userId: string; expiresAt: string } | undefined;
  if (!session || session.expiresAt <= new Date().toISOString()) {
    if (session) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashSession(token));
    throw new ApiError('UNAUTHORIZED', 'Login required', undefined, 401);
  }
  return session.userId;
}

function setSessionCookie(response: Response, token: string, expires: Date): void {
  response.append('Set-Cookie', `${sessionCookie}=${token}; Expires=${expires.toUTCString()}; HttpOnly; Path=/; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
}

function clearSessionCookie(response: Response): void {
  response.append('Set-Cookie', `${sessionCookie}=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Path=/; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
}

function withTransaction<T>(db: Database.Database, callback: () => T): T {
  return db.transaction(callback)();
}

export function createApp(db: Database.Database, options: { aiService?: AiServiceType } = {}): express.Express {
  const app = express();
  const aiService = options.aiService ?? new AiService();
  app.use(express.json());

  app.post('/api/auth/login', (request, response, next) => {
    try {
      const now = Date.now();
      const key = request.ip ?? 'unknown';
      const attempt = loginAttempts.get(key);
      if (attempt && attempt.resetAt > now && attempt.count >= loginLimit) {
        throw new ApiError('RATE_LIMITED', 'Too many login attempts', undefined, 429);
      }
      if (!attempt || attempt.resetAt <= now) loginAttempts.set(key, { count: 1, resetAt: now + loginWindowMs });
      else attempt.count += 1;

      const input = loginInput.parse(request.body);
      const user = db.prepare('SELECT id, email, password_hash AS passwordHash FROM users WHERE email = ?')
        .get(input.email.toLowerCase()) as { id: string; email: string; passwordHash: string } | undefined;
      if (!user || !bcrypt.compareSync(input.password, user.passwordHash)) throw new ApiError('UNAUTHORIZED', invalidLoginMessage, undefined, 401);
      loginAttempts.delete(key);

      db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString());
      const token = randomBytes(32).toString('base64url');
      const expires = new Date(Date.now() + sessionDurationMs);
      db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
        .run(hashSession(token), user.id, expires.toISOString(), new Date().toISOString());
      setSessionCookie(response, token, expires);
      response.json({ user: { id: user.id, email: user.email } });
    } catch (error) { next(error); }
  });

  app.post('/api/auth/logout', (request, response, next) => {
    try {
      requireAuth(db, request);
      const token = cookieValue(request);
      if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashSession(token));
      clearSessionCookie(response);
      response.status(204).send();
    } catch (error) { next(error); }
  });

  app.get('/api/auth/me', (request, response, next) => {
    try {
        const userId = requireAuth(db, request);
      const user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(userId) as { id: string; email: string };
      response.json({ user });
    } catch (error) { next(error); }
  });

  app.post('/api/ai/suggest-dependencies', (request, response, next) => {
    try {
      requireAuth(db, request);
      const { taskId } = aiSuggestionInput.parse(request.body);
      const state = loadEngineState(db);
      const targetTask = state.tasks.get(taskId);
      if (!targetTask) throw new ApiError('NOT_FOUND', 'Task not found', { id: taskId }, 404);
      const otherTasks = [...state.tasks.values()].filter((task) => task.id !== taskId);
      aiService.suggest(targetTask, otherTasks, state.dependencies)
        .then((result) => response.json(result))
        .catch(next);
    } catch (error) { next(error); }
  });

  app.get('/api/ai/status', (request, response, next) => {
    try {
      requireAuth(db, request);
      response.json({ provider: aiService.providerName });
    } catch (error) { next(error); }
  });

  app.get('/api/board', (_request, response) => response.json(board(db)));

  app.post('/api/tasks', (request, response, next) => {
    try {
        requireAuth(db, request);
      const input = taskInput.parse(request.body);
      const id = randomUUID();
      const now = new Date().toISOString();
      withTransaction(db, () => {
        const position = Number((db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS position FROM tasks WHERE status = ?').get(input.status) as { position: number }).position);
        db.prepare(`INSERT INTO tasks (id, title, description, status, position, start_date, end_date, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, input.title, input.description, input.status, position, input.start_date, input.end_date, now, now);
        writeAudit(db, 'task.created', { id });
      });
      response.status(201).json({ task: board(db).tasks.find((task) => (task as { id: string }).id === id) });
    } catch (error) { next(error); }
  });

  app.patch('/api/tasks/:id', (request, response, next) => {
    try {
        requireAuth(db, request);
      const input = taskPatch.parse(request.body);
      const moved: Array<{ taskId: string; startDate: string; endDate: string }> = [];
      withTransaction(db, () => {
        const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(request.params.id) as Record<string, unknown> | undefined;
        if (!existing) throw new ApiError('NOT_FOUND', 'Task not found', { id: request.params.id }, 404);
        const nextStart = input.start_date ?? String(existing.start_date);
        const nextEnd = input.end_date ?? String(existing.end_date);
        if (nextEnd < nextStart) throw new ApiError('VALIDATION', 'end_date must not be before start_date', { field: 'end_date' });
        const fields = {
          title: input.title ?? existing.title, description: input.description ?? existing.description,
          status: input.status ?? existing.status, startDate: nextStart, endDate: nextEnd,
        };
        db.prepare(`UPDATE tasks SET title = ?, description = ?, status = ?, start_date = ?, end_date = ?, updated_at = ? WHERE id = ?`)
          .run(fields.title, fields.description, fields.status, fields.startDate, fields.endDate, new Date().toISOString(), request.params.id);
        if (input.status !== undefined && input.status !== existing.status) {
          reindexColumn(db, String(existing.status) as DatabaseStatus);
          reindexColumn(db, input.status);
        }
        if (input.start_date !== undefined || input.end_date !== undefined) {
          const state = loadEngineState(db);
          moved.push(...propagateSchedule(state.tasks, state.dependencies, request.params.id));
          updateDates(db, moved);
        }
        writeAudit(db, 'task.updated', { id: request.params.id, moved });
      });
      response.json({ task: board(db).tasks.find((task) => (task as { id: string }).id === request.params.id), moved });
    } catch (error) { next(error); }
  });

  app.delete('/api/tasks/:id', (request, response, next) => {
    try {
        requireAuth(db, request);
      withTransaction(db, () => {
        if (!db.prepare('SELECT 1 FROM tasks WHERE id = ?').get(request.params.id)) throw new ApiError('NOT_FOUND', 'Task not found', { id: request.params.id }, 404);
        db.prepare('DELETE FROM tasks WHERE id = ?').run(request.params.id);
        writeAudit(db, 'task.deleted', { id: request.params.id });
      });
      response.status(204).send();
    } catch (error) { next(error); }
  });

  app.post('/api/tasks/:id/move', (request, response, next) => {
    try {
        requireAuth(db, request);
      const input = moveInput.parse(request.body);
      withTransaction(db, () => {
        const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(request.params.id) as Record<string, unknown> | undefined;
        if (!existing) throw new ApiError('NOT_FOUND', 'Task not found', { id: request.params.id }, 404);
        const state = loadEngineState(db);
        const statuses = computeStatus(state.tasks, state.dependencies);
        const status = statuses.get(request.params.id);
        if (status?.blocked && statusRank[input.status] > statusRank[String(existing.status) as DatabaseStatus]) {
          throw new ApiError('BLOCKED_MOVE', 'Blocked tasks cannot move forward', { blockers: status.blockers }, 409);
        }
        const oldStatus = String(existing.status) as DatabaseStatus;
        movePosition(db, request.params.id, oldStatus, input.status, input.position);
        writeAudit(db, 'task.moved', { id: request.params.id, status: input.status, position: input.position });
      });
      response.json({ task: board(db).tasks.find((task) => (task as { id: string }).id === request.params.id), moved: [] });
    } catch (error) { next(error); }
  });

  app.post('/api/dependencies', (request, response, next) => {
    try {
        requireAuth(db, request);
      const input = dependencyInput.parse(request.body);
      const moved: Array<{ taskId: string; startDate: string; endDate: string }> = [];
      withTransaction(db, () => {
        const state = loadEngineState(db);
        validateDependency(input.taskId, input.dependsOnId, new Set(state.tasks.keys()), state.dependencies);
        db.prepare('INSERT INTO dependencies (task_id, depends_on_id) VALUES (?, ?)').run(input.taskId, input.dependsOnId);
        const nextState = loadEngineState(db);
        moved.push(...propagateSchedule(nextState.tasks, nextState.dependencies, input.taskId));
        updateDates(db, moved);
        writeAudit(db, 'dependency.created', { ...input, moved });
      });
      response.status(201).json({ dependency: input, moved });
    } catch (error) { next(error); }
  });

  app.delete('/api/dependencies', (request, response, next) => {
    try {
        requireAuth(db, request);
      const input = dependencyInput.parse(request.body);
      withTransaction(db, () => {
        const result = db.prepare('DELETE FROM dependencies WHERE task_id = ? AND depends_on_id = ?').run(input.taskId, input.dependsOnId);
        if (result.changes === 0) throw new ApiError('NOT_FOUND', 'Dependency not found', input, 404);
        writeAudit(db, 'dependency.deleted', input);
      });
      response.status(204).send();
    } catch (error) { next(error); }
  });

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof z.ZodError) return response.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid input', details: error.flatten() } });
    if (error instanceof ApiError) return response.status(error.status).json({ error: { code: error.code, message: error.message, ...(error.details === undefined ? {} : { details: error.details }) } });
    const providerError = aiProviderStatusError(error);
    if (providerError) return response.status(providerError.status).json({ error: { code: 'AI_PROVIDER_ERROR', message: providerError.message, details: {} } });
    if (error instanceof DependencyError) return response.status(409).json({ error: { code: 'CYCLE_DETECTED', message: error.message, details: { path: error.cyclePath ?? [] } } });
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) return response.status(400).json({ error: { code: 'VALIDATION', message: 'Duplicate dependency', details: {} } });
    console.error(error);
    return response.status(500).json({ error: { code: 'VALIDATION', message: 'Internal server error', details: {} } });
  });
  return app;
}
