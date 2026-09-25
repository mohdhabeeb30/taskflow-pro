import { prerequisitesOf } from './graph.js';
import type { Dependency, Task } from './types.js';

export function isBlocked(task: Task, tasks: ReadonlyMap<string, Task>, dependencies: readonly Dependency[]): boolean {
  return prerequisitesOf(task.id, dependencies).some((id) => tasks.get(id)?.status !== 'Done');
}
