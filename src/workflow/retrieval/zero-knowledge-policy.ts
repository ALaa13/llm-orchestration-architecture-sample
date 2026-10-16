import type { InterpretationResult } from '../interpretation/interpretation.types';

export interface ZeroKnowledgePolicyInput {
  interpretation: InterpretationResult;
  eligibleKnowledgeCount: number;
}

export type ZeroKnowledgePolicy =
  | { action: 'continue'; reason: 'knowledge_available' | 'knowledge_optional' }
  | { action: 'clarify'; reason: 'knowledge_required_but_unavailable' };

/**
 * Determines whether a successful retrieval with no governed items can safely
 * continue. Stage 1 supplies the bounded knowledge-requirement evidence;
 * this policy remains deterministic and does not inspect raw user text.
 */
export function zeroKnowledgePolicyFor(
  input: ZeroKnowledgePolicyInput,
): ZeroKnowledgePolicy {
  if (input.eligibleKnowledgeCount > 0) {
    return { action: 'continue', reason: 'knowledge_available' };
  }

  if (input.interpretation.knowledgeRequirement === 'required') {
    return { action: 'clarify', reason: 'knowledge_required_but_unavailable' };
  }

  return { action: 'continue', reason: 'knowledge_optional' };
}
