export const ANTHROPIC_CLIENT = Symbol('ANTHROPIC_CLIENT');

export interface AnthropicGenerationResponse {
  content: ReadonlyArray<{ type: string; text?: string }>;
  model: string;
  stop_reason: string | null;
  usage: { input_tokens: number; output_tokens: number };
  _request_id?: string | null;
}

export interface AnthropicGenerationClient {
  messages: {
    create(
      params: {
        model: string;
        max_tokens: number;
        thinking: { type: 'disabled' };
        output_config?: {
          format: {
            type: 'json_schema';
            schema: Record<string, unknown>;
          };
        };
        system: string;
        messages: Array<{ role: 'user'; content: string }>;
      },
      options: { timeout: number; signal?: AbortSignal },
    ): Promise<unknown>;
  };
}
