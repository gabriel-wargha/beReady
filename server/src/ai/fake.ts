import { readFile } from 'node:fs/promises';
import type { AiClient, AiRequest, AiResponse } from './client';
/** Deterministic fixture answers; tests never call a paid API. */
export class FakeAiClient implements AiClient {
  calls = 0;
  constructor(private answers: unknown[] = []) {}
  static async fromFixture() {
    return new FakeAiClient([JSON.parse(await readFile(new URL('../../test/fixtures/extraction.json', import.meta.url), 'utf8'))]);
  }
  async send<T>(request: AiRequest<T>): Promise<AiResponse> {
    const data = this.answers[Math.min(this.calls++, this.answers.length - 1)];
    if (data instanceof Error) throw data;
    return {data: structuredClone(data), model: request.model, inputTokens: 120, outputTokens: 80, complete: true};
  }
}
