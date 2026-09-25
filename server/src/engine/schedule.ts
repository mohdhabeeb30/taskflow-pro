import { prerequisitesOf, downstreamOf, topologicalOrder } from './graph.js';
import type { DateChange, Dependency, Task } from './types.js';

function dateValue(date: string): number {
  const value = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(value)) throw new Error(`Invalid date: ${date}`);
  return value;
}

function dateString(value: number): string {
  return new Date(value).toISOString().slice(0, 10);
}

function duration(task: Task): number {
  return dateValue(task.endDate) - dateValue(task.startDate);
}

export function propagateSchedule(
  changedTaskId: string,
  tasks: ReadonlyMap<string, Task>,
  dependencies: readonly Dependency[],
): DateChange[] {
  const affected = downstreamOf(changedTaskId, dependencies);
  const changes: DateChange[] = [];
  for (const taskId of topologicalOrder(affected, dependencies)) {
    const task = tasks.get(taskId);
    if (task === undefined) continue;
    const latestPrerequisiteEnd = Math.max(
      ...prerequisitesOf(taskId, dependencies).map((id) => dateValue(tasks.get(id)?.endDate ?? task.startDate)),
    );
    if (latestPrerequisiteEnd > dateValue(task.startDate)) {
      const shift = latestPrerequisiteEnd - dateValue(task.startDate);
      const change = { taskId, startDate: dateString(latestPrerequisiteEnd), endDate: dateString(dateValue(task.endDate) + shift) };
      changes.push(change);
      tasks = new Map(tasks).set(taskId, { ...task, startDate: change.startDate, endDate: change.endDate });
    }
  }
  return changes;
}

export { duration };
