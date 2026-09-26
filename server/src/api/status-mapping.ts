import type { TaskStatus as EngineStatus } from '../engine/types.js';

export type DatabaseStatus = 'backlog' | 'in_progress' | 'review' | 'done';

const engineStatusByDatabase: Record<DatabaseStatus, EngineStatus> = {
  backlog: 'Backlog',
  in_progress: 'In Progress',
  review: 'Review',
  done: 'Done',
};

const databaseStatusByEngine: Record<EngineStatus, DatabaseStatus> = {
  Backlog: 'backlog',
  'In Progress': 'in_progress',
  Review: 'review',
  Done: 'done',
};

export function databaseToEngineStatus(status: DatabaseStatus): EngineStatus {
  return engineStatusByDatabase[status];
}

export function engineToDatabaseStatus(status: EngineStatus): DatabaseStatus {
  return databaseStatusByEngine[status];
}
