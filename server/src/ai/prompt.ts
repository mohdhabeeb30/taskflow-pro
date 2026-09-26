import type { Dependency, Task } from '../engine/types.js';

export function buildDependencyPrompt(tasks: readonly Task[], dependencies: readonly Dependency[]): string {
  const taskData = tasks.map(({ id, title, description, status, startDate, endDate }) => ({ id, title, description, status, startDate, endDate }));
  return [
    'Suggest prerequisite dependencies for the current TaskFlow board.',
    'Use only the task ids and existing dependencies provided below. Do not invent ids.',
    'Return JSON only: an array of objects with exactly taskId and dependsOnId string fields.',
    'A task may depend on another task only when that relationship is a plausible prerequisite.',
    'Do not return self-dependencies, duplicate existing dependencies, or cycles. An empty array is valid.',
    `Tasks: ${JSON.stringify(taskData)}`,
    `Existing dependencies: ${JSON.stringify(dependencies)}`,
  ].join('\n');
}