import { z } from 'zod';

/** The kind of content to which the original feedback refers. */
export const FEEDBACK_REFERENCE_TYPES = [
  'opening',
  'ending',
  'phrase',
  'tone',
  'structure',
  'whole_output',
  'other',
  'unknown',
] as const;
export const feedbackReferenceTypeSchema = z.enum(FEEDBACK_REFERENCE_TYPES);
export type FeedbackReferenceType = z.infer<typeof feedbackReferenceTypeSchema>;

/** Where a candidate is intended to apply. `unknown` is never a default. */
export const RULE_SCOPES = [
  'current_draft',
  'article',
  'digest',
  'review',
  'global',
  'unknown',
] as const;
export const ruleScopeSchema = z.enum(RULE_SCOPES);
export type RuleScope = z.infer<typeof ruleScopeSchema>;

/** Explicit lifecycle states for a feedback-derived candidate. */
export const RULE_CANDIDATE_STATUSES = [
  'needs_reference_resolution',
  'needs_scope_confirmation',
  'pending_approval',
  'approved',
  'rejected',
  'committed',
  'superseded',
] as const;
export const ruleCandidateStatusSchema = z.enum(RULE_CANDIDATE_STATUSES);
export type RuleCandidateStatus = z.infer<typeof ruleCandidateStatusSchema>;

const candidateTextSchema = z.string().trim().min(1);
const candidateTimestampSchema = z.string().datetime({ offset: true });

/**
 * Persistence-independent domain representation of controlled feedback.
 *
 * Optional reference and rule fields are intentional: the first lifecycle
 * state exists before the future analyzer has resolved and formulated them.
 */
export const ruleCandidateSchema = z
  .strictObject({
    id: candidateTextSchema,
    originalFeedback: candidateTextSchema,
    referencedContent: candidateTextSchema.optional(),
    referenceType: feedbackReferenceTypeSchema,
    derivedRule: candidateTextSchema.optional(),
    scope: ruleScopeSchema,
    status: ruleCandidateStatusSchema,
    sourceConversationId: candidateTextSchema.optional(),
    sourceMessageId: candidateTextSchema.optional(),
    createdAt: candidateTimestampSchema,
    updatedAt: candidateTimestampSchema,
  })
  .superRefine((candidate, context) => {
    const referenceResolved =
      candidate.referencedContent !== undefined &&
      candidate.referenceType !== 'unknown';
    const hasDerivedRule = candidate.derivedRule !== undefined;
    const scopeKnown = candidate.scope !== 'unknown';

    if (
      candidate.status === 'needs_scope_confirmation' &&
      (!referenceResolved || !hasDerivedRule || scopeKnown)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['status'],
        message:
          'scope confirmation requires a resolved reference, a derived rule, and unknown scope',
      });
    }

    if (
      (candidate.status === 'pending_approval' ||
        candidate.status === 'approved' ||
        candidate.status === 'committed' ||
        candidate.status === 'superseded') &&
      (!referenceResolved || !hasDerivedRule || !scopeKnown)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['status'],
        message:
          'approval and commitment require a resolved reference, a derived rule, and known scope',
      });
    }

    if (
      candidate.status === 'committed' &&
      candidate.scope === 'current_draft'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['scope'],
        message:
          'current_draft feedback cannot become a committed reusable rule',
      });
    }
  });
export type RuleCandidate = z.infer<typeof ruleCandidateSchema>;

export class RuleCandidateInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuleCandidateInvariantError';
  }
}

/** Returns whether all domain conditions for explicit approval are met. */
export function isReadyForApproval(candidate: RuleCandidate): boolean {
  return (
    candidate.referencedContent !== undefined &&
    candidate.referenceType !== 'unknown' &&
    candidate.derivedRule !== undefined &&
    candidate.scope !== 'unknown'
  );
}

/**
 * Apply one allowed lifecycle transition without persistence or side effects.
 * The caller supplies the new timestamp so the domain remains deterministic.
 */
export function transitionRuleCandidate(
  candidate: RuleCandidate,
  targetStatus: RuleCandidateStatus,
  updatedAt: string,
  updates: Partial<
    Pick<
      RuleCandidate,
      'referencedContent' | 'referenceType' | 'derivedRule' | 'scope'
    >
  > = {},
): RuleCandidate {
  if (!candidateTimestampSchema.safeParse(updatedAt).success) {
    throw new RuleCandidateInvariantError('updatedAt must be an ISO timestamp');
  }

  const allowedTargets: Record<RuleCandidateStatus, RuleCandidateStatus[]> = {
    needs_reference_resolution: ['needs_scope_confirmation', 'rejected'],
    needs_scope_confirmation: ['pending_approval', 'rejected'],
    // A positive conversational confirmation is both the user's approval and
    // the controlled write authorization, so it may activate the candidate.
    pending_approval: ['approved', 'rejected', 'committed'],
    approved: ['rejected', 'committed'],
    rejected: [],
    committed: ['superseded'],
    superseded: [],
  };

  if (!allowedTargets[candidate.status].includes(targetStatus)) {
    throw new RuleCandidateInvariantError(
      `cannot transition ${candidate.status} to ${targetStatus}`,
    );
  }

  const nextCandidate = { ...candidate, ...updates };
  const hasResolvedReferenceAndRule =
    nextCandidate.referencedContent !== undefined &&
    nextCandidate.referenceType !== 'unknown' &&
    nextCandidate.derivedRule !== undefined;

  if (
    targetStatus === 'needs_scope_confirmation' &&
    !hasResolvedReferenceAndRule
  ) {
    throw new RuleCandidateInvariantError(
      'reference resolution requires referenced content, a known reference type, and a derived rule',
    );
  }

  if (
    targetStatus === 'pending_approval' &&
    !isReadyForApproval(nextCandidate)
  ) {
    throw new RuleCandidateInvariantError(
      'candidate is not ready for approval: derived rule, reference, and known scope are required',
    );
  }

  if (
    (targetStatus === 'approved' || targetStatus === 'committed') &&
    !isReadyForApproval(nextCandidate)
  ) {
    throw new RuleCandidateInvariantError(
      'candidate cannot be approved or committed before it is ready for approval',
    );
  }

  if (targetStatus === 'committed' && nextCandidate.scope === 'current_draft') {
    throw new RuleCandidateInvariantError(
      'current_draft feedback cannot become a committed reusable rule',
    );
  }

  const transitioned = {
    ...nextCandidate,
    status: targetStatus,
    updatedAt,
  };
  const parsed = ruleCandidateSchema.safeParse(transitioned);
  if (!parsed.success) {
    throw new RuleCandidateInvariantError(
      'transition would violate the rule candidate invariants',
    );
  }
  return parsed.data;
}
