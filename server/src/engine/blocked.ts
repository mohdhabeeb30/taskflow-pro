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
  const result = new Map<string, StatusInfo>();
  for (const id of ids) {
    const blockers = prerequisitesOf(id, dependencies).filter((prerequisiteId) => tasks.get(prerequisiteId)?.status !== 'Done');
    result.set(id, { blocked: blockers.length > 0, blockers });
  }
  return result;
}
