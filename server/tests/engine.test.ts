import { describe, expect, it } from 'vitest';
import {
  canMove, computeStatus, findCyclePath, getDownstream, propagateSchedule, topoOrder, validateDependency,
  type Dependency, type Task,
} from '../src/engine/index.js';

const task = (id: string, status: Task['status'] = 'In Progress', startDate = '2026-01-01', endDate = '2026-01-03'): Task => ({
  id, title: id, description: '', status, startDate, endDate,
});
const mapOf = (...tasks: Task[]) => new Map(tasks.map((item) => [item.id, item]));
const edge = (taskId: string, dependsOnId: string): Dependency => ({ taskId, dependsOnId });

describe('cycle validation', () => {
  it('rejects a self-loop', () => expect(() => validateDependency('A', 'A', new Set(['A']), [])).toThrow('self'));
  it('rejects a two-node cycle', () => expect(() => validateDependency('B', 'A', new Set(['A', 'B']), [edge('A', 'B')])).toThrow('cycle'));
  it('returns the exact three-node cycle path', () => expect(findCyclePath([edge('A', 'B'), edge('B', 'C')], 'C', 'A')).toEqual(['C', 'A', 'B', 'C']));
  it('returns the exact longer cycle path', () => {
    const dependencies = [edge('A', 'B'), edge('B', 'C'), edge('C', 'D'), edge('D', 'E')];
    expect(findCyclePath(dependencies, 'E', 'A')).toEqual(['E', 'A', 'B', 'C', 'D', 'E']);
  });
  it('rejects a duplicate edge', () => expect(() => validateDependency('A', 'B', new Set(['A', 'B']), [edge('A', 'B')])).toThrow('already exists'));
});

describe('graph traversal', () => {
  it('returns all downstream tasks with BFS', () => {
    expect(getDownstream([edge('B', 'A'), edge('C', 'B'), edge('D', 'A')], 'A')).toEqual(new Set(['B', 'D', 'C']));
  });
  it('returns a topological order for a subset', () => {
    expect(topoOrder(['D', 'B', 'C'], [edge('B', 'A'), edge('C', 'B'), edge('D', 'C')])).toEqual(['B', 'C', 'D']);
  });
});

describe('status and movement', () => {
  it('returns blocked status and direct blockers per task', () => {
    const tasks = mapOf(task('A', 'In Progress'), task('B'), task('C', 'Done'));
    expect(computeStatus(tasks, [edge('B', 'A'), edge('B', 'C')]).get('B')).toEqual({ blocked: true, blockers: ['A'] });
  });
  it('allows backward moves and rejects blocked forward moves', () => {
    const blockedTask = task('B', 'In Progress');
    const statuses = new Map([['B', { blocked: true, blockers: ['A'] }]]);
    expect(canMove(blockedTask, 'Backlog', statuses)).toBe(true);
    expect(canMove(blockedTask, 'Review', statuses)).toBe(false);
  });
  it('rolls regression through three levels and unblocks after Done', () => {
    const tasks = mapOf(task('A', 'In Progress'), task('B', 'Done'), task('C', 'Done'), task('D', 'Done'));
    const dependencies = [edge('B', 'A'), edge('C', 'B'), edge('D', 'C')];
    expect([...computeStatus(tasks, dependencies).entries()].filter(([, status]) => status.blocked).map(([id]) => id)).toEqual(['B']);
    tasks.set('A', task('A', 'Done'));
    expect([...computeStatus(tasks, dependencies).values()].every((status) => !status.blocked)).toBe(true);
  });
});

describe('schedule propagation', () => {
  it('moves the diamond sink by the MAX delay, not the sum', () => {
    const tasks = mapOf(task('A', 'Done', '2026-01-01', '2026-01-06'), task('B', 'In Progress', '2026-01-01', '2026-01-03'), task('C', 'In Progress', '2026-01-01', '2026-01-04'), task('D', 'In Progress', '2026-01-01', '2026-01-02'));
    const changes = propagateSchedule(tasks, [edge('B', 'A'), edge('C', 'A'), edge('D', 'B'), edge('D', 'C')], 'A');
    expect(changes.find((change) => change.taskId === 'D')?.startDate).toBe('2026-01-09');
  });
  it('moves a wide diamond sink exactly once across five paths', () => {
    const tasks = mapOf(task('A', 'Done', '2026-01-01', '2026-01-11'), task('S', 'In Progress', '2026-01-01', '2026-01-02'));
    const dependencies = ['B', 'C', 'D', 'E', 'F'].flatMap((id) => [edge(id, 'A'), edge('S', id)]);
    for (const id of ['B', 'C', 'D', 'E', 'F']) tasks.set(id, task(id));
    expect(propagateSchedule(tasks, dependencies, 'A').filter((change) => change.taskId === 'S')).toHaveLength(1);
  });
  it('moves a sink with slack only until its prerequisite catches up', () => {
    const tasks = mapOf(task('A', 'Done', '2026-01-01', '2026-01-06'), task('B', 'In Progress', '2026-01-10', '2026-01-12'));
    expect(propagateSchedule(tasks, [edge('B', 'A')], 'A')).toEqual([]);
  });
  it('keeps duration when shifting a task', () => {
    const tasks = mapOf(task('A', 'Done', '2026-01-01', '2026-01-06'), task('B', 'In Progress', '2026-01-01', '2026-01-03'));
    expect(propagateSchedule(tasks, [edge('B', 'A')], 'A')).toEqual([{ taskId: 'B', startDate: '2026-01-06', endDate: '2026-01-08' }]);
  });
  it('never pulls downstream tasks earlier', () => {
    const tasks = mapOf(task('A', 'Done', '2026-01-01', '2026-01-02'), task('B', 'In Progress', '2026-01-10', '2026-01-12'));
    expect(propagateSchedule(tasks, [edge('B', 'A')], 'A')).toEqual([]);
  });
  it('never touches disconnected tasks', () => {
    const tasks = mapOf(task('A', 'Done', '2026-01-01', '2026-01-06'), task('B'), task('X'), task('Y'));
    expect(propagateSchedule(tasks, [edge('B', 'A'), edge('Y', 'X')], 'A').map((change) => change.taskId)).toEqual(['B']);
  });
});

describe('engine performance and visit scope', () => {
  it('handles a chain of 10,000 tasks in under one second', () => {
    const dependencies = Array.from({ length: 9_999 }, (_, index) => edge(`T${index + 1}`, `T${index}`));
    const start = performance.now();
    expect(getDownstream(dependencies, 'T0').size).toBe(9_999);
    expect(performance.now() - start).toBeLessThan(1_000);
  });
  it('keeps propagation and status recomputation under 200ms for 500 overlapping tasks', () => {
    const tasks = mapOf(...Array.from({ length: 500 }, (_, index) => task(`T${index}`, index === 0 ? 'Done' : 'In Progress')));
    const dependencies = Array.from({ length: 499 }, (_, index) => edge(`T${index + 1}`, `T${index}`));
    const start = performance.now();
    propagateSchedule(tasks, dependencies, 'T0');
    computeStatus(tasks, dependencies, 'T0');
    expect(performance.now() - start).toBeLessThan(200);
  });
  it('counts only the changed task and downstream nodes', () => {
    const dependencies = [edge('B', 'A'), edge('C', 'B'), edge('Y', 'X')];
    const visits = { count: 0 };
    getDownstream(dependencies, 'A', visits);
    expect(visits.count).toBe(3);
  });
});
