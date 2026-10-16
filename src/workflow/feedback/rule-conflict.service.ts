import { Injectable } from '@nestjs/common';
import type { RuleCandidate } from './feedback.types';
import { RuleConflictAnalyzer } from './rule-conflict-analyzer.service';
import {
  ruleConflictAnalysisSchema,
  type RuleConflictAnalysis,
} from './rule-conflict.types';

/**
 * Deterministic policy boundary around semantic comparison. It limits scope,
 * resolves exact duplicates locally, and validates analyzer rule IDs.
 */
@Injectable()
export class RuleConflictService {
  constructor(private readonly analyzer: RuleConflictAnalyzer) {}

  async analyze(
    candidate: RuleCandidate,
    ownerCandidates: readonly RuleCandidate[],
  ): Promise<RuleConflictAnalysis> {
    if (candidate.derivedRule === undefined) {
      return uncertain('The candidate has no derived reusable rule.');
    }

    const existingRules = ownerCandidates.filter(
      (existing): existing is RuleCandidate & { derivedRule: string } =>
        existing.status === 'committed' &&
        existing.derivedRule !== undefined &&
        scopesOverlap(candidate.scope, existing.scope),
    );
    if (existingRules.length === 0) {
      return compatible();
    }

    const normalizedCandidate = normalizeRule(candidate.derivedRule);
    const duplicates = existingRules.filter(
      (existing) => normalizeRule(existing.derivedRule) === normalizedCandidate,
    );
    if (duplicates.length > 0) {
      return {
        relationship: 'duplicate',
        relatedRuleIds: duplicates.map(({ id }) => id).sort(),
        reason: 'The same reusable rule is already committed.',
        confidence: 1,
      };
    }

    try {
      const result = ruleConflictAnalysisSchema.parse(
        await this.analyzer.analyze({
          candidate: {
            id: candidate.id,
            derivedRule: candidate.derivedRule,
            scope: candidate.scope,
          },
          existingRules: existingRules.map(({ id, derivedRule, scope }) => ({
            id,
            derivedRule,
            scope,
          })),
        }),
      );
      const eligibleIds = new Set(existingRules.map(({ id }) => id));
      if (result.relatedRuleIds.some((id) => !eligibleIds.has(id))) {
        return uncertain('Conflict analysis referenced an ineligible rule.');
      }
      if (
        result.relationship !== 'compatible' &&
        result.relationship !== 'uncertain' &&
        result.relatedRuleIds.length === 0
      ) {
        return uncertain('Conflict analysis did not identify a related rule.');
      }
      return result;
    } catch {
      return uncertain(
        'Semantic rule comparison could not be completed safely.',
      );
    }
  }
}

function scopesOverlap(
  first: RuleCandidate['scope'],
  second: RuleCandidate['scope'],
): boolean {
  return first === 'global' || second === 'global' || first === second;
}

function normalizeRule(rule: string): string {
  return rule
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function compatible(): RuleConflictAnalysis {
  return {
    relationship: 'compatible',
    relatedRuleIds: [],
    reason: 'No overlapping committed rule requires semantic comparison.',
    confidence: 1,
  };
}

function uncertain(reason: string): RuleConflictAnalysis {
  return {
    relationship: 'uncertain',
    relatedRuleIds: [],
    reason,
    confidence: 0,
  };
}
