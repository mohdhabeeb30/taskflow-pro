export type TaskStatus = 'Backlog' | 'In Progress' | 'Review' | 'Done';

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  startDate: string;
  endDate: string;
}

export interface Dependency {
  taskId: string;
  dependsOnId: string;
}

export interface DateChange {
  taskId: string;
  startDate: string;
  endDate: string;
}

export interface StatusInfo {
  blocked: boolean;
  blockers: string[];
}

export interface VisitCounter {
  count: number;
}
