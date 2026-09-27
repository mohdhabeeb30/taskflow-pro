import { validateDependency, type Dependency, type Task } from '../engine/index.js';

export type SuggestedDependency = { taskId: string; dependsOnId: string; reason: string };
export type RejectedSuggestion = { suggestion: unknown; reason: string };

export function validateSuggestions(raw: string, targetTaskId: string, tasks: readonly Task[], existingDependencies: readonly Dependency[]): { accepted: SuggestedDependency[]; rejected: RejectedSuggestion[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { accepted: [], rejected: [{ suggestion: raw, reason: 'Invalid JSON response' }] };
  }
  if (!Array.isArray(parsed)) return { accepted: [], rejected: [{ suggestion: parsed, reason: 'Response must be a JSON array' }] };

  const taskIds = new Set(tasks.map((task) => task.id));
  const accepted: SuggestedDependency[] = [];
  const rejected: RejectedSuggestion[] = [];
  const dependencies = [...existingDependencies];
  for (const suggestion of parsed) {
    if (!isSuggestion(suggestion)) {
      rejected.push({ suggestion, reason: 'Suggestion must contain string taskId, dependsOnId, and reason fields' });
      continue;
    }
    if (suggestion.taskId !== targetTaskId) {
      rejected.push({ suggestion, reason: 'Suggestion taskId must match the target task' });
      continue;
    }
    try {
      validateDependency(suggestion.taskId, suggestion.dependsOnId, taskIds, dependencies);
      accepted.push(suggestion);
      dependencies.push(suggestion);
    } catch (error) {
      rejected.push({ suggestion, reason: error instanceof Error ? error.message : 'Suggestion rejected' });
    }
  }
  return { accepted, rejected };
}

function isSuggestion(value: unknown): value is SuggestedDependency {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.taskId === 'string' && typeof candidate.dependsOnId === 'string' && typeof candidate.reason === 'string' && candidate.reason.trim().length > 0;
}