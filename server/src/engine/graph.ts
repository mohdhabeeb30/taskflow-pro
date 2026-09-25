import type { Dependency } from './types.js';

export function prerequisitesOf(taskId: string, dependencies: readonly Dependency[]): string[] {
  return dependencies.filter((dependency) => dependency.taskId === taskId).map((dependency) => dependency.dependsOnId);
}

export function dependentsOf(taskId: string, dependencies: readonly Dependency[]): string[] {
  return dependencies.filter((dependency) => dependency.dependsOnId === taskId).map((dependency) => dependency.taskId);
}

export function downstreamOf(taskId: string, dependencies: readonly Dependency[]): Set<string> {
  const downstream = new Set<string>();
  const pending = [taskId];
  while (pending.length > 0) {
    const current = pending.shift();
    if (current === undefined) continue;
    for (const dependent of dependentsOf(current, dependencies)) {
      if (!downstream.has(dependent)) {
        downstream.add(dependent);
        pending.push(dependent);
      }
    }
  }
  return downstream;
}

export function topologicalOrder(taskIds: Iterable<string>, dependencies: readonly Dependency[]): string[] {
  const ids = new Set(taskIds);
  const indegree = new Map([...ids].map((id) => [id, 0]));
  for (const dependency of dependencies) {
    if (ids.has(dependency.taskId) && ids.has(dependency.dependsOnId)) {
      indegree.set(dependency.taskId, (indegree.get(dependency.taskId) ?? 0) + 1);
    }
  }

  const queue = [...ids].filter((id) => indegree.get(id) === 0).sort();
  const result: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) continue;
    result.push(current);
    for (const dependent of dependentsOf(current, dependencies).sort()) {
      if (!ids.has(dependent)) continue;
      const next = (indegree.get(dependent) ?? 0) - 1;
      indegree.set(dependent, next);
      if (next === 0) queue.push(dependent);
    }
  }
  if (result.length !== ids.size) throw new Error('Graph contains a cycle');
  return result;
}

export function findCyclePath(
  taskId: string,
  dependsOnId: string,
  dependencies: readonly Dependency[],
): string[] | null {
  if (taskId === dependsOnId) return [taskId, taskId];
  const next = new Map<string, string[]>();
  for (const dependency of dependencies) {
    const current = next.get(dependency.taskId) ?? [];
    current.push(dependency.dependsOnId);
    next.set(dependency.taskId, current);
  }
  const pending: Array<{ id: string; path: string[] }> = [{ id: dependsOnId, path: [dependsOnId] }];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const current = pending.shift();
    if (current === undefined) continue;
    if (current.id === taskId) return [taskId, ...current.path];
    if (visited.has(current.id)) continue;
    visited.add(current.id);
    for (const prerequisite of next.get(current.id) ?? []) {
      pending.push({ id: prerequisite, path: [...current.path, prerequisite] });
    }
  }
  return null;
}
