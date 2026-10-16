import type { RuleCandidate } from './feedback.types';

export const RULE_CANDIDATE_REPOSITORY = Symbol('RULE_CANDIDATE_REPOSITORY');

/** Persistence boundary for owner-scoped RuleCandidate data. */
export interface RuleCandidateRepository {
  /** Serializes controlled commits for one owner in one DB transaction. */
  withCommitLock<T>(
    ownerUserId: string,
    operation: () => Promise<T>,
  ): Promise<T>;
  create(ownerUserId: string, candidate: RuleCandidate): Promise<RuleCandidate>;
  findById(
    candidateId: string,
    ownerUserId: string,
  ): Promise<RuleCandidate | undefined>;
  update(
    ownerUserId: string,
    candidate: RuleCandidate,
  ): Promise<RuleCandidate | undefined>;
  listByOwner(ownerUserId: string): Promise<RuleCandidate[]>;
  replaceCommitted(
    ownerUserId: string,
    supersededCandidates: RuleCandidate[],
    replacement: RuleCandidate,
  ): Promise<RuleCandidate>;
}
