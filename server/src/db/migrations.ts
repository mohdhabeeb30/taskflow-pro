import type Database from 'better-sqlite3';

interface Migration {
  version: number;
  sql: string;
}

const migrations: readonly Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL CHECK (status IN ('backlog', 'in_progress', 'review', 'done')),
        position INTEGER NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE dependencies (
        task_id TEXT NOT NULL,
        depends_on_id TEXT NOT NULL,
        PRIMARY KEY (task_id, depends_on_id),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (depends_on_id) REFERENCES tasks(id) ON DELETE CASCADE,
        CHECK (task_id != depends_on_id)
      );

      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts TEXT NOT NULL,
        action TEXT NOT NULL,
        payload JSON NOT NULL DEFAULT '{}'
      );

      CREATE INDEX dependencies_task_id_idx ON dependencies(task_id);
      CREATE INDEX dependencies_depends_on_id_idx ON dependencies(depends_on_id);
      CREATE INDEX tasks_status_position_idx ON tasks(status, position);
    `,
  },
  {
    version: 2,
    sql: `
      CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX sessions_user_id_idx ON sessions(user_id);
      CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);
    `,
  },
];

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set<number>(
    (db.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as Array<{ version: number }>)
      .map((row) => row.version),
  );

  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;
    db.transaction(() => {
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
        .run(migration.version, new Date().toISOString());
    })();
  }
}
