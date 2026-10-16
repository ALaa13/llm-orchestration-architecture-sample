import { z } from 'zod';
import { VerificationReasonCode } from '../../workflow/verification/verification.types';

export const semanticVerificationReasonCodes = [
  VerificationReasonCode.Passed,
  VerificationReasonCode.TaskNotFulfilled,
  VerificationReasonCode.WrongUsageArea,
  VerificationReasonCode.PolicyRuleViolation,
  VerificationReasonCode.RevisionNotApplied,
  VerificationReasonCode.ControlledKnowledgeContradiction,
  VerificationReasonCode.UnsupportedSourceClaim,
  VerificationReasonCode.OutputUnsafeToRelease,
] as const;

const semanticReasonCodeSchema = z.enum(semanticVerificationReasonCodes);

const feedbackSchema = z.object({
  issues: z
    .array(
      z.object({
        code: semanticReasonCodeSchema,
        message: z.string().trim().min(1).max(400),
      }),
    )
    .min(1)
    .max(5),
  revisionInstructions: z
    .array(z.string().trim().min(1).max(400))
    .min(1)
    .max(5),
});

export const semanticVerificationResultSchema = z
  .object({
    decision: z.enum(['pass', 'refine', 'reject']),
    reasonCodes: z.array(semanticReasonCodeSchema).min(1).max(3),
    feedback: feedbackSchema.optional(),
    materiallyUsedRequiredSourceIds: z
      .array(z.string().trim().min(1).max(200))
      .max(50),
  })
  .superRefine((result, context) => {
    if (result.decision === 'pass') {
      if (
        result.reasonCodes.length !== 1 ||
        result.reasonCodes[0] !== VerificationReasonCode.Passed
      ) {
        context.addIssue({
          code: 'custom',
          path: ['reasonCodes'],
          message: 'pass requires VERIFICATION_PASSED as its only reason code',
        });
      }
      if (result.feedback !== undefined) {
        context.addIssue({
          code: 'custom',
          path: ['feedback'],
          message: 'pass must not include refinement feedback',
        });
      }
    } else {
      if (result.reasonCodes.includes(VerificationReasonCode.Passed)) {
        context.addIssue({
          code: 'custom',
          path: ['reasonCodes'],
          message: 'non-pass decisions cannot use VERIFICATION_PASSED',
        });
      }
      if (result.decision === 'refine' && result.feedback === undefined) {
        context.addIssue({
          code: 'custom',
          path: ['feedback'],
          message: 'refine requires actionable feedback',
        });
      }
    }
  });
