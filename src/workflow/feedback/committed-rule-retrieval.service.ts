import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ApplicationConfig } from '../../config/configuration';
import type { UsageArea } from '../interpretation/interpretation.types';
import type { RuleCandidate } from './feedback.types';
import { CommittedRuleCache } from './committed-rule.cache';
import { RuleCandidatePersistenceService } from './rule-candidate.persistence.service';

/** Feedback the authenticated user explicitly saved for future use. */
export interface CommittedRule {
  id: string;
  derivedRule: string;
  scope: 'article' | 'digest' | 'review' | 'global';
}

/**
 * Read-only boundary for reusable feedback at generation time.
 *
 * This deliberately performs no natural-language retrieval: it deterministically
 * filters owner-scoped, already committed rules by their explicit scope.
 */
@Injectable()
export class CommittedRuleRetrievalService {
  constructor(
    private readonly persistence: RuleCandidatePersistenceService,
    private readonly config: ConfigService<ApplicationConfig, true>,
    private readonly cache: CommittedRuleCache = new CommittedRuleCache(),
  ) {}

  async retrieveApplicable(
    ownerUserId: string | undefined,
    usageArea: UsageArea,
  ): Promise<CommittedRule[]> {
    if (
      usageArea === 'unknown' ||
      !this.config.get('postgres.enabled', { infer: true })
    ) {
      return [];
    }

    const owner = this.persistence.resolveOwner(ownerUserId);
    const cached = this.cache.get(owner, usageArea);
    if (cached !== undefined) return cached;

    const candidates = await this.persistence.listByOwner(owner);
    const rules = candidates
      .filter((candidate): candidate is ApplicableCommittedCandidate =>
        isApplicableCommittedCandidate(candidate, usageArea),
      )
      .map((candidate) => ({
        id: candidate.id,
        derivedRule: candidate.derivedRule,
        scope: candidate.scope,
      }))
      .sort((first, second) => first.id.localeCompare(second.id));
    this.cache.set(owner, usageArea, rules);
    return rules;
  }
}

type ApplicableCommittedCandidate = RuleCandidate & {
  derivedRule: string;
  scope: CommittedRule['scope'];
};

function isApplicableCommittedCandidate(
  candidate: RuleCandidate,
  usageArea: Exclude<UsageArea, 'unknown'>,
): candidate is ApplicableCommittedCandidate {
  return (
    candidate.status === 'committed' &&
    candidate.derivedRule !== undefined &&
    (candidate.scope === 'global' || candidate.scope === usageArea)
  );
}
