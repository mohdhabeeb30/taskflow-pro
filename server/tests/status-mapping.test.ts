import { describe, expect, it } from 'vitest';
import { databaseToEngineStatus, engineToDatabaseStatus, type DatabaseStatus } from '../src/api/status-mapping.js';
import type { TaskStatus as EngineStatus } from '../src/engine/types.js';

describe('SQLite and engine status mapping', () => {
  it('maps all four statuses in both directions', () => {
    const pairs: Array<[DatabaseStatus, EngineStatus]> = [
      ['backlog', 'Backlog'],
      ['in_progress', 'In Progress'],
      ['review', 'Review'],
      ['done', 'Done'],
    ];

    for (const [databaseStatus, engineStatus] of pairs) {
      expect(databaseToEngineStatus(databaseStatus)).toBe(engineStatus);
      expect(engineToDatabaseStatus(engineStatus)).toBe(databaseStatus);
    }
  });
});
