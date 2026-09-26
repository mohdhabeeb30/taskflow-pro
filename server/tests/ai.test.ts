import { describe, expect, it } from 'vitest';
import { AiProviderError, GeminiProvider, MockProvider } from '../src/ai/provider.js';
import { AiService } from '../src/ai/service.js';
import { buildDependencyPrompt } from '../src/ai/prompt.js';
import { validateSuggestions } from '../src/ai/validation.js';
import type { Dependency, Task } from '../src/engine/types.js';

const tasks: Task[] = [
  { id: 'A', title: 'Plan', description: '', status: 'In Progress', startDate: '2026-01-01', endDate: '2026-01-02' },
  { id: 'B', title: 'Build', description: '', status: 'Backlog', startDate: '2026-01-03', endDate: '2026-01-04' },
  { id: 'C', title: 'Ship', description: '', status: 'Backlog', startDate: '2026-01-05', endDate: '2026-01-06' },
];
const edge = (taskId: string, dependsOnId: string): Dependency => ({ taskId, dependsOnId });

describe('AI dependency suggestions', () => {
  it('builds a grounded JSON-only prompt', () => {
    const prompt = buildDependencyPrompt(tasks, [edge('B', 'A')]);
    expect(prompt).toContain('"id":"A"');
    expect(prompt).toContain('"taskId":"B"');
    expect(prompt).toContain('JSON only');
    expect(prompt).toContain('empty array is valid');
  });

  it.each([
    ['hallucinated id', '[{"taskId":"B","dependsOnId":"X"}]', 'Both tasks must exist'],
    ['self-dependency', '[{"taskId":"A","dependsOnId":"A"}]', 'cannot depend on itself'],
    ['duplicate', '[{"taskId":"B","dependsOnId":"A"}]', 'already exists'],
  ])('rejects %s suggestions', (_name, raw, reason) => {
    const result = validateSuggestions(raw, tasks, [edge('B', 'A')]);
    expect(result.accepted).toEqual([]);
    expect(result.rejected[0]?.reason).toContain(reason);
  });

  it('rejects a cycle-creating suggestion', () => {
    const result = validateSuggestions('[{"taskId":"A","dependsOnId":"C"}]', tasks, [edge('C', 'B'), edge('B', 'A')]);
    expect(result.rejected[0]?.reason).toContain('cycle');
  });

  it('rejects invalid JSON and accepts an empty list', () => {
    expect(validateSuggestions('not json', tasks, []).rejected[0]?.reason).toBe('Invalid JSON response');
    expect(validateSuggestions('[]', tasks, [])).toEqual({ accepted: [], rejected: [] });
  });

  it('caches the last result by board content', async () => {
    const service = new AiService(new MockProvider('[{"taskId":"B","dependsOnId":"A"}]'));
    const first = await service.suggest(tasks, []);
    const second = await service.suggest(tasks, []);
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.accepted).toEqual([{ taskId: 'B', dependsOnId: 'A' }]);
  });

  it('uses mock output and exposes the provider name', async () => {
    const result = await new AiService(new MockProvider('[]')).suggest(tasks, []);
    expect(result.provider).toBe('mock');
  });

  it('surfaces timeout and missing-key failures without retrying', async () => {
    const timedOut = new GeminiProvider({
      apiKey: 'test-key',
      timeoutMs: 1,
      fetchImpl: (_input, init) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))),
    });
    const missingKey = new GeminiProvider({ apiKey: '' });
    await expect(timedOut.generate('prompt')).rejects.toBeInstanceOf(AiProviderError);
    await expect(missingKey.generate('prompt')).rejects.toMatchObject({ kind: 'MISSING_KEY' });
  });

  it('classifies provider quota responses as rate limited', async () => {
    const provider = new GeminiProvider({ apiKey: 'test-key', fetchImpl: async () => new Response('', { status: 429 }) });
    await expect(provider.generate('prompt')).rejects.toMatchObject({ kind: 'RATE_LIMITED' });
  });
});