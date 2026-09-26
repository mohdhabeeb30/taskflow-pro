import bcrypt from 'bcryptjs';
import { existsSync } from 'node:fs';
import process from 'node:process';
import { openDatabase } from './db/database.js';

type SeedTask = {
  id: string;
  title: string;
  description: string;
  status: 'backlog' | 'in_progress' | 'review' | 'done';
  position: number;
  startDate: string;
  endDate: string;
};

type SeedDependency = [taskId: string, dependsOnId: string];

const tasks: readonly SeedTask[] = [
  { id: 'database-schema', title: 'Database Schema', description: 'Create the launch data model and migrations.', status: 'done', position: 0, startDate: '2026-10-01', endDate: '2026-10-03' },
  { id: 'backend-api-auth', title: 'Backend API and Auth Service', description: 'Build the API surface and team authentication.', status: 'in_progress', position: 0, startDate: '2026-10-03', endDate: '2026-10-05' },
  { id: 'frontend-board-ui', title: 'Frontend Board UI', description: 'Build the launch board and task editing workflow.', status: 'review', position: 0, startDate: '2026-10-03', endDate: '2026-10-05' },
  { id: 'integration-tests', title: 'Integration Tests', description: 'Verify the API, auth, and board data flow together.', status: 'backlog', position: 0, startDate: '2026-10-05', endDate: '2026-10-07' },
  { id: 'deploy-staging', title: 'Deploy Staging Server', description: 'Deploy a reproducible staging environment.', status: 'backlog', position: 1, startDate: '2026-10-05', endDate: '2026-10-06' },
  { id: 'run-e2e-tests', title: 'Run End to End Tests', description: 'Exercise the product through a browser-like launch flow.', status: 'backlog', position: 1, startDate: '2026-10-07', endDate: '2026-10-08' },
  { id: 'production-release', title: 'Production Release', description: 'Promote the validated build to production.', status: 'backlog', position: 2, startDate: '2026-10-08', endDate: '2026-10-09' },
  { id: 'product-analytics', title: 'Product Analytics', description: 'Choose launch events and add the first tracking dashboard.', status: 'backlog', position: 3, startDate: '2026-10-01', endDate: '2026-10-02' },
  { id: 'error-monitoring', title: 'Error Monitoring', description: 'Configure actionable error reporting for launch week.', status: 'backlog', position: 4, startDate: '2026-10-05', endDate: '2026-10-06' },
  { id: 'launch-checklist', title: 'Launch Checklist', description: 'Confirm support, release notes, and go-live ownership.', status: 'backlog', position: 5, startDate: '2026-10-09', endDate: '2026-10-10' },
];

const dependencies: readonly SeedDependency[] = [
  ['backend-api-auth', 'database-schema'],
  ['frontend-board-ui', 'database-schema'],
  ['integration-tests', 'database-schema'],
  ['integration-tests', 'backend-api-auth'],
  ['integration-tests', 'frontend-board-ui'],
  ['deploy-staging', 'backend-api-auth'],
  ['run-e2e-tests', 'integration-tests'],
  ['production-release', 'deploy-staging'],
  ['production-release', 'run-e2e-tests'],
  ['error-monitoring', 'backend-api-auth'],
  ['launch-checklist', 'production-release'],
  ['launch-checklist', 'product-analytics'],
  ['launch-checklist', 'error-monitoring'],
];

function loadEnvironment(): void {
  if (existsSync('.env')) process.loadEnvFile?.();
}

function seed(): void {
  loadEnvironment();
  const db = openDatabase();
  const now = new Date().toISOString();
  const email = process.env.SEED_USER_EMAIL?.trim();
  if (!email) throw new Error('SEED_USER_EMAIL must be set before running the seed');

  const password = process.env.SEED_USER_PASSWORD ?? '';
  if (!password) throw new Error('SEED_USER_PASSWORD must be set before running the seed');
  const passwordHash = bcrypt.hashSync(password, 12);

  db.transaction(() => {
    db.exec('DELETE FROM dependencies; DELETE FROM tasks; DELETE FROM users; DELETE FROM audit_log;');
    const insertTask = db.prepare(`
      INSERT INTO tasks (id, title, description, status, position, start_date, end_date, created_at, updated_at)
      VALUES (@id, @title, @description, @status, @position, @startDate, @endDate, @now, @now)
    `);
    for (const task of tasks) insertTask.run({ ...task, now });

    const insertDependency = db.prepare('INSERT INTO dependencies (task_id, depends_on_id) VALUES (?, ?)');
    for (const [taskId, dependsOnId] of dependencies) insertDependency.run(taskId, dependsOnId);

    db.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run('demo-user', email, passwordHash, now);
    db.prepare('INSERT INTO audit_log (ts, action, payload) VALUES (?, ?, json(?))')
      .run(now, 'seed.completed', JSON.stringify({ taskCount: tasks.length, dependencyCount: dependencies.length, email }));
  })();

  console.log(`Seed created ${tasks.length} tasks, ${dependencies.length} dependencies, and 1 demo user (${email}).`);
  db.close();
}

seed();
