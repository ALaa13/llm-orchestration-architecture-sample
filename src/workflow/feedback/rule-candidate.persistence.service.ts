import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  RULE_CANDIDATE_REPOSITORY,
  type RuleCandidateRepository,
} from './rule-candidate.repository';
import type { RuleCandidate } from './feedback.types';
import type { ApplicationConfig } from '../../config/configuration';

/** Thin owner-scoped application boundary; lifecycle policy remains in domain. */
@Injectable()
export class RuleCandidatePersistenceService {
  constructor(
    @Inject(RULE_CANDIDATE_REPOSITORY)
    private readonly repository: RuleCandidateRepository,
    private readonly config: ConfigService<ApplicationConfig, true>,
  ) {}

  withCommitLock<T>(
    ownerUserId: string | undefined,
    operation: () => Promise<T>,
  ): Promise<T> {
    return this.repository.withCommitLock(
      this.resolveOwner(ownerUserId),
      operation,
    );
  }

  create(
    ownerUserId: string | undefined,
    candidate: RuleCandidate,
  ): Promise<RuleCandidate> {
    return this.repository.create(this.resolveOwner(ownerUserId), candidate);
  }

  findById(
    ownerUserId: string | undefined,
    candidateId: string,
  ): Promise<RuleCandidate | undefined> {
    return this.repository.findById(
      candidateId,
      this.resolveOwner(ownerUserId),
    );
  }

  update(
    ownerUserId: string | undefined,
    candidate: RuleCandidate,
  ): Promise<RuleCandidate | undefined> {
    return this.repository.update(this.resolveOwner(ownerUserId), candidate);
  }

  listByOwner(ownerUserId: string | undefined): Promise<RuleCandidate[]> {
    return this.repository.listByOwner(this.resolveOwner(ownerUserId));
  }

  replaceCommitted(
    ownerUserId: string | undefined,
    supersededCandidates: RuleCandidate[],
    replacement: RuleCandidate,
  ): Promise<RuleCandidate> {
    return this.repository.replaceCommitted(
      this.resolveOwner(ownerUserId),
      supersededCandidates,
      replacement,
    );
  }

  resolveOwner(ownerUserId: string | undefined): string {
    const configuredOwner = this.config.get('feedback.ownerId', {
      infer: true,
    });
    const resolvedOwner = ownerUserId ?? configuredOwner;
    if (resolvedOwner === undefined || resolvedOwner.trim() === '') {
      throw new Error('Configured feedback ownerUserId is required.');
    }
    return resolvedOwner;
  }
}
