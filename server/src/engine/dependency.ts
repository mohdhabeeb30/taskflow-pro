import { findCyclePath } from './graph.js';
import type { Dependency } from './types.js';

export class DependencyError extends Error {
  constructor(message: string, readonly cyclePath?: string[]) {
    super(message);
    this.name = 'DependencyError';
  }
}

export function validateDependency(
  taskId: string,
  dependsOnId: string,
  taskIds: ReadonlySet<string>,
  dependencies: readonly Dependency[],
): void {
  if (!taskIds.has(taskId) || !taskIds.has(dependsOnId)) throw new DependencyError('Both tasks must exist');
  if (taskId === dependsOnId) throw new DependencyError('A task cannot depend on itself');
  if (dependencies.some((dependency) => dependency.taskId === taskId && dependency.dependsOnId === dependsOnId)) {
    throw new DependencyError('This dependency already exists');
  }
  const cyclePath = findCyclePath(dependencies, taskId, dependsOnId);
  if (cyclePath !== null) throw new DependencyError(`Dependency would create a cycle: ${cyclePath.join(' -> ')}`, cyclePath);
}
