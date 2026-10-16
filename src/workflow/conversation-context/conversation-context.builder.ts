import { Injectable } from '@nestjs/common';
import type {
  ChatMessage,
  ConversationContext,
} from './conversation-context.types';

// Preserve the opening task/artifact alongside the recent window. No persistence
// or semantic classification belongs in this builder.
const RECENT_MESSAGE_LIMIT = 10;

@Injectable()
export class ConversationContextBuilder {
  /** Builds a small context window without persisting or summarizing messages. */
  build(messages: ChatMessage[]): ConversationContext {
    const latestUserMessage = messages.findLast(
      (message) => message.role === 'user',
    );

    return {
      latestUserMessage:
        // Structured content is intentionally ignored for now. A future content
        // normalizer will extract text from supported multimodal message parts.
        typeof latestUserMessage?.content === 'string'
          ? latestUserMessage.content
          : '',
      recentMessages: messages.filter(
        (_, index) =>
          index < 2 || index >= messages.length - RECENT_MESSAGE_LIMIT,
      ),
      messageCount: messages.length,
    };
  }
}
