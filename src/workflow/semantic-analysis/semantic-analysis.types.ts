import { z } from 'zod';
import {
  interpretationResultSchema,
  type InterpretationResult,
} from '../interpretation/interpretation.types';

/** Bounded semantic evidence for Stage 2's REQUEST_SCOPE_UNCLEAR rule. */
export const protectionSemanticEvidenceSchema = z.object({
  requestScopeUnclear: z.boolean(),
});
/** Legacy benchmark vocabulary; no longer part of the provider wire contract. */
export type ProtectionSemanticEvidenceReason =
  | 'revision_or_continuation'
  | 'conversation_reference'
  | 'publication_or_review'
  | 'request_purpose'
  | 'usage_task_distinction';

export type ProtectionSemanticEvidence = z.infer<
  typeof protectionSemanticEvidenceSchema
> & {
  /** Legacy benchmark-only metadata, not accepted from the provider wire. */
  readonly reason?: ProtectionSemanticEvidenceReason;
  readonly confidence?: number;
};

/** Atomic provider-neutral result of the shared Stage 1 semantic call. */
export const combinedSemanticAnalysisResultSchema = z
  .object({
    interpretation: interpretationResultSchema,
    protectionEvidence: protectionSemanticEvidenceSchema,
  })
  .transform(({ interpretation, protectionEvidence }) => ({
    interpretation,
    protectionEvidence,
  }));
export type CombinedSemanticAnalysisResult = z.infer<
  typeof combinedSemanticAnalysisResultSchema
> & {
  interpretation: InterpretationResult;
  protectionEvidence: ProtectionSemanticEvidence;
};
