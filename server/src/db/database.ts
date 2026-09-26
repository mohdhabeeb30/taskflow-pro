import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { runMigrations } from './migrations.js';

export function openDatabase(databasePath = process.env.DB_PATH || './data/taskflow.sqlite'): Database.Database {
  const resolvedPath = resolve(databasePath);
  mkdirSync(dirname(resolvedPath), { recursive: true });
  const db = new Database(resolvedPath);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  runMigrations(db);
  return db;
}
