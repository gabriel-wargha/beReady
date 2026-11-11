import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';

export interface AiRequest<T> {model: string; system: string; text: string; schema: z.ZodType<T>}
export interface AiResponse {data: unknown; model: string; inputTokens: number; outputTokens: number; complete: boolean}
export interface AiClient {send<T>(request: AiRequest<T>): Promise<AiResponse>}
export class ClaudeClient implements AiClient {
  private client: Anthropic;
  constructor(key: string) {this.client = new Anthropic({apiKey: key, maxRetries: 0, timeout: 90_000});}
  async send<T>(request: AiRequest<T>): Promise<AiResponse> {
    const answer = await this.client.messages.create({
      model: request.model, max_tokens: 16_000, system: request.system,
      messages: [{role: 'user', content: request.text}],
      output_config: {format: zodOutputFormat(request.schema)},
    });
    const text = answer.content.filter(c => c.type === 'text').map(c => c.text).join('');
    let data: unknown; try {data = JSON.parse(text);} catch {data = null;}
    return {data, model: answer.model, inputTokens: answer.usage.input_tokens, outputTokens: answer.usage.output_tokens, complete: answer.stop_reason === 'end_turn'};
  }
}
