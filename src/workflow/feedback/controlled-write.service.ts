import { Injectable } from '@nestjs/common';
import { transitionRuleCandidate, type RuleCandidate } from './feedback.types';
import { RuleCandidatePersistenceService } from './rule-candidate.persistence.service';
import { CommittedRuleCache } from './committed-rule.cache';
import { RuleConflictService } from './rule-conflict.service';
import { MockRuleConflictAnalyzer } from './mock-rule-conflict-analyzer.service';
import type { ControlledCommitResult } from './controlled-write.types';

/**
 * The sole application path that can activate a reusable rule. Every caller
 * supplies an explicit candidate ID and owner context; no bulk activation or
 * model-directed write is possible.
 */
@Injectable()
export class ControlledWriteService {
  constructor(
    private readonly persistence: RuleCandidatePersistenceService,
    private readonly cache: CommittedRuleCache = new CommittedRuleCache(),
    private readonly conflictService: RuleConflictService = new RuleConflictService(
      new MockRuleConflictAnalyzer(),
    ),
  ) {}

  async commitApprovedCandidate(
    ownerUserId: string | undefined,
    candidateId: string,
  ): Promise<ControlledCommitResult> {
    if (candidateId.trim() === '') {
      throw new Error(
        'Rule candidate ID is required for controlled commitment.',
      );
    }

    const result =
      await this.persistence.withCommitLock<ControlledCommitResult>(
        ownerUserId,
        async () => {
          const candidate = await this.persistence.findById(
            ownerUserId,
            candidateId,
          );
          if (candidate === undefined) {
            throw new Error('Approved feedback candidate was not found.');
          }
          if (candidate.status !== 'approved') {
            throw new Error(
              'Only approved feedback candidates can be committed.',
            );
          }

          return this.commitIfCompatible(
            ownerUserId,
            candidate,
            'Approved feedback candidate no longer exists.',
          );
        },
      );
    this.invalidateAfterSuccessfulCommit(ownerUserId, result);
    return result;
  }

  /** Commits one pending candidate after its owner explicitly confirms saving it. */
  async commitConfirmedPendingCandidate(
    ownerUserId: string | undefined,
    candidateId: string,
  ): Promise<ControlledCommitResult> {
    if (candidateId.trim() === '') {
      throw new Error(
        'Rule candidate ID is required for controlled commitment.',
      );
    }

    const result =
      await this.persistence.withCommitLock<ControlledCommitResult>(
        ownerUserId,
        async () => {
          const candidate = await this.persistence.findById(
            ownerUserId,
            candidateId,
          );
          if (candidate === undefined) {
            throw new Error('Pending feedback candidate was not found.');
          }
          if (candidate.status === 'committed') {
            return { outcome: 'already_committed', candidate };
          }
          if (candidate.status !== 'pending_approval') {
            throw new Error(
              'Only pending approval feedback candidates can be committed after confirmation.',
            );
          }

          return this.commitIfCompatible(
            ownerUserId,
            candidate,
            'Pending feedback candidate no longer exists.',
          );
        },
      );
    this.invalidateAfterSuccessfulCommit(ownerUserId, result);
    return result;
  }

  async replaceConflictingPendingCandidate(
    ownerUserId: string | undefined,
    candidateId: string,
  ): Promise<ControlledCommitResult> {
    const result =
      await this.persistence.withCommitLock<ControlledCommitResult>(
        ownerUserId,
        async () => {
          const candidate = await this.persistence.findById(
            ownerUserId,
            candidateId,
          );
          if (
            candidate === undefined ||
            candidate.status !== 'pending_approval'
          ) {
            throw new Error(
              'Pending replacement feedback candidate was not found.',
            );
          }
          const ownerCandidates =
            await this.persistence.listByOwner(ownerUserId);
          const analysis = await this.conflictService.analyze(
            candidate,
            ownerCandidates,
          );
          if (analysis.relationship === 'uncertain') {
            return { outcome: 'uncertain', candidate };
          }
          if (analysis.relationship === 'duplicate') {
            return this.replaceRelatedCommittedRules(
              ownerUserId,
              candidate,
              ownerCandidates,
              analysis.relatedRuleIds,
            );
          }
          if (analysis.relationship === 'compatible') {
            return this.commitIfCompatible(
              ownerUserId,
              candidate,
              'Pending replacement feedback candidate no longer exists.',
            );
          }

          return this.replaceRelatedCommittedRules(
            ownerUserId,
            candidate,
            ownerCandidates,
            analysis.relatedRuleIds,
          );
        },
      );
    this.invalidateAfterSuccessfulCommit(ownerUserId, result);
    return result;
  }

  private async commitIfCompatible(
    ownerUserId: string | undefined,
    candidate: RuleCandidate,
    missingMessage: string,
  ): Promise<ControlledCommitResult> {
    const ownerCandidates = await this.persistence.listByOwner(ownerUserId);
    const analysis = await this.conflictService.analyze(
      candidate,
      ownerCandidates,
    );
    const relatedRules = ownerCandidates.filter(({ id }) =>
      analysis.relatedRuleIds.includes(id),
    );

    if (analysis.relationship === 'duplicate') {
      return this.replaceRelatedCommittedRules(
        ownerUserId,
        candidate,
        ownerCandidates,
        analysis.relatedRuleIds,
      );
    }
    if (
      analysis.relationship === 'similar' ||
      analysis.relationship === 'contradiction'
    ) {
      return {
        outcome: 'conflict',
        relationship: analysis.relationship,
        candidate,
        relatedRules,
      };
    }
    if (analysis.relationship === 'uncertain') {
      return { outcome: 'uncertain', candidate };
    }

    const committed = transitionRuleCandidate(
      candidate,
      'committed',
      new Date().toISOString(),
    );
    const persisted = await this.persistence.update(ownerUserId, committed);
    if (persisted === undefined) throw new Error(missingMessage);
    return { outcome: 'committed', candidate: persisted };
  }

  private async replaceRelatedCommittedRules(
    ownerUserId: string | undefined,
    candidate: RuleCandidate,
    ownerCandidates: RuleCandidate[],
    relatedRuleIds: string[],
  ): Promise<ControlledCommitResult> {
    const now = new Date().toISOString();
    const supersededRules = ownerCandidates
      .filter(
        (existing) =>
          existing.status === 'committed' &&
          relatedRuleIds.includes(existing.id),
      )
      .map((existing) => transitionRuleCandidate(existing, 'superseded', now));
    if (supersededRules.length !== relatedRuleIds.length) {
      return { outcome: 'uncertain', candidate };
    }

    const committed = transitionRuleCandidate(candidate, 'committed', now);
    const persisted = await this.persistence.replaceCommitted(
      ownerUserId,
      supersededRules,
      committed,
    );
    return { outcome: 'replaced', candidate: persisted, supersededRules };
  }

  private invalidateAfterSuccessfulCommit(
    ownerUserId: string | undefined,
    result: ControlledCommitResult,
  ): void {
    if (result.outcome === 'committed') {
      this.invalidateCommittedRuleCache(ownerUserId, result.candidate);
      return;
    }
    if (result.outcome === 'replaced') {
      for (const superseded of result.supersededRules) {
        this.invalidateCommittedRuleCache(ownerUserId, superseded);
      }
      this.invalidateCommittedRuleCache(ownerUserId, result.candidate);
    }
  }

  private invalidateCommittedRuleCache(
    ownerUserId: string | undefined,
    candidate: RuleCandidate,
  ): void {
    if (
      candidate.scope === 'global' ||
      candidate.scope === 'article' ||
      candidate.scope === 'digest' ||
      candidate.scope === 'review'
    ) {
      this.cache.invalidate(
        this.persistence.resolveOwner(ownerUserId),
        candidate.scope,
      );
    }
  }
}
