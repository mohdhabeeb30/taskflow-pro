import bcrypt from 'bcryptjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import Database from 'better-sqlite3';
import { rmSync } from 'node:fs';
import { openDatabase } from '../src/db/database.js';
import { runMigrations } from '../src/db/migrations.js';
import { createApp } from '../src/api/app.js';
import { MockProvider } from '../src/ai/provider.js';
import { AiService } from '../src/ai/service.js';

const databases: Database.Database[] = [];
const paths: string[] = [];

function makeMemoryApp(aiService?: AiService) {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  databases.push(db);
  db.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
    .run('test-user', 'test@example.com', bcrypt.hashSync('correct-password', 4), new Date().toISOString());
  const app = aiService ? createApp(db, { aiService }) : createApp(db);
  return { db, app, agent: request.agent(app) };
}

const task = (title: string, status = 'backlog', start_date = '2026-01-01', end_date = '2026-01-03') => ({ title, description: title, status, start_date, end_date });

async function login(agent: request.Agent) {
  const response = await agent.post('/api/auth/login').send({ email: 'test@example.com', password: 'correct-password' });
  expect(response.status).toBe(200);
  return response;
}

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
  while (paths.length > 0) rmSync(paths.pop()!, { force: true });
});

describe('TaskFlow API', () => {
  it('requires a session for writes and ignores x-user-id', async () => {
    const { app } = makeMemoryApp();
    const response = await request(app).post('/api/tasks').set('x-user-id', 'test-user').send(task('Unauthenticated'));
    expect(response.status).toBe(401);
  });

  it('serves the board without login', async () => {
    const { app } = makeMemoryApp();
    expect((await request(app).get('/api/board')).status).toBe(200);
  });

  it('requires login for AI suggestions and caches mock results', async () => {
    const { app, agent } = makeMemoryApp(new AiService(new MockProvider('[]')));
    expect((await request(app).post('/api/ai/suggest-dependencies')).status).toBe(401);
    await login(agent);
    expect((await agent.get('/api/ai/status')).body).toEqual({ provider: 'mock' });
    const first = await agent.post('/api/ai/suggest-dependencies');
    const second = await agent.post('/api/ai/suggest-dependencies');
    expect(first.body).toMatchObject({ accepted: [], rejected: [], provider: 'mock', cached: false });
    expect(second.body).toMatchObject({ provider: 'mock', cached: true });
  });

  it('logs in with an httpOnly cookie and returns no secret fields', async () => {
    const { app } = makeMemoryApp();
    const response = await request(app).post('/api/auth/login').send({ email: 'test@example.com', password: 'correct-password' });
    expect(response.status).toBe(200);
    expect(response.headers['set-cookie']?.[0]).toMatch(/taskflow_session=.*HttpOnly/);
    expect(JSON.stringify(response.body)).not.toMatch(/password|token|password_hash/i);
  });

  it('rejects a wrong password with a generic error', async () => {
    const { app } = makeMemoryApp();
    const response = await request(app).post('/api/auth/login').send({ email: 'test@example.com', password: 'wrong-password' });
    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe('Invalid email or password');
    expect(JSON.stringify(response.body)).not.toMatch(/password_hash|token|test@example.com/i);
  });

  it('does not expose passwords or tokens in auth logs', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { app } = makeMemoryApp();
    await request(app).post('/api/auth/login').send({ email: 'test@example.com', password: 'correct-password' });
    expect(`${log.mock.calls.flat()}${error.mock.calls.flat()}`).not.toMatch(/correct-password|taskflow_session|token/i);
    log.mockRestore();
    error.mockRestore();
  });

  it('rejects a cycle and leaves dependencies unchanged', async () => {
    const { db, agent } = makeMemoryApp();
    await login(agent);
    const a = await agent.post('/api/tasks').send(task('A'));
    const b = await agent.post('/api/tasks').send(task('B'));
    await agent.post('/api/dependencies').send({ taskId: b.body.task.id, dependsOnId: a.body.task.id });
    const response = await agent.post('/api/dependencies').send({ taskId: a.body.task.id, dependsOnId: b.body.task.id });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CYCLE_DETECTED');
    expect((db.prepare('SELECT * FROM dependencies').all() as unknown[])).toHaveLength(1);
  });

  it('rejects a forward move of a blocked task', async () => {
    const { agent } = makeMemoryApp();
    await login(agent);
    const a = await agent.post('/api/tasks').send(task('A'));
    const b = await agent.post('/api/tasks').send(task('B'));
    await agent.post('/api/dependencies').send({ taskId: b.body.task.id, dependsOnId: a.body.task.id });
    const response = await agent.post(`/api/tasks/${b.body.task.id}/move`).send({ status: 'review', position: 0 });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('BLOCKED_MOVE');
    expect(response.body.error.details.blockers).toContain(a.body.task.id);
  });

  it('cascades blocked status through the API after regression', async () => {
    const { agent } = makeMemoryApp();
    await login(agent);
    const a = await agent.post('/api/tasks').send(task('A', 'done'));
    const b = await agent.post('/api/tasks').send(task('B', 'done'));
    const c = await agent.post('/api/tasks').send(task('C', 'done'));
    await agent.post('/api/dependencies').send({ taskId: b.body.task.id, dependsOnId: a.body.task.id });
    await agent.post('/api/dependencies').send({ taskId: c.body.task.id, dependsOnId: b.body.task.id });
    await agent.post(`/api/tasks/${a.body.task.id}/move`).send({ status: 'in_progress', position: 0 });
    const board = await agent.get('/api/board');
    expect(board.body.tasks.filter((item: { blocked: boolean }) => item.blocked)).toHaveLength(2);
  });

  it('persists the board and positions across fresh app instances', async () => {
    const path = `/tmp/taskflow-api-${Date.now()}.sqlite`;
    paths.push(path);
    const firstDb = openDatabase(path);
    databases.push(firstDb);
    dbForTest(firstDb);
    const firstApp = createApp(firstDb);
    const firstAgent = request.agent(firstApp);
    await login(firstAgent);
    const created = await firstAgent.post('/api/tasks').send(task('Persisted'));
    await firstAgent.post('/api/tasks').send(task('Second'));
    await firstAgent.post(`/api/tasks/${created.body.task.id}/move`).send({ status: 'review', position: 0 });
    const boardBefore = await firstAgent.get('/api/board');
    firstDb.close();
    databases.splice(databases.indexOf(firstDb), 1);
    const secondDb = openDatabase(path);
    databases.push(secondDb);
    const boardAfter = await request(createApp(secondDb)).get('/api/board');
    expect(boardAfter.body.tasks).toEqual(boardBefore.body.tasks);
  });
});

function dbForTest(db: Database.Database): void {
  db.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
    .run('test-user', 'test@example.com', bcrypt.hashSync('correct-password', 4), new Date().toISOString());
}
