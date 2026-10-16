/** Minimal provider-neutral message shape accepted from the LibreChat boundary. */
export interface ChatMessage {
  role: string;
  // Content stays unknown and optional because LibreChat may omit it or send
  // structured or multimodal content. Attachment handling comes later.
  content?: unknown;
}

/**
 * Bounded conversation data supplied to the interpretation service.
 *
 * This is intentionally separate from LangGraph state so a future real SLM can
 * receive a stable, purpose-built input without depending on graph internals.
 */
export interface ConversationContext {
  latestUserMessage: string;
  recentMessages: ChatMessage[];
  messageCount: number;
}
