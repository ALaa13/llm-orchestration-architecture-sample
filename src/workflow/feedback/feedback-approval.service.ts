import { Injectable } from '@nestjs/common';
import { transitionRuleCandidate, type RuleCandidate } from './feedback.types';
import type {
  FeedbackApprovalDecision,
  FeedbackApprovalResolution,
} from './feedback-approval.types';
import { RuleCandidatePersistenceService } from './rule-candidate.persistence.service';
import { ControlledWriteService } from './controlled-write.service';

/** Resolves a narrow conversational decision against owner-scoped persistence. */
@Injectable()
export class FeedbackApprovalService {
  constructor(
    private readonly persistence: RuleCandidatePersistenceService,
    private readonly controlledWriteService: ControlledWriteService,
  ) {}

  async persistPendingCandidate(
    ownerUserId: string | undefined,
    candidate: RuleCandidate,
  ): Promise<RuleCandidate> {
    if (candidate.status !== 'pending_approval') {
      throw new Error(
        'Only pending approval candidates can be persisted here.',
      );
    }
    return this.persistence.create(ownerUserId, candidate);
  }

  async resolvePendingDecision(
    ownerUserId: string | undefined,
    decision: FeedbackApprovalDecision,
    proposedRule?: string,
  ): Promise<FeedbackApprovalResolution | undefined> {
    const ownerCandidates = await this.persistence.listByOwner(ownerUserId);
    const pendingCandidates = ownerCandidates.filter(
      (candidate) => candidate.status === 'pending_approval',
    );

    // The current backend has no trusted conversation identifier. Owner-wide
    // resolution is therefore allowed only when exactly one candidate exists.
    if (pendingCandidates.length === 0) {
      if (decision !== 'approve' || proposedRule === undefined)
        return undefined;
      const committedMatches = ownerCandidates.filter(
        (candidate) =>
          candidate.status === 'committed' &&
          normalizeRule(candidate.derivedRule) === normalizeRule(proposedRule),
      );
      return committedMatches.length === 1
        ? { outcome: 'already_committed', candidate: committedMatches[0] }
        : undefined;
    }
    if (pendingCandidates.length > 1) return { outcome: 'ambiguous' };
    if (decision === 'unclear') return { outcome: 'unclear' };

    if (decision === 'keep_existing') {
      const rejected = transitionRuleCandidate(
        pendingCandidates[0],
        'rejected',
        new Date().toISOString(),
      );
      const persisted = await this.persistence.update(ownerUserId, rejected);
      if (persisted === undefined) {
        throw new Error('Pending feedback candidate no longer exists.');
      }
      return { outcome: 'existing_kept', candidate: persisted };
    }

    if (decision === 'replace_existing') {
      const result =
        await this.controlledWriteService.replaceConflictingPendingCandidate(
          ownerUserId,
          pendingCandidates[0].id,
        );
      if (result.outcome === 'uncertain') {
        return { outcome: 'conflict_uncertain', candidate: result.candidate };
      }
      if (result.outcome === 'replaced') return result;
      if (result.outcome === 'committed') return result;
      if (result.outcome === 'already_committed') return result;
      return {
        outcome: 'conflict',
        relationship: result.relationship,
        candidate: result.candidate,
        relatedRules: result.relatedRules,
      };
    }

    if (decision === 'approve') {
      const result =
        await this.controlledWriteService.commitConfirmedPendingCandidate(
          ownerUserId,
          pendingCandidates[0].id,
        );
      if (result.outcome === 'uncertain') {
        return { outcome: 'conflict_uncertain', candidate: result.candidate };
      }
      return result;
    }

    // Applying feedback to this draft is explicitly not future memory. Keep
    // the owner-scoped record only as a rejected decision/audit outcome.
    const targetStatus = 'rejected';
    const transitioned = transitionRuleCandidate(
      pendingCandidates[0],
      targetStatus,
      new Date().toISOString(),
    );
    const persisted = await this.persistence.update(ownerUserId, transitioned);
    if (persisted === undefined) {
      throw new Error('Pending feedback candidate no longer exists.');
    }
    return {
      outcome: decision === 'apply_current' ? 'apply_current' : targetStatus,
      candidate: persisted,
    };
  }
}

function normalizeRule(rule: string | undefined): string | undefined {
  return rule?.trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US');
}
