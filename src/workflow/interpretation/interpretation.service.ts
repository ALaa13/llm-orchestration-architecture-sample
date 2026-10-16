import type { ConversationContext } from '../conversation-context/conversation-context.types';
import type { InterpretationResult } from './interpretation.types';

/**
 * Compatibility boundary for consumers that need interpretation only.
 *
 * Retained for the historical interpretation benchmark and compatibility
 * consumers. The active workflow uses SemanticAnalysisService for the
 * combined semantic-analysis call.
 *
 * Graph nodes depend only on this contract. A real local or remote model can
 * replace the mock through NestJS dependency injection without changing edges.
 */
export abstract class InterpretationService {
  /**
   * Converts bounded conversation context into the validated Stage 1 contract.
   *
   * Implementations may use different providers, but must not make Stage 2
   * protection or authorization decisions.
   */
  abstract interpret(
    context: ConversationContext,
  ): Promise<InterpretationResult>;
}
