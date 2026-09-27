import { createHash } from 'node:crypto';
import type { Dependency, Task } from '../engine/types.js';
import { buildDependencyPrompt } from './prompt.js';
import { AiProviderError, type AiProvider, createAiProvider } from './provider.js';
import { validateSuggestions, type RejectedSuggestion, type SuggestedDependency } from './validation.js';

export type SuggestionResult = {
  accepted: SuggestedDependency[];
  rejected: RejectedSuggestion[];
  provider: 'gemini' | 'mock';
  cached: boolean;
};

export class AiService {
  private readonly provider: AiProvider;
  private lastResult?: { hash: string; result: SuggestionResult };

  constructor(provider = createAiProvider()) {
    this.provider = provider;
  }

  get providerName(): 'gemini' | 'mock' {
    return this.provider.name;
  }

  async suggest(targetTask: Task, otherTasks: readonly Task[], dependencies: readonly Dependency[]): Promise<SuggestionResult> {
    const input = JSON.stringify({ targetTask, otherTasks, dependencies });
    const hash = createHash('sha256').update(input).digest('hex');
    if (this.lastResult?.hash === hash) return { ...this.lastResult.result, cached: true };

    const prompt = buildDependencyPrompt(targetTask, otherTasks, dependencies);
    const raw = await this.provider.generate(prompt);
    const validated = validateSuggestions(raw, targetTask.id, [targetTask, ...otherTasks], dependencies);
    const result: SuggestionResult = { ...validated, provider: this.provider.name, cached: false };
    this.lastResult = { hash, result };
    return result;
  }
}

export function aiProviderStatusError(error: unknown): { status: number; message: string } | undefined {
  if (!(error instanceof AiProviderError)) return undefined;
  if (error.kind === 'RATE_LIMITED') return { status: 429, message: error.message };
  if (error.kind === 'TIMEOUT') return { status: 504, message: error.message };
  if (error.kind === 'MISSING_KEY') return { status: 503, message: error.message };
  return { status: 502, message: error.message };
}