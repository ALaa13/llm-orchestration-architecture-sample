import type { ContextPackage } from '../context-assembly/context-assembly.types';
import type { PolicyPlanningInput } from '../policy-rules/article/article-authoring-plan.types';
import type { VerificationFeedback } from '../verification/verification.types';

export interface GenerationRefinementContext {
  previousOutput: string;
  verificationFeedback: VerificationFeedback;
}

/** Exact orchestration-to-generation-model boundary. */
export interface GenerationRequest {
  contextPackage: ContextPackage;
  refinementCount: number;
  refinement?: GenerationRefinementContext;
}

/** Provider-neutral reasons for a generation result completing. */
export type GenerationFinishReason = 'completed' | 'max_tokens';

export interface GenerationResult {
  content: string;
  model: string;
  finishReason: GenerationFinishReason;
  /** Explicit planning choices selected during this generation call, never inferred from prose. */
  resolvedPolicyPlanning?: PolicyPlanningInput;
}
