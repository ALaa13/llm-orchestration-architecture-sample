import { z } from 'zod';

/** Supported business areas. New areas can be added without changing the graph. */
export const usageAreaSchema = z.enum([
  'article',
  'digest',
  'review',
  'unknown',
]);
export type UsageArea = z.infer<typeof usageAreaSchema>;

/** Supported user-facing language choices for deterministic response templates. */
export const responseLanguageSchema = z.enum(['en', 'de']);
export type ResponseLanguage = z.infer<typeof responseLanguageSchema>;

/** High-level immediate operation requested by the user. `unknown` can be a preference-only turn. */
export const taskTypeSchema = z.enum([
  'new_draft',
  'revision',
  'continue_thought',
  'question',
  'unknown',
]);
export type TaskType = z.infer<typeof taskTypeSchema>;

/** Whether the current request inherently needs controlled/source-backed knowledge. */
export const knowledgeRequirementSchema = z.enum(['required', 'optional']);
export type KnowledgeRequirement = z.infer<typeof knowledgeRequirementSchema>;

/** Whether feedback applies only to the current output or clearly to future behavior. */
export const feedbackIntentSchema = z.enum([
  'none',
  'current_output_feedback',
  'reusable_preference',
]);
export type FeedbackIntent = z.infer<typeof feedbackIntentSchema>;

/** Whether reusable feedback also requests an immediate content operation. */
export const feedbackExecutionModeSchema = z.enum([
  'none',
  'preference_only',
  'combined_with_current_task',
]);
export type FeedbackExecutionMode = z.infer<typeof feedbackExecutionModeSchema>;

/** Bounded semantic interpretation of a reply to a pending feedback proposal. */
export const feedbackApprovalIntentSchema = z.enum([
  'approve',
  'apply_current',
  'reject',
  'keep_existing',
  'replace_existing',
  'none',
  'unclear',
]);
export type FeedbackApprovalIntent = z.infer<
  typeof feedbackApprovalIntentSchema
>;

/** Why a user decision is needed before the request can be routed safely. */
export const clarificationReasonSchema = z.enum([
  'usage_area',
  'task_type',
  'request_scope',
  'conversation_reference',
  'insufficient_context',
]);
export type ClarificationReason = z.infer<typeof clarificationReasonSchema>;

/** Bounded, domain-facing evidence for a targeted clarification. */
export const clarificationSchema = z.object({
  reason: clarificationReasonSchema,
  question: z.string().trim().min(1).max(500),
  options: z.array(z.string().trim().min(1).max(100)).max(5).optional(),
});
export type InterpretationClarification = z.infer<typeof clarificationSchema>;

/**
 * Provider-neutral output contract for request interpretation.
 *
 * This schema remains authoritative for the interpretation member. Combined
 * semantic adapters validate it through `combinedSemanticAnalysisResultSchema`.
 */
export const interpretationResultCoreSchema = z
  .object({
    usageArea: usageAreaSchema,
    responseLanguage: responseLanguageSchema.optional(),
    taskType: taskTypeSchema,
    workingArtifactMessageIndex: z.number().int().min(0).optional(),
    knowledgeRequirement: knowledgeRequirementSchema,
    feedbackIntent: feedbackIntentSchema,
    feedbackExecutionMode: feedbackExecutionModeSchema.optional(),
    feedbackApprovalIntent: feedbackApprovalIntentSchema.optional(),
    intent: z.string().min(1),
    refersToPreviousContext: z.boolean(),
    needsClarification: z.boolean(),
    clarification: clarificationSchema.optional(),
  })
  .superRefine((result, context) => {
    if (result.needsClarification && result.clarification === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['clarification'],
        message:
          'clarification evidence is required when needsClarification is true',
      });
    }

    if (result.feedbackExecutionMode !== undefined) {
      if (
        result.feedbackIntent !== 'reusable_preference' &&
        result.feedbackExecutionMode !== 'none'
      ) {
        context.addIssue({
          code: 'custom',
          path: ['feedbackExecutionMode'],
          message: 'non-reusable feedback must use feedbackExecutionMode=none',
        });
      }
      if (
        result.feedbackIntent === 'reusable_preference' &&
        result.feedbackExecutionMode === 'none'
      ) {
        context.addIssue({
          code: 'custom',
          path: ['feedbackExecutionMode'],
          message:
            'reusable feedback requires preference_only or combined_with_current_task',
        });
      }
      if (
        result.feedbackExecutionMode === 'combined_with_current_task' &&
        result.taskType === 'unknown'
      ) {
        context.addIssue({
          code: 'custom',
          path: ['taskType'],
          message: 'combined feedback requires a resolved immediate task type',
        });
      }
    }
  });

/**
 * Adds legacy scope metadata deterministically after parsing. It is not part of
 * the provider wire schema and cannot be provider-controlled.
 */
export const interpretationResultSchema =
  interpretationResultCoreSchema.transform((interpretation) => ({
    ...interpretation,
    scope: {
      usageAreaResolved: interpretation.usageArea !== 'unknown',
      taskTypeResolved: interpretation.taskType !== 'unknown',
      conversationReferenceResolved:
        !interpretation.needsClarification ||
        interpretation.clarification?.reason !== 'conversation_reference',
    },
  }));

/**
 * Compatibility-only derived interpretation metadata. These fields are never
 * requested from, or trusted from, the Stage 1 provider response.
 */
export interface InterpretationScope {
  readonly usageAreaResolved: boolean;
  readonly taskTypeResolved: boolean;
  readonly conversationReferenceResolved: boolean;
}

export type InterpretationResult = z.infer<
  typeof interpretationResultSchema
> & {
  /** Legacy non-execution metadata accepted only by local fixtures. */
  readonly confidence?: number;
};
