import { getDownstream, prerequisitesOf } from './graph.js';
import type { Dependency, StatusInfo, Task, VisitCounter } from './types.js';

export function isBlocked(task: Task, tasks: ReadonlyMap<string, Task>, dependencies: readonly Dependency[]): boolean {
  return prerequisitesOf(task.id, dependencies).some((id) => tasks.get(id)?.status !== 'Done');
}

export function computeStatus(
  tasks: ReadonlyMap<string, Task>,
  dependencies: readonly Dependency[],
  changedId?: string,
  visitedNodes?: VisitCounter,
): Map<string, StatusInfo> {
  const ids = changedId === undefined ? tasks.keys() : new Set([changedId, ...getDownstream(dependencies, changedId, visitedNodes)]);
  const memo = new Map<string, StatusInfo>();
  const resolving = new Set<string>();
  const resolve = (id: string): StatusInfo => {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    if (resolving.has(id)) return { blocked: true, blockers: [id] };
    resolving.add(id);
    const blockers = prerequisitesOf(id, dependencies).filter((prerequisiteId) => {
      const prerequisite = tasks.get(prerequisiteId);
      return prerequisite?.status !== 'Done' || resolve(prerequisiteId).blocked;
    });
    const status = { blocked: blockers.length > 0, blockers };
    resolving.delete(id);
    memo.set(id, status);
    return status;
  };
  const result = new Map<string, StatusInfo>();
  for (const id of ids) result.set(id, resolve(id));
  return result;
}
