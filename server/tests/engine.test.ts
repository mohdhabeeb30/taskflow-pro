import { describe, expect, it } from 'vitest';
import { isBlocked, validateDependency, propagateSchedule, type Dependency, type Task } from '../src/engine/index.js';

const task = (id: string, status: Task['status'] = 'In Progress', startDate = '2026-01-01', endDate = '2026-01-03'): Task => ({
  id, title: id, description: '', status, startDate, endDate,
});

const mapOf = (...tasks: Task[]) => new Map(tasks.map((item) => [item.id, item]));

describe('dependency engine', () => {
  it('rejects self-dependencies, duplicates, and cycles with a path', () => {
    const dependencies: Dependency[] = [{ taskId: 'b', dependsOnId: 'a' }, { taskId: 'c', dependsOnId: 'b' }];
    expect(() => validateDependency('a', 'a', new Set(['a', 'b', 'c']), dependencies)).toThrow('self');
    expect(() => validateDependency('b', 'a', new Set(['a', 'b', 'c']), dependencies)).toThrow('already exists');
    expect(() => validateDependency('a', 'c', new Set(['a', 'b', 'c']), dependencies)).toThrow('a -> c -> b -> a');
  });

  it('derives blocked from prerequisite statuses', () => {
    const tasks = mapOf(task('a', 'In Progress'), task('b'));
    expect(isBlocked(tasks.get('b')!, tasks, [{ taskId: 'b', dependsOnId: 'a' }])).toBe(true);
    tasks.set('a', task('a', 'Done'));
    expect(isBlocked(tasks.get('b')!, tasks, [{ taskId: 'b', dependsOnId: 'a' }])).toBe(false);
  });

  it('propagates one maximum push through a diamond without compounding', () => {
    const tasks = mapOf(
      task('a', 'Done', '2026-01-01', '2026-01-06'),
      task('b', 'In Progress', '2026-01-01', '2026-01-03'),
      task('c', 'In Progress', '2026-01-01', '2026-01-04'),
      task('d', 'In Progress', '2026-01-01', '2026-01-02'),
    );
    const dependencies = [
      { taskId: 'b', dependsOnId: 'a' }, { taskId: 'c', dependsOnId: 'a' },
      { taskId: 'd', dependsOnId: 'b' }, { taskId: 'd', dependsOnId: 'c' },
    ];
    expect(propagateSchedule('a', tasks, dependencies)).toEqual([
      { taskId: 'b', startDate: '2026-01-06', endDate: '2026-01-08' },
      { taskId: 'c', startDate: '2026-01-06', endDate: '2026-01-09' },
      { taskId: 'd', startDate: '2026-01-09', endDate: '2026-01-10' },
    ]);
  });

  it('never pulls downstream work earlier', () => {
    const tasks = mapOf(task('a', 'Done', '2026-01-01', '2026-01-02'), task('b', 'In Progress', '2026-01-10', '2026-01-12'));
    expect(propagateSchedule('a', tasks, [{ taskId: 'b', dependsOnId: 'a' }])).toEqual([]);
  });
});
