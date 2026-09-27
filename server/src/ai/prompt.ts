import type { Dependency, Task } from '../engine/types.js';

export function buildDependencyPrompt(targetTask: Task, otherTasks: readonly Task[], dependencies: readonly Dependency[]): string {
  const taskData = otherTasks.map(({ id, title, description, status, startDate, endDate }) => ({ id, title, description, status, startDate, endDate }));
  const targetData = { id: targetTask.id, title: targetTask.title, description: targetTask.description, status: targetTask.status, startDate: targetTask.startDate, endDate: targetTask.endDate };
  return [
    'For the task below, suggest any plausible missing prerequisite from the other tasks listed, based on its title and description. Most relationships likely already exist in the existing dependencies list, so look specifically for gaps like a task that should logically come before this one but isn\'t yet linked. If genuinely none, return an empty array, but check carefully before concluding that.',
    'Use only the task ids provided below. Do not invent ids or suggest a prerequisite not listed.',
    'Return JSON only: an array of objects with exactly taskId, dependsOnId, and reason string fields.',
    'Every reason must briefly explain why the prerequisite is plausible for the target task.',
    'Do not return self-dependencies, duplicate existing dependencies, or cycles. An empty array is valid.',
    `Target task: ${JSON.stringify(targetData)}`,
    `Other tasks: ${JSON.stringify(taskData)}`,
    `Existing dependencies: ${JSON.stringify(dependencies)}`,
  ].join('\n');
}