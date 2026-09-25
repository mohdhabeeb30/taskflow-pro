import type { StatusInfo, Task, TaskStatus } from './types.js';

const statusOrder: TaskStatus[] = ['Backlog', 'In Progress', 'Review', 'Done'];

export function canMove(task: Task, targetStatus: TaskStatus, statusMap: ReadonlyMap<string, StatusInfo>): boolean {
  const currentIndex = statusOrder.indexOf(task.status);
  const targetIndex = statusOrder.indexOf(targetStatus);
  const status = statusMap.get(task.id);
  return targetIndex <= currentIndex || status?.blocked !== true;
}