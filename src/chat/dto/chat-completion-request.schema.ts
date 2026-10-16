import { z } from 'zod';
import { toOpenApiSchema } from '../../common/validation';

export const chatMessageSchema = z.strictObject({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  // Content stays unvalidated because LibreChat may send structured or
  // multimodal parts. ConversationContextBuilder normalizes what it can use.
  content: z.unknown().optional(),
  name: z.string().optional(),
  tool_call_id: z.string().optional(),
  tool_calls: z.unknown().optional(),
});

/**
 * The untrusted request body accepted at the LibreChat boundary.
 *
 * Unknown keys are rejected. The permissive fields below are standard
 * OpenAI-compatible parameters that LibreChat may forward; the workflow
 * intentionally accepts but does not use them yet.
 */
export const chatCompletionRequestSchema = z.strictObject({
  model: z
    .string()
    .regex(/\S/, 'model must contain a non-whitespace character'),
  messages: z.array(chatMessageSchema).min(1),
  stream: z.boolean().optional(),
  temperature: z.unknown().optional(),
  top_p: z.unknown().optional(),
  max_tokens: z.unknown().optional(),
  max_completion_tokens: z.unknown().optional(),
  stop: z.unknown().optional(),
  presence_penalty: z.unknown().optional(),
  frequency_penalty: z.unknown().optional(),
  // LibreChat supplies its authenticated account ID here. It is transport
  // metadata, not chat content, and is consumed only after service auth.
  user: z.string().trim().min(1).max(200).optional(),
  tools: z.unknown().optional(),
  tool_choice: z.unknown().optional(),
  response_format: z.unknown().optional(),
  stream_options: z.unknown().optional(),
});

export type ChatCompletionMessage = z.infer<typeof chatMessageSchema>;
export type ChatCompletionRequest = z.infer<typeof chatCompletionRequestSchema>;

export const chatCompletionRequestOpenApiSchema = toOpenApiSchema(
  chatCompletionRequestSchema,
);
