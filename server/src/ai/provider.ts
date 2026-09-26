export type AiProviderName = 'gemini' | 'mock';

export class AiProviderError extends Error {
  constructor(readonly kind: 'MISSING_KEY' | 'RATE_LIMITED' | 'TIMEOUT' | 'UNAVAILABLE', message: string) {
    super(message);
  }
}

export interface AiProvider {
  readonly name: AiProviderName;
  generate(prompt: string): Promise<string>;
}

export class GeminiProvider implements AiProvider {
  readonly name = 'gemini' as const;
  private readonly model: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: { apiKey?: string; model?: string; timeoutMs?: number; fetchImpl?: typeof fetch } = {}) {
    this.apiKey = options.apiKey ?? process.env.LLM_API_KEY ?? '';
    this.model = options.model?.trim() || process.env.LLM_MODEL?.trim() || 'gemini-3.5-flash-lite';
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async generate(prompt: string): Promise<string> {
    if (!this.apiKey) throw new AiProviderError('MISSING_KEY', 'LLM_API_KEY is not configured');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        signal: controller.signal,
      });
      const responseText = await response.text();
      if (response.status === 429 || (response.status === 403 && /quota|rate|resource exhausted|limit/i.test(responseText))) {
        throw new AiProviderError('RATE_LIMITED', 'The AI provider rate limit or quota was reached. Try again later.');
      }
      if (!response.ok) throw new AiProviderError('UNAVAILABLE', 'The AI provider is unavailable. Try again later.');
      const payload = JSON.parse(responseText) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      return payload.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      if (error instanceof Error && error.name === 'AbortError') throw new AiProviderError('TIMEOUT', 'The AI provider timed out. Try again.');
      throw new AiProviderError('UNAVAILABLE', 'The AI provider is unavailable. Try again later.');
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class MockProvider implements AiProvider {
  readonly name = 'mock' as const;
  private readonly response: string;
  private readonly delayMs: number;

  constructor(response = '[]', options: { delayMs?: number } = {}) {
    this.response = response;
    this.delayMs = options.delayMs ?? 0;
  }

  async generate(_prompt: string): Promise<string> {
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    return this.response;
  }
}

export function createAiProvider(): AiProvider {
  return process.env.LLM_PROVIDER === 'mock' ? new MockProvider() : new GeminiProvider();
}